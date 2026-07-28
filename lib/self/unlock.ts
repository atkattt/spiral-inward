// Shared gate for the "talk to your self" conversation.
//
// The chat opens once BOTH vedic phases are finished: every constellation
// cleared in `vedic` AND every constellation cleared in `vedic_deep`.
//
// It used to open on the reveal frontier passing a radius (a proxy for "enough
// reads accumulated"). That was a percentage-ish proxy for progress; the gate is
// now the actual milestone, so the voice only speaks once it has both phases of
// material to speak from.
import { sectionClearProgress, lensOf } from "@/lib/self/lenses"
import { lensRankFromRecord } from "@/lib/spiral/sections"
import type { FragmentRow } from "@/lib/self/reads-data"

/** The two phases that must both be finished before the chat opens. */
export const CHAT_UNLOCK_LENSES = ["vedic", "vedic_deep"] as const

export type LensClearState = {
  slug: string
  /** constellations cleared / total, by the EXISTING section-clear rule */
  done: number
  total: number
  /**
   * True when this lens has no matched fragments for the chart at all. Distinct
   * from `total > 0 && done === 0`: nothing is authored/matched to clear yet, so
   * the phase can't be worked on — the UI shows it as "locked" rather than "0 of 0".
   */
  empty: boolean
  /** finished: has constellations and every one of them is cleared */
  complete: boolean
}

/**
 * Per-lens section-clear progress for the two vedic phases.
 *
 * `matched` spans every lens, so it is split per lens and the EXISTING
 * section-clear rule is applied within each — the same call the lens
 * progression and the avatar already make. The section-clear rule itself is
 * untouched.
 */
export function lensClearStates(
  matched: FragmentRow[],
  respondedIds: ReadonlySet<string>,
  lensRanks?: Record<string, number>,
): LensClearState[] {
  const rank = lensRankFromRecord(lensRanks)
  return CHAT_UNLOCK_LENSES.map((slug) => {
    const inLens = matched.filter((f) => lensOf(f) === slug)
    if (inLens.length === 0) {
      return { slug, done: 0, total: 0, empty: true, complete: false }
    }
    const { done, total } = sectionClearProgress(inLens, respondedIds, rank)
    return {
      slug,
      done,
      total,
      empty: false,
      complete: total > 0 && done >= total,
    }
  })
}

/**
 * The gate: both vedic phases finished.
 *
 * A phase with nothing matched is NOT complete — otherwise a chart that happens
 * to match no vedic_deep fragments would open the chat for free, which is the
 * opposite of the intent.
 */
export function chatUnlocked(states: LensClearState[]): boolean {
  return (
    states.length === CHAT_UNLOCK_LENSES.length &&
    states.every((s) => s.complete)
  )
}

/** Convenience: compute states + gate straight from reads data. */
export function chatUnlockedFrom(
  matched: FragmentRow[],
  respondedIds: ReadonlySet<string>,
  lensRanks?: Record<string, number>,
): { states: LensClearState[]; unlocked: boolean } {
  const states = lensClearStates(matched, respondedIds, lensRanks)
  return { states, unlocked: chatUnlocked(states) }
}

/**
 * Overall progress through the whole vedic journey — both phases as ONE number,
 * for the locked panel's percentage.
 *
 * Must be given fragments from EVERY lens (the loader's `matchedAll`), not the
 * unlock-gated `matched` the client sees. `vedic_deep`'s constellations are
 * invisible until that lens opens, so a percentage computed from gated data
 * would read 100% the moment `vedic` was cleared — while the chat was still
 * locked, which is exactly the thing this number is supposed to track.
 *
 * Summed PER LENS rather than over one merged pool: section keys repeat across
 * lenses (both phases have "the surface"), so grouping the two together would
 * collapse them into one set of constellations and roughly halve the total.
 */
export function vedicJourneyProgress(
  matchedAll: FragmentRow[],
  respondedIds: ReadonlySet<string>,
  lensRanks?: Record<string, number>,
): { done: number; total: number } {
  const rank = lensRankFromRecord(lensRanks)
  let done = 0
  let total = 0
  for (const slug of CHAT_UNLOCK_LENSES) {
    const inLens = matchedAll.filter((f) => lensOf(f) === slug)
    if (inLens.length === 0) continue
    const p = sectionClearProgress(inLens, respondedIds, rank)
    done += p.done
    total += p.total
  }
  return { done, total }
}

/**
 * The locked panel's percentage, 0–100.
 *
 * Clamped to 99 until the gate actually opens so the bar can never sit at 100%
 * next to a locked panel — the two are computed from different scopes
 * (all-lens progress vs. the unlock-gated gate), and this makes "100% means
 * unlocked" true by construction rather than by assuming they agree.
 */
export function journeyPercent(
  progress: { done: number; total: number },
  unlocked: boolean,
): number {
  if (unlocked) return 100
  if (progress.total <= 0) return 0
  const pct = Math.floor((progress.done / progress.total) * 100)
  return Math.max(0, Math.min(99, pct))
}
