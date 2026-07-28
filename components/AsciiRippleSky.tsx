"use client"

import { useEffect, useRef } from "react"
import { SKY_CELL, skyField } from "@/lib/sky-field"
import { ACCENT_COLORS } from "@/lib/spiral/accent-colors"

/**
 * A full-screen, infinitely animating ASCII "ripple sky" rendered to a canvas.
 * Concentric sine ripples drift across a grid of monospace glyphs on pure black,
 * each glyph shaded along a grayscale gradient that fades from black up to a
 * soft grey at the ripple peaks (never full white). Sits behind all content
 * (fixed, pointer-events-none) and respects reduced-motion preferences.
 */
export default function AsciiRippleSky() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    // Sparse -> dense glyph ramp. Spaces keep the sky mostly empty/black.
    // ꩜ (spiral) replaces the round "o/O" glyphs as a nod to "Spiral Inward".
    // The three densest steps are all spirals, drawn small -> medium -> large
    // so the gradient ramps up smoothly toward the brightest ripple peaks.
    const ramp = "  ...,:;+*=꩜꩜꩜"
    // Per-index scale factor (of the cell size) for the spiral glyphs.
    const SPIRAL_SCALE: Record<number, number> = {
      11: 0.55, // small spiral
      12: 0.78, // medium spiral
      13: 1.0, // large spiral
    }
    const cell = SKY_CELL // px per glyph cell (shared with the cloud layer)
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches

    // ---- accent embers ----------------------------------------------------
    // A small fraction of fog glyphs slowly pulse through the /circle universe
    // accent hues (grey → color glow over ~3s → grey), staggered by a stable
    // per-cell phase so only a few points of color ever breathe at once.
    const ACCENT_RGB = ACCENT_COLORS.map((hex): [number, number, number] => [
      parseInt(hex.slice(1, 3), 16),
      parseInt(hex.slice(3, 5), 16),
      parseInt(hex.slice(5, 7), 16),
    ])
    const ACCENT_FRACTION = 0.1 // ~10% of glyphs are accent cells
    const ACCENT_MIN_PERIOD = 6 // s — full grey→color→grey cycle range
    const ACCENT_MAX_PERIOD = 10
    const lerp = (a: number, b: number, t: number) => a + (b - a) * t
    // Stable hash of a grid coordinate → [0,1).
    const hash2 = (x: number, y: number) => {
      const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453
      return s - Math.floor(s)
    }

    let cols = 0
    let rows = 0
    let dpr = 1

    // Declared as arrow consts (not hoisted `function`s) so TypeScript keeps
    // the non-null narrowing of `canvas`/`ctx` from the guards above.
    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      const w = window.innerWidth
      const h = window.innerHeight
      canvas.width = Math.floor(w * dpr)
      canvas.height = Math.floor(h * dpr)
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.font = `${cell}px "JetBrains Mono", ui-monospace, monospace`
      ctx.textBaseline = "top"
      cols = Math.ceil(w / cell)
      rows = Math.ceil(h / cell)
    }
    resize()
    window.addEventListener("resize", resize)

    // The ripple reads from the shared sky-field module (skyField / SKY_SOURCES)
    // so the cloud layer behind us pulses from the exact same wave.
    let raf = 0
    let start = performance.now()

    // Whole-field glow breathe: the entire ASCII sky brightens and dims on a
    // slow sine so the glyphs "glow in and out" together. Ranges from a dim
    // GLOW_MIN floor up to full brightness at the peak of each ~9s cycle.
    const GLOW_MIN = 0.15
    const GLOW_PERIOD = 9 // seconds per full glow-in / glow-out cycle

    const frame = (now: number) => {
      // Pause drawing while the tab is hidden (keep a cheap rAF alive to resume).
      if (typeof document !== "undefined" && document.hidden) {
        if (!reduceMotion) raf = requestAnimationFrame(frame)
        return
      }
      const t = (now - start) / 1000
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      // 0 -> 1 -> 0 breathe, eased toward the extremes for a softer swell.
      const wave = (Math.sin((t / GLOW_PERIOD) * Math.PI * 2) + 1) / 2
      const glow = GLOW_MIN + (1 - GLOW_MIN) * wave

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const n = skyField(c, r, cols, rows, t)

          const idx = Math.floor(n * (ramp.length - 1))
          const ch = ramp[idx]
          if (ch === " ") continue

          // Grayscale gradient that fades from black up to grey (never full
          // white). Brightness follows the ripple value, capped at GREY_MAX so
          // the peaks settle into a soft grey rather than glowing white. The
          // whole-field `glow` breathe then scales every glyph up and down.
          const GREY_MAX = 150
          const lum = Math.round(Math.pow(n, 1.5) * GREY_MAX * glow)

          // Accent ember: if this cell is one of the ~10% accent cells, blend
          // its grey toward an accent hue on a slow, narrow pulse.
          if (hash2(c, r) < ACCENT_FRACTION) {
            const [ar, ag, ab] =
              ACCENT_RGB[Math.floor(hash2(c + 1.3, r + 7.7) * ACCENT_RGB.length) % ACCENT_RGB.length]
            const phase = hash2(c + 4.1, r + 2.3)
            const period =
              ACCENT_MIN_PERIOD + hash2(c + 9.2, r + 5.5) * (ACCENT_MAX_PERIOD - ACCENT_MIN_PERIOD)
            const cyc = (t / period + phase) % 1
            // pow(3) keeps each glyph grey most of the cycle, blooming to color
            // only briefly — an ember, not a light show.
            const bump = Math.pow(Math.max(0, Math.sin(cyc * Math.PI)), 3)
            if (bump > 0.01) {
              // lift brightness a touch at the peak so the color reads as a glow
              const k = bump * (0.85 + 0.15 * glow)
              const rr = Math.round(lerp(lum, ar, k))
              const gg = Math.round(lerp(lum, ag, k))
              const bb = Math.round(lerp(lum, ab, k))
              ctx.fillStyle = `rgb(${rr}, ${gg}, ${bb})`
            } else {
              ctx.fillStyle = `rgb(${lum}, ${lum}, ${lum})`
            }
          } else {
            ctx.fillStyle = `rgb(${lum}, ${lum}, ${lum})`
          }

          const scale = SPIRAL_SCALE[idx]
          if (scale && scale < 1) {
            // Draw smaller spirals centered in their cell so the gradient steps
            // up smoothly from small -> medium -> large ꩜.
            const size = Math.round(cell * scale)
            ctx.font = `${size}px "JetBrains Mono", ui-monospace, monospace`
            const off = (cell - size) / 2
            ctx.fillText(ch, c * cell + off, r * cell + off)
            ctx.font = `${cell}px "JetBrains Mono", ui-monospace, monospace`
          } else {
            ctx.fillText(ch, c * cell, r * cell)
          }
        }
      }

      if (!reduceMotion) {
        raf = requestAnimationFrame(frame)
      }
    }

    raf = requestAnimationFrame(frame)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener("resize", resize)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[1]"
      // Transparent + screen blend so the ASCII glyphs sit as light ON TOP of
      // the SwirlCloudSky (z-0) behind it — the two layers share one wave.
      style={{ backgroundColor: "transparent", mixBlendMode: "screen" }}
    />
  )
}
