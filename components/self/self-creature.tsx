"use client"

import {
  Noto_Sans_Canadian_Aboriginal,
  Noto_Sans_Kannada,
  Noto_Sans_Mono,
  Noto_Sans_Oriya,
  Noto_Sans_Symbols_2,
  Noto_Sans_Telugu,
} from "next/font/google"
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react"
import {
  AURA,
  BLINK_EYES,
  EARS,
  EARS_LEVEL,
  EYES,
  MILESTONE_ORDER,
  MOUTH,
  PALETTE_LENGTH,
  SIDES,
  buildAura,
  dispositionOf,
  milestoneLevel,
  probePalettes,
  slotIndices,
  unlocksAtLevel,
  withFallback,
  type AvatarSignals,
  type MilestoneSlot,
  type PaletteFallbacks,
} from "@/lib/self/avatar-slots"

/**
 * SelfCreature — the composed ASCII "you".
 *
 * The being is FIVE SLOTS (sides, eyes, mouth, ears, aura) assembled as
 * centered text lines — deliberately NOT a fixed-width character grid, because
 * several palette glyphs (ಥ ರ ఠ 灬 ᒥ ᘳ) are wide and would shear a grid apart.
 * All structure and glyph choice lives in lib/self/avatar-slots.ts:
 *
 *   MILESTONES decide which slots exist (first read answered → eyes; first
 *   constellation cleared → mouth; half cleared → sides; all cleared → ears).
 *   Each unlock dissolves the being and reassembles it; the ears moment — the
 *   same beat vedic_deep unlocks — dissolves for noticeably longer.
 *
 *   DISPOSITION (agrees vs disagrees) decides WHICH glyph each unlocked slot
 *   shows. When a slot's index changes, only that slot morphs (fade out / in).
 *
 *   AURA grows one permanent glyph per written answer, placed deterministically
 *   from the user's seed, so the same user always regrows the same halo.
 *
 * Reactions stay imperative so the reads UI can fire them without prop churn:
 *   const ref = useRef<SelfCreatureHandle>(null)
 *   <SelfCreature ref={ref} signals={signals} seed={userId} />
 *   ref.current?.react("agree")
 */

export type CreatureReaction = "agree" | "disagree" | "submit"

export type SelfCreatureHandle = {
  react: (type: CreatureReaction) => void
  /** one imperative blink (choreographed moves: slow-blink, blink-flurry) */
  blink: (holdMs?: number) => void
  /** immediately flicker `swaps` slots to a neighbouring glyph */
  mutate: (swaps?: number) => void
}

type Props = {
  /** everything the being is derived from (responses, clears, answers) */
  signals?: AvatarSignals
  /** per-user seed (e.g. the auth user id) so the aura regrows identically */
  seed?: string
  size?: number
  /** glyph + glow tint; defaults to the neutral glowing self */
  color?: string
  /** creatureBreathe cycle in seconds — read moods slow/quicken it (default 4.5) */
  breatheDuration?: number
  /** blink loop tuning — read moods make blinks sleepy, rare, or quick */
  blinkMinMs?: number
  blinkMaxMs?: number
  blinkHoldMs?: number
  /** crisis reads: a faint ember-like flicker layered into the glow */
  ember?: boolean
  /** LCD-screen treatment: a subtle RGB sub-pixel grid + scanlines over the
      glyphs, an inner vignette on the container, and a 0.4px soften on the
      art — makes upscaled pixelation read as intentional hardware. */
  lcd?: boolean
  /** Diameter of the lit screen, for avatars that sit in a circular bezel. */
  lcdSize?: number
}

const REACTION_MS = 600
const EVOLVE_OUT_MS = 420
/** The ears milestone is the biggest — let its dissolve linger. */
const EARS_EVOLVE_OUT_MS = 1150
const EVOLVE_IN_MS = 480
const MORPH_MS = 600
const ACCRETE_MS = 800
/** How long a living-material flicker holds before reverting. */
const FLICKER_MS = 300

