// Shared shapes + helpers for the universe's read objects, which are the
// user's MATCHED FRAGMENTS — the same authored interpretations /self shows,
// matched deterministically against their chart (lib/matcher). Client-safe:
// imported by both the /circle server page (to serialize) and the universe.

export type UniverseFragment = {
  id: string
  /** authored lowercase title — the star's label + panel heading */
  title: string
  /** authored body, shown EXACTLY as written */
  body: string
  /** optional short ASCII sigil; when null we derive one from life_domain */
  symbol: string | null
  /** authored vibe of the read (gentle | confronting | hopeful | ...) —
      drives the creature's behavior in the read-open scene */
  tone: string | null
  /** which chart section this read belongs to (see lib/spiral/sections.ts);
      null falls back to deriving from trigger_type + condition */
  section: string | null
  life_domain: string | null
  trigger_type: string | null
  condition: unknown
  weight: number | null
  /** which lens authored the read. The star rule's depth tiebreak needs this
      when a deeper lens adds a second major to a section — see sections.ts. */
  lens: string | null
}

// Default sigils by life domain, used when a fragment has no authored symbol.
const DOMAIN_SYMBOLS: Record<string, string> = {
  crisis: "/\\",
  identity: "[*]",
  relationships: "<3",
  work: "++",
  lineage: "%%",
  spirit: "~\u263E",
}

export function symbolFor(f: UniverseFragment): string {
  if (f.symbol && f.symbol.trim()) return f.symbol.trim()
  const domain = (f.life_domain ?? "").trim().toLowerCase()
  return DOMAIN_SYMBOLS[domain] ?? "[*]"
}

// ---- trigger → plain words -------------------------------------------------
// A small dim metadata line under the panel title, e.g. "saturn in the 8th".
// Facts only, all lowercase, never interpretive.

function ordinal(n: unknown): string {
  const num = Number(n)
  if (!Number.isFinite(num)) return String(n ?? "")
  const mod100 = num % 100
  if (mod100 >= 11 && mod100 <= 13) return `${num}th`
  switch (num % 10) {
    case 1:
      return `${num}st`
    case 2:
      return `${num}nd`
    case 3:
      return `${num}rd`
    default:
      return `${num}th`
  }
}

const lc = (v: unknown): string =>
  v === null || v === undefined ? "" : String(v).trim().toLowerCase()

export function describeTrigger(f: UniverseFragment): string {
  const c = (typeof f.condition === "object" && f.condition !== null
    ? (f.condition as Record<string, unknown>)
    : {}) as Record<string, unknown>

  switch (lc(f.trigger_type)) {
    case "planet_in_house":
      return `${lc(c.planet)} in the ${ordinal(c.house)}`
    case "planet_in_sign":
      return `${lc(c.planet)} in ${lc(c.sign)}`
    case "planet_in_sign_and_house":
      return `${lc(c.planet)} in ${lc(c.sign)}, ${ordinal(c.house)} house`
    case "planet_in_nakshatra":
      return `${lc(c.planet)} in ${lc(c.nakshatra)}`
    case "ascendant_sign":
      return `${lc(c.sign)} rising`
    case "mahadasha":
      return `${lc(c.planet)} mahadasha`
    case "antardasha":
      return `${lc(c.antar)} antardasha in ${lc(c.maha)} mahadasha`
    case "conjunction": {
      const planets = Array.isArray(c.planets) ? c.planets.map(lc).join(" + ") : ""
      return `${planets} together in the ${ordinal(c.house)}`
    }
    case "house_lord_in_house":
      return `lord of the ${ordinal(c.lord_of)} in the ${ordinal(c.placed_in)}`
    case "planet_dignity":
      return `${lc(c.planet)} ${lc(c.dignity)}`
    default:
      return lc(f.life_domain)
  }
}
