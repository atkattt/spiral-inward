"use client"

import {
  memo,
  startTransition,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { useRouter } from "next/navigation"
import SelfCreature, { type SelfCreatureHandle } from "@/components/self/self-creature"
import { deriveLibrary } from "@/lib/self/signatures"
import { useSpiral } from "@/components/spiral/spiral-provider"
import { type Read } from "@/lib/spiral/reads"
import { ledTexture } from "@/lib/ui/led"
import { milestoneLevel, type AvatarSignals } from "@/lib/self/avatar-slots"
import { lensOf, sectionClearProgress } from "@/lib/self/lenses"
import { UniverseReadPanel, type PanelData } from "@/components/circle/universe-read-panel"
import { saveRevealRadius } from "@/app/actions/progress"
import { saveReadResponse } from "@/app/actions/self-reads"
import { matchFragments, type Chart, type Fragment } from "@/lib/matcher"
import { CHART_KEY } from "@/lib/birth-data"
import {
  describeTrigger,
  symbolFor,
  type UniverseFragment,
} from "@/lib/spiral/universe-reads"
import {
  moodForRead,
  NEUTRAL_MOOD,
  type Mood,
  type ReadMood,
} from "@/lib/self/read-moods"
import { choreograph } from "@/lib/self/moves"
import {
  SECTION_ORDER,
  SECTION_COLORS,
  sectionFor,
  lensRankFromRecord,
  orderSection,
  type SectionKey,
} from "@/lib/spiral/sections"

// Neutral self color — a glowing white, NOT gold. Reactions tint away from it.
const NEUTRAL_COLOR = "#e8e4da"
const AGREE_COLOR = "#8fc9a3"
const DISAGREE_COLOR = "#d98a9a"

// Mix two hex colors (#rrggbb): t=0 → a, t=1 → b. Used for the attunement
// pulses — brightening a read's accent on agree and fading its afterglow.
function mixHex(a: string, b: string, t: number): string {
  const pa = [1, 3, 5].map((i) => Number.parseInt(a.slice(i, i + 2), 16))
  const pb = [1, 3, 5].map((i) => Number.parseInt(b.slice(i, i + 2), 16))
  return `#${pa
    .map((v, i) =>
      Math.round(v + (pb[i] - v) * t)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`
}
// A tap must stay under this many pixels of movement to count as a click
// (otherwise dragging across the universe would open panels by accident).
const TAP_SLOP = 6

/**
 * SpiralUniverse — Layer 1 of the explorable universe.
 *
 * Turns the spiral area into a draggable, zoomable "universe." The SelfCreature
 * stays PINNED at the center of the stage and never moves; the universe layer
 * (starfield + spiral arm + object markers) pans and zooms behind/around it.
 *
 * Two layers, by design:
 *   1. #universe — absolutely positioned, transform-origin 0 0, gets a CSS
 *      transform translate(tx,ty) scale(s). Everything that should pan/zoom
 *      lives inside it, positioned in WORLD coordinates (0,0 = universe center).
 *   2. The avatar — a SEPARATE layer on top, pinned to stage center. It is NOT
 *      inside #universe, so the zoom/pan transform never touches it.
 *
 * Layer 1 uses placeholder markers only. Real read-objects and people, plus
 * click-to-open reads, arrive in Layers 2 and 3.
 */

/**
 * Zoom floor. Completed sections no longer leave stars in the near void, so
 * the disc-eclipse concern that once set this is now only about people and the
 * add-person badge (r >= ~278) plus the spiral itself.
 *
 * The avatar disc is counter-scaled (constant screen size), so its WORLD radius
 * grows as 120/scale — at the old 0.4 floor it reached r=300 and swallowed the
 * whole near sky. 0.57 caps that at r≈210. The floor still guarantees you can
 * never zoom out far enough for the disc to eclipse the ENTIRE galaxy.
 *
 * At 0.57 the visible world radius is ~321, past the drawn spiral edge
 * (MAX_R * SPIRAL_T_END ≈ 297), so the full spiral is always reachable in frame.
 */
const MIN_SCALE = 0.57
// Capped at 2x: beyond that, CSS-scaled glyph text pixelates badly.
const MAX_SCALE = 2

// ---- Layer 4: progressive reveal ----------------------------------------
// The universe starts mostly in void. Each answered read pushes a circular
// "revealed frontier" outward from center; objects/stars now inside it
// materialize (fade up, desaturate→color, scale into place). Objects beyond
// the frontier stay dimly visible but locked (not clickable, no label).
// Starting frontier: covers the innermost reads from the first moment; with
// many fragments the outer beads (and all PEOPLE, radius >= ~278) start
// beyond it and reveal progressively as reads are answered.
const BASE_REVEAL_RADIUS = 240
// How far each answer pushes the frontier outward. Deliberately small (~1/3
// of the old 120) so it takes several reads to noticeably grow the fog — but
// the judge also guarantees the NEXT unanswered read is always pulled just
// inside the frontier (capped at 2 steps), so progress never stalls while
// whole regions stay unrevealed.
const REVEAL_STEP = 40

// Spiral geometry in world units, centered on (0,0).
const TURNS = 3
const MAX_R = 480
// No nebula glyph is drawn within this radius — carves a clean hole where the
// avatar disc lives. Sized for the SMALLEST disc (stage 1 ≈ 120px diameter) so
// the hole never peeks around the constant-size disc at any stage:
// clear-radius × MAX_SCALE ≤ min disc screen radius (60px). Bigger discs simply
// cover more glyphs with their opaque background — intended.
const AVATAR_CLEAR_RADIUS = 28

// ---- Milestone-driven disc sizing ----------------------------------------
// The creature's disc grows with its structure: birth ≈ 120px diameter, +16px
// per milestone slot unlocked (eyes → mouth → sides → ears), then +2px per
// aura glyph, capped at 240px. Each unlock reads as a small tamagotchi growth
// spurt; the creature glyph scales with the disc (constant ratio).
function discSizeFor(level: number, auraCount: number): number {
  return Math.min(240, 120 + level * 16 + auraCount * 2)
}
const FADE_BAND = 76
// The nebula is sampled along the spiral curve; at each sample we scatter a
// small cloud of glyphs across the arm's width, so the sky reads as dense
// drifting fog rather than a thin bead-trail.
// Radius of the clean disc carved out of the nebula around each read/person
// marker, so its star badge sits in the spiral without a fog glyph behind it.
const MARKER_CLEAR_RADIUS = 26
const NEBULA_SAMPLES = 240
// Shimmer phase groups: the twinkle animation runs on this many wrapper
// layers (not per glyph) so the compositor tracks ~6 animated layers instead
// of hundreds — the difference between smooth and laggy panning on phones.
const NEBULA_PHASES = 6
const GLYPH_T_START = 0.04
const GLYPH_T_END = 1.72

/**
 * THE SPIRAL'S FIXED EDGE.
 *
 * The sky no longer grows, and it no longer has to be swept against the number
 * of completed sections: completed pairs leave nothing behind, so the only
 * thing ever placed on the walk is the ONE active section, anchored at one of the
 * two ANCHORS. The bound is therefore just the outermost read either anchor can
 * reach: idx 0 sweeps outward from t=0.316 and idx 1 inward from t=0.41, so
 * neither run passes t≈0.46 even at its worst case. That is well inside this
 * edge, and the rest is the fading tail.
 *
 * It is a LITERAL on purpose. The old value was derived from the walk's own
 * output (`sections[i].endT`), which made the drawn extent circular: place
 * fewer reads → sections end sooner → the spiral shrinks → less room to place
 * reads. Pinning it breaks that loop, so the sky is the same size on every
 * visit at every stage of the journey.
 *
 * Fog is still GENERATED out to GLYPH_T_END and fades to nothing past this
 * edge (see extFade) — unchanged from the previous unextended state, where
 * the visible end was 0.5313 against the same generated range.
 */
const SPIRAL_T_END = 0.6191

// Monospace fog glyphs, weighted toward faint punctuation so bright marks
// ( ✦ * @ ) only occasionally spark inside the cloud.
const NEBULA_CHARS = [
  "·", "·", "·", "·", ":", ":", ";", "'", "˚", "˙",
  "+", "=", "/", "*", "×", "@", ".", "·", ":", "'",
]
// Cool moonlit-fog tones (pale blue-white → dim slate) chosen per glyph.
const NEBULA_TONES = ["#cdd8e4", "#b3c2d2", "#9cadc0", "#8496ab", "#6f8299"]

/**
 * THE SKY'S FIXED ROTATION.
 *
 * The spiral does not fit a whole section on screen at its natural angle: a
 * 13-read run sweeps ~140° of arc, and at the original phase its outer reads
 * left a portrait viewport. Rotating the ENTIRE world by one constant brings
 * the run into frame instead of shrinking the sky to fit.
 *
 * It is STATIC and baked at placement — deliberately not animated and not
 * derived from the measured stage. A viewport-derived phase would have to live
 * in the journey memo's deps, which means the sky would re-place itself on
 * every resize and orientation change (and would have no value at all on the
 * first render, before the stage is measured). One literal is stable on the
 * server, on the client, and across rotations.
 *
 * 133.04° is the centre of the widest phase window that satisfies ALL of
 * 320×568, 347×735, 375×812, 390×844 and 428×926 simultaneously, for a 13-read
 * run at READ_ARC_GAP. That common window is 22.98° wide, so the value carries
 * ±11.49° of margin. Because it is applied as one rigid rotation, every
 * relative position in the sky is preserved exactly — the inter-strand dark
 * pockets, the fog density peaks, and the add-person slot that was tuned
 * against them all move together (see addPersonPoint).
 */
const SPIRAL_PHASE = (133.04 * Math.PI) / 180

// The galaxy has TWO interleaved strands (the fog draws both, half a turn
// apart). Reads bead along BOTH: `phase` selects the strand (0 or π).
function spiralPoint(t: number, phase = 0) {
  const theta =
    t * TURNS * Math.PI * 2 - Math.PI / 2 + phase + SPIRAL_PHASE
  const r = MAX_R * t
  return { x: r * Math.cos(theta), y: r * Math.sin(theta) }
}

// Deterministic PRNG (mulberry32) so the scattered nebula is identical on the
// server and client — random-looking, but stable across hydration.
function mulberry32(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Round a numeric px value to 2 decimals for inline styles. The browser's
 * CSSOM rounds sub-pixel values when it parses server HTML, so full-precision
 * floats hydrate as a mismatch (server "-66.7769px" vs client -66.776908...).
 * Rounding to 0.01px is imperceptible and serializes identically on both sides.
 */
function px2(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * Same hydration hazard as px2, but for `opacity` — which needs a DIFFERENT
 * rounding rule. The CSSOM keeps 6 SIGNIFICANT DIGITS for opacity, not 6
 * decimal places (measured: 0.5958080226108576 -> "0.595808", and
 * 0.00023397704199347886 -> "0.000233977"). So the server's full-precision
 * float never matches what the client reads back, and React reports
 * "some attributes ... didn't match" on the nebula spans.
 *
 * px2 can't be reused here: the faintest embers sit near 0.0002, and rounding
 * those to 2 decimals would snap a large part of the fog to 0 and visibly
 * flatten the starfield's depth gradient. toPrecision(6) round-trips exactly
 * while preserving that gradient.
 *
 * Values under 1e-6 are clamped to 0 because JS stringifies smaller numbers in
 * exponential notation ("1e-7"), which is not valid CSS — the browser would
 * drop the declaration and reintroduce a mismatch. Such glyphs are invisible.
 */
function op6(n: number): number {
  if (!Number.isFinite(n) || n <= 1e-6) return 0
  if (n >= 1) return 1
  return Number(n.toPrecision(6))
}

/**
 * Convert a CSS text-shadow list into the equivalent drop-shadow filter so an
 * SVG glyph can carry the exact same glow a text glyph had.
 */
function toDropShadow(textShadow: string): string {
  return textShadow
    .split(/,(?![^(]*\))/)
    .map((s) => `drop-shadow(${s.trim()})`)
    .join(" ")
}

/**
 * Geometric five-point star for major/person markers. The ★ text glyph rides
 * high in the Geist Pixel em box and its offset scales with zoom, so no
 * font nudge centers it at every size — a real SVG shape, symmetric in its
 * viewBox, is exactly centered always. Fill follows currentColor; glow is
 * passed as a drop-shadow filter (converted from the marker's text-shadow).
 */
function StarIcon({ size, glow }: { size: number; glow?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      style={{ display: "block", filter: glow || undefined }}
    >
      <path d="M12 1.8l3.1 7.2 7.8.66-5.92 5.13 1.78 7.62L12 18.34l-6.76 4.07 1.78-7.62L1.1 9.66l7.8-.66L12 1.8z" />
    </svg>
  )
}

type Glyph = {
  key: number
  x: number
  y: number
  r: number
  /** spiral parameter of this glyph's sample — gates the drawn extent */
  t: number
  char: string
  size: number
  /** lit opacity target once inside the frontier */
  max: number
  /** cool tone color for this glyph when lit */
  tone: string
  /** shimmer animation duration (s) + negative start delay for stagger */
  shimmerDur: number
  delay: number
}

// READ objects — the user's MATCHED FRAGMENTS (same pipeline as /self) —
// beaded along the spiral arm as ONE LINEAR PATH in walking order: the section's
// major star at its anchor, then its minors one after another along the same arm
// in whichever direction sweeps RIGHTWARD on screen (section order: ascendant →
// moon → sun → knot → nodes → chapter; see lib/spiral/sections.ts). No clusters —
// the sequence IS the path, and the ringed cursor walks it one read at a time.
// (READ_T_START_A/B are gone: sections no longer open at a fixed inner t. The
// major read is placed AT its anchor, which is the START of the run, and the
// minors trail away from it left to right — see ANCHORS.)
/**
 * Arc length (world units) between consecutive reads, lowered from 46 to 30.
 *
 * This is what lets ONE section be fully visible at a single fixed phase. The
 * section's angular sweep is what has to fit a portrait viewport, and 46 put
 * the 13th read at r=220 — past the 182 half-width of a 390pt screen at every
 * phase but a near-vertical sliver. At 30 the run ends at r=197 and a single
 * baked phase clears all five reference viewports (see SPIRAL_PHASE).
 *
 * 30 is a floor with headroom, not a minimum: the measured worst-case section
 * is 13 reads (the real matcher over 1,684 synthesized charts — `vedic | the
 * heart`; p50 is 5, p99 is 8), and 30 also fits 14 with a 13.2° window, so one
 * more authored fragment does not break the layout. It stays clear of the
 * widest badge too — min centre-to-centre is 30.1px against a 24px minor.
 */
const READ_ARC_GAP = 30
// (The old SPIRAL_TAIL_ARC is gone: the sparse fading tail past the last
// placed read is now baked into the pinned SPIRAL_T_END literal.)
// (SECTION_ARC_GAP is gone too: it spaced consecutive runs along the walk, and
// only the active run is placed on the walk now — see the journey memo.)

/**
 * THE TWO ANCHORS — where a section's MAJOR read sits, and which way it flows.
 *
 * Every section used to open at READ_T_START_A, so every section in the whole
 * journey appeared in exactly the same place on screen: the work never moved,
 * and the layout carried no sense of progress. Now the major read IS the anchor
 * and it alternates by pair index, with the minors trailing away from it in walk
 * order so the sequence READS LEFT TO RIGHT on screen.
 *
 * Left-to-right is the binding requirement here, and it is expensive. A section
 * of 13 reads spans ~360 world units of arc, so a rightward sweep needs the full
 * width of the viewport as runway — which means the major must START on the left.
 * Every one of the 1100 configurations that sweeps rightward at every one of its
 * 13 steps puts the major at screen x = 26…70 at 347×735. There is no viable
 * left-to-right run that opens on the RIGHT side of the screen, so the earlier
 * upper-right opening is unreachable under this constraint: at that position a
 * 13-read run reverses after the 4th read and turns into a downward sweep
 * (net dx −135 vs dy +256).
 *
 * Because of that, the two anchors are NOT 180° opposed any more and cannot be
 * derived from one t and two arms. Both open on the left; they alternate UPPER
 * vs LOWER instead of left vs right, and each needs its own arm, t and trail
 * direction. Hence a descriptor array rather than two scalars.
 *
 *   idx 0 -> screen ( 30, 337) at 347×735,  9% across, 46% down (upper-left)
 *   idx 1 -> screen ( 64, 550) at 347×735, 18% across, 75% down (lower-left)
 *
 * Both sweep right and slightly up (net dx +287 / +253, dy −94 / −152) and both
 * are strictly monotonic in screen x across all 13 reads. They stay 216px apart,
 * and their closest approach is 155px — far past MARKER_CLEAR_RADIUS.
 *
 * `outward` selects advanceT vs retreatT. The two anchors genuinely differ: idx 0
 * sweeps right by moving OUT along its arm, idx 1 by moving IN. Direction is a
 * property of the arm's local screen orientation, not a global choice, so it has
 * to be stored per anchor.
 *
 * Margins are 18.1 / 18.2px at 347×735, widening to 32.1 / 39.6 / 58.6px at
 * 375×812, 390×844 and 428×926 — clear of the 13.5px floor by ~4.6px. Worst-case
 * capacity is n=13 for idx 0 and n=15 for idx 1.
 */
const ANCHORS: ReadonlyArray<{ arm: number; t: number; outward: boolean }> = [
  { arm: (175 * Math.PI) / 180, t: 0.316, outward: true },
  { arm: (358 * Math.PI) / 180, t: 0.41, outward: false },
]

/** Advance t along the spiral by `arc` world units (small Euler steps). */
function advanceT(t: number, arc: number): number {
  let remaining = arc
  let cur = t
  while (remaining > 0) {
    const dsdt = MAX_R * Math.sqrt(1 + (2 * Math.PI * TURNS * cur) ** 2)
    const step = Math.min(remaining, 12)
    cur += step / dsdt
    remaining -= step
  }
  return cur
}

/**
 * Retreat t INWARD along the spiral by `arc` world units — advanceT's inverse,
 * used to trail a section's minor reads back from its anchor. Clamped at 0 so a
 * pathologically long section piles up at the center instead of wrapping past
 * it onto the far side of the spiral.
 */
function retreatT(t: number, arc: number): number {
  let remaining = arc
  let cur = t
  while (remaining > 0 && cur > 0) {
    const dsdt = MAX_R * Math.sqrt(1 + (2 * Math.PI * TURNS * cur) ** 2)
    const step = Math.min(remaining, 12)
    cur -= step / dsdt
    remaining -= step
  }
  return Math.max(0, cur)
}

type PlacedRead = {
  label: string
  x: number
  y: number
  r: number
  /** the SECTION's accent color (shared by every read in the constellation) */
  color: string
  panel: PanelData
  read: Read
  /** how the creature behaves on the panel stage — from tone + life_domain */
  mood: ReadMood
  /** star on the arm (major) vs clustered glyph (minor) */
  kind: "major" | "minor"
  /** the minor's sigil glyph (majors render the star char) */
  glyph: string
  sectionKey: SectionKey
  sectionIdx: number
}

/**
 * One (lens, section) PAIR — the unit of the journey.
 *
 * Sections repeat across lenses: "the heart" exists in both vedic and
 * vedic_deep. The old walk grouped by section key alone, which merged them
 * into a single run — so a completed constellation could be re-opened later
 * when a deeper lens unlocked and injected new reads into it. The pair is the
 * identity that collapses to a star, matching sectionClearProgress, which has
 * always keyed by (lens, section).
 */
type PairRun = {
  /** `${lens}\u0000${section}` — stable identity across renders */
  pairKey: string
  lens: string
  key: SectionKey
  /** position in the fixed journey order (section order, then lens depth) */
  idx: number
  color: string
  frs: UniverseFragment[]
}

export function SpiralUniverse({
  answerCount = 0,
  userId,
  onSelectSelf,
  guest,
  initialRevealRadius = BASE_REVEAL_RADIUS,
  onHomeChange,
  onBackChange,
  matchedReads,
  initialResponses,
  guestFragments,
  lensRanks,
}: {
  /** resting expression, retained for API compatibility (unused by creature) */
  mood?: Mood
  /** written answers so far — one permanent aura glyph each on the creature */
  answerCount?: number
  /** stable per-user seed so the creature regrows the exact same being */
  userId?: string
  onSelectSelf?: () => void
  guest: boolean
  initialRevealRadius?: number
  /** notifies the parent when the camera leaves / returns to the home view */
  onHomeChange?: (home: boolean) => void
  /**
   * Hands the parent a "back to the circle" action while a read is open, and
   * null once nothing is open. The header's top-left control owns the only
   * exit-shaped affordance on the screen, so while a read is up it has to mean
   * "leave this read" rather than "leave the app" — otherwise the natural tap
   * lands on sign-out. The parent can't derive this itself: the panel state
   * lives in here.
   */
  onBackChange?: (back: (() => void) | null) => void
  /** authed: matched fragments from the /self pipeline (weight desc) */
  matchedReads?: UniverseFragment[]
  /** authed: saved agree/disagree per fragment id from read_responses */
  initialResponses?: Record<string, "agree" | "disagree">
  /** guest: ALL fragments; matched client-side against the stashed chart */
  guestFragments?: UniverseFragment[]
  /** lens slug → depth (lenses.sort_order, higher = deeper). Feeds the star
      rule's depth tiebreak. A plain object because a Map cannot cross the
      server→client props boundary. */
  lensRanks?: Record<string, number>
}) {
  const stageRef = useRef<HTMLDivElement | null>(null)
  const universeRef = useRef<HTMLDivElement | null>(null)
  // The avatar wrapper gets an inverse counter-scale (1/cam.scale) applied in
  // the same render pass as the camera transform, so the creature's disc stays
  // a constant screen size at every zoom without jitter during pinch.
  const avatarRef = useRef<HTMLDivElement | null>(null)
  const camRef = useRef({ x: 0, y: 0, scale: 1 })
  // True when the camera sits at the home composition (scale 1, origin
  // centered). Drives the return-home "you" button's visibility and lets the
  // parent fade its chrome (exit / menu / hints) while exploring.
  const [isHome, setIsHome] = useState(true)
  const onHomeChangeRef = useRef(onHomeChange)
  onHomeChangeRef.current = onHomeChange
  useEffect(() => {
    onHomeChangeRef.current?.(isHome)
  }, [isHome])
  // Timer that strips the transient CSS transition off the universe transform
  // after an animated camera move (home / panel lift) finishes.
  const camAnimTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Pointer / gesture bookkeeping.
  const draggingRef = useRef(false)
  const lastRef = useRef({ x: 0, y: 0 })
  const ptsRef = useRef<Map<number, { x: number; y: number }>>(new Map())
  const pinchRef = useRef(0)
  // Click-vs-drag: where the gesture started, and whether it ever exceeded the
  // tap slop. Object clicks are ignored once movement crosses the threshold.
  const downPtRef = useRef({ x: 0, y: 0 })
  const movedRef = useRef(false)
  // The element pressed at pointerdown. We resolve taps here (not via onClick)
  // because the stage takes pointer capture, which retargets the click event
  // away from the object that was actually pressed.
  const downTargetRef = useRef<HTMLElement | null>(null)

  const router = useRouter()
  const { agree, disagree, agreed, disagreed } = useSpiral()

  /**
   * URGENT answer layer — the fix for "the next read takes a beat to light up".
   *
   * `agree`/`disagree` are written inside a transition (see `judge`), so the
   * provider's lists land at LOW priority. Since the cursor ring is derived
   * from those lists, the ring couldn't move until the transition committed —
   * and that commit carries the ~250ms nebula/fog re-render with it. The press
   * felt instant but the NEXT star only lit up once the fog finished.
   *
   * This mirror is set urgently in the same handler, so the cursor advances on
   * the next frame while the heavy work still streams in behind it. It only
   * ever ADDS the same verdicts the provider is about to hold, so the two agree
   * once the transition lands.
   */
  const [justAnswered, setJustAnswered] = useState<
    Record<string, "agree" | "disagree">
  >({})

  // id -> verdict for every read the user has responded to: the SAVED
  // read_responses rows (same table /self reads), plus anything answered this
  // session, plus the urgent layer above. Single source for the cursor, the
  // marker states, the counts, and the panel's "already answered" state.
  const responseById = useMemo(() => {
    const m = new Map<string, "agree" | "disagree">(
      Object.entries(initialResponses ?? {}),
    )
    for (const r of agreed) m.set(r.id, "agree")
    for (const r of disagreed) m.set(r.id, "disagree")
    // Last so a just-pressed verdict outranks stale saved state when a read is
    // re-answered.
    for (const [id, v] of Object.entries(justAnswered)) m.set(id, v)
    return m
  }, [initialResponses, agreed, disagreed, justAnswered])

  // Ids of every read the user has responded to. COMPLETED reads shed their
  // ring and live bare in their accent color.
  const respondedIds = useMemo(
    () => new Set<string>(responseById.keys()),
    [responseById],
  )

  // Guest matching: guests have no charts row — their chart was computed by
  // the onboarding ritual and stashed in local/sessionStorage. Run the SAME
  // deterministic matcher against it, client-side, once mounted.
  const [guestMatched, setGuestMatched] = useState<UniverseFragment[]>([])
  useEffect(() => {
    if (!guest || !guestFragments?.length) return
    try {
      const raw =
        localStorage.getItem(CHART_KEY) ?? sessionStorage.getItem(CHART_KEY)
      if (!raw) return
      const chart = JSON.parse(raw) as Chart
      const matched = matchFragments(
        chart,
        guestFragments as unknown as Fragment[],
      ) as unknown as UniverseFragment[]
      setGuestMatched(matched)
    } catch {
      // no stashed chart / bad JSON — the guest universe simply has no reads
    }
  }, [guest, guestFragments])

  // The fragments that become read objects, highest weight first (both the
  // server loader and matchFragments sort by weight desc).
  const fragments = guest ? guestMatched : (matchedReads ?? [])

  // lens slug → depth for the star rule's tiebreak. Guests only ever see the
  // first lens, so an empty rank is correct for them (every read same depth).
  const lensRank = useMemo(() => lensRankFromRecord(lensRanks), [lensRanks])

  // ---- Layer 4: the revealed frontier --------------------------------------
  // How far the universe has been uncovered, in world units from center.
  // Seeded from the user's saved progress so returning users keep their world.
  const [revealRadius, setRevealRadius] = useState(initialRevealRadius)
  // Mirror into a ref so the (stable) pointer handler can gate taps on locked
  // objects without re-subscribing.
  const revealRadiusRef = useRef(revealRadius)
  revealRadiusRef.current = revealRadius

  // Track the previous frontier so we can flare-in only the objects that just
  // crossed into the revealed zone this step. The ref lags one render behind:
  // during the render right after an expansion it still holds the old radius,
  // which is exactly the window we use to detect "newly revealed".
  const prevRevealRef = useRef(revealRadius)
  useEffect(() => {
    prevRevealRef.current = revealRadius
  }, [revealRadius])
  const justRevealed = (r: number) =>
    r > prevRevealRef.current && r <= revealRadius

  // The open read/person panel + the avatar's transient reaction. `fragment`
  // marks panels backed by a fragment row, whose yes/no must ALSO persist to
  // read_responses (the same table /self writes).
  const [panel, setPanel] = useState<{
    data: PanelData
    read: Read
    fragment?: boolean
    mood?: ReadMood
    /** The verdict this read already carried when the panel was opened, or
     *  null for a first-time read. Drives the panel's answered state. */
    prior?: "agree" | "disagree" | null
  } | null>(null)
  // Mood ease-in: when a panel opens, the creature keeps NEUTRAL behavior for
  // a beat, then eases into the read's mood (~600ms ramp via CSS transitions +
  // animation swap) instead of an instant personality swap.
  const [moodActive, setMoodActive] = useState(false)
  const [reactMood, setReactMood] = useState<Mood | null>(null)
  const [reactColor, setReactColor] = useState<string | null>(null)
  const reactTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // The evolving self creature at the center. Its stage comes from real
  // engagement; its brief reactions mirror the universe's read reactions.
  const creatureRef = useRef<SelfCreatureHandle>(null)
  // The second creature instance standing on the open panel's top edge — the
  // one actually visible while a read is open, so reactions fire on it too.
  const stageCreatureRef = useRef<SelfCreatureHandle>(null)

  useEffect(() => {
    if (!reactMood) return
    const kind =
      reactMood === "agree" ? "agree" : reactMood === "submit" ? "submit" : "disagree"
    creatureRef.current?.react(kind)
    stageCreatureRef.current?.react(kind)
  }, [reactMood])

  /**
   * The signature being WORN right now: set only when a read is agreed to, so
   * the creature answers with that read's face, then cleared when it lets go.
   * Declared here (above closePanel) because that handler clears it.
   */
  const [wornSignature, setWornSignature] = useState<string | null>(null)
  const clearWornSignature = useCallback(() => setWornSignature(null), [])

  const closePanel = useCallback(() => {
    if (reactTimer.current) clearTimeout(reactTimer.current)
    setPanel(null)
    setReactMood(null)
    setReactColor(null)
    // Never carry a read's face out of the read that gave it.
    setWornSignature(null)
  }, [])

  // THE SEQUENCE — fragments grouped by section (fixed order), each section's
  // heaviest weight>=7 read its major star, then its minis, ALL beaded one
  // after another along the arm in walking order. Every read still carries
  // the panel content (authored title + body EXACTLY as written, trigger in
  // plain words, sigil) and a Read whose id IS the fragment id, so
  // agree/disagree persists to read_responses and /self shows the same state.
  // ---- 1. THE PAIRS — grouping and order only, no geometry ----------------
  const pairs = useMemo<PairRun[]>(() => {
    const groups = new Map<
      string,
      { lens: string; key: SectionKey; frs: UniverseFragment[] }
    >()
    for (const f of fragments) {
      // Explicit fragments.section wins; when null (column missing or not
      // backfilled) the section is DERIVED from the trigger type + planets,
      // so authored fragments spread across the journey instead of
      // collapsing into one section.
      const key = sectionFor(f.section, f.trigger_type, f.condition)
      const lens = lensOf(f)
      const pairKey = `${lens}\u0000${key}`
      const g = groups.get(pairKey)
      if (g) g.frs.push(f)
      else groups.set(pairKey, { lens, key, frs: [f] })
    }
    // Fixed journey order: section order first, then lens depth — so vedic's
    // "the heart" is walked before vedic_deep's.
    const sectionPos = new Map(SECTION_ORDER.map((s, i) => [s, i]))
    return [...groups.entries()]
      .sort(([, a], [, b]) => {
        const bySection =
          (sectionPos.get(a.key) ?? 0) - (sectionPos.get(b.key) ?? 0)
        if (bySection !== 0) return bySection
        const byLens = (lensRank.get(a.lens) ?? 0) - (lensRank.get(b.lens) ?? 0)
        if (byLens !== 0) return byLens
        return a.lens < b.lens ? -1 : 1
      })
      .map(([pairKey, g], idx) => ({
        pairKey,
        lens: g.lens,
        key: g.key,
        idx,
        color: SECTION_COLORS[g.key],
        // THE STAR RULE (lib/spiral/sections.ts): weight desc, then lens depth
        // desc, then id — so the major never depends on the order rows came
        // back from the database.
        frs: orderSection(g.frs, lensRank),
      }))
  }, [fragments, lensRank])

  // ---- 2. THE COLLAPSE LATCH ---------------------------------------------
  // Strict completion is read from a SNAPSHOT of the responded set, refreshed
  // only while no read panel is open. Answering the last read of a section
  // therefore does nothing to the sky until the panel closes and the user is
  // back on the spiral — the constellation collapses on their RETURN, never
  // under their hands mid-read.
  const [collapseSnapshot, setCollapseSnapshot] =
    useState<ReadonlySet<string>>(respondedIds)
  useEffect(() => {
    if (panel) return
    setCollapseSnapshot((prev) => (prev === respondedIds ? prev : respondedIds))
  }, [panel, respondedIds])

  // ---- 3. THE WALK — one continuous fill, strand A then strand B ---------
  const journey = useMemo(() => {
    // STRICT completion: every read of the pair answered, either verdict.
    // Lens unlocks deliberately keep using the LENIENT sectionClearProgress
    // rule (major + 2 minors) — only this star morph is strict.
    const done = pairs.map((p) =>
      p.frs.every((f) => collapseSnapshot.has(f.id)),
    )
    // Only ONE section is live at a time. Everything already complete is a
    // star; everything after the active pair is not placed at all.
    const activeIdx = done.findIndex((d) => !d)
    const active = activeIdx === -1 ? null : pairs[activeIdx]

    /**
     * COMPLETED PAIRS LEAVE NOTHING BEHIND.
     *
     * A finished (lens, section) pair used to collapse into a quiet star in a
     * dark pocket of the sky. That is gone: completion now registers only in
     * the creature (via the section-clear rule) and in /history. The spiral
     * shows the active run and nothing else, so finishing a chapter never
     * displaces or clutters the work still in front of the user.
     */

    /**
     * The active section, anchored by its MAJOR read.
     *
     * The major is placed AT the anchor and the minors trail INWARD behind it
     * along the same arm, in walk order — so the anchor is the outermost read
     * and index 0 of the run is the innermost. This is the inverse of the old
     * scheme (which started at a fixed inner t and grew outward, letting the
     * section's length decide where its major landed).
     *
     * The arm alternates by pair index, so consecutive sections sit on opposite
     * sides of the sky. Placement is derived purely from `active.idx`, which is
     * a stable property of the journey — so a section lands in the same place on
     * every reload, and never depends on how much has been answered.
     */
    const activeReads: PlacedRead[] = []
    if (active) {
      const anchor = ANCHORS[active.idx % ANCHORS.length]
      // frs[0] is the major: it sits AT the anchor — the START of the run — and
      // each following minor steps one gap further along the arm in whichever
      // direction sweeps RIGHTWARD on screen for this particular anchor.
      let t = anchor.t
      active.frs.forEach((f, j) => {
        if (j > 0) {
          t = anchor.outward ? advanceT(t, READ_ARC_GAP) : retreatT(t, READ_ARC_GAP)
        }
        const pt = spiralPoint(t, anchor.arm)
        activeReads.push({
          label: f.title,
          x: pt.x,
          y: pt.y,
          r: Math.hypot(pt.x, pt.y),
          color: active.color,
          panel: {
            src: describeTrigger(f),
            title: f.title,
            body: f.body,
            accent: active.color,
            symbol: symbolFor(f),
          },
          read: {
            id: f.id,
            category: "about-you" as const,
            text: f.body,
            // carried so history can tint each read with its section accent
            section: active.key,
            // carried so history can group sections under their lens/phase
            lens: active.lens,
          },
          mood: moodForRead(f.tone, f.life_domain),
          kind: j === 0 ? ("major" as const) : ("minor" as const),
          glyph: symbolFor(f),
          sectionKey: active.key,
          sectionIdx: active.idx,
        })
      })
    }

    // The revealed frontier has to contain everything actually drawn — which
    // now means the active run alone. Completed sections leave nothing behind,
    // so nothing else feeds the frontier here.
    let endR = 0
    for (const r of activeReads) endR = Math.max(endR, r.r)
    return { activeReads, active, endR }
  }, [pairs, collapseSnapshot])

  // The creature is composed from THE JOURNEY ITSELF, never from points:
  //   - structure (which slots exist) comes from the section-clear rule over
  //     the reads placed in the CURRENT sky, so stale ids from old sessions
  //     or removed content can never inflate the being.
  //   - disposition (which glyph each slot shows) comes from the user's FULL
  //     agree/disagree history: the saved read_responses rows plus anything
  //     judged this session.
  //   - the aura grows one permanent glyph per written answer.
  // /self derives the exact same signals, so the being is identical on both.
  // Reads the shared verdict map so the creature reacts on the same urgent
  // frame as the cursor, instead of waiting for the deferred provider write.
  const dispositionCounts = useMemo(() => {
    let agrees = 0
    let disagrees = 0
    for (const v of responseById.values()) {
      if (v === "agree") agrees++
      else disagrees++
    }
    return { agrees, disagrees }
  }, [responseById])

  const creatureSignals = useMemo<AvatarSignals>(() => {
    // Same lensRank as the walk above, so the star the user sees in a section
    // is the same read this clear math wants answered.
    const { done, total } = sectionClearProgress(
      fragments,
      respondedIds,
      lensRank,
    )
    return {
      agrees: dispositionCounts.agrees,
      disagrees: dispositionCounts.disagrees,
      answers: answerCount,
      cleared: done,
      constellations: total,
    }
  }, [dispositionCounts, fragments, respondedIds, answerCount, lensRank])

  /**
   * THE SIGNATURE LIBRARY — the faces the creature has collected.
   *
   * Derived from exactly the same two inputs as the disposition above (the
   * reads in the current sky + the shared verdict map), so it can never drift
   * out of step with what the being is: one face per AGREED read, unlocked the
   * moment the user says "yes, that's me". Nothing is stored.
   */
  const signatureLibrary = useMemo(
    () => deriveLibrary(fragments, responseById),
    [fragments, responseById],
  )

  // TEMPORARY INSTRUMENTATION — ambient drift diagnosis. Remove after reading.
  // In an effect (not inline) so it prints once per change, not once per render.
  useEffect(() => {
    const agreedIds = [...responseById.entries()]
      .filter(([, v]) => v === "agree")
      .map(([id]) => id)
    const fragmentIds = new Set(fragments.map((f) => f.id))
    // The join deriveLibrary actually performs: an agreed id only produces a
    // face if that fragment is ALSO in `fragments`. This split is what
    // separates "no agreements yet" from "agreements dropped by the lens gate".
    const agreedInSky = agreedIds.filter((id) => fragmentIds.has(id))
    const agreedNotInSky = agreedIds.filter((id) => !fragmentIds.has(id))
    console.log("[v0] ---- ambient drift diagnosis ----")
    console.log("[v0] lib.length:", signatureLibrary.length)
    console.log("[v0] responseById agree count:", agreedIds.length)
    console.log("[v0] fragments reaching deriveLibrary:", fragments.length)
    console.log("[v0] agreed AND in fragments (become faces):", agreedInSky.length)
    console.log(
      "[v0] agreed but NOT in fragments (dropped by join):",
      agreedNotInSky.length,
      agreedNotInSky.slice(0, 8),
    )
    console.log("[v0] guest:", guest, "| responseById total:", responseById.size)
    console.log(
      "[v0] drift gate needs lib.length > 0 =>",
      signatureLibrary.length > 0 ? "PASSES" : "FAILS",
    )
  }, [signatureLibrary, responseById, fragments, guest])

  // Disc size follows the creature's structure (see discSizeFor), from the
  // same signals SelfCreature renders.
  const discSize = discSizeFor(
    milestoneLevel(creatureSignals),
    creatureSignals.answers,
  )
  // Constant ratio (the previous 248/188 proportion) keeps the skeleton at
  // roughly half the disc at every stage.
  const creatureSize = Math.round(discSize * (248 / 188))

  // The ACTIVE pair, answered right to its end — drives the full-saturation
  // pre-collapse glow in the marker renderer. Read LIVE (not from the collapse
  // snapshot) so the constellation lights up the moment its last answer lands,
  // then collapses to its star when the panel closes.
  const activeDone = useMemo(
    () =>
      journey.activeReads.length > 0 &&
      journey.activeReads.every((r) => respondedIds.has(r.read.id)),
    [journey, respondedIds],
  )

  // THE SPIRAL NEVER CHANGES SIZE. The drawn extent is the pinned literal —
  // no growth, no extension flip, no luminous crawl. See SPIRAL_T_END.
  const visibleTEnd = SPIRAL_T_END

  // Fog visibility vs the drawn extent: 1 well inside, thinning to 0 across
  // the last ~0.12 of t before the edge (the sparse fade-out tail).
  const extFade = (t: number) => {
    const fadeStart = visibleTEnd - 0.12
    if (t <= fadeStart) return 1
    if (t >= visibleTEnd) return 0
    return 1 - (t - fadeStart) / 0.12
  }

  // What actually renders: ONLY the active section's reads. Everything already
  // complete has left the spiral entirely; nothing later is placed.
  const reads = journey.activeReads

  // The frontier expands to CONTAIN everything drawn — now just the active
  // run. The expansion is TWEENED over ~2s so the fog reveal keeps its old
  // pacing. Persisted, so a returning user's sky rebuilds expanded.
  const neededRevealR = useMemo(
    () => Math.max(BASE_REVEAL_RADIUS, journey.endR + 28),
    [journey],
  )

  // STALE-FRONTIER CLAMP (once, on load): a returning user's persisted radius
  // may date from an older sky layout where much larger radii were legitimate.
  // If it exceeds what the CURRENT layout warrants (placed sections + the
  // small per-answer growth headroom), snap it down and persist the corrected
  // value — otherwise the whole fog renders pre-lit and the gradual reveal is
  // lost.
  const clampedRef = useRef(false)
  useEffect(() => {
    if (clampedRef.current || pairs.length === 0) return
    clampedRef.current = true
    const cap = neededRevealR + REVEAL_STEP * 2
    if (revealRadiusRef.current > cap) {
      setRevealRadius(cap)
      if (!guest) void saveRevealRadius(cap).catch(() => {})
    }
  }, [pairs, neededRevealR, guest])

  useEffect(() => {
    const from = revealRadiusRef.current
    if (neededRevealR <= from) return
    if (!guest) void saveRevealRadius(neededRevealR).catch(() => {})
    // Small jumps land immediately; big ones (a new section) ease outward in
    // steps over ~2s, matching the crawl.
    if (neededRevealR - from < 80) {
      setRevealRadius(neededRevealR)
      return
    }
    const STEPS = 8
    let step = 0
    const iv = setInterval(() => {
      step++
      const p = step / STEPS
      const eased = 1 - (1 - p) * (1 - p)
      setRevealRadius(from + (neededRevealR - from) * eased)
      if (step >= STEPS) clearInterval(iv)
    }, 250)
    return () => clearInterval(iv)
  }, [neededRevealR, guest])

  // SEQUENTIAL GATE — the walk is one read at a time. Only the cursor read
  // (first unanswered in walking order) or an already-answered read (reopen)
  // may open; unanswered reads further along stay sealed even when visible
  // inside the fog. Ref-backed because openRead is a stable callback and the
  // cursor memo lives further down the component.
  const readGateRef = useRef<{
    cursor: string | null
    responded: Set<string>
    verdicts: Map<string, "agree" | "disagree">
  }>({
    cursor: null,
    responded: new Set(),
    verdicts: new Map(),
  })

  const openRead = useCallback((r: PlacedRead) => {
    const gate = readGateRef.current
    if (!gate.responded.has(r.read.id) && r.read.id !== gate.cursor) return
    if (reactTimer.current) clearTimeout(reactTimer.current)
    setPanel({
      data: r.panel,
      read: r.read,
      fragment: true,
      mood: r.mood,
      // Captured AT OPEN so the panel shows "you said yes" only for a read that
      // was already answered before this visit. Reading it live would flip the
      // panel into its answered state mid-linger, fighting the press
      // confirmation the user just triggered.
      prior: gate.verdicts.get(r.read.id) ?? null,
    })
    setReactMood("curious") // lean in
    // Attunement: the creature (glyphs + glow) adopts the read's accent while
    // the panel is open — SelfCreature eases the color over ~500ms.
    setReactColor(r.panel.accent ?? null)
  }, [])

  // yes/no from the panel → SAME persistence as the bottom ReadHub, plus a
  // brief avatar emote/tint that auto-decays before the panel closes.
  const judge = useCallback(
    (agreeIt: boolean) => {
      const current = panel
      if (!current) return
      /**
       * Also deferred. `agree`/`disagree` write to the spiral provider, which
       * recomputes `respondedIds` -> `reads` -> the marker layer, and that
       * landed in the same blocking commit as the press. Measured: the pressed
       * attribute flipped at ~210ms and the green wash only reached the screen
       * at ~444ms. Deferring both heavy writes lets the acknowledgement paint
       * on the next frame (~25ms) while the universe catches up behind it.
       *
       * Safe to defer because the panel latches its own choice locally, so the
       * confirmation never depends on this state round-tripping back down.
       */
      /**
       * URGENT: advance the cursor now. This is the one piece of answer state
       * that must NOT be deferred — it's what lights up the next read. The
       * provider write below stays in a transition; this mirror just lets the
       * ring move without waiting for it (and for the fog behind it).
       */
      setJustAnswered((prev) => ({
        ...prev,
        [current.read.id]: agreeIt ? "agree" : "disagree",
      }))

      startTransition(() => {
        if (agreeIt) agree(current.read)
        else disagree(current.read, "skip")
      })
      // Fragment reads persist to read_responses — the SAME table /self
      // writes — so both surfaces always show the same saved responses.
      // Guests keep session-only state (their chart never left the browser).
      if (!guest && current.fragment) {
        void saveReadResponse(current.read.id, agreeIt ? "agree" : "disagree").catch(
          () => {},
        )
      }
      setReactMood(agreeIt ? "agree" : "disagree")
      /**
       * "Yes, that's me" unlocks this read's face AND wears it immediately —
       * the library above already contains it on this same urgent frame,
       * because responseById picks up `justAnswered` set just above. Saying no
       * unlocks nothing, so the face stays as it was.
       */
      if (agreeIt) setWornSignature(current.read.id)
      const accent = current.data.accent ?? (agreeIt ? AGREE_COLOR : DISAGREE_COLOR)
      if (agreeIt) {
        // Absorbed: a saturated pulse — the accent pushed brighter — rides the
        // happy bounce while the panel lingers.
        setReactColor(mixHex(accent, "#ffffff", 0.3))
      } else {
        // Let it go: drain back to neutral (~400-500ms color ease) with the
        // curious tilt.
        setReactColor(null)
      }
      // The frontier does NOT move on answer. The spiral is a fixed size
      // (SPIRAL_T_END is pinned), so there is nothing new to materialize by
      // answering a read — the whole active run already sits inside the
      // frontier that `neededRevealR` established when the section became
      // active. Stepping it here only produced a creeping fog ring that read as
      // the spiral "growing." Reveal now changes in exactly one place: the
      // `neededRevealR` easing effect, which fires when a NEW section's geometry
      // needs more room. That path is monotonic (it never eases inward), so
      // once sky is lit it stays lit — including for returning users whose
      // radius is rehydrated from the DB.
      if (reactTimer.current) clearTimeout(reactTimer.current)
      reactTimer.current = setTimeout(() => {
        if (agreeIt) {
          // Close the panel but carry a faint tint of the absorbed read for
          // ~2s before settling back to neutral white.
          setPanel(null)
          setReactMood(null)
          setReactColor(mixHex(NEUTRAL_COLOR, accent, 0.35))
          reactTimer.current = setTimeout(() => setReactColor(null), 2000)
        } else {
          closePanel()
        }
      }, 820)
    },
    [panel, agree, disagree, closePanel, guest],
  )

  useEffect(() => {
    return () => {
      if (reactTimer.current) clearTimeout(reactTimer.current)
      if (camAnimTimer.current) clearTimeout(camAnimTimer.current)
    }
  }, [])

  // Read-open scene: while a panel is open the sky above it goes near-black
  // (a dim overlay fades the nebula/stars to ~10% over 300ms) and the creature
  // LEAVES its disc to take the stage — rendered ~1.5x, standing on the
  // panel's top edge, tinted the read's accent. Everything returns on close.
  const panelOpen = !!panel

  // Ease into the read's mood ~600ms after the panel opens (the stage slides
  // up in that window), and drop back to neutral the moment it closes — so the
  // yes/no reaction plays, then the creature returns to itself.
  useEffect(() => {
    if (!panelOpen) {
      setMoodActive(false)
      return
    }
    const t = setTimeout(() => setMoodActive(true), 600)
    return () => clearTimeout(t)
  }, [panelOpen])

  // The mood the on-stage creature is CURRENTLY expressing.
  const activeMood = moodActive && panel?.mood ? panel.mood : NEUTRAL_MOOD

  // The choreographer: once the mood is active, continuously compose 2-4
  // atomic moves weighted by the read's tone (see lib/self/moves.ts), play
  // them with jittered durations + small pauses, repeat with a new sequence.
  // Cancelled the moment the panel closes or the mood changes.
  const stageMoveRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!panelOpen || !moodActive) return
    const el = stageMoveRef.current
    if (!el) return
    return choreograph(
      el,
      {
        blink: (h) => stageCreatureRef.current?.blink(h),
        mutate: (s) => stageCreatureRef.current?.mutate(s),
      },
      activeMood.tone,
    )
  }, [panelOpen, moodActive, activeMood.tone])

  // World-space centers of every read marker. The nebula carves a small clear
  // disc around each so a marker's badge sits in the sky cleanly, never stacked
  // on top of a fog glyph.
  const markerCenters = useMemo<{ x: number; y: number }[]>(
    () => reads.map((r) => ({ x: r.x, y: r.y })),
    [reads],
  )

  // The nebula: a dense field of ASCII glyphs scattered along AND across the
  // spiral arm, forming cloudy limbs with organic clumping (density noise)
  // rather than an even trail. Deterministic (seeded RNG + spiralPoint), so
  // SSR and the client render the exact same cloud.
  const glyphs = useMemo<Glyph[]>(() => {
    const rand = mulberry32(0x5eed)
    const out: Glyph[] = []
    let key = 0
    const along = (MAX_R * (GLYPH_T_END - GLYPH_T_START)) / NEBULA_SAMPLES
    // Two interleaved arms (half a turn apart) so the fog wraps around the moon
    // as a cloud rather than a single thin thread.
    const ARMS = [0, Math.PI]
    for (const armPhase of ARMS) {
      for (let s = 0; s <= NEBULA_SAMPLES; s++) {
        const t = GLYPH_T_START + (GLYPH_T_END - GLYPH_T_START) * (s / NEBULA_SAMPLES)
        // + SPIRAL_PHASE keeps the fog locked to the reads beaded on it by
        // spiralPoint — the whole sky turns as one rigid body.
        const theta =
          t * TURNS * Math.PI * 2 - Math.PI / 2 + armPhase + SPIRAL_PHASE
        const rr = MAX_R * t
        const cx = rr * Math.cos(theta)
        const cy = rr * Math.sin(theta)
        // unit tangent + perpendicular to the curve at this point
        const tx = Math.cos(theta)
        const ty = Math.sin(theta)
        const px = -ty
        const py = tx
        // density noise → clumpy, cloudy arms instead of a uniform ribbon
        const dens = 0.35 + 0.65 * Math.abs(Math.sin(t * 5.1 + armPhase + 1.3) * Math.sin(t * 2.3 + 0.7))
        // wide arms that overlap into a continuous cloud, widening outward
        const armWidth = 30 + t * 74
        const count = 2 + Math.round(dens * 3.2)
        for (let k = 0; k < count; k++) {
          // triangular (gaussian-ish) perpendicular offset → denser near the
          // curve spine, thinning toward the arm edges
          const gp = rand() + rand() - 1
          const perp = gp * armWidth
          const off = (rand() - 0.5) * along * 2.2
          const x = cx + px * perp + tx * off
          const y = cy + py * perp + ty * off
          const dist = Math.hypot(x, y)
          if (dist < AVATAR_CLEAR_RADIUS) continue
          // Keep a clean disc around each marker so its star reads as part of
          // the spiral, not layered over a fog glyph.
          let nearMarker = false
          for (const m of markerCenters) {
            if (Math.hypot(x - m.x, y - m.y) < MARKER_CLEAR_RADIUS) {
              nearMarker = true
              break
            }
          }
          if (nearMarker) continue
          const rawEdge = Math.min(1, Math.max(0, (dist - AVATAR_CLEAR_RADIUS) / FADE_BAND))
          const edgeFade = rawEdge * rawEdge * (3 - 2 * rawEdge) // smoothstep
          // brighter near the spine, fainter toward the arm edge
          const widthFade = 1 - Math.min(1, Math.abs(perp) / (armWidth * 1.2)) * 0.7
          out.push({
            key: key++,
            x,
            y,
            r: dist,
            t,
            char: NEBULA_CHARS[Math.floor(rand() * NEBULA_CHARS.length)],
            size: 7 + Math.min(t, 1.5) * 7 + rand() * 4,
            max: (0.34 + rand() * 0.54) * edgeFade * widthFade,
            tone: NEBULA_TONES[Math.floor(rand() * NEBULA_TONES.length)],
            shimmerDur: 4 + rand() * 4.5,
            delay: -(rand() * 6),
          })
        }
      }
    }
    return out
  }, [markerCenters])

  // THE CURSOR — the ring sits on the FIRST unanswered read in the walking
  // sequence, major or mini alike, and moves one read at a time as answers
  // land. Purely derived from response data, so a returning user's cursor
  // reconstructs at their true position.
  const currentReadId = useMemo(() => {
    for (const r of reads) {
      if (!respondedIds.has(r.read.id)) return r.read.id
    }
    return null
  }, [reads, respondedIds])
  // Keep the sequential-open gate in sync (see openRead).
  readGateRef.current = {
    cursor: currentReadId,
    responded: respondedIds,
    verdicts: responseById,
  }

  // FIRST-READ COACH MARK — a quiet line of sky-language shown only to a
  // visitor who has never answered anything: "start here. this one's about
  // you." with a thin thread down to the current ringed star. Eligibility is
  // decided ONCE (zero responses at mount); the moment the first answer
  // lands it fades out (~400ms) and never returns.
  // Latch eligibility only once the sky actually has reads — a guest's reads
  // arrive after hydration (chart parsed from storage), so deciding on the
  // very first render would always see an empty sky and never show the mark.
  const coachEligibleRef = useRef<boolean | null>(null)
  if (coachEligibleRef.current === null && reads.length > 0) {
    coachEligibleRef.current = respondedIds.size === 0
  }
  const [coachPhase, setCoachPhase] = useState<"hidden" | "in" | "out" | "gone">("hidden")
  const coachTextRef = useRef<HTMLParagraphElement | null>(null)
  const coachLineRef = useRef<SVGLineElement | null>(null)
  const coachStarRef = useRef<{ x: number; y: number } | null>(null)
  {
    const cur = reads.find((r) => r.read.id === currentReadId)
    coachStarRef.current = cur ? { x: cur.x, y: cur.y } : null
  }

  // Fade in ~1s after the sky first settles. Keyed on the sky having reads
  // (not bare mount) because guests get their reads a render after hydration.
  const skyHasReads = reads.length > 0
  useEffect(() => {
    if (!skyHasReads || !coachEligibleRef.current) return
    const t = setTimeout(() => {
      setCoachPhase((p) => (p === "hidden" ? "in" : p))
    }, 1600)
    return () => clearTimeout(t)
  }, [skyHasReads])

  // The first saved answer dismisses it, permanently.
  useEffect(() => {
    if (respondedIds.size === 0) return
    setCoachPhase((p) => {
      if (p === "gone" || p === "out") return p
      return p === "hidden" ? "gone" : "out"
    })
  }, [respondedIds])
  useEffect(() => {
    if (coachPhase !== "out") return
    const t = setTimeout(() => setCoachPhase("gone"), 450)
    return () => clearTimeout(t)
  }, [coachPhase])

  // Thread geometry — tracked every frame while visible by reading the
  // universe layer's LIVE computed transform, so the line follows the star
  // exactly through pans, pinches, AND eased camera animations. If the star
  // drifts off-screen the endpoint clamps to the frame edge, still pointing
  // toward it.
  useEffect(() => {
    if (coachPhase !== "in" && coachPhase !== "out") return
    let raf = 0
    const tick = () => {
      raf = requestAnimationFrame(tick)
      const stage = stageRef.current
      const universe = universeRef.current
      const line = coachLineRef.current
      const text = coachTextRef.current
      const star = coachStarRef.current
      if (!stage || !universe || !line || !text || !star) return
      const m = new DOMMatrixReadOnly(getComputedStyle(universe).transform)
      const scale = m.a || 1
      // Screen position of the star (universe transform is translate+scale).
      const sx = m.a * star.x + m.e
      const sy = m.d * star.y + m.f
      const sr = stage.getBoundingClientRect()
      const tr = text.getBoundingClientRect()
      const x1 = tr.left + tr.width / 2 - sr.left
      const y1 = tr.bottom - sr.top + 6
      const MARGIN = 12
      const cx2 = Math.min(Math.max(sx, MARGIN), sr.width - MARGIN)
      const cy2 = Math.min(Math.max(sy, MARGIN), sr.height - MARGIN)
      let x2: number
      let y2: number
      if (cx2 !== sx || cy2 !== sy) {
        // Star is off-frame: clamp to the edge, aimed at it.
        x2 = cx2
        y2 = cy2
      } else {
        // Stop at the edge of the star's ring (ring ≈ 21px ∅ + breathing room,
        // scaled with the camera) so the thread touches, never crosses.
        const dx = sx - x1
        const dy = sy - y1
        const d = Math.hypot(dx, dy) || 1
        const stop = 10.5 * scale + 9
        x2 = sx - (dx / d) * stop
        y2 = sy - (dy / d) * stop
      }
      line.setAttribute("x1", x1.toFixed(1))
      line.setAttribute("y1", y1.toFixed(1))
      line.setAttribute("x2", x2.toFixed(1))
      line.setAttribute("y2", y2.toFixed(1))
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [coachPhase])

  // When the ring passes to a new read (not on first paint), that star blooms
  // briefly (~800ms) as its ring + color arrive.
  const prevCurrentRef = useRef<string | null>(null)
  const [bloomId, setBloomId] = useState<string | null>(null)
  useEffect(() => {
    const prev = prevCurrentRef.current
    prevCurrentRef.current = currentReadId
    if (prev && currentReadId && prev !== currentReadId) {
      setBloomId(currentReadId)
      const t = setTimeout(() => setBloomId(null), 850)
      return () => clearTimeout(t)
    }
  }, [currentReadId])

  // Mirror the latest reads + opener into refs so the (stable) pointer
  // effect can resolve a tap to the right object without re-subscribing.
  const readsRef = useRef(reads)
  readsRef.current = reads
  const openReadRef = useRef(openRead)
  openReadRef.current = openRead
  const routerRef = useRef(router)
  routerRef.current = router

  // Camera bounds: the world origin may never drift further than this from the
  // viewport center (in world units), so the view always contains part of the
  // populated universe and can't wander into empty void.
  const PAN_LIMIT = MAX_R * 1.2

  const clampCam = useCallback(() => {
    const cam = camRef.current
    const d = Math.hypot(cam.x, cam.y)
    if (d > PAN_LIMIT) {
      const k = PAN_LIMIT / d
      cam.x *= k
      cam.y *= k
    }
  }, [PAN_LIMIT])

  const apply = useCallback(() => {
    const stage = stageRef.current
    const universe = universeRef.current
    if (!stage || !universe) return
    const cam = camRef.current
    const cx = stage.clientWidth / 2
    const cy = stage.clientHeight / 2
    const tx = cx - cam.x * cam.scale
    const ty = cy - cam.y * cam.scale
    universe.style.transform = `translate(${tx}px, ${ty}px) scale(${cam.scale})`
    // Counter-scale the avatar in the same pass so it renders at constant
    // screen size and never jitters against the camera during pinch.
    if (avatarRef.current) {
      avatarRef.current.style.transform = `translate(-50%, -50%) scale(${1 / cam.scale})`
    }
    setIsHome(Math.abs(cam.scale - 1) < 0.005 && Math.abs(cam.x) < 1 && Math.abs(cam.y) < 1)
  }, [])

  // Center BEFORE the browser paints. The universe layer sits at the stage's
  // top-left with `transformOrigin: 0 0` and no initial transform, so world
  // origin (0,0) — where the avatar and the whole sky live — would paint in the
  // top-left corner on the very first frame. `apply()` is what translates it to
  // the stage center, but running it from a plain useEffect happens AFTER that
  // first paint, so every mount (arriving at /circle, or navigating back to it)
  // flashed the sky pinned to the top and then snapped to center. useLayoutEffect
  // runs synchronously after mount and before paint, so the first visible frame
  // is already centered — no flash, no drift.
  useLayoutEffect(() => {
    apply()
  }, [apply])

  // Run an animated camera move: temporarily put a transform transition on the
  // universe layer, apply the new camera, then strip the transition so drags
  // and pinches stay perfectly snappy afterwards.
  const animateCam = useCallback(
    (mutate: () => void, ms = 700) => {
      const universe = universeRef.current
      if (!universe) return
      if (camAnimTimer.current) clearTimeout(camAnimTimer.current)
      const easing = `transform ${ms}ms cubic-bezier(.3,.8,.3,1)`
      universe.style.transition = easing
      // The avatar's counter-scale must ease in lockstep with the camera.
      if (avatarRef.current) avatarRef.current.style.transition = easing
      mutate()
      apply()
      camAnimTimer.current = setTimeout(() => {
        universe.style.transition = ""
        if (avatarRef.current) avatarRef.current.style.transition = ""
      }, ms + 60)
    },
    [apply],
  )

  // Zoom anchored at a stage-relative point (sx,sy) — keeps that point fixed.
  const zoomAt = useCallback(
    (sx: number, sy: number, factor: number) => {
      const stage = stageRef.current
      if (!stage) return
      const cam = camRef.current
      const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, cam.scale * factor))
      if (newScale === cam.scale) return
      const cx = stage.clientWidth / 2
      const cy = stage.clientHeight / 2
      const wx = (sx - (cx - cam.x * cam.scale)) / cam.scale
      const wy = (sy - (cy - cam.y * cam.scale)) / cam.scale
      cam.scale = newScale
      cam.x = wx - (sx - cx) / cam.scale
      cam.y = wy - (sy - cy) / cam.scale
      clampCam()
      apply()
    },
    [apply, clampCam],
  )

  // Return home: smoothly animate the camera back to scale 1, avatar centered
  // (~700ms ease). Replaces the old RESET button — same end state, one motion.
  const goHome = useCallback(() => {
    animateCam(() => {
      camRef.current = { x: 0, y: 0, scale: 1 }
    }, 700)
  }, [animateCam])

  /**
   * "Back to the circle": dismiss the read AND return the camera to the home
   * composition. Closing alone would leave the user still zoomed into the star
   * they were just reading, which doesn't feel like going back.
   */
  const backToCircle = useCallback(() => {
    closePanel()
    goHome()
  }, [closePanel, goHome])

  // Publish/retract that action as the panel opens and closes. Declared after
  // goHome so both halves of backToCircle exist by now; reuses the existing
  // panelOpen flag above rather than deriving a second one.
  const onBackChangeRef = useRef(onBackChange)
  onBackChangeRef.current = onBackChange
  useEffect(() => {
    onBackChangeRef.current?.(panelOpen ? backToCircle : null)
    // Retract on unmount so the parent can never keep a stale back action
    // pointing at a panel that no longer exists.
    return () => onBackChangeRef.current?.(null)
  }, [panelOpen, backToCircle])

  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return

    const relX = (clientX: number) => clientX - stage.getBoundingClientRect().left
    const relY = (clientY: number) => clientY - stage.getBoundingClientRect().top

    // PERF: while a gesture is in flight the shimmer animations pause (see
    // [data-gesture] rule in globals.css). Compositing the big blurred fog
    // texture AND group opacity animations during pan/zoom is what made the
    // walk feel laggy on phones — pausing the twinkle mid-gesture is
    // imperceptible (the eye tracks the moving sky) and frees the GPU.
    let wheelIdle: ReturnType<typeof setTimeout> | null = null
    const setGesture = (on: boolean) => {
      if (on) stage.dataset.gesture = "1"
      else delete stage.dataset.gesture
    }

    const onPointerDown = (e: PointerEvent) => {
      // Let interactive controls (HUD buttons, avatar tap target) handle their
      // own clicks — don't hijack the pointer for panning, which would capture
      // it to the stage and swallow the click.
      if ((e.target as HTMLElement | null)?.closest("button")) return
      ptsRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
      setGesture(true)
      draggingRef.current = true
      lastRef.current = { x: e.clientX, y: e.clientY }
      downPtRef.current = { x: e.clientX, y: e.clientY }
      movedRef.current = false
      downTargetRef.current = e.target as HTMLElement | null
      try {
        stage.setPointerCapture(e.pointerId)
      } catch {
        // ignore — capture is best-effort
      }
    }

    const onPointerMove = (e: PointerEvent) => {
      if (ptsRef.current.has(e.pointerId)) {
        ptsRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
      }
      // Once the pointer travels past the slop, this gesture is a drag, not a
      // tap — suppress any object click that would otherwise fire on pointerup.
      if (
        !movedRef.current &&
        Math.hypot(e.clientX - downPtRef.current.x, e.clientY - downPtRef.current.y) > TAP_SLOP
      ) {
        movedRef.current = true
      }
      // Two pointers → pinch zoom about their midpoint.
      if (ptsRef.current.size === 2) {
        const [a, b] = [...ptsRef.current.values()]
        const d = Math.hypot(a.x - b.x, a.y - b.y)
        const mx = (a.x + b.x) / 2
        const my = (a.y + b.y) / 2
        if (pinchRef.current) {
          zoomAt(mx - stage.getBoundingClientRect().left, my - stage.getBoundingClientRect().top, d / pinchRef.current)
        }
        pinchRef.current = d
        draggingRef.current = false
        return
      }
      if (!draggingRef.current) return
      const dx = e.clientX - lastRef.current.x
      const dy = e.clientY - lastRef.current.y
      lastRef.current = { x: e.clientX, y: e.clientY }
      const cam = camRef.current
      // Zoom-gated panning: at 100% the view IS the fixed home composition —
      // dragging does nothing. Panning unlocks only when zoomed in or out.
      if (Math.abs(cam.scale - 1) < 0.005) return
      // Divide by scale so pan speed feels natural at every zoom level.
      cam.x -= dx / cam.scale
      cam.y -= dy / cam.scale
      clampCam()
      apply()
    }

    // Resolve a tap: only when the gesture didn't move past the slop and wasn't
    // a pinch. We use the element pressed at pointerdown (capture retargets the
    // synthetic click, so onClick on the object is unreliable here).
    const resolveTap = () => {
      if (movedRef.current) return
      const objEl = downTargetRef.current?.closest<HTMLElement>("[data-obj]")
      if (!objEl) return
      const type = objEl.dataset.obj
      const idx = Number(objEl.dataset.objIndex)
      if (Number.isNaN(idx)) return
      // The center self: a tap on the creature opens its history. Handled
      // first because it is the one object that isn't frontier-gated — the
      // self is always reachable.
      if (type === "self") {
        routerRef.current.push("/history")
        return
      }
      // Locked objects (beyond the revealed frontier) can't be opened — the
      // user has to expand the frontier by answering reads first.
      if (type === "read") {
        const r = readsRef.current[idx]
        if (r && r.r <= revealRadiusRef.current) openReadRef.current(r)
      }
    }

    const onPointerUp = (e: PointerEvent) => {
      const wasPinch = ptsRef.current.size >= 2
      ptsRef.current.delete(e.pointerId)
      if (ptsRef.current.size < 2) pinchRef.current = 0
      if (ptsRef.current.size === 0) {
        draggingRef.current = false
        setGesture(false)
        if (!wasPinch) resolveTap()
        downTargetRef.current = null
      }
    }

    const onPointerCancel = (e: PointerEvent) => {
      ptsRef.current.delete(e.pointerId)
      if (ptsRef.current.size < 2) pinchRef.current = 0
      if (ptsRef.current.size === 0) {
        draggingRef.current = false
        setGesture(false)
        downTargetRef.current = null
      }
    }

    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      // Wheel zoom has no down/up bracket — hold the pause until the wheel
      // has been idle for a beat.
      setGesture(true)
      if (wheelIdle) clearTimeout(wheelIdle)
      wheelIdle = setTimeout(() => setGesture(false), 220)
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12
      zoomAt(relX(e.clientX), relY(e.clientY), factor)
    }

    stage.addEventListener("pointerdown", onPointerDown)
    stage.addEventListener("pointermove", onPointerMove)
    stage.addEventListener("pointerup", onPointerUp)
    stage.addEventListener("pointercancel", onPointerCancel)
    stage.addEventListener("wheel", onWheel, { passive: false })

    const onResize = () => apply()
    window.addEventListener("resize", onResize)

    // Re-assert centering after listeners attach. The pre-paint useLayoutEffect
    // above already did the initial centering; this is a harmless idempotent
    // pass that also covers this effect re-running.
    apply()

    return () => {
      stage.removeEventListener("pointerdown", onPointerDown)
      stage.removeEventListener("pointermove", onPointerMove)
      stage.removeEventListener("pointerup", onPointerUp)
      stage.removeEventListener("pointercancel", onPointerCancel)
      stage.removeEventListener("wheel", onWheel)
      window.removeEventListener("resize", onResize)
      if (wheelIdle) clearTimeout(wheelIdle)
      setGesture(false)
    }
  }, [apply, zoomAt, clampCam])

  const monoFont =
    "'Geist Pixel', ui-monospace, monospace"

  return (
    <div
      ref={stageRef}
      className="absolute inset-0 overflow-hidden"
      style={{
        touchAction: "none",
        cursor: "grab",
        userSelect: "none",
        // Pure black void — no gradient lift. The only light in this sky is the
        // cool nebula glow that blooms inside the revealed frontier.
        background: "#050505",
      }}
    >
      {/* ===== The universe layer: everything here pans + zooms — including
          the self creature, anchored at world origin (0,0). ===== */}
      <div
        ref={universeRef}
        className="absolute left-0 top-0"
        style={{ width: 0, height: 0, transformOrigin: "0 0", willChange: "transform" }}
      >
        {/* ── Nebula, glow underlay ────────────────────────────���─────────
            One layer holding a soft bloom blob per glyph. Lit (inside-
            frontier) blobs carry the cool moonlit glow; locked ones sit at
            opacity 0. PERF: these are radial-gradient discs — already soft,
            NO blur filter. The old blur(9px) over ~500 text glyphs forced the
            GPU to re-rasterize a huge filtered texture during every pan/zoom
            frame, which is exactly the walkthrough lag (profiled: ~39fps with
            the filter, ~60fps without). Gradients composite for free. When
            the frontier grows, new blobs fade in over ~1.2s (spread by
            radius), so the fog still visibly rolls outward. */}
        {/* PERF: extracted into a memoized child. These two layers are ~1890
            spans, and they depend on NOTHING that a judgement changes. Inline,
            every unrelated state change (opening a read, answering it, the
            creature's reaction) re-reconciled all of them — a ~294ms long task
            that blocked the button's own press feedback from painting for
            ~300ms, which is the "lag before it registers" this fixes. */}
        <NebulaLayers
          glyphs={glyphs}
          revealRadius={revealRadius}
          prevReveal={prevRevealRef.current}
          monoFont={monoFont}
          visibleTEnd={visibleTEnd}
        />

        {/* Completed (lens, section) pairs leave NOTHING behind on the spiral.
            A finished chapter's progress lives in the creature (which grows
            from the section-clear rule) and in /history (where its answers are
            grouped). The spiral only ever shows the ACTIVE section. */}

        {/* READ objects — the ACTIVE section's constellation: its major star on
            the arm + its minor glyphs clustered around it. Tap to open. Taps
            resolve in the stage's pointerup handler (via data-obj), since
            pointer capture makes per-element onClick unreliable here. */}
        {reads.map((r, i) => {
          // Marker states within a constellation:
          // CURRENT   — the active section's major only: section-color ring +
          //             colored star + colored glow.
          // ANSWERED  — major or minor, takes the section color (minors keep
          //             their small local fog-tint glow, now in section hue);
          //             still tappable to reopen.
          // UNANSWERED major — bare white glowing star, no ring.
          // UNANSWERED minor — dim white glyph, waiting forever if need be.
          const completed = respondedIds.has(r.read.id)
          const isCurrent = r.read.id === currentReadId
          const blooming = bloomId === r.read.id
          const isMajor = r.kind === "major"
          // Subtle full-saturation glow once the constellation is 100%
          // answered — the beat before it collapses into its star.
          const sectionDone = activeDone
          const starColor = isCurrent || completed ? r.color : isMajor ? "#e8e4da" : "#8d8a80"
          // Shared glow: applied as text-shadow for minor sigils and converted
          // to a drop-shadow filter for the majors' SVG star.
          const starGlow = completed
            ? sectionDone
              ? `0 0 6px ${r.color}, 0 0 14px ${r.color}, 0 0 26px ${r.color}88`
              : `0 0 8px ${r.color}, 0 0 18px ${r.color}99`
            : isCurrent
              ? `0 0 8px ${r.color}, 0 0 18px ${r.color}`
              : isMajor
                ? `0 0 8px #e8e4da, 0 0 16px #e8e4da66`
                : "0 0 6px #8d8a8055"
          return (
            <div
              key={r.read.id}
              data-obj="read"
              data-obj-index={i}
              role="button"
              tabIndex={0}
              aria-label={`Read: ${r.label}`}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault()
                  openRead(r)
                }
              }}
              className={`group absolute flex flex-col items-center${
                justRevealed(r.r) ? " animate-flare-in" : ""
              }`}
              style={{
                left: px2(r.x),
                top: px2(r.y),
                transform: "translate(-50%, -50%)",
                // Only the cursor read and answered reads are openable —
                // sealed future reads shouldn't invite a click.
                cursor: completed || isCurrent ? "pointer" : "default",
                transition:
                  "opacity 1s ease, filter 1s ease, transform 1s cubic-bezier(.3,.8,.3,1)",
              }}
            >
              <span
                className={`flex items-center justify-center rounded-full leading-none transition-all duration-500 group-hover:brightness-150 animate-object-pulse${
                  blooming ? " animate-current-bloom" : ""
                }`}
                style={{
                  // Major: 21px ring with a 12px star icon (~60% fill).
                  // Minor: a smaller badge around the fragment's sigil.
                  width: isMajor ? 21 : 24,
                  height: isMajor ? 21 : 24,
                  backgroundColor: isCurrent ? "#050505" : "transparent",
                  border: isCurrent
                    ? `1.5px solid ${r.color}`
                    : "1.5px solid transparent",
                  color: starColor,
                  fontFamily: monoFont,
                  fontSize: isMajor ? (isCurrent ? 20 : 16) : 10,
                  letterSpacing: isMajor ? undefined : "-0.5px",
                  whiteSpace: "nowrap",
                  textShadow: starGlow,
                  boxShadow: isCurrent
                    ? `0 0 10px ${r.color}, 0 0 20px ${r.color}66`
                    : "none",
                }}
              >
                {/* Majors render a geometric SVG star (exactly centered at any
                    zoom); minors keep their text sigil. */}
                {isMajor ? (
                  // Same size in every state — current (ringed), answered on
                  // the spiral, and bare — so answering never shrinks the star.
                  <StarIcon size={12} glow={toDropShadow(starGlow)} />
                ) : (
                  r.glyph
                )}
              </span>
            </div>
          )
        })}

        {/* ===== The avatar: anchored to the WORLD at origin (0,0) — the
            spiral's center — so it pans with the map, but counter-scaled by
            1/cameraScale (set imperatively in apply()) so the disc, creature,
            and outline render at a constant screen size at every zoom. ===== */}
        <div
          ref={avatarRef}
          className="pointer-events-none absolute z-[60]"
          style={{
            left: 0,
            top: 0,
            width: creatureSize,
            height: creatureSize,
            transform: "translate(-50%, -50%)",
            transformOrigin: "center",
          }}
        >
        {/* The moon of this sky: an opaque black disc that contains the self
            creature and masks the nebula behind it, so the fog reads as emerging
            from the circle's rim. Its outline normally sits at the neutral
            near-white, but adopts the color of whichever read/person panel is
            open — echoing the tapped node back onto the self. */}
        <div
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{
            width: discSize,
            height: discSize,
            backgroundColor: "#050505",
            border: `1.5px solid ${panel?.data.accent ?? NEUTRAL_COLOR}`,
            boxShadow: panel?.data.accent ? `0 0 18px ${panel.data.accent}55` : "none",
            // width/height ease makes stage-evolution growth a smooth swell.
            transition:
              "border-color .5s ease, box-shadow .5s ease, width .8s cubic-bezier(.3,.8,.3,1), height .8s cubic-bezier(.3,.8,.3,1)",
          }}
        />
        <div className="relative flex h-full w-full items-center justify-center overflow-hidden">
          <SelfCreature
            ref={creatureRef}
            signals={creatureSignals}
            seed={userId ?? "guest-journey"}
            color={reactColor ?? NEUTRAL_COLOR}
            size={creatureSize}
            lcd
            lcdSize={discSize}
            /* At rest in its own sky, the self drifts through the faces it has
               collected — so an explored self visibly has range and a new one
               has none. */
            library={signatureLibrary}
            ambient
          />
        </div>

        {/* THE CENTER TAP — the self opens its own history.

            A sibling INSIDE the avatar wrapper, never a prop on it: the
            wrapper carries the counter-scale transform (see the camera apply
            loop) and stays pointer-events-none, so hanging a handler there
            would either fight that transform or swallow stage gestures. This
            child re-enables pointer events for exactly the disc's circle and
            grows with it, since discSize swells as the creature evolves.

            Tap resolution goes through the stage's data-obj dispatch, which
            already distinguishes a tap from a drag/pinch — so panning across
            the center never navigates. Keyboard activation is handled here
            directly, with a visible focus ring for it. */}
        <div
          data-obj="self"
          data-obj-index={0}
          role="button"
          tabIndex={0}
          aria-label="Open your history of answered reads"
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault()
              router.push("/history")
            }
          }}
          className="pointer-events-auto absolute left-1/2 top-1/2 cursor-pointer rounded-full outline-none ring-offset-2 ring-offset-[#050505] focus-visible:ring-2"
          style={{
            width: discSize,
            height: discSize,
            transform: "translate(-50%, -50%)",
            // @ts-expect-error -- CSS custom property for the focus ring hue
            "--tw-ring-color": panel?.data.accent ?? NEUTRAL_COLOR,
            transition:
              "width .8s cubic-bezier(.3,.8,.3,1), height .8s cubic-bezier(.3,.8,.3,1)",
          }}
        />

        {/* ===== The name plate: a small pill straddling the disc's bottom rim,
            naming the self the way the app addresses it everywhere else.
            Deliberately built from the SAME three ingredients as the disc so it
            reads as one object: black fill, a 1.5px outline in the disc's live
            color, and the creature's LED sub-pixel grid laid over both text and
            background.

            Positioned OFF discSize rather than a fixed offset — the disc swells
            as the creature evolves (see discSizeFor), so a hardcoded top would
            drift off the rim at later stages. Rendered after the disc so it
            paints above the rim line it crosses. ===== */}
        <div
          className="absolute left-1/2 rounded-full"
          style={{
            // Center sits just inside the rim, so the outline crosses the
            // plate's lower third exactly as in the design.
            top: `calc(50% + ${discSize / 2 - 6}px)`,
            transform: "translate(-50%, -50%)",
            // Outward glow lives out here, above the clip layer, so it isn't
            // eaten by that layer's overflow-hidden.
            boxShadow: panel?.data.accent
              ? `0 0 12px ${panel.data.accent}55`
              : "none",
            // Mirrors the disc's easing so outline color and stage growth move
            // together instead of the plate snapping while the disc glides.
            transition:
              "box-shadow .5s ease, top .8s cubic-bezier(.3,.8,.3,1)",
          }}
        >
          {/* Clip layer. Its only job is to give the LED overlay a box that
              INCLUDES the pill's outline. The creature's LCD is sized to the
              full disc, so the disc's rim sits *under* the grid and vignette and
              reads dimmer than its raw color; an overlay pinned to inset-0 of
              the bordered element itself would stop at the padding box and
              leave the outline at full brightness — which is exactly why the
              pill's outline looked brighter than the circle's despite both
              being the identical color string. */}
          <div className="relative overflow-hidden rounded-full">
            <div
              className="flex items-center justify-center rounded-full"
              style={{
                padding: "3px 12px",
                backgroundColor: "#050505",
                border: `1.5px solid ${panel?.data.accent ?? NEUTRAL_COLOR}`,
                transition: "border-color .5s ease",
              }}
            >
              <span
                style={{
                  fontFamily: "'Geist Pixel', ui-monospace, monospace",
                  fontSize: 13,
                  lineHeight: 1.15,
                  color: reactColor ?? NEUTRAL_COLOR,
                  // Same glow the creature's glyphs carry, so the text sits on
                  // the same light as the face above it.
                  filter: `drop-shadow(0 0 6px ${reactColor ?? NEUTRAL_COLOR})`,
                  transition: "color .5s ease, filter .5s ease",
                  userSelect: "none",
                }}
              >
                you
              </span>
            </div>

            {/* The LED treatment, floated over outline, fill AND text. Same
                recipe and same FIXED 2px sub-pixel pitch as the creature's
                screen — that constant pitch is what makes a plate this small
                read as the same display as the big face. */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0"
              style={{
                boxShadow: "inset 0 0 8px 2px rgba(0,0,0,0.6)",
                // Shared, desaturated texture — see lib/ui/led.ts.
                backgroundImage: ledTexture(0.16),
              }}
            />
          </div>
        </div>
          {/* Tap target over the face → opens the chart read sheet. Still
              works inside the transformed layer: the stage's pointerdown
              handler skips buttons, so the native click reaches it. */}
          {onSelectSelf && (
            <button
              type="button"
              onClick={onSelectSelf}
              aria-label="Read your chart"
              className="pointer-events-auto absolute left-1/2 top-1/2 size-36 -translate-x-1/2 -translate-y-1/2 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          )}
        </div>
      </div>

      {/* Sky dim: while a read panel is open, the whole universe (nebula,
          stars, disc) fades to ~10% behind this near-black overlay — the
          creature has left its disc for the panel's stage. 300ms both ways. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-30"
        style={{
          background: "#050505",
          opacity: panelOpen ? 0.9 : 0,
          transition: "opacity 300ms ease",
        }}
      />

      {/* ===== First-read coach mark =====
          Screen-space, pointer-transparent overlay: the invitation line at the
          top of the frame and a thin thread down to the current star's ring.
          Geometry is written imperatively each frame (see the coach rAF
          effect) so it tracks the star through pan/zoom/eased camera moves. */}
      {coachPhase !== "gone" && coachEligibleRef.current && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-20"
          style={{
            opacity: coachPhase === "in" ? 1 : 0,
            transition: `opacity ${coachPhase === "out" ? 400 : 1000}ms ease`,
          }}
        >
          <p
            ref={coachTextRef}
            className="absolute left-1/2 top-10 -translate-x-1/2 text-center text-[10px] uppercase leading-relaxed tracking-[0.22em]"
            style={{ fontFamily: monoFont, color: "rgba(255,255,255,0.62)" }}
          >
            START HERE
            <br />
            THIS ONE&apos;S ABOUT YOU
          </p>
          <svg className="absolute inset-0 h-full w-full overflow-visible">
            <line
              ref={coachLineRef}
              x1={0}
              y1={0}
              x2={0}
              y2={0}
              stroke="rgba(255,255,255,0.62)"
              strokeWidth={1}
              className="animate-coach-thread"
            />
          </svg>
        </div>
      )}

      {/* ===== HUD ===== */}
      {/* Bottom dock: one fixed slot shared by the hint text (at home) and the
          take-me-back button (when zoomed/panned away), so the button appears
          in the exact position the text occupied. */}
      <div
        className="absolute bottom-4 left-1/2 z-20 flex h-12 -translate-x-1/2 items-center justify-center"
        style={{ marginRight: "-22px" }}
      >
        {isHome ? (
          <p
            className="pointer-events-none max-w-64 text-center text-[10px] lowercase leading-relaxed tracking-widest text-balance"
            style={{ fontFamily: monoFont, color: "#fff" }}
          >
            pinch and drag to explore
          </p>
        ) : (
          /* Take-me-back: shown only when the camera has left the home
             composition. Tapping glides the camera back to scale 1,
             centered (~700ms). */
          <button
            type="button"
            onClick={goHome}
            aria-label="Take me back"
            /* rounded-full, matching "enter the spiral" and the name plate —
               every other command in the app is a pill, so the lone rounded-lg
               rectangle read as a different kind of control. Horizontal padding
               is >= the 24px pill radius so the label clears the curve instead
               of crowding it (the same reason ENTER carries ~21-29px). */
            className="flex h-12 items-center justify-center rounded-full px-6 animate-in fade-in duration-300"
            style={{
              fontFamily: monoFont,
              backgroundColor: "#0d0d0d",
              border: "1px solid #fff",
              color: "#fff",
            }}
          >
            {/* 13px to match the "you" name plate exactly — same size AND same
                Geist Pixel family, so the two read as one voice. */}
            <span
              className="lowercase tracking-widest"
              style={{ fontSize: 13, lineHeight: 1.15 }}
            >
              take me back
            </span>
          </button>
        )}
      </div>

      {/* Slide-up read panel — tapping a read/person opens it; yes/no persists
          to read_responses (fragments) / the spiral session, same as /self.
          The stage: the creature standing ON the panel's top edge, animated
          by the choreographer (endlessly varied mood-weighted move sequences)
          rather than a fixed idle loop, tinted the read's accent. */}
      <UniverseReadPanel
        data={panel?.data ?? null}
        answered={panel?.prior ?? null}
        onJudge={judge}
        onClose={closePanel}
        stage={
          panel ? (
            // Outer wrapper: the spirit-domain drift (up a few px + settle).
            // Inner wrapper: the choreographer's stage — moves animate its
            // transform via WAAPI, each starting/ending in neutral stance.
            <div
              style={{
                animation: activeMood.driftAnimation ?? "none",
              }}
            >
              <div
                ref={stageMoveRef}
                style={{
                  // relationships: constant slight lean toward the panel text
                  rotate: `${activeMood.leanDeg}deg`,
                  transition: "rotate 600ms ease",
                }}
              >
                <SelfCreature
            ref={stageCreatureRef}
            signals={creatureSignals}
            seed={userId ?? "guest-journey"}
                  color={reactColor ?? panel.data.accent ?? NEUTRAL_COLOR}
                  size={Math.round(creatureSize * 3.375)}
                  /* The read screen is where a face is EARNED: on "yes" the
                     creature wears the signature of the read it just accepted.
                     No ambient drift here — inside a read, the only face that
                     should surface is that read's own. */
                  library={signatureLibrary}
                  signature={wornSignature}
                  onSignatureEnd={clearWornSignature}
                  breatheDuration={activeMood.breatheDuration}
                  blinkMinMs={activeMood.blinkMinMs}
                  blinkMaxMs={activeMood.blinkMaxMs}
                  blinkHoldMs={activeMood.blinkHoldMs}
                  ember={activeMood.ember}
                  /**
                   * No `lcd` here on purpose.
                   *
                   * The read-phase field in UniverseReadPanel now paints the LED
                   * texture across the whole viewport, and this creature sits on
                   * top of it. Drawing its own grid too stacked a second
                   * identical 2px grid over the first — the two can't align, so
                   * the overlap darkened and moiréd exactly where the face is,
                   * and its box edge was the rectangle framing the avatar.
                   *
                   * One continuous field reads as a single screen, which is the
                   * point: nothing changes texture when a read opens.
                   */
                />
              </div>
            </div>
          ) : null
        }
      />

    </div>
  )
}

