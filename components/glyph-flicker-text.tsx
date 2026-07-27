"use client"

import { useEffect, useRef } from "react"
import { randomScramble } from "@/lib/self/mutation"

/**
 * Text whose letters drift into ascii glyphs and back — the same feel as the
 * loading screen's AsciiMorphDisplay, but ambient and endless rather than
 * resolving into a final word.
 *
 * Smoothness comes from three things:
 *  - each cell fades on a sine curve rather than hard-swapping, so a letter
 *    dims out, becomes a glyph or two, and lifts back in
 *  - several cells can be mid-drift at once, at staggered offsets, so the
 *    line shimmers continuously instead of ticking one letter at a time
 *  - a single requestAnimationFrame loop writes straight to the DOM, so the
 *    fade is per-frame smooth with no re-render churn
 *
 * It reuses the shared scramble glyphs from lib/self/mutation.ts so the
 * character vocabulary stays defined in one place. Spaces never mutate, and
 * because the type is monospaced every glyph occupies the same cell — the
 * line never reflows while it breathes.
 *
 * The real string stays in the accessibility tree (aria-label on the wrapper,
 * per-cell spans aria-hidden), and under prefers-reduced-motion the text is
 * simply rendered still.
 */
export function GlyphFlickerText({
  text,
  className,
  /** average ms between new cells beginning to drift — higher is calmer. */
  spawnMs = 260,
  /** how long one cell takes to dim out, morph, and lift back in. */
  driftMs = 760,
}: {
  text: string
  className?: string
  spawnMs?: number
  driftMs?: number
}) {
  const cellRefs = useRef<(HTMLSpanElement | null)[]>([])

  useEffect(() => {
    const reduceMotion =
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false
    if (reduceMotion) return

    // Indices we're allowed to mutate — letters only, never the spaces, so
    // word shapes stay readable.
    const mutable = [...text]
      .map((char, index) => (char.trim() ? index : -1))
      .filter((index) => index !== -1)
    if (mutable.length === 0) return

    type Drift = { index: number; start: number; dur: number; glyphs: string[] }
    let drifts: Drift[] = []
    let nextSpawn = 0
    let frame = 0

    const spawn = (now: number) => {
      // Don't stack two drifts on the same cell — that's what read as a jump.
      const free = mutable.filter((i) => !drifts.some((d) => d.index === i))
      if (free.length === 0) return
      const index = free[Math.floor(Math.random() * free.length)]
      drifts.push({
        index,
        start: now,
        // Vary duration a little so the shimmer never syncs into a pulse.
        dur: driftMs * (0.75 + Math.random() * 0.5),
        glyphs: [
          randomScramble(text[index]),
          randomScramble(text[index]),
          randomScramble(text[index]),
        ],
      })
    }

    const tick = (now: number) => {
      frame = requestAnimationFrame(tick)

      if (now >= nextSpawn) {
        spawn(now)
        // Randomized gaps keep the rhythm organic rather than metronomic.
        nextSpawn = now + spawnMs * (0.6 + Math.random() * 0.8)
      }

      for (const drift of drifts) {
        const node = cellRefs.current[drift.index]
        if (!node) continue
        const p = Math.min(1, (now - drift.start) / drift.dur)

        // Smooth dip and recovery — no discontinuity at either end.
        node.style.opacity = String(1 - 0.6 * Math.sin(Math.PI * p))

        // The glyph only appears once the letter has faded down, and steps
        // through a couple of forms before the letter lifts back in.
        if (p > 0.22 && p < 0.78) {
          const step = Math.min(
            drift.glyphs.length - 1,
            Math.floor(((p - 0.22) / 0.56) * drift.glyphs.length),
          )
          node.textContent = drift.glyphs[step]
        } else {
          node.textContent = text[drift.index]
        }
      }

      // Retire finished drifts and make sure their cells end fully restored.
      drifts = drifts.filter((drift) => {
        if (now - drift.start < drift.dur) return true
        const node = cellRefs.current[drift.index]
        if (node) {
          node.textContent = text[drift.index]
          node.style.opacity = "1"
        }
        return false
      })
    }

    frame = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(frame)
      // Leave the real word behind on unmount.
      for (const index of mutable) {
        const node = cellRefs.current[index]
        if (node) {
          node.textContent = text[index]
          node.style.opacity = "1"
        }
      }
    }
  }, [text, spawnMs, driftMs])

  return (
    <span aria-label={text} className={className}>
      {[...text].map((char, index) => (
        <span
          key={index}
          aria-hidden="true"
          ref={(node) => {
            cellRefs.current[index] = node
          }}
          // Every cell is locked to one character width: some glyphs are
          // narrower than the mono advance, and without this the line would
          // twitch horizontally as letters drift.
          style={{
            display: "inline-block",
            width: "1ch",
            textAlign: "center",
            whiteSpace: "pre",
          }}
        >
          {char}
        </span>
      ))}
    </span>
  )
}