/**
 * The avatar's OWN font — deliberately not the app's pixel font.
 *
 * The palettes reach across scripts (Kannada ಥ ರ, Telugu ఠ, Oriya ୧, Canadian
 * syllabics ᒥ ᘳ, CJK 灬, Hangul ᆺ), so the being needs the widest monospace
 * coverage we can get. Noto Sans Mono is loaded here, scoped to this
 * component only — every label, the disc, and the rest of /self and /circle
 * keep the app's existing fonts untouched.
 *
 * Noto Sans Mono only publishes Latin/Greek/Cyrillic subsets on Google Fonts,
 * so the Indic / syllabics / CJK glyphs resolve through the platform's own
 * Noto or DejaVu install via the fallbacks below.
 */
const notoSansMono = Noto_Sans_Mono({
  subsets: ["latin", "latin-ext", "greek", "cyrillic", "cyrillic-ext"],
  weight: ["400", "500", "700"],
  display: "swap",
})
// Noto Sans Mono ships only Latin/Greek/Cyrillic, so each remaining palette
// script gets its own Noto face. Without these the Indic, syllabics and
// symbol glyphs fall through to tofu boxes on any machine lacking a system
// Noto install (including most Linux servers and many phones).
const notoKannada = Noto_Sans_Kannada({
  subsets: ["kannada"],
  weight: ["400"],
  display: "swap",
})
const notoTelugu = Noto_Sans_Telugu({
  subsets: ["telugu"],
  weight: ["400"],
  display: "swap",
})
const notoOriya = Noto_Sans_Oriya({
  subsets: ["oriya"],
  weight: ["400"],
  display: "swap",
})
const notoSyllabics = Noto_Sans_Canadian_Aboriginal({
  subsets: ["canadian-aboriginal"],
  weight: ["400"],
  display: "swap",
})
const notoSymbols2 = Noto_Sans_Symbols_2({
  subsets: ["symbols"],
  weight: ["400"],
  display: "swap",
})

/**
 * Latin/geometric shapes resolve from Noto Sans Mono first; anything it lacks
 * cascades into the script faces above, then to whatever the platform has.
 */
const MONO = [
  notoSansMono.style.fontFamily,
  notoSyllabics.style.fontFamily,
  notoKannada.style.fontFamily,
  notoTelugu.style.fontFamily,
  notoOriya.style.fontFamily,
  notoSymbols2.style.fontFamily,
  '"Noto Sans Mono CJK SC"',
  '"Noto Sans CJK SC"',
  '"DejaVu Sans Mono"',
  "ui-monospace",
  "monospace",
].join(", ")

/** A slot glyph that fades out and back in when its palette index changes. */
function SlotGlyph({
  glyph,
  morphKey,
  style,
  animate,
}: {
  /** the glyph to draw right now (may be a transient flicker / blink) */
  glyph: string
  /** changes ONLY when disposition moved this slot — triggers the morph */
  morphKey: number
  style?: React.CSSProperties
  animate: boolean
}) {
  const [shown, setShown] = useState(glyph)
  const [fading, setFading] = useState(false)
  const keyRef = useRef(morphKey)

  useEffect(() => {
    if (morphKey === keyRef.current || !animate) {
      keyRef.current = morphKey
      setShown(glyph)
      setFading(false)
      return
    }
    keyRef.current = morphKey
    setFading(true)
    const t = setTimeout(() => {
      setShown(glyph)
      setFading(false)
    }, MORPH_MS / 2)
    return () => clearTimeout(t)
  }, [glyph, morphKey, animate])

  return (
    <span
      style={{
        ...style,
        whiteSpace: "pre",
        opacity: fading ? 0 : 1,
        transition: animate ? `opacity ${MORPH_MS / 2}ms ease` : "none",
      }}
    >
      {shown}
    </span>
  )
}