/**
 * The two nebula layers (bloom underlay + crisp glyphs), ~1890 spans total.
 *
 * Split out and memoized purely for responsiveness. The fog only depends on the
 * glyph field and the revealed frontier — never on the panel, the pending
 * judgement, or the creature's reaction. Rendered inline it was re-reconciled on
 * every one of those state changes, producing a ~294ms long task that delayed
 * the yes/no press feedback by ~300ms.
 *
 * `extFade`/`crawlDelay` are recreated here from scalar props rather than passed
 * as callbacks: a fresh function identity each render would defeat memo's
 * shallow compare and undo the whole point.
 */
const NebulaLayers = memo(function NebulaLayers({
  glyphs,
  revealRadius,
  prevReveal,
  monoFont,
  visibleTEnd,
}: {
  glyphs: Glyph[]
  revealRadius: number
  prevReveal: number
  monoFont: string
  visibleTEnd: number
}) {
  const extFade = (t: number) => {
    const fadeStart = visibleTEnd - 0.12
    if (t <= fadeStart) return 1
    if (t >= visibleTEnd) return 0
    return 1 - (t - fadeStart) / 0.12
  }
  const justRevealed = (r: number) => r > prevReveal && r <= revealRadius
  const spreadFor = (r: number) =>
    justRevealed(r)
      ? Math.min(0.6, Math.max(0, (r - prevReveal) / REVEAL_STEP) * 0.6)
      : 0

  return (
    <>
      {/* ── Nebula, glow underlay ───────────────���──────────────────────
          One layer holding a soft bloom blob per glyph. Lit (inside-
          frontier) blobs carry the cool moonlit glow; locked ones sit at
          opacity 0. PERF: these are radial-gradient discs — already soft,
          NO blur filter. The old blur(9px) over ~500 text glyphs forced the
          GPU to re-rasterize a huge filtered texture during every pan/zoom
          frame, which is exactly the walkthrough lag (profiled: ~39fps with
          the filter, ~60fps without). Gradients composite for free. When
          the frontier grows, new blobs fade in over ~1.2s (spread by
          radius), so the fog still visibly rolls outward. */}
      <div
        className="absolute left-0 top-0 select-none"
        style={{ width: 0, height: 0 }}
      >
        {glyphs.map((g) => {
          const lit = g.r <= revealRadius
          const ext = extFade(g.t)
          const spread = spreadFor(g.r)
          // Glow diameter ≈ the old blurred glyph's visual extent
          // (fontSize×1.7 + 9px blur spilling both ways).
          const glow = px2(g.size * 1.7 + 18)
          return (
            <span
              key={`bloom-${g.key}`}
              className="absolute rounded-full"
              style={{
                left: px2(g.x),
                top: px2(g.y),
                width: glow,
                height: glow,
                // Peak alpha is VERY low: blur used to smear a glyph's thin
                // ink strokes across this whole area, so the equivalent
                // gradient must be a whisper or the fog washes out the
                // crisp glyphs on top of it.
                background:
                  "radial-gradient(closest-side, rgba(189,214,238,0.11), rgba(189,214,238,0.035) 55%, transparent)",
                transform: "translate(-50%, -50%)",
                opacity: op6(lit ? Math.min(1, g.max * 2.4) * ext : 0),
                transition: "opacity 1.2s ease",
                transitionDelay: `${spread}s`,
              }}
            />
          )
        })}
      </div>

      {/* ── Nebula, crisp layer ────────────────────────────────────────
          The readable glyphs on top of the bloom.
            • inside the frontier → lit cool tone; warms from dim ember to
              its tone over ~1.2s (delayed by radius) as the frontier passes.
            • outside → barely-there embers: very dim, desaturated, no glow.
          PERF: the slow shimmer animates on ~6 phase-group WRAPPERS (each
          with its own duration/offset) instead of per glyph — hundreds of
          individually-animated nodes forced mobile compositors to manage a
          layer per glyph and made panning feel laggy. Group opacity
          multiplies each glyph's static opacity, so the cloud still
          twinkles out of phase, at ~1% of the compositing cost.
          Positions are deterministic (seeded RNG), so SSR + client agree. */}
      {Array.from({ length: NEBULA_PHASES }, (_, phase) => (
        <div
          key={`shimmer-${phase}`}
          className="animate-nebula-shimmer absolute left-0 top-0 select-none"
          style={{
            width: 0,
            height: 0,
            // The wrapper IS the shimmer: keyframes read --glyph-max as the
            // peak, so 1 → group opacity breathes 0.62 → 1.
            // @ts-expect-error custom property consumed by the shimmer keyframes
            "--glyph-max": 1,
            animationDuration: `${5.6 + phase * 1.15}s`,
            animationDelay: `${phase * -1.9}s`,
          }}
        >
          {glyphs
            .filter((_, i) => i % NEBULA_PHASES === phase)
            .map((g) => {
              const lit = g.r <= revealRadius
              const ext = extFade(g.t)
              const spread = spreadFor(g.r)
              return (
                <span
                  key={`glyph-${g.key}`}
                  className="absolute select-none"
                  style={{
                    // Round to 2 decimals so full-precision floats don't
                    // hydrate as a CSSOM-rounded mismatch.
                    left: px2(g.x),
                    top: px2(g.y),
                    fontFamily: monoFont,
                    fontSize: px2(g.size),
                    lineHeight: 1,
                    color: lit ? g.tone : "#4b515b",
                    transform: "translate(-50%, -50%)",
                    // Lit glyphs run at ~2x their scattered base brightness;
                    // beyond the drawn extent (ext → 0) the fog thins to
                    // sparse embers implying more.
                    opacity: op6(
                      lit
                        ? Math.min(1, g.max * 2) * ext
                        : Math.min(0.22, g.max * 0.6) * ext,
                    ),
                    transition: "color 1.2s ease, opacity 1.2s ease",
                    transitionDelay: `${spread}s`,
                  }}
                >
                  {g.char}
                </span>
              )
            })}
        </div>
      ))}
    </>
  )
})


