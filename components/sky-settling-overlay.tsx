"use client"

import { useEffect, useState } from "react"

const SETTLING_GLYPHS = ["·", ":", "+", "*", "✦", "=", "/"]

/**
 * A small row of mutating glyphs, echoing the ASCII loader the threshold screen
 * uses, so this gap reads as the same ritual rather than a generic spinner.
 */
function SettlingGlyphs() {
  const [glyphs, setGlyphs] = useState(() => SETTLING_GLYPHS.slice(0, 5))

  useEffect(() => {
    // Honour reduced motion: hold a still frame instead of flickering.
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return
    const id = setInterval(() => {
      setGlyphs((prev) =>
        prev.map((g) =>
          Math.random() < 0.45
            ? SETTLING_GLYPHS[Math.floor(Math.random() * SETTLING_GLYPHS.length)]
            : g,
        ),
      )
    }, 140)
    return () => clearInterval(id)
  }, [])

  return (
    <div
      aria-hidden="true"
      className="flex items-center justify-center gap-2 font-mono text-base text-foreground/70"
    >
      {glyphs.map((g, i) => (
        <span key={i} className="inline-block w-3">
          {g}
        </span>
      ))}
    </div>
  )
}

/**
 * Covers /circle for the one render where the user is signed in but their chart
 * hasn't been persisted yet, so the spiral would otherwise paint a
 * complete-looking universe with no stars in it.
 *
 * Kept separate from BirthChartBootstrap's effect logic so the visual can be
 * rendered (and reviewed) on its own.
 */
export function SkySettlingOverlay({ failed }: { failed?: string | null }) {
  return (
    <div
      role="status"
      aria-live="polite"
      /* z-[80] clears the spiral's own layers (up to z-[60]) and the view
         chrome (z-50), siblings in this same stacking context. */
      className="fixed inset-0 z-[80] flex flex-col items-center justify-center gap-5 bg-background px-6 text-center"
    >
      {failed ? (
        <>
          <p className="max-w-xs font-mono text-sm leading-relaxed lowercase tracking-wide text-foreground text-pretty">
            {failed}
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-full border border-border/80 px-5 py-2.5 font-mono text-xs lowercase tracking-widest text-foreground"
          >
            try again
          </button>
        </>
      ) : (
        <>
          <SettlingGlyphs />
          <p className="font-mono text-xs lowercase tracking-widest text-muted-foreground">
            settling your sky…
          </p>
        </>
      )}
    </div>
  )
}
