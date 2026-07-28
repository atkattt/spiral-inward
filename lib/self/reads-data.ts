import type { SupabaseClient } from "@supabase/supabase-js"
import { matchFragments, type Chart, type Fragment } from "@/lib/matcher"
import { nakshatraKeyOf, padaOf } from "@/lib/vedic/astro"
import {
  computeLensState,
  ensureUnlockedLenses,
  lensOf,
  loadActiveLenses,
  type LensState,
} from "@/lib/self/lenses"
// unlock.ts only imports a TYPE from this module, so this is not a runtime cycle.
import { vedicJourneyProgress } from "@/lib/self/unlock"

// A fragment row as stored in Supabase (superset of the matcher's Fragment).
export type FragmentRow = Fragment & {
  id: string
  title: string | null
  body: string | null
  archetype: string | null
  tone: string | null
  life_domain: string | null
  self_questions: string[] | string | null
  weight: number | null
  trigger_type: string | null
  condition: unknown
  /** which lens this read belongs to; legacy rows are 'vedic' */
  lens?: string | null
  /** which chart section (constellation) this read belongs to */
  section?: string | null
}

export type ReadResponse = "agree" | "disagree"

/**
 * Run a query, retrying once after a short beat on failure. Used for the
 * queries whose silent failure would render a WRONG universe (no stars, seed
 * creature) rather than a broken one — transient DB hiccups self-heal, and
 * anything persistent surfaces as a real error instead of fake-empty data.
 */
export async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (err) {
    console.error("[spiral] query failed, retrying once:", err)
    await new Promise((r) => setTimeout(r, 300))
    return await fn()
  }
}

/**
 * Lazy backfill of moon_nakshatra / moon_pada onto a stored chart's moon
 * planet entry (planets jsonb — no schema change). Mutates `chart` in memory
 * so this load already matches, and persists best-effort for the next one.
 */
async function backfillMoonNakshatra(
  supabase: SupabaseClient,
  profileId: string,
  chart: Chart,
): Promise<void> {
  try {
    if (!Array.isArray(chart.planets)) return
    const moon = chart.planets.find(
      (p) => String(p.planet ?? "").toLowerCase() === "moon",
    )
    if (!moon || moon.moon_nakshatra) return // nothing there, or already done
    if (typeof moon.longitude !== "number") return
    moon.moon_nakshatra = nakshatraKeyOf(moon.longitude)
    moon.moon_pada = padaOf(moon.longitude)
    await supabase
      .from("charts")
      .update({ planets: chart.planets })
      .eq("profile_id", profileId)
  } catch (err) {
    // Never let a backfill hiccup break the page — matching still works from
    // the longitude directly.
    console.error("[spiral] moon_nakshatra backfill failed:", err)
  }
}

export type SelfReadsData = {
  chart: Chart | null
  matched: FragmentRow[]
  // fragment_id -> the user's saved free-text answer
  answers: Record<string, string>
  // fragment_id -> agree | disagree
  responses: Record<string, ReadResponse>
  // lens progression (null when the lenses tables are unavailable)
  lens: LensState | null
  /** lens slug → depth (lenses.sort_order, higher = deeper). Feeds the star
      rule's depth tiebreak in lib/spiral/sections.ts. A plain object so it can
      cross the server→client props boundary; empty when lenses are
      unavailable, which collapses the tiebreak to weight + id. */
  lensRanks: Record<string, number>
  /** Constellations cleared across BOTH vedic phases, for the locked chat's
      percentage. Computed here from `matchedAll` because `matched` is gated to
      unlocked lenses — the client cannot see vedic_deep's total until it opens,
      which would make the bar read 100% while the chat was still locked. */
  vedicJourney: { done: number; total: number }
}