const SelfCreature = forwardRef<SelfCreatureHandle, Props>(function SelfCreature(
  {
    signals,
    seed,
    size = 230,
    color = "#e8e4da",
    breatheDuration = 4.5,
    blinkMinMs = 4000,
    blinkMaxMs = 9000,
    blinkHoldMs = 150,
    ember = false,
    lcd = false,
    lcdSize,
  },
  ref,
) {
  // ---- what the being IS ----------------------------------------------------
  const level = signals ? milestoneLevel(signals) : 0
  const disposition = signals
    ? dispositionOf(signals.agrees, signals.disagrees)
    : 0
  const auraCount = signals?.answers ?? 0

  const [blinking, setBlinking] = useState(false)
  const [reaction, setReaction] = useState<CreatureReaction | null>(null)
  const [evolvePhase, setEvolvePhase] = useState<"idle" | "out" | "in">("idle")
  /** The level currently DRAWN — lags `level` through an evolution dissolve. */
  const [displayLevel, setDisplayLevel] = useState(level)
  /** transient ±1 palette step on ONE slot: living-material mutation */
  const [flicker, setFlicker] = useState<Partial<Record<MilestoneSlot, number>>>(
    {},
  )

  const reactTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const evolveTimers = useRef<ReturnType<typeof setTimeout>[]>([])
  const flickerTimers = useRef<ReturnType<typeof setTimeout>[]>([])

  // Read prefers-reduced-motion only AFTER mount (reading `window` during
  // render is a server/client branch that caused a hydration mismatch).
  const [reduceMotion, setReduceMotion] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)")
    if (!mq) return
    setReduceMotion(mq.matches)
    const onChange = () => setReduceMotion(mq.matches)
    mq.addEventListener?.("change", onChange)
    return () => mq.removeEventListener?.("change", onChange)
  }, [])

  // ---- glyph safety: probe the palettes once, after mount ------------------
  // Any glyph the platform can't draw falls back to its nearest palette
  // neighbour, so an unsupported exotic glyph degrades by one step of
  // softness instead of showing a tofu box.
  const [fallbacks, setFallbacks] = useState<PaletteFallbacks | null>(null)
  useEffect(() => {
    let cancelled = false
    const run = () => {
      if (cancelled) return
      const probed = probePalettes(MONO)
      setFallbacks(probed)
      if (probed.unsupported.length > 0) {
        console.log(
          "[v0] avatar glyphs unsupported on this platform:",
          probed.unsupported.join(" "),
        )
      }
    }
    // Wait for webfonts so we probe the exact stack we render with.
    const fonts = (document as Document & { fonts?: FontFaceSet }).fonts
    if (fonts?.ready) void fonts.ready.then(run)
    else run()
    return () => {
      cancelled = true
    }
  }, [])

  // ---- imperative reactions ------------------------------------------------
  const flickerOnce = (slots: MilestoneSlot[], count: number) => {
    if (!slots.length) return
    for (let i = 0; i < count; i++) {
      const slot = slots[Math.floor(Math.random() * slots.length)]
      const len = PALETTE_LENGTH[slot]
      if (len <= 1) continue
      const delta = Math.random() < 0.5 ? -1 : 1
      setFlicker((prev) => ({ ...prev, [slot]: delta }))
      const t = setTimeout(() => {
        setFlicker((prev) => {
          const next = { ...prev }
          delete next[slot]
          return next
        })
      }, FLICKER_MS)
      flickerTimers.current.push(t)
    }
  }
  const flickerRef = useRef(flickerOnce)
  flickerRef.current = flickerOnce

  const liveSlots = useMemo<MilestoneSlot[]>(() => {
    const unlocks = unlocksAtLevel(displayLevel)
    // Only slots that are DRAWN can mutate; locked eyes/sides are held at
    // their birth glyph, so they stay still.
    return MILESTONE_ORDER.filter((slot) => unlocks[slot])
  }, [displayLevel])
  const liveSlotsRef = useRef(liveSlots)
  liveSlotsRef.current = liveSlots

  useImperativeHandle(
    ref,
    () => ({
      react(type: CreatureReaction) {
        if (reduceMotion) return
        if (reactTimer.current) clearTimeout(reactTimer.current)
        setReaction(type)
        reactTimer.current = setTimeout(() => setReaction(null), REACTION_MS)
      },
      blink(holdMs = 150) {
        if (reduceMotion) return
        setBlinking(true)
        setTimeout(() => setBlinking(false), holdMs)
      },
      mutate(swaps = 2) {
        if (reduceMotion) return
        flickerRef.current(liveSlotsRef.current, swaps)
      },
    }),
    [reduceMotion],
  )

  useEffect(
    () => () => {
      flickerTimers.current.forEach(clearTimeout)
      flickerTimers.current = []
    },
    [],
  )

  // ---- blink loop ----------------------------------------------------------
  useEffect(() => {
    if (reduceMotion) return
    let alive = true
    let blinkOff: ReturnType<typeof setTimeout>
    const schedule = () => {
      const wait = blinkMinMs + Math.random() * Math.max(0, blinkMaxMs - blinkMinMs)
      return setTimeout(() => {
        if (!alive) return
        setBlinking(true)
        blinkOff = setTimeout(() => {
          setBlinking(false)
          next = schedule()
        }, blinkHoldMs)
      }, wait)
    }
    let next = schedule()
    return () => {
      alive = false
      clearTimeout(next)
      clearTimeout(blinkOff)
    }
  }, [reduceMotion, blinkMinMs, blinkMaxMs, blinkHoldMs])

  // ---- living material: one slot steps to a NEIGHBOUR glyph, every 2–5s ----
  useEffect(() => {
    if (reduceMotion) return
    let alive = true
    let timer: ReturnType<typeof setTimeout>
    const step = () => {
      timer = setTimeout(
        () => {
          if (!alive) return
          if (typeof document === "undefined" || !document.hidden) {
            flickerRef.current(liveSlotsRef.current, 1)
          }
          step()
        },
        2000 + Math.random() * 3000,
      )
    }
    step()
    return () => {
      alive = false
      clearTimeout(timer)
    }
  }, [reduceMotion])

  // ---- evolution: dissolve + reassemble on every milestone unlock ----------
  const earsMoment = level >= EARS_LEVEL && displayLevel < EARS_LEVEL
  useEffect(() => {
    if (level === displayLevel) return
    if (reduceMotion) {
      setDisplayLevel(level)
      return
    }
    evolveTimers.current.forEach(clearTimeout)
    evolveTimers.current = []
    const outMs = level >= EARS_LEVEL ? EARS_EVOLVE_OUT_MS : EVOLVE_OUT_MS

    setEvolvePhase("out")
    evolveTimers.current.push(
      setTimeout(() => {
        setDisplayLevel(level)
        setEvolvePhase("in")
      }, outMs),
    )
    evolveTimers.current.push(
      setTimeout(() => setEvolvePhase("idle"), outMs + EVOLVE_IN_MS),
    )
    return () => {
      evolveTimers.current.forEach(clearTimeout)
      evolveTimers.current = []
    }
  }, [level, displayLevel, reduceMotion])

  // ---- aura: which glyphs are freshly grown (to flicker in) ---------------
  const prevAura = useRef(auraCount)
  const [freshFrom, setFreshFrom] = useState(auraCount)
  useEffect(() => {
    if (auraCount > prevAura.current) {
      setFreshFrom(prevAura.current)
      const t = setTimeout(() => setFreshFrom(auraCount), ACCRETE_MS + 100)
      prevAura.current = auraCount
      return () => clearTimeout(t)
    }
    if (auraCount !== prevAura.current) {
      prevAura.current = auraCount
      setFreshFrom(auraCount)
    }
  }, [auraCount])

  // ---- the composed glyphs -------------------------------------------------
  const unlocks = useMemo(() => unlocksAtLevel(displayLevel), [displayLevel])
  const base = useMemo(
    () => slotIndices(disposition, unlocks),
    [disposition, unlocks],
  )

  /** index actually drawn for a slot: disposition ± an active flicker step. */
  const drawnIndex = (slot: MilestoneSlot): number => {
    const len = PALETTE_LENGTH[slot]
    const delta = flicker[slot] ?? 0
    return Math.max(0, Math.min(len - 1, base[slot] + delta))
  }

  const eyesIndex = withFallback(fallbacks?.eyes ?? null, drawnIndex("eyes"))
  const mouthIndex = withFallback(fallbacks?.mouth ?? null, drawnIndex("mouth"))
  const sidesIndex = withFallback(fallbacks?.sides ?? null, drawnIndex("sides"))
  const earsIndex = withFallback(fallbacks?.ears ?? null, drawnIndex("ears"))

  // The blink overrides eye disposition AND eye mutation entirely.
  const eyes = blinking ? BLINK_EYES : EYES[eyesIndex]
  const mouth = MOUTH[mouthIndex]
  const [sideL, sideR] = SIDES[sidesIndex]
  const [earL, earR] = EARS[earsIndex]

  const aura = useMemo(
    () => (seed ? buildAura(seed, auraCount) : []),
    [seed, auraCount],
  )
  const auraFallback = fallbacks?.aura ?? null

  // ---- metrics -------------------------------------------------------------
  // Text-flow layout, so wide glyphs simply take the room they need.
  const fontPx = Math.round(size * 0.085)
  const lineH = fontPx * 1.15
  const gap = fontPx * 0.22

  const evolving = evolvePhase !== "idle"
  const artOpacity = evolvePhase === "out" ? 0 : 1
  // lcd: a constant 0.4px soften makes upscaled glyph pixels sit naturally
  // under the LED grid overlay (glow drop-shadow is unaffected).
  const artBlur = evolvePhase === "out" ? (earsMoment ? 9 : 6) : lcd ? 0.4 : 0
  const evolveScale = evolvePhase === "out" ? (earsMoment ? 0.82 : 0.9) : 1
  const outMs = earsMoment ? EARS_EVOLVE_OUT_MS : EVOLVE_OUT_MS

  let reactionAnim = "none"
  if (reaction === "agree") reactionAnim = `creatureBounce ${REACTION_MS}ms ease`
  else if (reaction === "disagree")
    reactionAnim = `creatureTilt ${REACTION_MS}ms ease`
  else if (reaction === "submit")
    reactionAnim = `creatureAbsorb ${REACTION_MS}ms ease`
  const breatheAnim = reduceMotion
    ? "none"
    : `creatureBreathe ${breatheDuration}s ease-in-out infinite`
  const emberAnim =
    ember && !reduceMotion ? ", creatureEmber 3.4s steps(1) infinite" : ""

  const glyphStyle: React.CSSProperties = {
    fontFamily: MONO,
    fontSize: `${fontPx}px`,
    lineHeight: 1,
    userSelect: "none",
  }

  // LED/LCD geometry — the sub-pixel pitch stays FIXED at 2px so a small
  // avatar reads as the same screen as the big one; only shape/falloff change.
  // (GRID_OVERSCAN / GRID_FADE_MASK live at module scope, below the component.)
  const lcdMetrics = useMemo(() => {
    const boardW = size * 0.62
    const boardH = size * 0.5
    if (lcdSize) {
      // 0 at ~150px screens (spiral center) → 1 at ~480px
      const t = Math.max(0, Math.min(1, (lcdSize - 150) / 330))
      return {
        w: lcdSize,
        h: lcdSize,
        radius: "50%",
        blur: 18 + t * 42,
        spread: 4 + t * 10,
        gridAlpha: 0.16,
      }
    }
    return {
      w: boardW,
      h: boardH,
      radius: 6,
      blur: 60,
      spread: 14,
      gridAlpha: 0.16,
    }
  }, [lcdSize, size])

  return (
    <div
      className="relative flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      <style>{CREATURE_KEYFRAMES}</style>

      {/* Dust motes drifting inside the circle */}
      {!reduceMotion && <Dust color={color} size={size} />}

      {/* The being: composed text lines + its scattered aura */}
      <div
        aria-hidden="true"
        style={{
          position: "relative",
          width: size,
          height: size,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          opacity: artOpacity,
          filter: `drop-shadow(0 0 10px ${color}) blur(${artBlur}px)`,
          transform: `scale(${evolveScale})`,
          transformOrigin: "center",
          transition: evolving
            ? `opacity ${outMs}ms ease, filter ${outMs}ms ease, transform ${outMs}ms ease, color .5s ease`
            : "opacity .3s ease, filter .5s ease, transform .3s ease, color .5s ease",
          animation: (reaction ? reactionAnim : breatheAnim) + emberAnim,
          pointerEvents: "none",
          color,
        }}
      >
        {/* aura — one permanent glyph per written answer, scattered outside
            the body so it can never sit on the eyes or the mouth */}
        {aura.map((a) => {
          const glyph = AURA[withFallback(auraFallback, AURA.indexOf(a.glyph))]
          const fresh = !reduceMotion && a.index >= freshFrom
          return (
            <span
              key={`aura-${a.index}`}
              style={{
                ...glyphStyle,
                position: "absolute",
                left: "50%",
                top: "50%",
                fontSize: `${Math.round(fontPx * 0.72)}px`,
                transform: `translate(-50%, -50%) translate(${a.x * size}px, ${a.y * size}px)`,
                opacity: fresh ? undefined : 0.55,
                filter: `drop-shadow(0 0 3px ${color})`,
                animation: fresh
                  ? `creatureAccrete ${ACCRETE_MS}ms ease forwards`
                  : "none",
              }}
            >
              {glyph ?? a.glyph}
            </span>
          )
        })}

        {/* the body itself: ears line, then sides+eyes, then mouth */}
        <div
          style={{
            position: "relative",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          {unlocks.ears && (
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                gap: fontPx * 1.1,
                height: lineH,
                alignItems: "center",
              }}
            >
              <SlotGlyph
                glyph={earL}
                morphKey={earsIndex}
                style={glyphStyle}
                animate={!reduceMotion}
              />
              <SlotGlyph
                glyph={earR}
                morphKey={earsIndex}
                style={glyphStyle}
                animate={!reduceMotion}
              />
            </div>
          )}

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap,
              height: lineH,
            }}
          >
            <SlotGlyph
              glyph={sideL}
              morphKey={sidesIndex}
              style={glyphStyle}
              animate={!reduceMotion}
            />
            <SlotGlyph
              glyph={eyes}
              morphKey={eyesIndex}
              style={glyphStyle}
              animate={!reduceMotion}
            />
            <SlotGlyph
              glyph={sideR}
              morphKey={sidesIndex}
              style={glyphStyle}
              animate={!reduceMotion}
            />
          </div>

          {unlocks.mouth && (
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                height: lineH,
                alignItems: "center",
              }}
            >
              <SlotGlyph
                glyph={mouth}
                morphKey={mouthIndex}
                style={glyphStyle}
                animate={!reduceMotion}
              />
            </div>
          )}
        </div>
      </div>

      {/* lcd: RGB sub-pixel stripes + scanline grid floated ABOVE the glyphs.
          Never captures taps.

          The grid and the vignette are TWO elements on purpose. They used to be
          one, but the grid's own box edge was visible as a hard rectangle around
          the avatar (most obvious on desktop, where the default no-lcdSize
          branch draws a 6px-radius board rather than a circle): the RGB stripes
          are slightly lighter than the sky, so the board read as a faint panel
          floating on black.

          Fixing that means extending the grid well past the avatar and fading it
          out — but the vignette is an INSET box-shadow, so if it rode the same
          enlarged box it would start its falloff at the new outer edge and go
          soft and off-center over the glyphs. The user's constraint was to leave
          the vignette alone, so it keeps the exact original geometry below and
          only the grid grows. */}
      {lcd && (
        <>
          {/* The grid, oversized and dissolved into the sky at its rim.

              GRID_OVERSCAN 1.36 puts the box edge ~18% of the avatar's width
              outside the old bounds on each side, so the edge sits far away from
              any glyph. The radial mask then takes the grid to fully transparent
              by 95% of that enlarged box — i.e. it is already nothing well
              before the edge, so there is no rectangle left to see at any
              viewport width.

              Because the mask percentages resolve against the ENLARGED box,
              `black 55%` keeps the grid at full strength across the central
              ~75% of the original board — which comfortably covers the glyphs —
              and only the empty margin beyond them is where it falls off.

              The 2px sub-pixel pitch is untouched: the gradients below are
              byte-identical to the originals, and pitch is defined in absolute
              px, so scaling the CONTAINER cannot stretch it. */}
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              left: "50%",
              top: "50%",
              width: `calc(${lcdMetrics.w}px * ${GRID_OVERSCAN})`,
              height: `calc(${lcdMetrics.h}px * ${GRID_OVERSCAN})`,
              transform: "translate(-50%, -50%)",
              pointerEvents: "none",
              maskImage: GRID_FADE_MASK,
              WebkitMaskImage: GRID_FADE_MASK,
              backgroundImage: `repeating-linear-gradient(to right,
                  rgba(255,60,60,.05) 0 .67px,
                  rgba(60,255,120,.05) .67px 1.33px,
                  rgba(80,120,255,.05) 1.33px 2px),
                repeating-linear-gradient(to bottom,
                  transparent 0 1px, rgba(0,0,0,${lcdMetrics.gridAlpha}) 1px 2px),
                repeating-linear-gradient(to right,
                  transparent 0 1px, rgba(0,0,0,${lcdMetrics.gridAlpha}) 1px 2px)`,
            }}
          />
          {/* The vignette, at the original size/radius/blur/spread/alpha.
              Carries no background of its own.

              It needs its own fade. An inset shadow is drawn only INSIDE its
              box and is at full strength right at the edge (spread pushes it
              inward, blur softens toward the centre), so the box boundary is a
              hard step: grid darkened by 0.6 on the inside, grid untouched on
              the outside. While the grid stopped at this same boundary that
              step was the rectangle being complained about; once the grid
              extended past it, the step became a crisp outline instead.

              Masking it converts that step into a gradual falloff. The shadow's
              own numbers are untouched — this only dissolves where it ENDS, so
              it no longer terminates against brighter grid. */}
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              left: "50%",
              top: "50%",
              width: lcdMetrics.w,
              height: lcdMetrics.h,
              transform: "translate(-50%, -50%)",
              pointerEvents: "none",
              borderRadius: lcdMetrics.radius,
              boxShadow: `inset 0 0 ${lcdMetrics.blur}px ${lcdMetrics.spread}px rgba(0,0,0,0.6)`,
              maskImage: VIGNETTE_FADE_MASK,
              WebkitMaskImage: VIGNETTE_FADE_MASK,
            }}
          />
        </>
      )}
    </div>
  )
})

