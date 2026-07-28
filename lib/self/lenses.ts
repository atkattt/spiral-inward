import type { SupabaseClient } from "@supabase/supabase-js"
import { matchFragments, type Chart } from "@/lib/matcher"
import {
  MAJOR_WEIGHT,
  lensRankFrom,
  orderSection,
  sectionFor,
  type JourneyFragment,
  type LensRank,
} from "@/lib/spiral/sections"
import type { FragmentRow } from "@/lib/self/reads-data"

// ---------------------------------------------------------------------------
// Lens-based progression. Fragments carry a `lens` column; users unlock
// lenses one at a time (rows in user_lens_progress). All reads behavior is
// unchanged — the only gate is WHICH fragments are matchable.
// ---------------------------------------------------------------------------

export type LensRow = {
  slug: string
  name: string
  sort_order: number
  unlock_threshold: number
  is_active: boolean
}

export type LensState = {
  /** the user's highest unlocked lens */
  current: { slug: string; name: string }
  /** responded matched fragments in the current lens */
  answered: number
  /** total matched fragments for the chart in the current lens */
  total: number
  /**
   * total === 0 means the current lens has no authored fragments yet — it is
   * the frontier and is shown as "coming"; we never unlock past it.
   */
  next: { slug: string; name: string } | null
  /**
   * Present when the NEXT lens unlocks by the section-clear rule
   * (vedic_deep): how many of the chart's constellations are cleared.
   */
  clearedProgress: { done: number; total: number } | null
}

/** The lens that unlocks by clearing every constellation, not a threshold. */
export const VEDIC_DEEP_SLUG = "vedic_deep"

/**
 * Section-clear progress across a set of matched fragments, using the
 * EXISTING clear rule (mirrors the spiral's section grouping in
 * lib/spiral/sections.ts — sectionFor + orderSection's star rule):
 *   - a section with a major: its major answered + 2 of its minors
 *     (or every minor it has, when it has fewer than 2)
 *   - a section with no matched major: 2 minors answered
 *     (or everything it has, when it has fewer than 2)
 */
export function sectionClearProgress(
  matched: JourneyFragment[],
  respondedIds: ReadonlySet<string>,
  rank?: LensRank,
): { done: number; total: number } {
  const groups = new Map<string, JourneyFragment[]>()
  for (const f of matched) {
    const key = sectionFor(f.section, f.trigger_type, f.condition)
    const g = groups.get(key)
    if (g) g.push(f)
    else groups.set(key, [f])
  }

  let done = 0
  for (const frags of groups.values()) {
    // Same star rule the spiral walks with (weight desc, lens depth desc, id),
    // so the read the UI shows as a section's star is the exact read this
    // progress math requires an answer to.
    const ordered = orderSection(frags, rank)
    const star = ordered[0]
    const major = star && (star.weight ?? 0) >= MAJOR_WEIGHT ? star : null
    const minors = major ? ordered.filter((f) => f !== major) : ordered

    const majorOk = major ? respondedIds.has(String(major.id)) : true
    const answeredMinors = minors.filter((f) =>
      respondedIds.has(String(f.id)),
    ).length
    const requiredMinors = Math.min(2, minors.length)

    if (majorOk && answeredMinors >= requiredMinors) done++
  }
  return { done, total: groups.size }
}

/** The lens a fragment belongs to; legacy rows without one are vedic. */
export function lensOf(fragment: { lens?: unknown }): string {
  return typeof fragment.lens === "string" && fragment.lens.trim()
    ? fragment.lens.trim().toLowerCase()
    : "vedic"
}

/** unlock_threshold stored as either a 0–1 fraction or a 0–100 percent. */
function asFraction(threshold: number): number {
  return threshold > 1 ? threshold / 100 : threshold
}

/** Active lenses in unlock order. */
export async function loadActiveLenses(
  supabase: SupabaseClient,
): Promise<LensRow[]> {
  const { data, error } = await supabase
    .from("lenses")
    .select("slug, name, sort_order, unlock_threshold, is_active")
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
  if (error) throw new Error(`lenses query failed: ${error.message}`)
  return (data ?? []) as LensRow[]
}

/**
 * The user's unlocked lens slugs. If the user has NO rows yet (new signup, or
 * an existing account from before lenses), unlock the first lens for them.
 */
export async function ensureUnlockedLenses(
  supabase: SupabaseClient,
  profileId: string,
  lenses: LensRow[],
): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("user_lens_progress")
    .select("lens_slug")
    .eq("user_id", profileId)
  if (error) throw new Error(`user_lens_progress query failed: ${error.message}`)

  const unlocked = new Set(
    (data ?? []).map((r) => String((r as { lens_slug: unknown }).lens_slug)),
  )
  if (unlocked.size > 0) return unlocked

  const first = lenses[0]
  if (!first) return unlocked
  // Plain insert (no constraint assumptions) — we just read zero rows, and a
  // rare duplicate from a race is harmless since callers use a Set of slugs.
  await supabase
    .from("user_lens_progress")
    .insert({ user_id: profileId, lens_slug: first.slug })
  unlocked.add(first.slug)
  return unlocked
}

