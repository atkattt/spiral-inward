import { SECTION_ORDER, sectionFor } from "@/lib/spiral/sections"

/** How many sections (a star + all its smaller ones) must be complete to open bonds. */
export const BONDS_UNLOCK_SECTIONS = 3

/**
 * The minimum a fragment must carry for the grouping below to place it. Kept
 * structural (and id deliberately loose) so BOTH callers fit without casts:
 * the client passes UniverseFragment (string ids), the server passes
 * FragmentRow (numeric ids). Ids are normalised with String() before lookup.
 */
type UnlockFragment = {
  id: string | number
  section?: string | null
  trigger_type?: string | null
  condition?: unknown
}

export type BondsUnlock = {
  /** Sections whose every read has been answered. */
  completedSections: number
  /** Sections that must be complete — clamped to what the sky actually has. */
  threshold: number
  /** How many sections are still owed. 0 means open. */
  remaining: number
  /** The sky has learned something, so bonds can be hinted at. */
  visible: boolean
  /** Bonds are fully open. */
  unlocked: boolean
}

/**
 * THE BONDS GATE — one rule, shared by everything that enforces it.
 *
 * A bond read needs enough of your chart to say something true about you AND
 * someone else, so bonds stay shut until three sections are finished.
 *
 * This lives in lib (not in the spiral component) because three separate
 * places must agree on it: the spiral's dimmed invitation, the menu's Bonds
 * entry, and the /bonds route guard. When the rule lived only inside
 * SpiralUniverse, the menu happily linked past a lock the spiral was drawing.
 *
 * "Complete" means EVERY read in the section is answered — deliberately
 * stricter than lib/self/lenses.ts#sectionClearProgress, which only requires
 * the major plus two minors. That helper drives creature growth, where partial
 * credit is wanted; the gate copy promises "the star and all its smaller
 * ones", so the gate uses the strict reading. Do not swap one for the other.
 */
/**
 * TEMPORARY stub: Bonds is currently a permanently-locked menu entry.
 *
 * Bonds was pulled off the spiral (no more add-person affordance, no in-sky
 * people/bond markers), and the feature it gates — reads about you and someone
 * else — depends on lenses that don't exist yet. Rather than compute a gate the
 * user could satisfy and then hit an empty feature, we hold it closed until the
 * lenses ship. When they do, delete this and call `bondsUnlockState` with the
 * real fragments + respondedIds; the shape is identical, so nothing downstream
 * changes.
 */
export function bondsGateStub(): BondsUnlock {
  return {
    completedSections: 0,
    threshold: BONDS_UNLOCK_SECTIONS,
    remaining: BONDS_UNLOCK_SECTIONS,
    visible: false,
    unlocked: false,
  }
}

export function bondsUnlockState(
  fragments: readonly UnlockFragment[],
  respondedIds: ReadonlySet<string>,
): BondsUnlock {
  const groups = new Map<string, UnlockFragment[]>()
  for (const f of fragments) {
    const key = sectionFor(f.section, f.trigger_type, f.condition)
    const g = groups.get(key)
    if (g) g.push(f)
    else groups.set(key, [f])
  }

  // Mirror the spiral's own ordering so "sections that exist" counts the same
  // set the user can actually see and walk.
  const present = SECTION_ORDER.filter((s) => groups.has(s))

  let completedSections = 0
  for (const key of present) {
    const reads = groups.get(key)!
    if (reads.every((r) => respondedIds.has(String(r.id)))) completedSections++
  }

  // Clamped to the sections that actually EXIST: a sparse chart can yield
  // fewer than three, and an unclamped threshold would leave that user
  // staring at a permanently locked door with no way through. Finishing
  // everything the sky has must always be enough.
  const threshold = Math.min(BONDS_UNLOCK_SECTIONS, Math.max(1, present.length))
  const remaining = Math.max(0, threshold - completedSections)

  return {
    completedSections,
    threshold,
    remaining,
    // The invitation appears once the FIRST section is done — the sky has
    // learned something about you, so it can hint at bonds.
    visible: completedSections >= 1,
    unlocked: remaining === 0,
  }
}
