"use server"

import { createClient } from "@/lib/supabase/server"
import {
  CALCULATION_VERSION,
  computeChart,
  type ComputedChart,
} from "@/lib/vedic/compute"

// The placeholder birth_place the DB trigger seeds new profiles with.
const PLACEHOLDER_PLACE = "pending"

type ChartPayload = Pick<
  ComputedChart,
  "planets" | "ascendant" | "houses" | "dashas"
>

export type PersistBirthChartInput = {
  birth: {
    date: string // "YYYY-MM-DD"
    time: string // "HH:MM"
    place: string // human-readable, e.g. "Mumbai, India"
    lat: number
    lng: number
    timezone: string // IANA
  }
  chart: ChartPayload
}

export type PersistResult =
  | { status: "saved" }
  | { status: "unauthenticated" }
  | { status: "error"; message: string }

/**
 * Writes the real birth data onto the user's profiles row (replacing the
 * trigger's placeholders) and stores the computed chart in the charts table.
 * Runs under the caller's authenticated session, so RLS applies. Idempotent —
 * an existing chart row is updated rather than duplicated.
 */
export async function persistBirthChart(
  input: PersistBirthChartInput,
): Promise<PersistResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { status: "unauthenticated" }

  const { birth, chart } = input

  // Basic sanity — never write half-formed data over the placeholders.
  if (
    !birth?.date ||
    !birth?.time ||
    !birth?.place ||
    typeof birth.lat !== "number" ||
    typeof birth.lng !== "number" ||
    !birth?.timezone
  ) {
    return { status: "error", message: "incomplete birth data" }
  }

  const { error: profileError } = await supabase
    .from("profiles")
    .update({
      birth_date: birth.date,
      birth_time: birth.time,
      birth_place: birth.place,
      birth_lat: birth.lat,
      birth_lng: birth.lng,
      timezone: birth.timezone,
    })
    .eq("id", user.id)

  if (profileError) return { status: "error", message: profileError.message }

  const upsertError = await upsertChart(supabase, user.id, chart)
  if (upsertError) return { status: "error", message: upsertError }

  return { status: "saved" }
}

export type EnsureChartResult =
  // recomputed=true means the chart row did NOT exist when the page rendered
  // and was just created — callers must refresh so server-computed props
  // (matched reads, first star) pick it up.
  | { status: "ready"; recomputed: boolean }
  | { status: "needs_onboarding" } // profile still holds placeholder data
  | { status: "unauthenticated" }
  | { status: "error"; message: string }

/**
 * Recovery + idempotency for signed-in users:
 *   - no chart row + real birth data  -> recompute and insert
 *   - no chart row + placeholder data -> caller should send them to onboarding
 *   - chart row already present        -> nothing to do
 */
export async function ensureUserChart(): Promise<EnsureChartResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { status: "unauthenticated" }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("birth_date, birth_time, birth_place, birth_lat, birth_lng, timezone")
    .eq("id", user.id)
    .maybeSingle()

  if (profileError) return { status: "error", message: profileError.message }
  // No profile row yet (trigger lag) — treat as needing onboarding.
  if (!profile) return { status: "needs_onboarding" }

  const hasRealBirthData =
    !!profile.birth_place &&
    profile.birth_place !== PLACEHOLDER_PLACE &&
    !!profile.birth_date &&
    typeof profile.birth_lat === "number" &&
    typeof profile.birth_lng === "number"

  if (!hasRealBirthData) return { status: "needs_onboarding" }

  // Is there already a chart? If so we're done.
  const { data: existing, error: existingError } = await supabase
    .from("charts")
    .select("id")
    .eq("profile_id", user.id)
    .maybeSingle()

  if (existingError) return { status: "error", message: existingError.message }
  if (existing) return { status: "ready", recomputed: false }

  // Recompute from the stored birth data and insert.
  try {
    const chart = computeChart({
      date: profile.birth_date,
      // A time column may serialize as "HH:MM:SS"; the engine wants "HH:MM".
      time: String(profile.birth_time ?? "12:00").slice(0, 5),
      lat: profile.birth_lat,
      lng: profile.birth_lng,
      timezone: profile.timezone,
    })
    const upsertError = await upsertChart(supabase, user.id, chart)
    if (upsertError) return { status: "error", message: upsertError }
    return { status: "ready", recomputed: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : "recompute failed"
    return { status: "error", message }
  }
}

// Insert-or-update a single chart row for a profile. Returns an error message
// string on failure, or null on success. Guarantees no duplicate rows.
async function upsertChart(
  supabase: Awaited<ReturnType<typeof createClient>>,
  profileId: string,
  chart: ChartPayload,
): Promise<string | null> {
  const row = {
    planets: chart.planets,
    ascendant: chart.ascendant,
    houses: chart.houses,
    dashas: chart.dashas,
    computed_at: new Date().toISOString(),
    // Which engine settings produced this chart (see lib/vedic/compute.ts).
    calculation_version: CALCULATION_VERSION,
  }

  const { data: existing, error: selectError } = await supabase
    .from("charts")
    .select("id")
    .eq("profile_id", profileId)
    .maybeSingle()

  if (selectError) return selectError.message

  if (existing) {
    const { error } = await supabase
      .from("charts")
      .update(row)
      .eq("id", existing.id)
    return error ? error.message : null
  }

  const { error } = await supabase
    .from("charts")
    .insert({ profile_id: profileId, ...row })
  return error ? error.message : null
}
