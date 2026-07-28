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

  const birthColumns = {
    birth_date: birth.date,
    birth_time: birth.time,
    birth_place: birth.place,
    birth_lat: birth.lat,
    birth_lng: birth.lng,
    timezone: birth.timezone,
  }

  /**
   * `.select()` is what makes this honest. A bare UPDATE that matches ZERO rows
   * is not an error in PostgREST — it reports success. Because the profiles row
   * only ever comes from the `auth.users` insert trigger (nothing in the app
   * inserts one), an account whose profiles row went missing would take this
   * path, get told "saved", and have its onboarding stash cleared — silently
   * destroying the birth data and leaving a chartless, read-less spiral.
   *
   * How the row went missing: deleteAccount() used to DELETE it while being
   * unable to delete the underlying auth.users row (no service-role key), so
   * signing back in reused the auth user, the insert trigger never re-fired,
   * and no profiles row came back. deleteAccount() now blanks the row instead,
   * so this should no longer happen — but the check stays, because reporting a
   * save that didn't happen is what destroyed the birth data last time.
   */
  const { data: updated, error: profileError } = await supabase
    .from("profiles")
    .update(birthColumns)
    .eq("id", user.id)
    .select("id")

  if (profileError) return { status: "error", message: profileError.message }

  // No row to update — try to recreate it rather than pretending the write
  // landed. NOTE: there is no `profiles_insert_own` RLS policy (the schema only
  // defines select/update/delete for own rows), so this insert is expected to be
  // refused with 42501 unless that policy is added. It's attempted anyway
  // because it costs one round trip and fixes the account outright where the
  // policy does exist.
  if (!updated || updated.length === 0) {
    const { error: insertError } = await supabase
      .from("profiles")
      .insert({ id: user.id, ...birthColumns })

    if (insertError) {
      return {
        status: "error",
        message:
          insertError.code === "42501"
            ? "your profile row is missing and the app isn't allowed to recreate it — this needs a profiles insert policy"
            : `profile row missing and could not be recreated (${insertError.message})`,
      }
    }
  }

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