/**
 * How much larger the LED grid's container is than the screen it represents,
 * so its box edge falls well outside the glyphs. 1.36 = ~36% larger overall,
 * i.e. ~18% of the avatar's width of extra margin on each side.
 *
 * This scales the CONTAINER only. The grid's 2px sub-pixel pitch is expressed
 * in absolute px inside `repeating-linear-gradient`, so it is unaffected.
 */
const GRID_OVERSCAN = 1.36

/**
 * Fades the grid to nothing before it reaches its own edge, so there is no hard
 * rectangle (or circle) anywhere on the sky.
 *
 * Full strength out to 55% and gone by 95% of the oversized box. Combined with
 * GRID_OVERSCAN that means the glyph area sits entirely in the solid part while
 * the falloff happens across the empty margin around it.
 */
/**
 * `farthest-side` is load-bearing, not decoration.
 *
 * A bare `radial-gradient(ellipse at center, ...)` defaults to farthest-CORNER,
 * so its 100% is the distance to the corner and the ellipse passes through the
 * corners. The straight edges then sit at only ~71% of the gradient's extent, so
 * a `transparent 95%` stop was still ~60% OPAQUE along the flat sides — the grid
 * never actually reached zero at the edge it was supposed to dissolve before,
 * and the rectangle stayed visible.
 *
 * farthest-side makes 100% mean the edge midpoints, which is what these
 * percentages are written to describe.
 */
