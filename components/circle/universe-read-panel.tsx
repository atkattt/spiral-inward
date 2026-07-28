"use client"

import { useCallback, useEffect, useRef, useState } from "react"

/**
 * UniverseReadPanel
 *
 * A terminal-styled panel that slides up from the bottom when an object in the
 * SpiralUniverse is tapped. Mirrors the ReadHub voice: a small lowercase title,
 * a dim metadata line, the full body text (no typing animation — the whole
 * content fades in ~200ms), and [ ✓ yes ] / [ ✕ no ] commands. Closes on
 * scrim tap or swipe-down.
 *
 * The yes/no handlers are wired by the parent to the SAME spiral agree/disagree
 * persistence used by the bottom ReadHub — this is not a parallel system.
 */

export type PanelData = {
  /** Small dim metadata line under the title — the trigger in plain words,
      e.g. "saturn in the 8th". */
  src: string
  /** The fragment's authored lowercase title, e.g. "the underworld door". */
  title: string
  /** The authored body, shown EXACTLY as written; types out. */
  body: string
  /** The tapped marker's color — tints the panel border + heading. */
  accent?: string
  /** The read's sigil — short ASCII floated above the creature on stage. */
  symbol?: string
}

const mono =
  "'Geist Pixel', ui-monospace, monospace"

export function UniverseReadPanel({
  data,
  onJudge,
  onClose,
  stage,
}: {
  data: PanelData | null
  onJudge: (agree: boolean) => void
  onClose: () => void
  /**
   * The read-open scene rendered standing ON the panel's top edge (its
   * "floor"): the creature at ~1.5x with the read's sigil floating above it.
   * Slides up/down WITH the panel since it lives inside it.
   */
  stage?: React.ReactNode
}) {
  const [dragY, setDragY] = useState(0)
  const dragStart = useRef<number | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const open = data !== null
  // The tapped marker's color, translated into the panel chrome. Falls back to
  // the neutral grey when no accent is provided.
  const accent = data?.accent ?? "#9a9a9a"

  /**
   * Which command was just pressed, latched the instant it is clicked.
   *
   * The parent deliberately keeps the panel open ~820ms after a judgement so
   * the creature's reaction can play. Without this, nothing in the panel
   * changed during that window, so the press read as an unresponsive delay —
   * the click had registered, it just looked like it hadn't. Latching locally
   * (rather than waiting on the parent) paints the confirmation on the very
   * next frame.
   *
   * It also makes the panel single-shot: the handler is ignored once a choice
   * is latched, so extra taps inside the linger window can't fire onJudge
   * again. Previously three fast taps sent three judgements — duplicating the
   * read_responses write and stepping the reveal frontier three times.
   */
  const [chosen, setChosen] = useState<"yes" | "no" | null>(null)

  const choose = useCallback(
    (agree: boolean) => {
      if (chosen) return
      setChosen(agree ? "yes" : "no")
      onJudge(agree)
    },
    [chosen, onJudge],
  )

  // Reset the drag offset (and the latched choice) whenever new content arrives.
  useEffect(() => {
    if (data) {
      setDragY(0)
      setChosen(null)
    }
  }, [data])

  // Height of the "sky" — the dark region between the viewport top and the
  // panel's top edge. The stage fills it so the creature centers vertically
  // between the two. Re-measured whenever the panel's content resizes.
  const [skyH, setSkyH] = useState(0)
  useEffect(() => {
    if (!open) return
    const el = panelRef.current
    if (!el) return
    const measure = () =>
      setSkyH(Math.max(0, window.innerHeight - el.offsetHeight))
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    window.addEventListener("resize", measure)
    return () => {
      ro.disconnect()
      window.removeEventListener("resize", measure)
    }
  }, [open, data])

  // ----- swipe-down to dismiss (on the grab handle) -----
  const onGrabDown = useCallback((e: React.PointerEvent) => {
    dragStart.current = e.clientY
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }, [])
  const onGrabMove = useCallback((e: React.PointerEvent) => {
    if (dragStart.current == null) return
    setDragY(Math.max(0, e.clientY - dragStart.current))
  }, [])
  const onGrabUp = useCallback(() => {
    if (dragStart.current == null) return
    setDragY((y) => {
      if (y > 70) onClose()
      return 0
    })
    dragStart.current = null
  }, [onClose])

  return (
    <>
      {/* Scrim */}
      <button
        aria-hidden={!open}
        tabIndex={-1}
        onClick={onClose}
        className="fixed inset-0 z-40 cursor-default transition-opacity duration-300"
        style={{
          background: "rgba(0,0,0,0.55)",
          backdropFilter: "blur(2px)",
          opacity: open ? 1 : 0,
          pointerEvents: open ? "auto" : "none",
        }}
      />

      {/* Panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-hidden={!open}
        className="fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-[440px]"
        style={{
          background: "#070707",
          // Explicit sides (not the `border` shorthand) so React doesn't see
          // a shorthand/longhand conflict with the missing bottom edge.
          borderTop: `1px solid ${accent}`,
          borderLeft: `1px solid ${accent}`,
          borderRight: `1px solid ${accent}`,
          borderRadius: "20px 20px 0 0",
          // A soft bloom of the marker's color along the panel's top edge.
          boxShadow: `0 -1px 24px ${accent}40`,
          transform: open ? `translateY(${dragY}px)` : "translateY(110%)",
          transition: dragStart.current
            ? "none"
            : "transform .38s cubic-bezier(.3,.8,.3,1)",
          // When closed, drop out of the a11y tree + pointer flow entirely so
          // the off-screen yes/no buttons aren't focusable or clickable.
          visibility: open ? "visible" : "hidden",
          pointerEvents: open ? "auto" : "none",
          fontFamily: mono,
        }}
      >
        {/* The stage: the creature in the sky above the panel. The wrapper
            spans the FULL region between the viewport top and the panel's top
            edge (measured skyH), and flex-centers the creature so it floats
            exactly midway between the two. */}
        {stage && open && skyH > 0 && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-full flex flex-col items-center justify-center"
            style={{ height: skyH }}
          >
            {stage}
          </div>
        )}

        {/* Grab handle (also the swipe-down target) */}
        <div
          onPointerDown={onGrabDown}
          onPointerMove={onGrabMove}
          onPointerUp={onGrabUp}
          onPointerCancel={onGrabUp}
          className="flex cursor-grab justify-center pb-1 pt-3 active:cursor-grabbing"
          style={{ touchAction: "none" }}
        >
          <span className="block h-1 w-9 rounded-full" style={{ background: accent, opacity: 0.7 }} />
        </div>

        {/* Content: keyed on the read so the whole block re-fades (~200ms)
            per read. The full body is simply there — no typing animation. */}
        <div
          key={data ? `${data.title}::${data.src}` : "empty"}
          className="px-6 pb-7 pt-2"
          style={{ animation: open ? "urpFadeIn 200ms ease-out" : "none" }}
        >
          {/* title — the fragment's authored lowercase title, as written */}
          <div
            className="mb-2 text-[13px] lowercase tracking-[2px]"
            style={{ color: accent, textShadow: `0 0 12px ${accent}55` }}
          >
            {data?.title}
          </div>
          {/* metadata — the trigger in plain words, e.g. "saturn in the 8th" */}
          {data?.src ? (
            <div
              className="mb-3.5 text-[10px] lowercase tracking-[1.5px]"
              style={{ color: "#6f6a60" }}
            >
              {data.src}
            </div>
          ) : (
            <div className="mb-3.5" />
          )}
          {/* body — the full authored text, present immediately */}
          <div
            className="whitespace-pre-wrap text-[15px] leading-relaxed"
            style={{ color: "#cfcbc1", minHeight: 54 }}
          >
            {data?.body}
          </div>

          {/* yes / no commands */}
          <div className="mt-6 flex gap-3">
            <CmdButton
              variant="yes"
              onClick={() => choose(true)}
              chosen={chosen === "yes"}
              dimmed={chosen === "no"}
            >
              yes
            </CmdButton>
            <CmdButton
              variant="no"
              onClick={() => choose(false)}
              chosen={chosen === "no"}
              dimmed={chosen === "yes"}
            >
              no
            </CmdButton>
          </div>
        </div>

        <style>{`@keyframes urpFadeIn { from { opacity: 0; } to { opacity: 1; } }`}</style>
      </div>
    </>
  )
}

