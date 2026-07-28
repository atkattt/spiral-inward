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

/** Display name for a phase in the locked status list. */
export function lensLabel(slug: string): string {
  return slug === "vedic_deep" ? "vedic deeper" : "vedic"
}
