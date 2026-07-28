// The chart SECTIONS, in their fixed walking order. Each section is one
// run of reads along the spiral arm: a MAJOR read (weight >= 7, star) followed
// by its MINOR reads (glyphs) beaded outward. This file is the single source
// of truth for section order + accent colors. Labels render lowercase
// everywhere in UI — the keys ARE the display names. Sections with no
// fragments yet simply don't appear; they join the walk automatically as
// their content is imported.

export const SECTION_ORDER = [
  "the surface",
  "the heart",
  "mind",
  "the fire",
  "the taste",
  "growth",
  "the weight",
  "the center",
  "cluster",
  "the hunger",
  "the private",
] as const

export type SectionKey = (typeof SECTION_ORDER)[number]

// One accent per section, used by ALL of its reads once answered (and by the
// CURRENT ring on its major). Temperature arc: warm/light early, cooling
// through the middle, deeper and more saturated late, ending in the dim
// violet of the hidden room.
export const SECTION_COLORS: Record<SectionKey, string> = {
  "the surface": "#e8c06a", // light gold — the mask you were handed
  "the heart": "#e8907a", // warm peach-coral — the inner tide
  mind: "#8ecfdc", // pale cool cyan — the weather of thought
  "the fire": "#e0704e", // burnt ember-orange — the drive
  "the taste": "#d8a86e", // warm amber — what you reach for
  growth: "#5fd0a8", // sea green — where you widen
  "the weight": "#6e8fa8", // slate steel-blue — what you carry
  "the center": "#e8dc9a", // pale sun-gold — the core self
  cluster: "#4a90d8", // deep saturated blue — the knot of planets
  "the hunger": "#c85a8a", // deep magenta-rose — the pull of the nodes
  "the private": "#7a6f9e", // dim violet — the hidden room
}

/** Normalize a raw fragments.section value; unknown/null → null (caller
    falls back to deriving from the trigger). */
export function sectionOf(raw: string | null | undefined): SectionKey | null {
  const s = (raw ?? "").trim().toLowerCase()
  return (SECTION_ORDER as readonly string[]).includes(s)
    ? (s as SectionKey)
    : null
}

// ---------------------------------------------------------------------------
// Fallback derivation — used ONLY when fragments.section is null (the column
// may not exist yet, or a row wasn't backfilled). Reads the trigger type +
// condition and maps to a section by priority, so authored fragments spread
// across the journey instead of collapsing into one section:
//   ascendant_sign → the surface | moon_nakshatra → the heart |
//   moon → the heart | mercury/venus → mind | jupiter → growth |
//   conjunctions → cluster | rahu/ketu → the hunger |
//   saturn in the 12th → the private
//
// Trigger types whose condition has no `planet` key need an explicit rule here,
// otherwise they reach the final "the surface" fallback and quietly land an
// extra major in a section they do not belong to. moon_nakshatra ({ nakshatra })
// and antardasha ({ maha, antar }) are both such cases and are handled below.
// ---------------------------------------------------------------------------
function planetsIn(condition: unknown): string[] {
  if (!condition || typeof condition !== "object") return []
  const c = condition as Record<string, unknown>
  const out: string[] = []
  if (typeof c.planet === "string") out.push(c.planet.toLowerCase())
  if (Array.isArray(c.planets)) {
    for (const p of c.planets) if (typeof p === "string") out.push(p.toLowerCase())
  }
  // antardasha conditions are shaped { maha, antar } with no `planet` key, so
  // without these two they would carry no planet at all and collapse into the
  // final "the surface" fallback. The sub-period (antar) is the more specific
  // flavour, so it is listed first — though note the cascade below picks by its
  // own fixed priority, not by this order.
  if (typeof c.antar === "string") out.push(c.antar.toLowerCase())
  if (typeof c.maha === "string") out.push(c.maha.toLowerCase())
  return out
}

function houseIn(condition: unknown): number | null {
  if (!condition || typeof condition !== "object") return null
  const h = (condition as Record<string, unknown>).house
  return typeof h === "number" ? h : null
}

export function deriveSection(
  triggerType: string | null | undefined,
  condition: unknown,
): SectionKey {
  const trigger = (triggerType ?? "").trim().toLowerCase()
  if (trigger === "ascendant_sign") return "the surface"
  if (trigger === "conjunction") return "cluster"
  // moon_nakshatra conditions are shaped { nakshatra } with no `planet` key, so
  // the planet cascade below cannot see that they are about the Moon. Without
  // this rule all 135 of them fall through to "the surface" and land a second
  // major in a section they do not belong to.
  if (trigger === "moon_nakshatra") return "the heart"

  // planet_in_nakshatra and mahadasha both carry a `planet` key, so they route
  // correctly through the cascade below and need no rule of their own.
  const planets = planetsIn(condition)
  if (planets.includes("saturn") && houseIn(condition) === 12) return "the private"
  if (planets.includes("rahu") || planets.includes("ketu")) return "the hunger"
  if (planets.includes("moon")) return "the heart"
  if (planets.includes("jupiter")) return "growth"
  if (planets.includes("mercury") || planets.includes("venus")) return "mind"
  return "the surface"
}

