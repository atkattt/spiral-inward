// SIGNATURES — the face a read leaves behind.
//
// Companion to read-moods.ts. Both are driven by the same two fragment fields,
// on two different axes:
//
//   read-moods.ts  tone → HOW the creature carries itself (breath, blink, walk)
//   signatures.ts  tone → WHAT ITS FACE IS  (eyes + mouth glyphs)
//                  life_domain → the FAMILY a signature belongs to
//
// The rules:
//
//   A signature is unlocked by AGREEING to a read. Agreement is the whole
//   gesture — "yes, that's me" — so the read hands over its face and the
//   creature can wear it from then on. Disagreeing unlocks nothing.
//
//   The LIBRARY is every signature the user has agreed to. The creature can
//   only ever wear what it has collected, so a young self has no range and an
//   explored one visibly does. Nothing is stored: the library is recomputed
//   from read_responses exactly like AvatarSignals is (see deriveLibrary).
//
//   FAMILIES deepen. life_domain groups signatures, and agreeing to more reads
//   in one domain intensifies that family's expression:
//     level 0  the face as authored
//     level 1  the face pulses — eyes alternate with their variant, glow swells
//     level 2  + blush marks beside the eyes
//   Thresholds are FAMILY_PULSE_AT / FAMILY_BLUSH_AT below.
//
// Why these glyphs are NOT from the avatar palettes: the EYES / MOUTH palettes
// in avatar-slots.ts are the creature's RESTING face, picked by disposition.
// If a signature reused them, wearing one would often be invisible (it could
// resolve to the glyph already on screen). Signature glyphs are deliberately
// drawn from outside those palettes so a worn face always reads as an event.
// Each one names a palette-proven `fallbackEyes` for platforms that can't draw
// it — same spirit as probePalettes(), which can't cover these because they
// aren't palette members.
//
// Why signatures carry no COLOR: in this app color is already owned by the
// read's section accent, and /circle deliberately synchronizes the disc border,
// its shadow, the name plate and the creature to that single live value. A
// per-signature hue would fight that. Signatures change the FACE; the accent
// system keeps the color, and a level-1+ signature only swells its intensity.

import type { AvatarSignals } from "@/lib/self/avatar-slots"

/** The 8 authored tones in fragments.tone (all 799 rows are non-null). */
export type SignatureTone =
  | "warm"
  | "tender"
  | "gentle"
  | "hopeful"
  | "direct"
  | "neutral"
  | "wry"
  | "confronting"

export type SignatureFace = {
  /** eyes as the slot renders them: two glyphs separated by a space */
  eyes: string
  /** the alternate worn on a level-1+ pulse */
  eyesAlt: string
  /** mouth glyph (these ARE palette members — mouths read fine reused) */
  mouth: string
  /** eyes to fall back to when the platform can't draw `eyes` / `eyesAlt` */
  fallbackEyes: string
}

export type SignatureExpr = SignatureFace & {
  /** unique per unlocked read — this IS the fragment id */
  id: string
  /** the read that unlocked it (same as id; named for readability at call sites) */
  readId: string
  /** variant grouping — the fragment's life_domain */
  family: string
  /** the tone this face came from */
  tone: SignatureTone
}

// ---- tone → face (tune freely) ---------------------------------------------
//
// Ordered warmest → sharpest, mirroring the palettes' softest → sharpest
// convention. Asymmetric pairs (wry, confronting) are intentional: an uneven
// gaze is what makes those two read as attitude rather than shape.

const TONE_FACES: Record<SignatureTone, SignatureFace> = {
  // hearts — the read the user recognised as warmth
  warm: { eyes: "♡ ♡", eyesAlt: "♥ ♥", mouth: "ᗜ", fallbackEyes: "◕ ◕" },
  tender: { eyes: "◔ ◔", eyesAlt: "◕ ◕", mouth: "◡", fallbackEyes: "◕ ◕" },
  gentle: { eyes: "◠ ◠", eyesAlt: "◡ ◡", mouth: "‿", fallbackEyes: "• •" },
  hopeful: { eyes: "✧ ✧", eyesAlt: "✦ ✦", mouth: "▽", fallbackEyes: "◉ ◉" },
  direct: { eyes: "■ ■", eyesAlt: "□ □", mouth: "‗", fallbackEyes: "● ●" },
  neutral: { eyes: "◦ ◦", eyesAlt: "∘ ∘", mouth: ".", fallbackEyes: "o o" },
  // an uneven gaze — the closest the glyph set gets to a raised eyebrow
  wry: { eyes: "◑ ◐", eyesAlt: "◓ ◒", mouth: "⌐", fallbackEyes: "¬ ¬" },
  confronting: { eyes: "◤ ◥", eyesAlt: "◢ ◣", mouth: "∧", fallbackEyes: "> <" },
}

/** Blush marks that flank the eyes at family level 2. */
export const BLUSH_GLYPH = "˚"

/** Every glyph string a signature can ask the platform to draw. */
export const SIGNATURE_EYE_GLYPHS: string[] = Object.values(TONE_FACES).flatMap(
  (f) => [f.eyes, f.eyesAlt],
)

// ---- families --------------------------------------------------------------

/** Agreed reads in one life_domain before its face starts pulsing. */
export const FAMILY_PULSE_AT = 3
/** ...and before blush marks appear. */
export const FAMILY_BLUSH_AT = 6

/** 0 = as authored, 1 = pulsing, 2 = pulsing + blush. */
export function computeVariantLevel(
  library: SignatureExpr[],
  family: string,
): number {
  const n = library.filter((s) => s.family === family).length
  if (n >= FAMILY_BLUSH_AT) return 2
  if (n >= FAMILY_PULSE_AT) return 1
  return 0
}

// ---- deriving ---------------------------------------------------------------

const lc = (v: unknown): string =>
  v === null || v === undefined ? "" : String(v).trim().toLowerCase()

function toneOf(tone: unknown): SignatureTone {
  const t = lc(tone)
  return (t in TONE_FACES ? t : "neutral") as SignatureTone
}

/** The face a single read wears, whether or not it has been agreed to yet. */
export function signatureFor(fragment: {
  id: string
  tone?: string | null
  life_domain?: string | null
}): SignatureExpr {
  const tone = toneOf(fragment.tone)
  return {
    ...TONE_FACES[tone],
    id: fragment.id,
    readId: fragment.id,
    tone,
    // life_domain is non-null across every authored row; the fallback only
    // guards fragments written later without one.
    family: lc(fragment.life_domain) || "identity",
  }
}

/**
 * The library: one signature per AGREED read, in the order the reads were
 * given. Derived, never stored — pass the same fragments and verdicts the
 * creature's AvatarSignals come from and both surfaces agree by construction.
 */
export function deriveLibrary(
  fragments: Array<{
    id: string
    tone?: string | null
    life_domain?: string | null
  }>,
  responses: Map<string, "agree" | "disagree"> | Record<string, string>,
): SignatureExpr[] {
  const verdict = (id: string): string | undefined =>
    responses instanceof Map ? responses.get(id) : responses[id]
  const out: SignatureExpr[] = []
  for (const f of fragments) {
    if (verdict(f.id) !== "agree") continue
    out.push(signatureFor(f))
  }
  return out
}

/**
 * Sanity helper for callers that already hold AvatarSignals: the library can
 * never be larger than the lifetime agree count. Useful in dev to catch a
 * fragments/responses mismatch (e.g. a library built from a gated lens subset).
 */
export function libraryMatchesSignals(
  library: SignatureExpr[],
  signals: AvatarSignals,
): boolean {
  return library.length <= signals.agrees
}
