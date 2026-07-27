/**
 * THE SELF, AS SLOTS.
 *
 * The being is not a set of drawn stages anymore — it is FIVE SLOTS composed
 * together at render time:
 *
 *        ears        ʕ     ʔ        (unlocked last)
 *        sides+eyes  [  . .  ]      (the body line — always present)
 *        mouth          ᗜ           (unlocked at the first cleared constellation)
 *        aura        · ˙ ° * ✦      (one glyph per written answer, forever)
 *
 * Two independent forces shape it:
 *   1. MILESTONES (structural) — which slots exist at all. Driven by the
 *      journey itself (reads answered, constellations cleared), never points.
 *   2. DISPOSITION (expressive) — WHICH glyph each unlocked slot shows.
 *      agrees vs disagrees maps linearly onto every palette: all-agree picks
 *      the softest glyph, all-disagree the sharpest, neutral sits mid-palette.
 *
 * Every palette below is a plain array, ordered SOFTEST (index 0) → SHARPEST
 * (last index). They are meant to be edited by hand; nothing else in the code
 * knows any glyph by name.
 */

// ---------------------------------------------------------------------------
// PALETTES — softest first, sharpest last. Edit freely.
// ---------------------------------------------------------------------------

// These are the authored palettes, kept verbatim. They deliberately reach into
// Kannada / Telugu / Oriya / Canadian-syllabics / CJK for shapes no Latin set
// has, so the avatar is rendered in a wide-coverage monospace stack (see MONO
// in components/self/self-creature.tsx) rather than the app's pixel font.
// probePalettes() still runs at mount as a safety net: any glyph the platform
// genuinely cannot draw degrades to its nearest palette neighbour.
export const EYES: string[] = [
  "◕ ◕",
  "● ●",
  "◉ ◉",
  "ಥ ಥ",
  "o o",
  "⊙ ⊙",
  ". .",
  "• •",
  "- -",
  "ರ ರ",
  "¬ ¬",
  "ఠ ఠ",
  "> <",
  "× ×",
  "▼ ▼",
]

// NOTE: 〰 carries U+FE0E (text presentation selector) so it can never render
// as a color emoji on iOS / Android.
export const MOUTH: string[] = [
  "ᗜ",
  "◡",
  "‿",
  "ω",
  "▽",
  "o",
  "‗",
  "~",
  "〰\uFE0E",
  "_",
  ".",
  "⌐",
  "灬",
  "∨",
  "∧",
  "▼",
  "ʬ",
  "⍊",
]

export type GlyphPair = [string, string]

export const SIDES: GlyphPair[] = [
  ["∩", "∩"],
  ["୧", "୨"],
  ["(", ")"],
  ["[", "]"],
  ["{", "}"],
  ["⌐", "¬"],
  ["ʅ", "ʃ"],
  ["ᒥ", "ᒧ"],
  ["╚", "╝"],
]

export const EARS: GlyphPair[] = [
  ["ʕ", "ʔ"],
  ["ᘳ", "ᘰ"],
  ["ε", "϶"],
  ["⌒", "⌒"],
  ["ʖ", "ʗ"],
  ["ʌ", "ʌ"],
  ["ʇ", "ʇ"],
  ["ᆺ", "ᆺ"],
]

export const AURA: string[] = ["·", "˙", "°", "*", "✦", "⁘"]

// ---------------------------------------------------------------------------
// BIRTH — before the first read is answered the being is locked to  [ . . ]
// ---------------------------------------------------------------------------

/** Index of ". ." in EYES — the newborn's shut, undecided gaze. */
export const BIRTH_EYES_INDEX = Math.max(0, EYES.indexOf(". ."))
/** Index of ["[","]"] in SIDES — the newborn's plain shell. */
export const BIRTH_SIDES_INDEX = Math.max(
  0,
  SIDES.findIndex(([l, r]) => l === "[" && r === "]"),
)
/** Eyes during a blink — overrides disposition AND idle mutation. */
export const BLINK_EYES = "- -"

// ---------------------------------------------------------------------------
// MILESTONES — structural unlocks, in the order they can ever happen.
// ---------------------------------------------------------------------------

export type SlotName = "sides" | "eyes" | "mouth" | "ears" | "aura"

/** The unlock ladder. Level N means the first N of these have happened. */
export const MILESTONE_ORDER = ["eyes", "mouth", "sides", "ears"] as const
export type MilestoneSlot = (typeof MILESTONE_ORDER)[number]

/** Level 4 — ears — is the biggest moment (it coincides with vedic_deep). */
export const EARS_LEVEL = MILESTONE_ORDER.length

export type SlotUnlocks = Record<MilestoneSlot, boolean>

/**
 * Everything the avatar is derived from. No avatar state is ever stored: this
 * is recomputed from read_responses, the section-clear rule, and the count of
 * written answers, so any existing account maps over automatically.
 */
