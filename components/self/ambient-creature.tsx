"use client"

import { useEffect, useRef, useState } from "react"
import { RIPPLE_STAGGER_MS, randomScramble } from "@/lib/self/mutation"
import { ledTexture } from "@/lib/ui/led"

/**
 * AmbientCreature — a "demo mode" of the self being for the landing page.
 *
 * It sits inside the same black disc + thin near-white outline used on /self,
 * and cycles playfully through small creature faces as a preview of the self
 * you'll grow. Faces are composed PROCEDURALLY from parts (eyes, optional
 * enclosure, ears, mouth, rare extras) so most results are simple and the
 * occasional one is detailed — the same composition never shows twice in a row.
 *
 * Every face resolves in with the being's signature ripple/stagger mutation
 * (lib/self/mutation): its cells flicker through a scramble glyph before
 * settling. There is NO word/letterform/pixel-font path — the cycle is faces
 * only.
 *
 * Deterministic first paint (a fixed simple face) so SSR and client match;
 * morphing, blinking and breathing begin after mount. Animation pauses while
 * the tab is hidden and collapses to quiet swaps under prefers-reduced-motion.
 */

const NEUTRAL = "#e8e4da"
const MONO = "ui-monospace, monospace"

// ---- face part vocabulary --------------------------------------------------
const EYES = [".", "·", "˚", "°", "o", "O", "*", "✦", "-", "^", "x", "+", "="]
const MOUTHS = ["_", ".", "o", "~", "v", "w", "‿", "▽"]
const ENCLOSURES: { l: string; r: string }[] = [
  { l: "[", r: "]" },
  { l: "{", r: "}" },
  { l: "(", r: ")" },
  { l: "<", r: ">" },
]
const EARS = ["/\\ /\\", "^   ^", "'   '", "~   ~"]
const EXTRAS = ["\\__/", "(v)", "\\  /", ">  <"]

const rand = () => Math.random()
const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)]

/** Center each line within the widest line, padding to a uniform rectangle. */
function centerBlock(lines: string[]): string {
  const w = Math.max(...lines.map((l) => l.length))
  return lines
    .map((l) => {
      const pad = w - l.length
      const left = Math.floor(pad / 2)
      return " ".repeat(left) + l + " ".repeat(pad - left)
    })
    .join("\n")
}

/**
 * Compose a face from parts by weighted rules:
 *   enclosure ~70%, ears ~25%, mouth ~50%, extras ~10%.
 * Eyes usually match (occasionally a wink/mismatch).
 *
 * The eye line is ALWAYS anchored at the vertical center: blank rows are padded
 * above/below so the count of rows above the eyes equals the count below. Since
 * the whole block is also flex-centered in the disc, the eyes therefore always
 * land at the exact disc center, no matter which optional parts appear.
 */
function composeFace(): string {
  const eye = pick(EYES)
  const eyeR = rand() < 0.12 ? pick(EYES) : eye // occasional mismatch/wink
  const hasEnclosure = rand() < 0.7
  const hasEars = rand() < 0.25
  const hasMouth = rand() < 0.5
  const hasExtra = rand() < 0.1

  const eyeCore = `${eye} ${eyeR}` // e.g. "o o"
  const eyeLine = hasEnclosure
    ? (() => {
        const e = pick(ENCLOSURES)
        return `${e.l} ${eyeCore} ${e.r}`
      })()
    : eyeCore

  const above: string[] = []
  const below: string[] = []
  if (hasEars) above.push(pick(EARS))
  if (hasMouth) below.push(pick(MOUTHS))
  if (hasExtra) below.push(pick(EXTRAS))

  // Pad with blank rows so the eye line sits in the exact vertical middle.
  const diff = below.length - above.length
  const topPad = Math.max(0, diff)
  const botPad = Math.max(0, -diff)

  const lines: string[] = [
    ...Array<string>(topPad).fill(""),
    ...above,
    eyeLine,
    ...below,
    ...Array<string>(botPad).fill(""),
  ]

  return centerBlock(lines)
}

