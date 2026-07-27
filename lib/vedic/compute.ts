// Server-side Vedic chart computation, extracted so both the /api/chart route
// and server actions (persistence / recovery) can compute a chart without an
// HTTP round-trip. Pure Node (ephemeris is CommonJS Moshier — no native deps).
import ephemeris from "ephemeris"
import {
  SIGNS,
  ascendantTropical,
  computeDashas,
  houseOf,
  julianDay,
  lahiriAyanamsa,
  meanNodeLongitude,
  nakshatraKeyOf,
  norm360,
  padaOf,
  place,
  zonedWallTimeToUtc,
} from "@/lib/vedic/astro"

// The calculation settings this engine implements, encoded as a version
// string stamped onto every saved chart (charts.calculation_version). Bump it
// whenever any of these change so stored charts can be told apart from ones
// computed under different settings:
//   vedic     — sidereal zodiac
//   lahiri    — Lahiri ayanamsa
//   wholesign — whole-sign houses
//   meannode  — Rahu/Ketu from the Moon's MEAN node
export const CALCULATION_VERSION = "vedic-lahiri-wholesign-meannode-v1"

// Bodies read straight from the ephemeris, in Vedic display order. Rahu/Ketu
// come from the Moon's mean node.
const EPHEMERIS_BODIES = [
  "sun",
  "moon",
  "mercury",
  "venus",
  "mars",
  "jupiter",
  "saturn",
] as const

export type ChartInput = {
  date?: string
  time?: string
  lat?: number
  lng?: number
  timezone?: string
}

export type ComputedChart = {
  meta: {
    utc: string
    julianDay: number
    ayanamsa: number
    ayanamsaName: string
    houseSystem: string
    zodiac: string
  }
  planets: {
    planet: string
    sign: string
    house: number
    degree: number
    nakshatra: string
    longitude: number
  }[]
  ascendant: {
    sign: string
    degree: number
    nakshatra: string
    longitude: number
  }
  houses: Record<number, { sign: string; planets: string[] }>
  dashas: ReturnType<typeof computeDashas>
  /** Moon's nakshatra, underscore spelling matching fragment conditions. */
  moon_nakshatra: string
  /** Quarter within the Moon's nakshatra, 1-4 (each 3°20'). */
  moon_pada: number
}

// Thrown for invalid input so callers can surface a clean message.
export class ChartInputError extends Error {}

/**
 * Computes a sidereal (Lahiri) Vedic chart. Throws ChartInputError on bad
 * input and a generic Error on calculation failure.
 */
export function computeChart(input: ChartInput): ComputedChart {
  const { date, time, lat, lng, timezone } = input

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date))
    throw new ChartInputError('date must be "YYYY-MM-DD"')
  if (!time || !/^\d{2}:\d{2}$/.test(time))
    throw new ChartInputError('time must be "HH:MM"')
  if (typeof lat !== "number" || lat < -90 || lat > 90)
    throw new ChartInputError("lat must be a number between -90 and 90")
  if (typeof lng !== "number" || lng < -180 || lng > 180)
    throw new ChartInputError("lng must be a number between -180 and 180")
  if (!timezone || typeof timezone !== "string")
    throw new ChartInputError(
      "timezone must be an IANA string like America/New_York",
    )

  const [year, month, day] = date.split("-").map(Number)
  const [hour, minute] = time.split(":").map(Number)

  // Wall-clock birth time in the given timezone -> exact UTC instant.
  let utcDate: Date
  try {
    utcDate = zonedWallTimeToUtc(year, month, day, hour, minute, timezone)
  } catch {
    throw new ChartInputError(`unknown timezone: ${timezone}`)
  }
  if (Number.isNaN(utcDate.getTime()))
    throw new ChartInputError("could not parse date/time")

  const jd = julianDay(utcDate)
  const ayanamsa = lahiriAyanamsa(jd)

  // Planets: tropical from ephemeris -> sidereal via ayanamsa.
  const eph = ephemeris.getAllPlanets(utcDate, lng, lat, 0)

  // `name` is widened to string so Rahu/Ketu can be pushed below.
  const planets: (ReturnType<typeof place> & { name: string })[] =
    EPHEMERIS_BODIES.map((name) => {
      const tropical = eph.observed[name].apparentLongitudeDd as number
      const sidereal = norm360(tropical - ayanamsa)
      return { name: name as string, ...place(sidereal) }
    })

  // Rahu (Moon's mean ascending node) and Ketu (exactly opposite).
  const rahuTropical = meanNodeLongitude(jd)
  const rahuSid = norm360(rahuTropical - ayanamsa)
  const ketuSid = norm360(rahuSid + 180)
  planets.push({ name: "rahu", ...place(rahuSid) })
  planets.push({ name: "ketu", ...place(ketuSid) })

  // Ascendant (lagna): tropical -> sidereal.
  const ascSid = norm360(ascendantTropical(jd, lat, lng) - ayanamsa)
  const ascPlacement = place(ascSid)
  const ascSignIndex = ascPlacement.signIndex

  // Whole-sign houses.
  const planetsWithHouse = planets.map((p) => ({
    planet: p.name,
    sign: p.sign,
    house: houseOf(p.signIndex, ascSignIndex),
    degree: Number(p.degree.toFixed(4)),
    nakshatra: p.nakshatra,
    longitude: Number(p.longitude.toFixed(4)),
  }))

  const houses: Record<number, { sign: string; planets: string[] }> = {}
  for (let h = 1; h <= 12; h++) {
    const signIndex = (ascSignIndex + (h - 1)) % 12
    houses[h] = {
      sign: SIGNS[signIndex],
      planets: planetsWithHouse
        .filter((p) => p.house === h)
        .map((p) => p.planet),
    }
  }

  // Vimshottari dashas from the Moon's nakshatra.
  const moon = planets.find((p) => p.name === "moon")!
  const dashas = computeDashas(moon.longitude, utcDate, new Date())

  // The Moon's nakshatra (underscore spelling, matched on by 'moon_nakshatra'
  // fragments) and pada. Embedded onto the moon entry in `planets` too so
  // the values persist through the existing charts row (planets jsonb)
  // without any schema change.
  const moonNakshatra = nakshatraKeyOf(moon.longitude)
  const moonPada = padaOf(moon.longitude)
  const moonRow = planetsWithHouse.find((p) => p.planet === "moon")
  if (moonRow) {
    Object.assign(moonRow, {
      moon_nakshatra: moonNakshatra,
      moon_pada: moonPada,
    })
  }

  return {
    meta: {
      utc: utcDate.toISOString(),
      julianDay: Number(jd.toFixed(6)),
      ayanamsa: Number(ayanamsa.toFixed(6)),
      ayanamsaName: "lahiri",
      houseSystem: "whole-sign",
      zodiac: "sidereal",
    },
    planets: planetsWithHouse,
    ascendant: {
      sign: ascPlacement.sign,
      degree: Number(ascPlacement.degree.toFixed(4)),
      nakshatra: ascPlacement.nakshatra,
      longitude: Number(ascPlacement.longitude.toFixed(4)),
    },
    houses,
    dashas,
    moon_nakshatra: moonNakshatra,
    moon_pada: moonPada,
  }
}