const GRID_FADE_MASK =
  "radial-gradient(ellipse farthest-side at center, #000 55%, transparent 95%)"

/**
 * Dissolves the vignette's outer boundary so it doesn't end in a hard step
 * against the (now larger) grid. Reaches transparent at 100% — exactly the box
 * edge — so the darkening ramps out instead of being cut off.
 *
 * Starts fading later than the grid's mask (72% vs 55%) so the shadow keeps its
 * strength through the region where it actually reads, and only the last sliver
 * before the edge is softened.
 */
const VIGNETTE_FADE_MASK =
  "radial-gradient(ellipse farthest-side at center, #000 60%, transparent 100%)"

/** A few faint glyph motes drifting within the circle. */
function Dust({ color, size }: { color: string; size: number }) {
  // The motes use Math.random(), which would differ between the server and
  // client and cause a hydration mismatch. They're purely decorative, so we
  // generate them only AFTER mount.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const motes = useMemo(
    () =>
      mounted
        ? Array.from({ length: 9 }).map((_, i) => ({
            id: i,
            left: 12 + Math.random() * 76, // %
            top: 12 + Math.random() * 76, // %
            delay: Math.random() * 6,
            dur: 5 + Math.random() * 5,
            char: Math.random() > 0.5 ? "·" : "*",
            op: 0.12 + Math.random() * 0.22,
          }))
        : [],
    [mounted],
  )
  return (
    <div
      className="pointer-events-none absolute inset-0"
      style={{ width: size, height: size }}
    >
      {motes.map((m) => (
        <span
          key={m.id}
          style={{
            position: "absolute",
            left: `${m.left}%`,
            top: `${m.top}%`,
            fontFamily: MONO,
            fontSize: 9,
            color,
            opacity: m.op,
            animation: `creatureDrift ${m.dur}s ease-in-out ${m.delay}s infinite`,
          }}
        >
          {m.char}
        </span>
      ))}
    </div>
  )
}

