// Pure Vedic/sidereal astrology math. No external deps, no I/O — everything
// here is deterministic given its inputs, so it runs anywhere (serverless) and
// is easy to sanity-check. The route supplies tropical planet longitudes from
// the ephemeris package; this module handles ayanamsa, the ascendant, whole-
// sign houses, nakshatras, and the Vimshottari dasha timeline.

export const SIGNS = [
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
] as const

// 27 nakshatras, each 13°20' (= 360/27) starting at 0° sidereal aries.
export const NAKSHATRAS = [
  "ashwini",
  "bharani",
  "krittika",
  "rohini",
  "mrigashira",
  "ardra",
  "punarvasu",
  "pushya",
  "ashlesha",
  "magha",
  "purva phalguni",
  "uttara phalguni",
  "hasta",
  "chitra",
  "swati",
  "vishakha",
  "anuradha",
  "jyeshtha",
  "mula",
  "purva ashadha",
  "uttara ashadha",
  "shravana",
  "dhanishta",
  "shatabhisha",
  "purva bhadrapada",
  "uttara bhadrapada",
  "revati",
] as const

// The same 27 nakshatras with the underscore spellings used by fragment
// conditions (e.g. "purva_phalguni"). Index-aligned with NAKSHATRAS.
export const NAKSHATRA_KEYS = NAKSHATRAS.map((n) =>
  n.replace(/ /g, "_"),
) as readonly string[]

// Nakshatra key (underscore spelling) for a sidereal longitude.
export function nakshatraKeyOf(siderealLongitude: number): string {
  const lon = norm360(siderealLongitude)
  return NAKSHATRA_KEYS[Math.floor(lon / NAK_LEN) % 27]
}

// Pada (quarter within the nakshatra, 1-4, each 3°20') for a sidereal
// longitude.
export function padaOf(siderealLongitude: number): number {
  const lon = norm360(siderealLongitude)
  const posInNak = lon - Math.floor(lon / NAK_LEN) * NAK_LEN
  return Math.min(4, Math.floor(posInNak / (NAK_LEN / 4)) + 1)
}

// Vimshottari cycle: the 9 dasha lords in order, with their period lengths in
// years (total = 120). The lord of a nakshatra is DASHA_SEQUENCE[index % 9].
export const DASHA_SEQUENCE = [
  { name: "ketu", years: 7 },
  { name: "venus", years: 20 },
  { name: "sun", years: 6 },
  { name: "moon", years: 10 },
  { name: "mars", years: 7 },
  { name: "rahu", years: 18 },
  { name: "jupiter", years: 16 },
  { name: "saturn", years: 19 },
  { name: "mercury", years: 17 },
] as const

const NAK_LEN = 360 / 27 // 13.3333... degrees per nakshatra
const YEAR_MS = 365.25 * 24 * 3600 * 1000 // Vedic dasha year length

const deg2rad = (d: number) => (d * Math.PI) / 180
const rad2deg = (r: number) => (r * 180) / Math.PI
export const norm360 = (d: number) => ((d % 360) + 360) % 360

// Julian Day (UT) from a JS Date (which is a UTC instant).
export function julianDay(date: Date): number {
  return date.getTime() / 86400000 + 2440587.5
}

// Lahiri (Chitrapaksha) ayanamsa. Computed, not hardcoded: anchored at the
// J2000 value and accumulated with the IAU general precession in longitude, so
// it grows ~50.29"/yr (≈ 24.20° in 2025).
export function lahiriAyanamsa(jd: number): number {
  const T = (jd - 2451545.0) / 36525 // Julian centuries from J2000
  const AYANAMSA_J2000 = 23.8525 // Lahiri ayanamsa at J2000.0 (degrees)
  // General precession in longitude accumulated since J2000 (arcseconds).
  const precessionArcsec = 5028.796195 * T + 1.1054348 * T * T
  return AYANAMSA_J2000 + precessionArcsec / 3600
}

// Mean obliquity of the ecliptic (Meeus), degrees.
function obliquity(jd: number): number {
  const T = (jd - 2451545.0) / 36525
  const arcsec =
    84381.448 - 46.815 * T - 0.00059 * T * T + 0.001813 * T * T * T
  return arcsec / 3600
}

// Greenwich Mean Sidereal Time in degrees (IAU 1982, Meeus).
function gmst(jd: number): number {
  const T = (jd - 2451545.0) / 36525
  const g =
    280.46061837 +
    360.98564736629 * (jd - 2451545.0) +
    0.000387933 * T * T -
    (T * T * T) / 38710000
  return norm360(g)
}

// Tropical longitude of the ascendant (lagna) from JD, latitude, longitude.
// Uses the local sidereal time (RAMC) and the standard rising-point formula.
export function ascendantTropical(
  jd: number,
  latDeg: number,
  lngDeg: number,
): number {
  const lst = norm360(gmst(jd) + lngDeg) // local sidereal time = RAMC, east +
  const ramc = deg2rad(lst)
  const eps = deg2rad(obliquity(jd))
  const lat = deg2rad(latDeg)
  const asc = Math.atan2(
    Math.cos(ramc),
    -(Math.sin(ramc) * Math.cos(eps) + Math.tan(lat) * Math.sin(eps)),
  )
  return norm360(rad2deg(asc))
}

// Mean longitude of the Moon's ascending node (Rahu), tropical, degrees.
export function meanNodeLongitude(jd: number): number {
  const T = (jd - 2451545.0) / 36525
  const omega =
    125.0445479 -
    1934.1362891 * T +
    0.0020754 * T * T +
    (T * T * T) / 467441 -
    (T * T * T * T) / 60616000
  return norm360(omega)
}

