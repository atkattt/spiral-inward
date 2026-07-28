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
}
