"use client"

import { useEffect, useState } from "react"
import { randomScramble } from "@/lib/self/mutation"

/**
 * Text whose letters occasionally flicker into ascii glyphs and back — the
 * same feel as the loading screen's AsciiMorphDisplay, but ambient and
 * endless rather than resolving into a final word.
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
  /** ms between flickers — higher is calmer. */
  intervalMs = 420,
  /** how long a single cell stays a glyph before returning to its letter. */
  holdMs = 140,
}: {
  text: string
  className?: string
  intervalMs?: number
  holdMs?: number
}) {
  // null = showing the real letter; a string = currently flickering to a glyph
  const [cell, setCell] = useState<{ index: number; glyph: string } | null>(null)

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

    let restore: number | undefined
    const timer = window.setInterval(() => {
      const index = mutable[Math.floor(Math.random() * mutable.length)]
      setCell({ index, glyph: randomScramble(text[index]) })
      restore = window.setTimeout(() => setCell(null), holdMs)
    }, intervalMs)

    return () => {
      window.clearInterval(timer)
      if (restore !== undefined) window.clearTimeout(restore)
    }
  }, [text, intervalMs, holdMs])

  return (
    <span aria-label={text} className={className}>
      {[...text].map((char, index) => (
        <span key={index} aria-hidden="true">
          {cell?.index === index ? cell.glyph : char}
        </span>
      ))}
    </span>
  )
}
