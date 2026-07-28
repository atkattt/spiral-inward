"use client"

import { useEffect, useRef } from "react"
import { useReducedMotion } from "@/lib/use-reduced-motion"

/**
 * AsciiSpiral
 * A glowing ASCII spiral that matches the SelfAvatar aesthetic — same glyph
 * ramp, same Space Mono font, same drop-shadow glow. Rendered as a polar
 * field via requestAnimationFrame.
 *
 * Motion: two arms wind continuously *inward* and dissolve into a dark center,
 * while fresh arms emerge at the rim — an infinite loop that disappears into
 * darkness at its core. Respects prefers-reduced-motion (renders one frame).
 */

// Grid half-extents. Monospace cells are taller than wide, so ASPECT squashes
// the y axis to keep the spiral a true circle.
const RX = 15
const RY = 9
const ASPECT = RY / RX

// Shared glyph ramp with SelfAvatar (sparse dots → dense star).
const RAMP = [" ", "·", "·", ":", "+", "*", "#", "✦"]

const smooth = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

export default function AsciiSpiral({
  size = 150,
  tone = "dark",
}: {
  size?: number
  // "dark": black glyphs for the grey-glass hero.
  // "light": near-white glowing glyphs, for use inside the black self-avatar disc.
  tone?: "dark" | "light"
}) {
  const ref = useRef<HTMLPreElement | null>(null)
  const rafRef = useRef<number | null>(null)

  // Hydration-safe; see lib/use-reduced-motion.ts. Only read inside the rAF
  // effect below, which renders a single static frame when motion is reduced.
  const reduceMotion = useReducedMotion()

  useEffect(() => {
    const el = ref.current
    if (!el) return

    // Time-based motion: driving the field off real elapsed seconds (rather
    // than a per-frame integer counter) keeps the angular velocity constant
    // regardless of display refresh rate and immune to dropped frames, so the
    // spiral glides smoothly. The sine field is fully periodic, so it loops
    // forever with no seam.
    let start = 0

    const field = (t: number) => {
      // gentle breath so the spiral feels alive, not mechanical
      const breathe = Math.sin(t * 0.7) * 0.5 + 0.5
      const arms = 2
      const tightness = 0.62
      const grid: number[][] = []

      for (let y = -RY; y <= RY; y++) {
        const row: number[] = []
        for (let x = -RX; x <= RX; x++) {
          const nx = x
          const ny = y / ASPECT
          const d = Math.sqrt(nx * nx + ny * ny)
          if (d > RX + 0.5) {
            row.push(0)
            continue
          }
          const ang = Math.atan2(ny, nx)

          // Spiral arms wind inward toward the dark center. A slow angular
          // velocity (matching the calm feel of the /circle self spiral) keeps
          // each glyph on screen long enough to read as fluid, not flickery.
          const s = Math.sin(arms * ang + d * tightness + t * 1.05)
          let arm = Math.max(0, s)
          arm = Math.pow(arm, 1.5)

          // Radial envelope: ~0 at the core (ends vanish into darkness),
          // brightest in the outer body, soft fade at the very rim.
          const rN = d / RX
          let env = smooth(0.04, 0.5, rN)
          env *= 1 - smooth(0.86, 1.02, rN)

          let v = arm * env * (0.78 + breathe * 0.22)

          // Faint inner sparkle so the dark core isn't perfectly empty.
          if (rN < 0.35 && Math.abs(s) > 0.985) v = Math.max(v, 0.25 * env + 0.12)

          row.push(v)
        }
        grid.push(row)
      }
      return grid
    }

    // Persistent smoothed buffer. Each frame every cell eases toward its target
    // value instead of snapping, so glyphs fade in/out gradually rather than
    // popping — this is what removes the jitter and gives the soft, fluid feel
    // of the /circle self spiral.
    let buf: number[][] | null = null

    const render = (grid: number[][]) => {
      let out = ""
      for (const row of grid) {
        for (const v of row)
          out += v <= 0.02 ? " " : RAMP[Math.min(RAMP.length - 1, Math.floor(v * RAMP.length))]
        out += "\n"
      }
      el.textContent = out
    }

    const draw = (t: number, ease: number) => {
      const target = field(t)
      if (!buf) {
        buf = target
      } else {
        for (let r = 0; r < target.length; r++) {
          const tr = target[r]
          const br = buf[r]
          for (let c = 0; c < tr.length; c++) br[c] += (tr[c] - br[c]) * ease
        }
      }
      render(buf)
    }

    let last = 0
    const loop = (now: number) => {
      if (start === 0) start = now
      // Pause work while the tab is hidden; resume seamlessly (periodic field).
      if (typeof document !== "undefined" && document.hidden) {
        last = now
        rafRef.current = requestAnimationFrame(loop)
        return
      }
      // Frame-rate-independent easing: ~10ms time-constant keeps the smoothing
      // consistent whether the display runs at 60 or 120 Hz.
      const dt = last === 0 ? 16 : Math.min(64, now - last)
      last = now
      const ease = 1 - Math.exp(-dt / 90)
      draw((now - start) / 1000, ease)
      rafRef.current = requestAnimationFrame(loop)
    }

    if (reduceMotion) {
      render(field(0))
    } else {
      rafRef.current = requestAnimationFrame(loop)
    }

    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
    }
  }, [reduceMotion])

  const cols = RX * 2 + 1
  const fontPx = (size / cols) * 1.05

  return (
    <pre
      ref={ref}
      aria-hidden="true"
      style={{
        margin: 0,
        width: size,
        height: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily:
          "'Geist Pixel', ui-monospace, monospace",
        fontSize: `${fontPx}px`,
        lineHeight: 0.92,
        letterSpacing: 0,
        // Dark glyphs match the /onboarding ASCII sky (black-on-grey glass);
        // light glyphs glow near-white for use inside the black avatar disc.
        color: tone === "light" ? "oklch(0.97 0 0)" : "#141414",
        whiteSpace: "pre",
        userSelect: "none",
        pointerEvents: "none",
        overflow: "hidden",
        filter:
          tone === "light"
            ? "drop-shadow(0 0 6px oklch(0.97 0 0 / 0.55))"
            : "drop-shadow(0 1px 2px rgba(0,0,0,0.25))",
      }}
    />
  )
}