export type Placement = {
  longitude: number // sidereal longitude, 0..360
  sign: string
  signIndex: number
  degree: number // degree within the sign, 0..30
  nakshatra: string
}

// Turn a sidereal longitude into sign / degree-in-sign / nakshatra.
export function place(siderealLongitude: number): Placement {
  const lon = norm360(siderealLongitude)
  const signIndex = Math.floor(lon / 30)
  const degree = lon - signIndex * 30
  const nakIndex = Math.floor(lon / NAK_LEN) % 27
  return {
    longitude: lon,
    sign: SIGNS[signIndex],
    signIndex,
    degree,
    nakshatra: NAKSHATRAS[nakIndex],
  }
}

// Whole-sign house of a body: house 1 is the ascendant's whole sign.
export function houseOf(planetSignIndex: number, ascSignIndex: number): number {
  return ((planetSignIndex - ascSignIndex + 12) % 12) + 1
}

const toISODate = (d: Date) => d.toISOString().slice(0, 10)
const addYears = (d: Date, years: number) =>
  new Date(d.getTime() + years * YEAR_MS)

export type DashaPeriod = { lord: string; start: string; end: string }
export type DashaResult = {
  timeline: DashaPeriod[]
  current: DashaPeriod & {
    antardashas: DashaPeriod[]
    currentAntardasha: DashaPeriod | null
  }
}

// Vimshottari mahadasha timeline from the Moon's sidereal longitude at birth,
// plus antardashas for whichever mahadasha is running "now".
export function computeDashas(
  moonSiderealLongitude: number,
  birth: Date,
  now: Date,
): DashaResult {
  const lon = norm360(moonSiderealLongitude)
  const nakIndex = Math.floor(lon / NAK_LEN) % 27
  const startLordIdx = nakIndex % 9
  const posInNak = lon - Math.floor(lon / NAK_LEN) * NAK_LEN
  const elapsedFraction = posInNak / NAK_LEN // how far through the nakshatra
  const startLord = DASHA_SEQUENCE[startLordIdx]
  const balanceYears = (1 - elapsedFraction) * startLord.years

  // Timeline: the balance of the birth dasha, then the following lords in
  // order (one full round of the cycle).
  const timeline: (DashaPeriod & { years: number })[] = []
  let cursor = new Date(birth)
  const firstEnd = addYears(cursor, balanceYears)
  timeline.push({
    lord: startLord.name,
    start: toISODate(cursor),
    end: toISODate(firstEnd),
    years: balanceYears,
  })
  cursor = firstEnd
  for (let i = 1; i <= 8; i++) {
    const lord = DASHA_SEQUENCE[(startLordIdx + i) % 9]
    const end = addYears(cursor, lord.years)
    timeline.push({
      lord: lord.name,
      start: toISODate(cursor),
      end: toISODate(end),
      years: lord.years,
    })
    cursor = end
  }

  // Which mahadasha is running now?
  const nowMs = now.getTime()
  let currentIdx = timeline.findIndex(
    (p) =>
      nowMs >= new Date(p.start).getTime() && nowMs < new Date(p.end).getTime(),
  )
  if (currentIdx === -1) currentIdx = nowMs < birth.getTime() ? 0 : timeline.length - 1
  const current = timeline[currentIdx]

  // Reconstruct the FULL mahadasha span so antardasha proportions are correct
  // even for the partial birth dasha (whose true start precedes birth).
  const mahaLordIdx = DASHA_SEQUENCE.findIndex((l) => l.name === current.lord)
  const fullYears = DASHA_SEQUENCE[mahaLordIdx].years
  const fullStart =
    currentIdx === 0
      ? addYears(new Date(current.end), -fullYears)
      : new Date(current.start)

  const antardashas: DashaPeriod[] = []
  let ac = new Date(fullStart)
  for (let i = 0; i < 9; i++) {
    const sub = DASHA_SEQUENCE[(mahaLordIdx + i) % 9]
    const subYears = (fullYears * sub.years) / 120
    const end = addYears(ac, subYears)
    antardashas.push({
      lord: sub.name,
      start: toISODate(ac),
      end: toISODate(end),
    })
    ac = end
  }
  const currentAntardasha =
    antardashas.find(
      (p) =>
        nowMs >= new Date(p.start).getTime() &&
        nowMs < new Date(p.end).getTime(),
    ) ?? null

  return {
    timeline: timeline.map(({ lord, start, end }) => ({ lord, start, end })),
    current: {
      lord: current.lord,
      start: current.start,
      end: current.end,
      antardashas,
      currentAntardasha,
    },
  }
}

// Convert a wall-clock time in an IANA timezone to a UTC Date, using Intl so we
// need no timezone database dependency. Handles DST via a one-step refinement.
export function zonedWallTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute, 0)
  const offset1 = tzOffsetMs(timeZone, new Date(guess))
  let utc = guess - offset1
  const offset2 = tzOffsetMs(timeZone, new Date(utc))
  if (offset2 !== offset1) utc = guess - offset2
  return new Date(utc)
}

// Milliseconds that the given timezone is ahead of UTC at the given instant.
function tzOffsetMs(timeZone: string, date: Date): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
  const parts = dtf.formatToParts(date)
  const map: Record<string, string> = {}
  for (const p of parts) if (p.type !== "literal") map[p.type] = p.value
  const asUTC = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    Number(map.hour),
    Number(map.minute),
    Number(map.second),
  )
  return asUTC - date.getTime()
}