/** The section for a fragment: explicit column value wins, else derived. */
export function sectionFor(
  section: string | null | undefined,
  triggerType: string | null | undefined,
  condition: unknown,
): SectionKey {
  return sectionOf(section) ?? deriveSection(triggerType, condition)
}

// ---------------------------------------------------------------------------
// Section shape shared by every consumer that groups reads into
// constellations (the spiral's walk, the section-clear rule in
// lib/self/lenses.ts, and through it the avatar's structural milestones).
// ---------------------------------------------------------------------------

/** A read's major/minor threshold — a section's star needs weight >= 7. */
export const MAJOR_WEIGHT = 7

/** The minimal fragment shape the section grouping needs. */
export type JourneyFragment = {
  id: string
  weight: number | null
  section?: string | null
  trigger_type: string | null
  condition: unknown
  /** which lens the read belongs to; absent/blank rows are treated as vedic */
  lens?: unknown
}

// ---------------------------------------------------------------------------
// THE STAR RULE — which read becomes a section's star when several qualify.
//
// A section can hold MORE THAN ONE major (weight >= MAJOR_WEIGHT): the base
// lens authors one, and a deeper lens can later add another to the same
// constellation. Ordering by weight alone leaves those tied, and every fetch
// site used to leave row order unpinned, so the star could flip between loads.
//
// The rule, in strict order:
//   1. weight descending      — the heaviest read leads
//   2. lens depth descending  — deeper lens wins (lenses.sort_order, higher
//                               is deeper). A deep major only ever appears
//                               after the base star is already answered, so it
//                               is that constellation's NEXT chapter and takes
//                               the star position; the base major stays in the
//                               section as an already-answered bright member.
//   3. id ascending           — final deterministic tiebreak, so the result
//                               never depends on row order from the database
//
// Because rule 1 sorts weight descending, the star is simply the first element
// of the ordered list: the heaviest read, which still stands in when nothing in
// the section reaches MAJOR_WEIGHT (unchanged from the previous behavior).
// ---------------------------------------------------------------------------

/** lens slug → depth. Higher is deeper. Built from the lenses table. */
export type LensRank = ReadonlyMap<string, number>

/** Normalize a lens value the same way lib/self/lenses.ts lensOf() does.
    Kept local so this module stays dependency-free (lenses.ts imports it). */
function lensSlugOf(lens: unknown): string {
  return typeof lens === "string" && lens.trim()
    ? lens.trim().toLowerCase()
    : "vedic"
}

/** Depth of a fragment's lens; unknown lenses sort shallowest. */
export function lensDepthOf(lens: unknown, rank?: LensRank): number {
  return rank?.get(lensSlugOf(lens)) ?? 0
}

/** Build a LensRank from the lenses table (sort_order; higher = deeper). */
export function lensRankFrom(
  lenses: readonly { slug: string; sort_order: number }[],
): LensRank {
  const m = new Map<string, number>()
  for (const l of lenses) {
    m.set(lensSlugOf(l.slug), Number(l.sort_order) || 0)
  }
  return m
}

/** Rebuild a LensRank from a plain object (crosses the server→client boundary
    as props, where a Map cannot be serialized). */
export function lensRankFromRecord(
  rank: Record<string, number> | null | undefined,
): LensRank {
  return new Map(Object.entries(rank ?? {}))
}

/** The star comparator: weight desc, then lens depth desc, then id asc. */
export function compareStarCandidates(
  a: JourneyFragment,
  b: JourneyFragment,
  rank?: LensRank,
): number {
  const wa = a.weight ?? 0
  const wb = b.weight ?? 0
  if (wa !== wb) return wb - wa
  const da = lensDepthOf(a.lens, rank)
  const db = lensDepthOf(b.lens, rank)
  if (da !== db) return db - da
  return String(a.id).localeCompare(String(b.id))
}

/** A section's reads in walk order — the star first, then its minis. */
export function orderSection<T extends JourneyFragment>(
  frags: readonly T[],
  rank?: LensRank,
): T[] {
  return [...frags].sort((a, b) => compareStarCandidates(a, b, rank))
}

/** A section's star, or null for an empty section. */
export function pickStar<T extends JourneyFragment>(
  frags: readonly T[],
  rank?: LensRank,
): T | null {
  return orderSection(frags, rank)[0] ?? null
}
