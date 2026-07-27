"use client"

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react"
import {
  STAGE_ART,
  STAGE_1,
  STAGE_5,
  STAGE_GRIDS,
  MAX_STAGE,
  scoreToStage,
  buildAccretionGrid,
  buildGrowth,
  buildJourneyGrowth,
  stageForMajors,
  growthEventCount,
  detailSiblings,
  ZONE_OPACITY,
  type PlacedDetail,
  type GrowthEvent,
  type StageCell,
  type StageGrid,
} from "@/lib/self/avatar-stages"
import { rollIndex } from "@/lib/self/mutation"

/**
 * SelfCreature — the evolving ASCII "you".
 *
 * Two growth systems layer here:
 *   1. STAGES (1–5) — discrete skeletons from lib/self/avatar-stages.ts. When
 *      the stage increases the old form dissolves and the new one reassembles.
 *   2. ACCRETION — infinite growth. Every engagement point adds one persistent
 *      detail (aura spark / body texture / edge whisker), placed deterministically
 *      from seed = hash(userId + point index). New details flicker in; the rest
 *      of the being stays perfectly stable.
 *
 * The whole being (skeleton + details) is drawn as ONE monospace grid of
 * absolutely-positioned cells, so details always line up with the skeleton and
 * ride along with breathing / reactions / evolution.
 *
 * Reactions are imperative so the reads UI can fire them without prop churn:
 *   const ref = useRef<SelfCreatureHandle>(null)
 *   <SelfCreature ref={ref} score={score} seed={userId} />
 *   ref.current?.react("agree")
 */

export type CreatureReaction = "agree" | "disagree" | "submit"

export type SelfCreatureHandle = {
  react: (type: CreatureReaction) => void
  /** one imperative blink (choreographed moves: slow-blink, blink-flurry) */
  blink: (holdMs?: number) => void
  /** immediately swap `swaps` random character variants (mutation-burst) */
  mutate: (swaps?: number) => void
}

type Props = {
  /** journey growth events (majors + every-other-minor). When provided this
      drives BOTH the stage (stageForMajors) and all accretion detail —
      overriding `score`/`stage`. */
  growthEvents?: GrowthEvent[]
  /** engagement score — drives BOTH the stage and the accretion detail count */
  score?: number
  /** explicit stage override; ignored when `score` is provided */
  stage?: number
  /** per-user seed (e.g. the auth user id) so the being regrows identically */
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
}

// Lay an arbitrary stage skeleton, centered, into the fixed grid envelope so it
// shares coordinates with the accretion details (which are built from stage 5).
function layoutSkeleton(art: string, cols: number, rows: number): string[] {
  const lines = art.split("\n")
  const w = Math.max(...lines.map((l) => l.length))
  const top = Math.floor((rows - lines.length) / 2)
  const left = Math.floor((cols - w) / 2)
  const out = Array.from({ length: rows }, () => Array<string>(cols).fill(" "))
  lines.forEach((line, i) => {
    const lineLeft = left + Math.floor((w - line.length) / 2)
    for (let j = 0; j < line.length; j++) {
      const r = top + i
      const c = lineLeft + j
      if (r >= 0 && r < rows && c >= 0 && c < cols) out[r][c] = line[j]
    }
  })
  return out.map((a) => a.join(""))
}

/**
 * Lay a stage's CELL grid into the same fixed envelope, using EXACTLY the same
 * centering math as `layoutSkeleton` (a cell's `variants[0]` equals the glyph
 * that string layout places), so every cell maps to the identical "r,c"
 * coordinate the skeleton glyph occupies. Returns a lookup of coord → cell.
 */
function layoutStageCells(
  grid: StageGrid,
  cols: number,
  rows: number,
): Map<string, StageCell> {
  const lines = grid.map((row) =>
    row.map((cell) => (cell ? cell.variants[0] : " ")).join(""),
  )
  const w = Math.max(...lines.map((l) => l.length))
  const top = Math.floor((rows - lines.length) / 2)
  const left = Math.floor((cols - w) / 2)
  const map = new Map<string, StageCell>()
  grid.forEach((row, i) => {
    const lineLeft = left + Math.floor((w - lines[i].length) / 2)
    row.forEach((cell, j) => {
      if (!cell) return
      const r = top + i
      const c = lineLeft + j
      if (r >= 0 && r < rows && c >= 0 && c < cols) map.set(`${r},${c}`, cell)
    })
  })
  return map
}