export type AvatarSignals = {
  /** lifetime agree count from read_responses */
  agrees: number
  /** lifetime disagree count from read_responses */
  disagrees: number
  /** written answers (self_entries kind='answer') — one aura glyph each */
  answers: number
  /** constellations cleared, by the EXISTING section-clear rule */
  cleared: number
  /** the user's matched constellations in total */
  constellations: number
}

export const EMPTY_SIGNALS: AvatarSignals = {
  agrees: 0,
  disagrees: 0,
  answers: 0,
  cleared: 0,
  constellations: 0,
}

/**
 * The four structural unlocks:
 *   eyes  — the first read answered (agree or disagree)
 *   mouth — the first constellation cleared
 *   sides — half of the user's matched constellations cleared (rounded up)
 *   ears  — ALL constellations cleared (the same moment vedic_deep unlocks)
 */
export function computeUnlocks(s: AvatarSignals): SlotUnlocks {
  const responded = s.agrees + s.disagrees
  const total = s.constellations
  const half = Math.ceil(total / 2)
  return {
    eyes: responded >= 1,
    mouth: s.cleared >= 1,
    sides: total > 0 && s.cleared >= half,
    ears: total > 0 && s.cleared >= total,
  }
}

/** 0 = birth `[ . . ]`, 1 = eyes, 2 = +mouth, 3 = +sides, 4 = +ears. */
export function milestoneLevel(s: AvatarSignals): number {
  const unlocks = computeUnlocks(s)
  let level = 0
  for (const slot of MILESTONE_ORDER) {
    if (!unlocks[slot]) break
    level++
  }
  return level
}

/** The unlocks implied by a level — what the renderer actually draws. */
export function unlocksAtLevel(level: number): SlotUnlocks {
  const out = { eyes: false, mouth: false, sides: false, ears: false }
  MILESTONE_ORDER.forEach((slot, i) => {
    if (i < level) out[slot] = true
  })
  return out
}

// ---------------------------------------------------------------------------
// DISPOSITION — one number, −1 (all disagree) .. +1 (all agree).
// ---------------------------------------------------------------------------

/** Written answers never move this; only agree/disagree does. */
export function dispositionOf(agrees: number, disagrees: number): number {
  return (agrees - disagrees) / Math.max(1, agrees + disagrees)
}

/** +1 → index 0 (softest), 0 → middle, −1 → last index (sharpest). */
export function paletteIndex(disposition: number, length: number): number {
  if (length <= 1) return 0
  const d = Math.max(-1, Math.min(1, disposition))
  return Math.round(((1 - d) / 2) * (length - 1))
}

export type SlotIndices = Record<MilestoneSlot, number>

/**
 * Each slot picks its own glyph from its own palette, but all from the SAME
 * disposition value. Locked slots hold their birth glyph (eyes / sides) or
 * their disposition glyph the moment they appear (mouth / ears).
 */
export function slotIndices(
  disposition: number,
  unlocks: SlotUnlocks,
): SlotIndices {
  return {
    eyes: unlocks.eyes
      ? paletteIndex(disposition, EYES.length)
      : BIRTH_EYES_INDEX,
    sides: unlocks.sides
      ? paletteIndex(disposition, SIDES.length)
      : BIRTH_SIDES_INDEX,
    mouth: paletteIndex(disposition, MOUTH.length),
    ears: paletteIndex(disposition, EARS.length),
  }
}

/** Palette length per slot — used by the ±1 living-material mutation. */
export const PALETTE_LENGTH: Record<MilestoneSlot, number> = {
  eyes: EYES.length,
  mouth: MOUTH.length,
  sides: SIDES.length,
  ears: EARS.length,
}

// ---------------------------------------------------------------------------
// AURA — one permanent glyph per written answer, deterministic per user.
// ---------------------------------------------------------------------------

