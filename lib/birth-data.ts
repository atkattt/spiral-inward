// Shared shapes + parsing for the onboarding birth-data ritual.
//
// TerminalOnboarding stores raw, human-formatted answers in sessionStorage:
//   date: "MM / DD / YYYY"   time: "HH : MM AM"|"(time unknown)"|""   place: "city, country"
// The chart engine (/api/chart) needs an ISO date, a 24h time, and lat/lng/tz.
// These helpers bridge the two.

export const BIRTH_DATA_KEY = "spiral_birth_data"
export const BIRTH_NORMALIZED_KEY = "spiral_birth_normalized"
export const CHART_KEY = "spiral_chart"
/** Provenance for the stash above: who it belongs to, and when it was made. */
export const BIRTH_STAMP_KEY = "spiral_birth_stamp"

/** Every key the onboarding ritual writes into browser storage. */
export const BIRTH_STASH_KEYS = [
  BIRTH_DATA_KEY,
  BIRTH_NORMALIZED_KEY,
  CHART_KEY,
  BIRTH_STAMP_KEY,
] as const

/**
 * The birth stash lives in localStorage so it can survive a sign-in that lands
 * in a new tab (OAuth, email confirm link). That durability is also a hazard:
 * localStorage outlives sign-out, so without provenance an abandoned stash
 * would be silently adopted by the NEXT person to sign in on the same browser,
 * handing them someone else's birth chart.
 *
 * `ownerId` is null while the ritual is still anonymous (onboarding happens
 * before there's an account). The first authenticated visitor to consume an
 * anonymous stash claims it; a stash already claimed by a different user id is
 * discarded rather than persisted.
 */
export type BirthStashStamp = {
  createdAt: number
  ownerId: string | null
}

/**
 * How long an unclaimed stash may sit before we stop trusting it. Long enough
 * for a slow OAuth round trip, short enough that yesterday's abandoned ritual
 * never lands in today's new account.
 */
export const BIRTH_STASH_MAX_AGE_MS = 60 * 60 * 1000

export function stampBirthStash(ownerId: string | null = null): void {
  try {
    const existing = readBirthStashStamp()
    const stamp: BirthStashStamp = {
      // Keep the original creation time when re-stamping (e.g. on claim), so
      // claiming a stash can't extend its freshness window indefinitely.
      createdAt: existing?.createdAt ?? Date.now(),
      ownerId,
    }
    localStorage.setItem(BIRTH_STAMP_KEY, JSON.stringify(stamp))
  } catch {
    // storage unavailable (private mode) — the stash won't persist either.
  }
}

export function readBirthStashStamp(): BirthStashStamp | null {
  try {
    const raw =
      localStorage.getItem(BIRTH_STAMP_KEY) ??
      sessionStorage.getItem(BIRTH_STAMP_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<BirthStashStamp>
    if (typeof parsed?.createdAt !== "number") return null
    return {
      createdAt: parsed.createdAt,
      ownerId: typeof parsed.ownerId === "string" ? parsed.ownerId : null,
    }
  } catch {
    return null
  }
}

/** Remove the onboarding stash (and its stamp) from both storages. */
export function clearBirthStash(): void {
  try {
    for (const key of BIRTH_STASH_KEYS) {
      localStorage.removeItem(key)
      sessionStorage.removeItem(key)
    }
  } catch {
    // storage unavailable (private mode) — nothing stashed to clear.
  }
}

/**
 * Decide whether `userId` may consume the stash currently in storage.
 *
 * - unstamped: written before this guard existed — treat as anonymous.
 * - owned by someone else: never adopt it.
 * - anonymous but stale: too old to trust.
 */
export function canConsumeBirthStash(
  userId: string,
  stamp: BirthStashStamp | null,
  now: number = Date.now(),
): boolean {
  if (stamp?.ownerId && stamp.ownerId !== userId) return false
  if (!stamp) return true
  if (stamp.ownerId === userId) return true
  return now - stamp.createdAt <= BIRTH_STASH_MAX_AGE_MS
}

export type RawBirthData = {
  date?: string
  time?: string
  place?: string
  timeUnknown?: boolean
  /** Resolved geocode pick from the onboarding typeahead (canonical label +
      coords + timezone). When present, the threshold read uses it directly
      and never re-geocodes free text. */
  placePick?: {
    label: string
    name: string
    admin1: string | null
    country: string | null
    lat: number
    lng: number
    timezone: string
  }
}

export type NormalizedBirthData = {
  // ISO date, e.g. "1990-01-01"
  date: string
  // 24h wall-clock time, e.g. "13:45". Defaults to noon when unknown.
  time: string
  timeUnknown: boolean
  place: string
}

// "MM / DD / YYYY" (possibly partial) -> "YYYY-MM-DD". Throws if incomplete.
export function parseDate(raw: string | undefined): string {
  const digits = (raw ?? "").replace(/\D/g, "")
  if (digits.length < 8) throw new Error("please enter a full birth date")
  const mm = digits.slice(0, 2)
  const dd = digits.slice(2, 4)
  const yyyy = digits.slice(4, 8)

  const month = Number(mm)
  const day = Number(dd)
  const year = Number(yyyy)
  if (month < 1 || month > 12) throw new Error("that month looks off")
  if (day < 1 || day > 31) throw new Error("that day looks off")
  if (year < 1900 || year > 2100) throw new Error("that year looks off")

  return `${yyyy}-${mm}-${dd}`
}

// "HH : MM AM" -> "HH:MM" (24h). When the time is unknown we use noon, a
// standard convention that keeps the planets accurate even if the ascendant
// (which needs an exact time) is approximate.
export function parseTime(
  raw: string | undefined,
  timeUnknown: boolean | undefined,
): string {
  if (timeUnknown || !raw || raw.includes("unknown")) return "12:00"

  const meridiemMatch = raw.toUpperCase().match(/\b(AM|PM)\b/)
  const meridiem = meridiemMatch ? meridiemMatch[1] : null

  const digits = raw.replace(/[^\d]/g, "")
  if (digits.length < 3) return "12:00"
  const hh = digits.slice(0, 2)
  const mm = digits.slice(2, 4).padEnd(2, "0")

  let hour = Number(hh)
  const minute = Number(mm)
  if (meridiem === "AM") {
    if (hour === 12) hour = 0
  } else if (meridiem === "PM") {
    if (hour !== 12) hour += 12
  }
  if (hour > 23 || minute > 59) return "12:00"

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`
}

export function normalizeBirthData(raw: RawBirthData): NormalizedBirthData {
  return {
    date: parseDate(raw.date),
    time: parseTime(raw.time, raw.timeUnknown),
    timeUnknown: Boolean(raw.timeUnknown),
    place: (raw.place ?? "").trim(),
  }
}