// Normalize self_questions (jsonb array, JSON string, or plain string) to a
// clean string[]. Shared with the read UI.
export function toQuestions(value: FragmentRow["self_questions"]): string[] {
  if (Array.isArray(value)) return value.filter(Boolean).map(String)
  if (typeof value === "string" && value.trim().length > 0) {
    try {
      const parsed = JSON.parse(value)
      if (Array.isArray(parsed)) return parsed.filter(Boolean).map(String)
    } catch {
      return [value]
    }
    return [value]
  }
  return []
}

/**
 * Load everything the /self reads section (and the self-chat voice) needs for a
 * signed-in user: their computed chart, the fragments matched to it (highest
 * weight first), their saved answers, and their agree/disagree responses.
 *
 * Interpretation NEVER comes from a model — only from the authored `fragments`
 * table via the deterministic matcher.
 */
export async function loadSelfReads(
  supabase: SupabaseClient,
  profileId: string,
): Promise<SelfReadsData> {
  // 1) the user's chart. NEVER swallow a query error here: a transient
  // failure would render an empty universe (no reads, seed creature) that
  // looks like lost progress. Retry once, then fail loudly.
  const chart = await withRetry(async () => {
    const { data, error } = await supabase
      .from("charts")
      .select("planets, ascendant, houses, dashas")
      .eq("profile_id", profileId)
      .maybeSingle()
    if (error) throw new Error(`charts query failed: ${error.message}`)
    return (data as Chart | null) ?? null
  })

  // Lazy backfill: charts saved before moon_nakshatra existed don't carry it.
  // Compute from the stored moon longitude, patch in memory, and save back
  // into the planets jsonb (best-effort — matching works either way since
  // the matcher can also derive it from the longitude).
  if (chart) await backfillMoonNakshatra(supabase, profileId, chart)

  // 2) all authored fragments — same rule: a silent empty list here erases
  // every star from the spiral.
  // Order is PINNED (weight desc, then id): a section can hold two majors, and
  // an unpinned fetch let the star flip between loads. Downstream still applies
  // the full star rule, but nothing should ever depend on raw row order.
  //
  // Skipped entirely when there is no chart, because `matchedAll` below is then
  // hardcoded to [] and every one of these rows is thrown away. That is exactly
  // the state /circle server-renders in right after a fresh sign-in (the chart
  // is still sitting in localStorage, waiting for BirthChartBootstrap to
  // persist it), so the slowest query on the page was being paid for nothing on
  // the one render where the user is already waiting. Measured: 799 rows /
  // ~524KB / ~240-430ms of pure waste before the reads could even start.
  const fragments = chart
    ? await withRetry(async () => {
        const { data, error } = await supabase
          .from("fragments")
          .select("*")
          .order("weight", { ascending: false })
          .order("id", { ascending: true })
        if (error) throw new Error(`fragments query failed: ${error.message}`)
        return (data ?? []) as FragmentRow[]
      })
    : ([] as FragmentRow[])

  // 3) match chart -> fragments (deterministic, sorted by weight desc), then
  // gate by the user's unlocked lenses. matchedAll (every lens) stays local —
  // it feeds the lens progress numbers; everything downstream only ever sees
  // fragments from unlocked lenses. If the lenses tables are unavailable the
  // gate falls open (old behavior) rather than erasing the universe.
  const matchedAll = chart ? matchFragments(chart, fragments) : []
  let matched = matchedAll
  let lenses: Awaited<ReturnType<typeof loadActiveLenses>> = []
  let unlockedSlugs: Set<string> | null = null
  try {
    lenses = await loadActiveLenses(supabase)
    if (lenses.length > 0) {
      unlockedSlugs = await ensureUnlockedLenses(supabase, profileId, lenses)
      const unlocked = unlockedSlugs
      matched = matchedAll.filter((f) => unlocked.has(lensOf(f)))
    }
  } catch (err) {
    console.error("[spiral] lens gating unavailable, showing all lenses:", err)
  }

  // 4) the user's saved answers (kind = 'answer')
  const answers: Record<string, string> = {}
  const { data: entryRows } = await supabase
    .from("self_entries")
    .select("fragment_id, content, created_at")
    .eq("profile_id", profileId)
    .eq("kind", "answer")
    .order("created_at", { ascending: true })
  for (const row of entryRows ?? []) {
    const r = row as { fragment_id: string | null; content: string | null }
    if (r.fragment_id && r.content) answers[r.fragment_id] = r.content
  }

  // 5) the user's agree/disagree responses. This table may not exist yet (the
  // user runs the SQL separately) — never let that crash the page.
  const responses: Record<string, ReadResponse> = {}
  try {
    const { data: responseRows } = await supabase
      .from("read_responses")
      .select("fragment_id, response")
      .eq("profile_id", profileId)
    for (const row of responseRows ?? []) {
      const r = row as { fragment_id: string | null; response: string | null }
      if (r.fragment_id && (r.response === "agree" || r.response === "disagree"))
        responses[r.fragment_id] = r.response
    }
  } catch {
    // read_responses table not created yet — treat as no responses.
  }

  // 6) lens progress, computed on demand — no stored state beyond the
  // unlock rows themselves.
  const lens =
    unlockedSlugs !== null
      ? computeLensState(lenses, unlockedSlugs, matchedAll, responses)
      : null

  // Depth per lens for the star rule. Empty when the lenses table was
  // unavailable above — the tiebreak then falls back to weight + id, which is
  // still fully deterministic.
  const lensRanks: Record<string, number> = {}
  for (const l of lenses) lensRanks[l.slug] = Number(l.sort_order) || 0

  // Overall vedic-journey progress for the locked chat's percentage. Uses
  // matchedAll (every lens) so vedic_deep's constellations are counted while it
  // is still locked; see vedicJourneyProgress for why that matters.
  const vedicJourney = vedicJourneyProgress(
    matchedAll,
    new Set(Object.keys(responses)),
    lensRanks,
  )

  return { chart, matched, answers, responses, lens, lensRanks, vedicJourney }
}