/** FNV-1a string hash → uint32. Stable across runs and machines. */
export function hashString(s: string): number {
  let h = 2166136261 >>> 0
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** mulberry32: tiny deterministic PRNG seeded by a uint32. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Every Nth aura glyph mirrors the one before it, left/right. */
export const AURA_MIRROR_EVERY = 5

/** Aura ring, as fractions of the avatar box: never closer than the body. */
const AURA_MIN_RADIUS = 0.215
const AURA_MAX_RADIUS = 0.3

export type AuraGlyph = {
  /** stable identity = the answer's index; aura never re-shuffles */
  index: number
  glyph: string
  /** offset from the centre, as a fraction of the avatar box size */
  x: number
  y: number
}

/**
 * The aura for `count` written answers. Position + glyph come from
 * seed = hash(seedKey + aura index), so a user always regrows the exact same
 * halo, and every AURA_MIRROR_EVERY-th glyph mirrors its predecessor for
 * symmetry. The ring starts outside the body, so aura can never sit on the
 * eyes or the mouth. No cap — it grows forever.
 */
export function buildAura(seedKey: string, count: number): AuraGlyph[] {
  const out: AuraGlyph[] = []
  for (let i = 0; i < count; i++) {
    const mirrored = (i + 1) % AURA_MIRROR_EVERY === 0 && out.length > 0
    if (mirrored) {
      const prev = out[out.length - 1]
      out.push({ index: i, glyph: prev.glyph, x: -prev.x, y: prev.y })
      continue
    }
    const rand = mulberry32(hashString(`${seedKey}:aura:${i}`))
    const angle = rand() * Math.PI * 2
    const radius = AURA_MIN_RADIUS + rand() * (AURA_MAX_RADIUS - AURA_MIN_RADIUS)
    const glyph = AURA[Math.floor(rand() * AURA.length) % AURA.length]
    out.push({
      index: i,
      glyph,
      // Slightly wider than tall: the body line is wide, the halo follows it.
      x: Math.cos(angle) * radius * 1.15,
      y: Math.sin(angle) * radius * 0.92,
    })
  }
  return out
}

// ---------------------------------------------------------------------------
// GLYPH SAFETY — several palette glyphs are exotic. On mount we measure each
// one and, if the platform can't draw it, fall back to its NEAREST palette
// neighbour (which is by definition only a hair softer / sharper).
// ---------------------------------------------------------------------------

/** Chars of a palette entry (pairs contribute both halves). */
function charsOf(entry: string | GlyphPair): string[] {
  return Array.isArray(entry) ? [entry[0], entry[1]] : [entry]
}

/**
 * Does the platform actually have a glyph for every char of `entry`?
 * Monospace fonts give every glyph the same advance width, so width alone
 * proves nothing — we RENDER each char and compare its pixels to the
 * "missing glyph" box and to blank.
 */
function makeGlyphProbe(fontFamily: string): (entry: string | GlyphPair) => boolean {
  if (typeof document === "undefined") return () => true
  const canvas = document.createElement("canvas")
  canvas.width = 32
  canvas.height = 32
  const ctx = canvas.getContext("2d", { willReadFrequently: true })
  if (!ctx) return () => true
  ctx.font = `20px ${fontFamily}`
  ctx.textBaseline = "middle"
  ctx.fillStyle = "#fff"

  const signature = (ch: string): string => {
    ctx.clearRect(0, 0, 32, 32)
    ctx.fillText(ch, 4, 16)
    const { data } = ctx.getImageData(0, 0, 32, 32)
    let sig = ""
    let ink = 0
    for (let i = 3; i < data.length; i += 4) {
      const on = data[i] > 24 ? 1 : 0
      ink += on
      sig += on
    }
    return ink === 0 ? "blank" : sig
  }

  // U+FFFF is permanently unassigned → whatever the platform draws for it IS
  // its "missing glyph" box.
  const missing = signature("\uFFFF")
  const cache = new Map<string, boolean>()
  const okChar = (ch: string): boolean => {
    const hit = cache.get(ch)
    if (hit !== undefined) return hit
    const sig = signature(ch)
    const ok = sig !== "blank" && sig !== missing
    cache.set(ch, ok)
    return ok
  }
  return (entry) => charsOf(entry).every(okChar)
}

/**
 * For a palette, the index each index should actually RENDER as: itself when
 * supported, otherwise the nearest supported neighbour (ties prefer softer).
 * Returns null when the whole palette is fine — the common case.
 */
export function buildFallbacks<T extends string | GlyphPair>(
  palette: T[],
  ok: (entry: T) => boolean,
): number[] | null {
  const supported = palette.map(ok)
  if (supported.every(Boolean)) return null
  const map = palette.map((_, i) => {
    if (supported[i]) return i
    for (let d = 1; d < palette.length; d++) {
      if (supported[i - d]) return i - d
      if (supported[i + d]) return i + d
    }
    return i // nothing in this palette renders; draw it anyway
  })
  return map
}

export type PaletteFallbacks = {
  eyes: number[] | null
  mouth: number[] | null
  sides: number[] | null
  ears: number[] | null
  aura: number[] | null
  /** glyphs the platform could not draw — logged once for reporting */
  unsupported: string[]
}

/**
 * Probe every palette against the platform. Runs client-side on mount only.
 */
export function probePalettes(fontFamily: string): PaletteFallbacks {
  const probe = makeGlyphProbe(fontFamily)
  const unsupported: string[] = []
  const watch = <T extends string | GlyphPair>(palette: T[]) =>
    buildFallbacks(palette, (entry) => {
      const ok = probe(entry)
      if (!ok) unsupported.push(charsOf(entry).join(""))
      return ok
    })
  return {
    eyes: watch(EYES),
    mouth: watch(MOUTH),
    sides: watch(SIDES),
    ears: watch(EARS),
    aura: watch(AURA),
    unsupported,
  }
}

/** Apply a fallback map (if any) to an index. */
export function withFallback(map: number[] | null, index: number): number {
  return map ? (map[index] ?? index) : index
}
