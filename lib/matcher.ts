// The fragment matcher: given a computed chart (the shape /api/chart returns)
// and a list of interpretation fragments, return the fragments whose `condition`
// is satisfied by the chart, sorted by `weight` descending.
//
// Design notes:
// - All comparisons are case-insensitive; condition values are treated as
//   lowercase (chart values already are).
// - If a condition references a field that's missing from the chart (or the
//   condition itself is malformed), that fragment simply doesn't match — we
//   never throw.
import { nakshatraKeyOf } from "@/lib/vedic/astro"

// ---- chart shape (loose — we only read what we need) ----------------------
export type ChartPlanet = {
  planet: string
  sign: string
  house: number | string
  degree?: number
  nakshatra?: string
  longitude?: number
  // Stored on the moon entry only (underscore spelling, e.g. "purva_phalguni")
  moon_nakshatra?: string
  moon_pada?: number
}

export type Chart = {
  planets?: ChartPlanet[]
  ascendant?: { sign?: string; degree?: number; nakshatra?: string }
  moon_nakshatra?: string
  moon_pada?: number
  houses?: Record<string, { sign?: string; planets?: string[] }>
  dashas?: {
    current?: {
      lord?: string
      currentAntardasha?: { lord?: string } | null
    }
  }
}

export type Fragment = {
  trigger_type?: string | null
  condition?: unknown
  weight?: number | null
  [key: string]: unknown
}

// ---- traditional Vedic rulership + exaltation tables ----------------------
const RULERS: Record<string, string> = {
  aries: "mars",
  taurus: "venus",
  gemini: "mercury",
  cancer: "moon",
  leo: "sun",
  virgo: "mercury",
  libra: "venus",
  scorpio: "mars",
  sagittarius: "jupiter",
  capricorn: "saturn",
  aquarius: "saturn",
  pisces: "jupiter",
}

const SIGN_ORDER = [
  "aries",
  "taurus",
  "gemini",
  "cancer",
  "leo",
  "virgo",
  "libra",
  "scorpio",
  "sagittarius",
  "capricorn",
  "aquarius",
  "pisces",
]

const EXALTATION: Record<string, string> = {
  sun: "aries",
  moon: "taurus",
  mercury: "virgo",
  venus: "pisces",
  mars: "capricorn",
  jupiter: "cancer",
  saturn: "libra",
  rahu: "taurus",
  ketu: "scorpio",
}

// Debilitation is the sign opposite the exaltation sign.
const oppositeSign = (sign: string): string | undefined => {
  const i = SIGN_ORDER.indexOf(sign)
  return i === -1 ? undefined : SIGN_ORDER[(i + 6) % 12]
}

// ---- small case-insensitive helpers ---------------------------------------
const lc = (v: unknown): string | undefined =>
  v === null || v === undefined ? undefined : String(v).trim().toLowerCase()

// Loose equality: works for both "10"/10 (houses) and "mars"/"Mars".
const eq = (a: unknown, b: unknown): boolean => {
  const la = lc(a)
  const lb = lc(b)
  return la !== undefined && lb !== undefined && la === lb
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v)
}

// ---- chart lookups ---------------------------------------------------------
function findPlanet(chart: Chart, name: unknown): ChartPlanet | undefined {
  const target = lc(name)
  if (!target || !Array.isArray(chart.planets)) return undefined
  return chart.planets.find((p) => lc(p.planet) === target)
}

// The Moon's nakshatra in the underscore spelling fragment conditions use.
// Prefers the stored value (chart-level, then the moon planet entry) and
// falls back to deriving it from the stored moon longitude — so charts saved
// before moon_nakshatra existed still match without waiting for a backfill.
function moonNakshatraOf(chart: Chart): string | undefined {
  const stored = lc(chart.moon_nakshatra)
  if (stored) return stored
  const moon = findPlanet(chart, "moon")
  const onMoon = lc(moon?.moon_nakshatra)
  if (onMoon) return onMoon
  if (typeof moon?.longitude === "number") {
    return nakshatraKeyOf(moon.longitude)
  }
  return undefined
}

// Ruling planet of whichever sign occupies a given house number.
function houseLord(chart: Chart, houseNumber: unknown): string | undefined {
  const key = lc(houseNumber)
  if (!key || !chart.houses) return undefined
  const house = chart.houses[key] ?? chart.houses[String(Number(key))]
  const sign = lc(house?.sign)
  return sign ? RULERS[sign] : undefined
}

// Dignity of a planet given the sign it sits in (exalted/debilitated/own/none).
function dignityOf(planet: string, sign: string): string {
  if (EXALTATION[planet] === sign) return "exalted"
  if (oppositeSign(EXALTATION[planet]) === sign) return "debilitated"
  if (RULERS[sign] === planet) return "own"
  return "none"
}

// ---- the per-trigger matching rules ----------------------------------------
function matchesCondition(
  triggerType: string,
  condition: Record<string, unknown>,
  chart: Chart,
): boolean {
  switch (triggerType) {
    case "planet_in_house": {
      const p = findPlanet(chart, condition.planet)
      return !!p && eq(p.house, condition.house)
    }

    case "planet_in_sign": {
      const p = findPlanet(chart, condition.planet)
      return !!p && eq(p.sign, condition.sign)
    }

    case "planet_in_sign_and_house": {
      const p = findPlanet(chart, condition.planet)
      return !!p && eq(p.sign, condition.sign) && eq(p.house, condition.house)
    }

    case "planet_in_nakshatra": {
      const p = findPlanet(chart, condition.planet)
      return !!p && eq(p.nakshatra, condition.nakshatra)
    }

    case "moon_nakshatra":
      return eq(moonNakshatraOf(chart), condition.nakshatra)

    case "ascendant_sign":
      return eq(chart.ascendant?.sign, condition.sign)

    case "mahadasha":
      return eq(chart.dashas?.current?.lord, condition.planet)

    case "antardasha":
      return (
        eq(chart.dashas?.current?.lord, condition.maha) &&
        eq(chart.dashas?.current?.currentAntardasha?.lord, condition.antar)
      )

    case "conjunction": {
      const planets = condition.planets
      if (!Array.isArray(planets) || planets.length === 0) return false
      return planets.every((name) => {
        const p = findPlanet(chart, name)
        if (!p) return false
        if (!eq(p.house, condition.house)) return false
        // Sign is optional — only enforced when present in the condition.
        if (condition.sign !== undefined && !eq(p.sign, condition.sign))
          return false
        return true
      })
    }

    case "house_lord_in_house": {
      const lord = houseLord(chart, condition.lord_of)
      if (!lord) return false
      const p = findPlanet(chart, lord)
      return !!p && eq(p.house, condition.placed_in)
    }

    case "planet_dignity": {
      const planet = lc(condition.planet)
      const wanted = lc(condition.dignity)
      if (!planet || !wanted) return false
      const p = findPlanet(chart, planet)
      const sign = lc(p?.sign)
      if (!sign) return false
      return dignityOf(planet, sign) === wanted
    }

    default:
      // Unknown trigger types never match.
      return false
  }
}

// ---- public API ------------------------------------------------------------
export function matchFragments<T extends Fragment>(
  chart: Chart,
  fragments: T[],
): T[] {
  if (!Array.isArray(fragments)) return []

  const matched = fragments.filter((fragment) => {
    const triggerType = lc(fragment.trigger_type)
    if (!triggerType) return false
    if (!isRecord(fragment.condition)) return false
    try {
      return matchesCondition(triggerType, fragment.condition, chart)
    } catch {
      // Defensive: a malformed condition must never crash the matcher.
      return false
    }
  })

  return matched.sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0))
}