/** The highest unlocked lens and the next locked one, in sort order. */
export function frontierOf(
  lenses: LensRow[],
  unlocked: Set<string>,
): { current: LensRow | null; next: LensRow | null } {
  let current: LensRow | null = null
  for (const lens of lenses) {
    if (unlocked.has(lens.slug)) current = lens
  }
  if (!current) return { current: null, next: null }
  const i = lenses.findIndex((l) => l.slug === current!.slug)
  return { current, next: lenses[i + 1] ?? null }
}

/**
 * Compute the on-demand lens state from data the reads loader already has:
 * ALL matched fragments (every lens) and the user's saved responses.
 */
export function computeLensState(
  lenses: LensRow[],
  unlocked: Set<string>,
  matchedAll: FragmentRow[],
  responses: Record<string, string>,
): LensState | null {
  const { current, next } = frontierOf(lenses, unlocked)
  if (!current) return null
  const inLens = matchedAll.filter((f) => lensOf(f) === current.slug)
  const answered = inLens.filter((f) => responses[String(f.id)]).length

  // vedic_deep unlocks by CLEARING every constellation of the current lens,
  // not by a response threshold — surface that progress for the UI.
  let clearedProgress: LensState["clearedProgress"] = null
  if (next?.slug === VEDIC_DEEP_SLUG && inLens.length > 0) {
    const respondedIds = new Set(
      inLens.filter((f) => responses[String(f.id)]).map((f) => String(f.id)),
    )
    // inLens is a single lens, so the depth tiebreak cannot change anything
    // here — passed anyway so the gate keeps matching the spiral's star rule
    // if this ever widens beyond one lens.
    clearedProgress = sectionClearProgress(
      inLens,
      respondedIds,
      lensRankFrom(lenses),
    )
  }

  return {
    current: { slug: current.slug, name: current.name },
    answered,
    total: inLens.length,
    next: next ? { slug: next.slug, name: next.name } : null,
    clearedProgress,
  }
}

/**
 * Unlock check, run whenever a read response is saved. If progress in the
 * user's highest unlocked lens has reached the NEXT lens's unlock_threshold,
 * insert that next lens (one lens ahead, never more). A lens with zero
 * matched fragments is a frontier — nothing unlocks past it.
 */
export async function maybeUnlockNextLens(
  supabase: SupabaseClient,
  profileId: string,
): Promise<void> {
  try {
    const lenses = await loadActiveLenses(supabase)
    if (lenses.length === 0) return
    const unlocked = await ensureUnlockedLenses(supabase, profileId, lenses)
    const { current, next } = frontierOf(lenses, unlocked)
    if (!current || !next) return

    // The user's chart, needed to know which fragments match.
    const { data: chartRow } = await supabase
      .from("charts")
      .select("planets, ascendant, houses, dashas")
      .eq("profile_id", profileId)
      .maybeSingle()
    if (!chartRow) return

    // Only the current lens's fragments matter for this check.
    const { data: fragmentRows, error: fragErr } = await supabase
      .from("fragments")
      .select("*")
      .eq("lens", current.slug)
      .order("weight", { ascending: false })
      .order("id", { ascending: true })
    if (fragErr) return
    const matched = matchFragments(
      chartRow as Chart,
      (fragmentRows ?? []) as FragmentRow[],
    )
    if (matched.length === 0) return // frontier lens — never unlock past it

    const ids = matched.map((f) => String(f.id))
    const { data: responseRows } = await supabase
      .from("read_responses")
      .select("fragment_id")
      .eq("profile_id", profileId)
      .in("fragment_id", ids)
    const respondedIds = new Set(
      (responseRows ?? []).map((r) =>
        String((r as { fragment_id: unknown }).fragment_id),
      ),
    )

    // vedic_deep: unlocks when EVERY constellation of the current lens is
    // cleared (section-clear rule), ignoring unlock_threshold. All other
    // lenses keep the threshold rule.
    let shouldUnlock: boolean
    if (next.slug === VEDIC_DEEP_SLUG) {
      // Also single-lens (queried with .eq("lens", current.slug)), so the
      // depth tiebreak is a no-op; the id tiebreak makes it deterministic.
      const { done, total } = sectionClearProgress(
        matched,
        respondedIds,
        lensRankFrom(lenses),
      )
      shouldUnlock = total > 0 && done >= total
    } else {
      shouldUnlock =
        respondedIds.size / matched.length >= asFraction(next.unlock_threshold)
    }

    if (shouldUnlock) {
      // `next` is by definition not in the user's unlocked set (checked
      // above), so a plain insert is safe without constraint assumptions.
      await supabase
        .from("user_lens_progress")
        .insert({ user_id: profileId, lens_slug: next.slug })
    }
  } catch (err) {
    // Unlocking is best-effort — never let it break saving a response.
    console.error("[spiral] lens unlock check failed:", err)
  }
}