const CREATURE_KEYFRAMES = `
@keyframes creatureBreathe {
  0%, 100% { transform: translateY(0) scale(1); }
  50% { transform: translateY(-3px) scale(1.02); }
}
@keyframes creatureBounce {
  0% { transform: translateY(0); }
  30% { transform: translateY(-10px) scale(1.05); }
  55% { transform: translateY(0) scale(0.98); }
  75% { transform: translateY(-4px); }
  100% { transform: translateY(0) scale(1); }
}
@keyframes creatureTilt {
  0% { transform: rotate(0deg); }
  35% { transform: rotate(-8deg); }
  70% { transform: rotate(5deg); }
  100% { transform: rotate(0deg); }
}
@keyframes creatureAbsorb {
  0% { transform: scale(1); filter: brightness(1); }
  40% { transform: scale(1.12); filter: brightness(1.8); }
  100% { transform: scale(1); filter: brightness(1); }
}
@keyframes creatureEmber {
  0%, 100% { opacity: 1; }
  7% { opacity: 0.86; }
  11% { opacity: 0.97; }
  23% { opacity: 0.9; }
  27% { opacity: 1; }
  46% { opacity: 0.93; }
  52% { opacity: 1; }
  71% { opacity: 0.87; }
  76% { opacity: 0.98; }
  88% { opacity: 0.92; }
}
@keyframes creatureDrift {
  0%, 100% { transform: translate(0, 0); opacity: 0.1; }
  50% { transform: translate(4px, -6px); opacity: 0.35; }
}
@keyframes creatureShimmer {
  0% { filter: brightness(1); }
  30% { filter: brightness(2.2) drop-shadow(0 0 6px currentColor); }
  60% { filter: brightness(1.4); }
  100% { filter: brightness(1); }
}
@keyframes creatureAccrete {
  0% { opacity: 0; }
  20% { opacity: 0.65; }
  35% { opacity: 0.12; }
  55% { opacity: 0.9; }
  70% { opacity: 0.3; }
  100% { opacity: 0.55; }
}
@media (prefers-reduced-motion: reduce) {
  @keyframes creatureBreathe { 0%,100% { transform: none; } }
}
`

export default SelfCreature