function CmdButton({
  variant,
  onClick,
  children,
  chosen = false,
  dimmed = false,
}: {
  variant: "yes" | "no"
  onClick: () => void
  children: React.ReactNode
  /** This command was the one pressed — hold it lit while the panel lingers. */
  chosen?: boolean
  /** The OTHER command was pressed — recede so the choice reads clearly. */
  dimmed?: boolean
}) {
  const [hover, setHover] = useState(false)
  // `chosen` outranks hover: once pressed, the button stays lit even as the
  // pointer leaves, so the confirmation survives the whole linger window.
  const lit = hover || chosen
  const palette =
    variant === "yes"
      ? {
          color: lit ? "#8fe0a3" : "#5fa873",
          border: chosen ? "#5fa873" : lit ? "#3f8a55" : "#1f3a28",
          bg: chosen ? "rgba(95,168,115,.22)" : lit ? "rgba(95,168,115,.1)" : "transparent",
          glyph: "✓",
        }
      : {
          color: lit ? "#e88f9c" : "#b0606e",
          border: chosen ? "#b0606e" : lit ? "#8a3f4c" : "#3a1f24",
          bg: chosen ? "rgba(176,96,110,.22)" : lit ? "rgba(176,96,110,.1)" : "transparent",
          glyph: "✕",
        }
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      aria-pressed={chosen}
      className="flex-1 rounded-lg px-2.5 py-3 text-[13px] tracking-wide transition-all"
      style={{
        background: palette.bg,
        border: `1px solid ${palette.border}`,
        color: palette.color,
        fontFamily: "inherit",
        // The unpicked command fades back rather than disappearing, so the
        // panel doesn't visibly reflow while it's on its way out.
        opacity: dimmed ? 0.35 : 1,
        transform: chosen ? "scale(0.97)" : "scale(1)",
      }}
    >
      <span style={{ opacity: 0.5 }}>[</span> {palette.glyph} {children}{" "}
      <span style={{ opacity: 0.5 }}>]</span>
    </button>
  )
}