/**
 * How many written answers (self_entries kind='answer') the user has saved.
 * The self creature grows ONE permanent aura glyph per answer, so this is all
 * the universe view needs beyond the reads payload it already loads. A missing
 * table is treated as zero so this never crashes.
 */
export async function loadAnswerCount(
  supabase: SupabaseClient,
  profileId: string,
): Promise<number> {
  try {
    const { count } = await supabase
      .from("self_entries")
      .select("id", { count: "exact", head: true })
      .eq("profile_id", profileId)
      .eq("kind", "answer")
    return count ?? 0
  } catch {
    return 0
  }
}

// ---- chart summary for the self-chat voice --------------------------------

type PlanetRow = {
  planet?: string
  name?: string
  sign?: string
  house?: number | string
  nakshatra?: string
}

/**
 * A compact, factual chart summary for the chat system prompt: ascendant, moon
 * sign + nakshatra, and the current mahadasha/antardasha. Facts only — no
 * interpretation (that lives in the fragments).
 */
export function describeChartFacts(chart: Chart | null): string {
  if (!chart) return "their chart hasn't been computed yet."
  const planets = (Array.isArray(chart.planets) ? chart.planets : []) as PlanetRow[]
  const moon = planets.find((p) => (p.planet ?? p.name)?.toLowerCase() === "moon")

  const lines: string[] = []
  if (chart.ascendant?.sign) lines.push(`ascendant (lagna): ${chart.ascendant.sign}`)
  if (moon?.sign) {
    lines.push(
      `moon: ${moon.sign}${moon.nakshatra ? `, nakshatra ${moon.nakshatra}` : ""}`,
    )
  }
  const maha = chart.dashas?.current?.lord
  const antar = chart.dashas?.current?.currentAntardasha?.lord
  if (maha) {
    lines.push(
      `current dasha: ${maha} mahadasha${antar ? `, ${antar} antardasha` : ""}`,
    )
  }
  return lines.length ? lines.join("\n") : "their chart is sparse."
}