const REACTION_MS = 600
const EVOLVE_OUT_MS = 420
const EVOLVE_IN_MS = 480
const ACCRETE_MS = 800

const MONO =
  "'Geist Pixel', ui-monospace, monospace"

const SelfCreature = forwardRef<SelfCreatureHandle, Props>(function SelfCreature(
  {
    growthEvents,
    score,
    stage,
    seed,
    size = 230,
    color = "#e8e4da",
    breatheDuration = 4.5,
    blinkMinMs = 4000,
    blinkMaxMs = 9000,
    blinkHoldMs = 150,
    ember = false,
    lcd = false,
  },
  ref,
) {
  // Effective stage: journey events win (big change per star answered), then
  // score, then the explicit stage prop.
  const majorsAnswered =
    growthEvents?.filter((e) => e.kind === "major").length ?? 0
  const effectiveStage = growthEvents
    ? stageForMajors(majorsAnswered)
    : score != null
      ? scoreToStage(score)
      : Math.round(stage ?? 1)
  const clampedStage = Math.max(1, Math.min(MAX_STAGE, effectiveStage))

  // Visible growth EVENTS: from the journey when provided, else the
  // diminishing score schedule. Each event adds or matures a detail.
  const detailCount = growthEvents
    ? growthEvents.length
    : score != null && seed
      ? growthEventCount(score)
      : 0

  // The form currently drawn. Lags the prop during an evolution transition.
  const [displayStage, setDisplayStage] = useState(clampedStage)
  const [blinking, setBlinking] = useState(false)
  // Character-level mutation: current variant index per "unit". A unit is a
  // group name (grouped cells mutate in lockstep) or a single cell/detail key.
  // Missing keys default to 0 → the canonical base glyph, so first paint (and
  // SSR) always matches the plain art and there is no hydration mismatch.
  const [variantState, setVariantState] = useState<Record<string, number>>({})
  const [reaction, setReaction] = useState<CreatureReaction | null>(null)
  const [evolvePhase, setEvolvePhase] = useState<"idle" | "out" | "in">("idle")

  const reactTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const evolveTimers = useRef<ReturnType<typeof setTimeout>[]>([])

  // Read prefers-reduced-motion only AFTER mount. Reading `window` during render
  // is a server/client branch that produced a hydration mismatch and left the
  // dev preview stuck reloading. Start `false` (matching the server), then sync.
  const [reduceMotion, setReduceMotion] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)")
    if (!mq) return
    setReduceMotion(mq.matches)
    const onChange = () => setReduceMotion(mq.matches)
    mq.addEventListener?.("change", onChange)
    return () => mq.removeEventListener?.("change", onChange)
  }, [])

  // ----- imperative reactions ------------------------------------------------
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
        const units = unitsRef.current
        if (!units.length) return
        setVariantState((prev) => {
          const next = { ...prev }
          for (let k = 0; k < swaps; k++) {
            const u = units[Math.floor(Math.random() * units.length)]
            next[u.key] = rollIndex(u.count, prev[u.key] ?? 0)
          }
          return next
        })
      },
    }),
    [reduceMotion],
  )

  // ----- blink loop (mood-tunable: sleepy long blinks, steady-gaze rare
  // blinks, or quick hopeful blinks) -------------------------------------------
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

  // ----- evolution transition on stage increase ------------------------------
  useEffect(() => {
    if (clampedStage === displayStage) return
    if (reduceMotion) {
      setDisplayStage(clampedStage)
      return
    }
    evolveTimers.current.forEach(clearTimeout)
    evolveTimers.current = []

    setEvolvePhase("out")
    evolveTimers.current.push(
        setTimeout(() => {
          setDisplayStage(clampedStage)
          setEvolvePhase("in")
        }, EVOLVE_OUT_MS),
      )
      evolveTimers.current.push(
        setTimeout(() => setEvolvePhase("idle"), EVOLVE_OUT_MS + EVOLVE_IN_MS),
      )
    return () => {
      evolveTimers.current.forEach(clearTimeout)
      evolveTimers.current = []
    }
  }, [clampedStage, displayStage, reduceMotion])

  // ----- accretion: which details are freshly added (to flicker in) ----------
  const prevCount = useRef(detailCount)
  const [freshFrom, setFreshFrom] = useState(detailCount)
  useEffect(() => {
    if (detailCount > prevCount.current) {
      setFreshFrom(prevCount.current) // animate indices >= previous count
      const t = setTimeout(() => setFreshFrom(detailCount), ACCRETE_MS + 100)
      prevCount.current = detailCount
      return () => clearTimeout(t)
    }
    if (detailCount !== prevCount.current) {
      prevCount.current = detailCount
      setFreshFrom(detailCount)
    }
  }, [detailCount])

  // ----- geometry (fixed to the mature stage-5 envelope) ---------------------
  const grid = useMemo(() => buildAccretionGrid(STAGE_5), [])
  const details = useMemo(
    () =>
      seed
        ? growthEvents
          ? buildJourneyGrowth(seed, growthEvents, grid)
          : buildGrowth(seed, detailCount, grid)
        : [],
    [seed, growthEvents, detailCount, grid],
  )
  const skelLines = useMemo(
    () => layoutSkeleton(STAGE_ART[displayStage] ?? STAGE_1, grid.cols, grid.rows),
    [displayStage, grid],
  )
  // Cell lookup for the SAME coordinates the skeleton glyphs occupy, so each
  // drawn position knows its variant set for character-level mutation.
  const cellMap = useMemo(
    () => layoutStageCells(STAGE_GRIDS[displayStage] ?? STAGE_GRIDS[1], grid.cols, grid.rows),
    [displayStage, grid],
  )

  // Every mutable "unit" = a grouped set of cells (one shared index), a lone
  // cell, or an accreted detail. Only units with >1 variant can change.
  const mutationUnits = useMemo(() => {
    const list: { key: string; count: number }[] = []
    const seen = new Set<string>()
    cellMap.forEach((cell, coord) => {
      if (cell.variants.length <= 1) return
      const key = cell.group ? `g:${cell.group}` : `s:${coord}`
      if (seen.has(key)) return
      seen.add(key)
      list.push({ key, count: cell.variants.length })
    })
    details.forEach((d) => {
      const sib = detailSiblings(d.char, d.zone)
      if (sib.length > 1)
        list.push({ key: `d:${d.index}:${d.row}:${d.col}`, count: sib.length })
    })
    return list
  }, [cellMap, details])
  const unitsRef = useRef(mutationUnits)
  unitsRef.current = mutationUnits

  // Pick a fresh variant index for a unit, guaranteed different from `cur`.
  // Shared with the landing-page AmbientCreature via lib/self/mutation.
  const rollVariant = rollIndex

  // ----- mutation tick: swap 1–2 cells every 500–900ms -----------------------
  useEffect(() => {
    if (reduceMotion) return
    let alive = true
    let timer: ReturnType<typeof setTimeout>
    const step = () => {
      timer = setTimeout(
        () => {
          if (!alive) return
          if (typeof document === "undefined" || !document.hidden) {
            const units = unitsRef.current
            if (units.length) {
              const swaps = 1 + (Math.random() < 0.5 ? 1 : 0)
              setVariantState((prev) => {
                const next = { ...prev }
                for (let k = 0; k < swaps; k++) {
                  const u = units[Math.floor(Math.random() * units.length)]
                  next[u.key] = rollVariant(u.count, prev[u.key] ?? 0)
                }
                return next
              })
            }
          }
          step()
        },
        500 + Math.random() * 400,
      )
    }
    step()
    return () => {
      alive = false
      clearTimeout(timer)
    }
  }, [reduceMotion])

  // ----- occasional shift: re-compose ~half the cells with a 150ms ripple ----
  useEffect(() => {
    if (reduceMotion) return
    let alive = true
    let timer: ReturnType<typeof setTimeout>
    const staggers: ReturnType<typeof setTimeout>[] = []
    const step = () => {
      timer = setTimeout(
        () => {
          if (!alive) return
          if (typeof document === "undefined" || !document.hidden) {
            const units = unitsRef.current.filter((u) => u.count > 1)
            const half = Math.ceil(units.length / 2)
            const chosen = [...units]
              .sort(() => Math.random() - 0.5)
              .slice(0, half)
            const per = chosen.length ? 150 / chosen.length : 0
            chosen.forEach((u, i) => {
              const t = setTimeout(() => {
                setVariantState((prev) => ({
                  ...prev,
                  [u.key]: rollVariant(u.count, prev[u.key] ?? 0),
                }))
              }, Math.round(i * per))
              staggers.push(t)
            })
          }
          step()
        },
        6000 + Math.random() * 6000,
      )
    }
    step()
    return () => {
      alive = false
      clearTimeout(timer)
      staggers.forEach(clearTimeout)
    }
  }, [reduceMotion])

  // Font sized so the whole grid fits inside the face disc with aura room.
  const inner = size * 0.62
  const cellW = useMemo(() => {
    const byWidth = inner / (grid.cols * 0.6)
    const byHeight = inner / (grid.rows * 1.05)
    return Math.min(byWidth, byHeight) * 0.6
  }, [inner, grid.cols, grid.rows])
  const fontPx = cellW / 0.6
  const rowH = fontPx * 1.05
  const boardW = grid.cols * cellW
  const boardH = grid.rows * rowH

  // Exact centering correction for the drawn skeleton. Each stage's art is laid
  // into the fixed grid with integer cell padding, so an even-width form (e.g.
  // stage 1's "[..]") ends up a half-cell off the board center. Measure the
  // skeleton's real bounding box and translate ONLY the skeleton layer by the
  // leftover sub-cell delta so it sits perfectly centered in the circle. The
  // accretion details are intentionally left on the stage-5 grid coordinates.
  const skelOffset = useMemo(() => {
    let minR = grid.rows,
      maxR = -1,
      minC = grid.cols,
      maxC = -1
    skelLines.forEach((line, r) => {
      for (let c = 0; c < line.length; c++) {
        if (line[c] !== " ") {
          if (r < minR) minR = r
          if (r > maxR) maxR = r
          if (c < minC) minC = c
          if (c > maxC) maxC = c
        }
      }
    })
    if (maxC < 0) return { x: 0, y: 0 }
    const bboxCenterX = ((minC + maxC + 1) / 2) * cellW
    const bboxCenterY = ((minR + maxR + 1) / 2) * rowH
    return { x: boardW / 2 - bboxCenterX, y: boardH / 2 - bboxCenterY }
  }, [skelLines, grid.rows, grid.cols, cellW, rowH, boardW, boardH])

  const evolving = evolvePhase !== "idle"
  const artOpacity = evolvePhase === "out" ? 0 : 1
  // lcd: a constant 0.4px soften makes upscaled glyph pixels sit naturally
  // under the LED grid overlay (glow drop-shadow is unaffected).
  const artBlur = evolvePhase === "out" ? 6 : lcd ? 0.4 : 0
  const evolveScale = evolvePhase === "out" ? 0.9 : 1

  // Reaction animation on the whole being.
  let reactionAnim = "none"
  if (reaction === "agree") reactionAnim = `creatureBounce ${REACTION_MS}ms ease`
  else if (reaction === "disagree")
    reactionAnim = `creatureTilt ${REACTION_MS}ms ease`
  else if (reaction === "submit")
    reactionAnim = `creatureAbsorb ${REACTION_MS}ms ease`
  const breatheAnim = reduceMotion
    ? "none"
    : `creatureBreathe ${breatheDuration}s ease-in-out infinite`
  // Ember flicker (crisis reads) animates opacity only, so it can share the
  // element with the transform-based breathe/reaction animation.
  const emberAnim = ember && !reduceMotion ? ", creatureEmber 3.4s steps(1) infinite" : ""

  const cellStyle = (r: number, c: number): React.CSSProperties => ({
    position: "absolute",
    left: c * cellW,
    top: r * rowH,
    width: cellW,
    height: rowH,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: MONO,
    fontSize: `${fontPx}px`,
    lineHeight: 1,
    userSelect: "none",
  })

  return (
    <div
      className="relative flex items-center justify-center"
      style={{
        width: size,
        height: size,
        // lcd: soft inner vignette — the screen's edge falloff.
        boxShadow: lcd ? "inset 0 0 60px 20px rgba(0,0,0,0.6)" : undefined,
      }}
    >
      <style>{CREATURE_KEYFRAMES}</style>

      {/* Dust motes drifting inside the circle */}
      {!reduceMotion && <Dust color={color} size={size} />}

      {/* The being: skeleton + accreted details, one shared grid */}
      <div
        aria-hidden="true"
        style={{
          position: "relative",
          width: boardW,
          height: boardH,
          opacity: artOpacity,
          filter: `drop-shadow(0 0 10px ${color}) blur(${artBlur}px)`,
          transform: `scale(${evolveScale})`,
          transformOrigin: "center",
          // `color` eases ~500ms so attunement tints (a read's accent while
          // its panel is open, the absorbed afterglow on agree, the drain back
          // to neutral) glide instead of snapping. filter matches so the
          // drop-shadow glow re-tints in step with the glyphs.
          transition: evolving
            ? `opacity ${EVOLVE_OUT_MS}ms ease, filter ${EVOLVE_OUT_MS}ms ease, transform ${EVOLVE_OUT_MS}ms ease, color .5s ease`
            : "opacity .3s ease, filter .5s ease, transform .3s ease, color .5s ease",
          animation: (reaction ? reactionAnim : breatheAnim) + emberAnim,
          pointerEvents: "none",
          color,
        }}
      >
        {/* skeleton glyphs — translated by the sub-cell delta so the drawn
            form is perfectly centered within the circle at every stage */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            transform: `translate(${skelOffset.x}px, ${skelOffset.y}px)`,
          }}
        >
          {skelLines.flatMap((line, r) =>
            line.split("").map((ch, c) => {
              if (ch === " ") return null
              const cell = cellMap.get(`${r},${c}`)
              let shown = ch
              if (cell) {
                const key = cell.group ? `g:${cell.group}` : `s:${r},${c}`
                const idx = variantState[key] ?? 0
                shown = cell.variants[idx % cell.variants.length]
                if (blinking && cell.blink) shown = "-"
              } else if (blinking && ch === "o") {
                shown = "-"
              }
              return (
                <span key={`s-${r}-${c}`} style={cellStyle(r, c)}>
                  {shown}
                </span>
              )
            }),
          )}
        </div>

        {/* accreted details — flicker within same-weight lookalikes only.
            Fresh ADDS flicker in; fresh UPGRADES shimmer in place as their
            glyph swaps one step up its maturity ladder. */}
        {details.map((d: PlacedDetail, i) => {
          const freshAdd = !reduceMotion && d.index >= freshFrom
          const freshUpgrade =
            !reduceMotion &&
            !freshAdd &&
            d.upgradedAt != null &&
            d.upgradedAt >= freshFrom
          const sib = detailSiblings(d.char, d.zone)
          const idx = variantState[`d:${d.index}:${d.row}:${d.col}`] ?? 0
          const glyph = sib[idx % sib.length]
          return (
            <span
              key={`d-${d.row}-${d.col}-${i}`}
              style={{
                ...cellStyle(d.row, d.col),
                fontSize: `${fontPx * 0.92}px`,
                opacity: freshAdd ? undefined : ZONE_OPACITY[d.zone],
                filter: `drop-shadow(0 0 3px ${color})`,
                animation: freshAdd
                  ? `creatureAccrete ${ACCRETE_MS}ms ease forwards`
                  : freshUpgrade
                    ? `creatureShimmer ${ACCRETE_MS}ms ease`
                    : "none",
              }}
            >
              {glyph}
            </span>
          )
        })}
      </div>

      {/* lcd: RGB sub-pixel stripes + scanline grid floated ABOVE the glyphs,
          confined to the avatar container only. Never captures taps. */}
      {lcd && (
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            backgroundImage: `repeating-linear-gradient(to right,
                rgba(255,60,60,.05) 0 .67px,
                rgba(60,255,120,.05) .67px 1.33px,
                rgba(80,120,255,.05) 1.33px 2px),
              repeating-linear-gradient(to bottom,
                transparent 0 1px, rgba(0,0,0,.55) 1px 2px),
              repeating-linear-gradient(to right,
                transparent 0 1px, rgba(0,0,0,.55) 1px 2px)`,
          }}
        />
      )}
    </div>
  )
})

/** A few faint glyph motes drifting within the circle. */
function Dust({ color, size }: { color: string; size: number }) {
  // The motes use Math.random(), which would differ between the server and
  // client and cause a hydration mismatch (that mismatch was stalling the
  // preview). They're purely decorative, so we generate them only AFTER mount:
  // the server renders an empty layer and the client fills it in.
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
  100% { opacity: 1; }
}
@media (prefers-reduced-motion: reduce) {
  @keyframes creatureBreathe { 0%,100% { transform: none; } }
}
`

export default SelfCreature