type EmoteGrid = { cells: string[]; rows: number; cols: number; fontPx: number }

/** Turn a composed face string into a grid sized to ~40-50% of the disc. */
function buildFace(art: string, size: number): EmoteGrid {
  const lines = art.split("\n")
  const cols = Math.max(...lines.map((l) => l.length))
  const rows = lines.length
  const cells = Array<string>(rows * cols).fill(" ")
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < lines[r].length; c++) cells[r * cols + c] = lines[r][c]
  }
  // The disc is size * 0.75. Fit the face into ~50% of that diameter.
  const disc = size * 0.75
  const target = disc * 0.5
  const byWidth = target / (cols * 0.62)
  const byHeight = target / (rows * 1.15)
  const fontPx = Math.min(byWidth, byHeight, size * 0.12)
  return { cells, rows, cols, fontPx }
}

// A fixed, simple face for deterministic first paint (SSR === client).
function initialFace(size: number): EmoteGrid {
  return buildFace(centerBlock(["[ o o ]"]), size)
}

export default function AmbientCreature({ size = 200 }: { size?: number }) {
  const [face, setFace] = useState<EmoteGrid>(() => initialFace(size))
  // Live grid cells while a face resolves in (starts fully settled).
  const [cells, setCells] = useState<string[]>(() => initialFace(size).cells)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  // The previous composition string, to guarantee no immediate repeats.
  const prevArt = useRef<string>("")

  useEffect(() => {
    let alive = true
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false
    const clearAll = () => {
      timers.current.forEach(clearTimeout)
      timers.current = []
    }

    function scheduleNext() {
      const wait = 1500 + Math.random() * 1500 // 1.5–3s per face
      const t = setTimeout(() => {
        if (!alive) return
        if (typeof document !== "undefined" && document.hidden) {
          const retry = setTimeout(() => alive && scheduleNext(), 900)
          timers.current.push(retry)
          return
        }
        morph()
      }, wait)
      timers.current.push(t)
    }

    function morph() {
      // Compose a fresh face, never repeating the previous composition.
      let art = composeFace()
      for (let guard = 0; guard < 8 && art === prevArt.current; guard++) art = composeFace()
      prevArt.current = art

      const target = buildFace(art, size)
      setFace(target)

      if (reduce) {
        setCells(target.cells)
        scheduleNext()
        return
      }

      // Seed every "on" cell with a scramble glyph, then resolve them one by
      // one — the being's signature ripple/mutation.
      setCells(target.cells.map((c) => (c === " " ? " " : randomScramble(c))))

      const active = target.cells
        .map((c, i) => (c === " " ? -1 : i))
        .filter((i) => i >= 0)
        .sort(() => Math.random() - 0.5)

      const per = Math.min(RIPPLE_STAGGER_MS / 2, 700 / Math.max(1, active.length))
      let maxDelay = 0
      active.forEach((idx, k) => {
        const base = k * per
        const t1 = setTimeout(() => {
          if (!alive) return
          setCells((prev) => {
            const next = [...prev]
            next[idx] = randomScramble(next[idx])
            return next
          })
        }, base)
        const t2 = setTimeout(() => {
          if (!alive) return
          setCells((prev) => {
            const next = [...prev]
            next[idx] = target.cells[idx]
            return next
          })
        }, base + 130)
        timers.current.push(t1, t2)
        maxDelay = Math.max(maxDelay, base + 130)
      })

      const done = setTimeout(() => alive && scheduleNext(), maxDelay + 260)
      timers.current.push(done)
    }

    scheduleNext()
    return () => {
      alive = false
      clearAll()
    }
  }, [size])

  const disc = size * 0.75
  const lcd = lcdVignette(disc)

  return (
    <div
      className="relative flex items-center justify-center"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <style>{AMBIENT_KEYFRAMES}</style>

      {/* The black disc with a thin near-white outline + breathing halo. */}
      <div
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          width: disc,
          height: disc,
          backgroundColor: "var(--background)",
          border: "2px solid oklch(0.95 0 0 / 0.6)",
          boxShadow: "0 0 22px oklch(0.95 0 0 / 0.12)",
          animation: "ambientHalo 4.5s ease-in-out infinite",
        }}
      />

      {/* The morphing being — breathes (outer) and blinks (inner). */}
      <div className="relative" style={{ animation: "ambientBreathe 4.5s ease-in-out infinite" }}>
        <div
          className="flex items-center justify-center"
          style={{
            color: NEUTRAL,
            // The 0.4px soften is SelfCreature's `lcd` treatment: it makes the
            // upscaled glyph pixels sit under the LED grid instead of looking
            // like sharp text laid on top of it. The glow is unaffected.
            filter: `drop-shadow(0 0 10px ${NEUTRAL}) blur(0.4px)`,
            animation: "ambientBlink 5.4s ease-in-out infinite",
            width: disc,
            height: disc,
          }}
        >
          {/* A FACE: the mutation grid (cells resolve in one by one). */}
          <div className="flex flex-col items-center">
            {Array.from({ length: face.rows }).map((_, r) => (
              <div key={r} className="flex" style={{ height: face.fontPx * 1.15 }}>
                {Array.from({ length: face.cols }).map((_, c) => {
                  const ch = cells[r * face.cols + c] ?? " "
                  return (
                    <span
                      key={c}
                      style={{
                        width: face.fontPx * 0.62,
                        textAlign: "center",
                        fontFamily: MONO,
                        fontSize: `${face.fontPx}px`,
                        lineHeight: `${face.fontPx * 1.15}px`,
                        userSelect: "none",
                      }}
                    >
                      {ch === " " ? "\u00A0" : ch}
                    </span>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* The same LED/LCD screen overlay the /self avatar wears: neutral
          sub-pixel stripes + a scanline grid floated ABOVE the glyphs, carrying
          an inner vignette so the disc reads as a lit panel rather than flat
          text.

          The texture now comes from the shared ledTexture() rather than being
          a local copy of SelfCreature's values — the copies had drifted, so
          this disc and the /self avatar rendered subtly different hues. Pitch
          stays FIXED at 2px so a small avatar reads as the same physical screen
          as a large one; only the vignette blur/spread scale. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          width: disc,
          height: disc,
          boxShadow: `inset 0 0 ${lcd.blur}px ${lcd.spread}px rgba(0,0,0,0.6)`,
          backgroundImage: ledTexture(LCD_GRID_ALPHA),
        }}
      />
    </div>
  )
}

/** Scanline darkness, matching SelfCreature's circular-avatar value. */
const LCD_GRID_ALPHA = 0.16

/**
 * Vignette falloff for a circular screen, using SelfCreature's curve:
 * 0 at ~150px discs (the spiral center) up to 1 at ~480px.
 */
function lcdVignette(discPx: number) {
  const t = Math.max(0, Math.min(1, (discPx - 150) / 330))
  return { blur: 18 + t * 42, spread: 4 + t * 10 }
}

const AMBIENT_KEYFRAMES = `
@keyframes ambientBreathe {
  0%, 100% { transform: translateY(0) scale(1); }
  50% { transform: translateY(-3px) scale(1.02); }
}
@keyframes ambientBlink {
  0%, 90%, 100% { opacity: 1; }
  93% { opacity: 0.2; }
  96% { opacity: 1; }
}
@keyframes ambientHalo {
  0%, 100% { box-shadow: 0 0 18px oklch(0.95 0 0 / 0.10); }
  50% { box-shadow: 0 0 30px oklch(0.95 0 0 / 0.20); }
}
@media (prefers-reduced-motion: reduce) {
  @keyframes ambientBreathe { 0%,100% { transform: none; } }
  @keyframes ambientBlink { 0%,100% { opacity: 1; } }
  @keyframes ambientHalo { 0%,100% { box-shadow: 0 0 18px oklch(0.95 0 0 / 0.12); } }
}
`
