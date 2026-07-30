"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import {
  LED_FIELD_GRID_ALPHA,
  LED_FIELD_STRIPE_BOOST,
  ledTexture,
} from "@/lib/ui/led"

/**
 * UniverseReadPanel
 *
 * A terminal-styled panel that slides up from the bottom when an object in the
 * SpiralUniverse is tapped. Mirrors the ReadHub voice: a small lowercase title,
 * a dim metadata line, the full body text (no typing animation — the whole
 * content fades in ~200ms), and [ ✓ yes ] / [ × no ] commands. Closes on
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
  answered = null,
  onJudge,
  onClose,
  stage,
}: {
  data: PanelData | null
  /**
   * The verdict this read already carried when it was opened, or null for a
   * first-time read. When set, the panel opens in its ANSWERED state — showing
   * what the user said instead of two live commands — with an edit affordance
   * to change it. Captured at open time by the parent, so it never flips
   * mid-linger right after a fresh press.
   */
  answered?: "agree" | "disagree" | null
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

  /**
   * Re-entry guard. This has to be a ref, not the `chosen` state above.
   *
   * `setChosen` is batched, so several clicks dispatched within one tick all
   * observe the pre-update closure where `chosen` is still null — a state check
   * lets every one of them through. Measured: five fast taps sent five
   * judgements even with the state guard in place. A ref mutates synchronously,
   * so the second tap sees the latch the first tap set.
   */
  const lockedRef = useRef(false)

  /**
   * True once the user asks to change an already-answered read, which swaps the
   * answered summary back to the two live commands. Reset per read below, so
   * reopening a read always starts from the calm answered state.
   */
  const [editing, setEditing] = useState(false)

  const choose = useCallback(
    (agree: boolean) => {
      if (lockedRef.current) return
      lockedRef.current = true
      setChosen(agree ? "yes" : "no")
      onJudge(agree)
    },
    [onJudge],
  )

  // Reset the drag offset (and the latched choice) whenever new content arrives.
  useEffect(() => {
    if (data) {
      setDragY(0)
      setChosen(null)
      setEditing(false)
      lockedRef.current = false
    }
  }, [data])

  // Height of the "sky" — the dark region between the viewport top and the
  // panel's top edge. The stage fills it so the creature centers vertically
  // between the two. Re-measured whenever the panel's content resizes.
  const [skyH, setSkyH] = useState(0)
  /**
   * The panel's left and right edges in viewport px.
   *
   * Needed because the LED overlay now spans the FULL viewport and cuts the
   * sheet out of itself, rather than stopping above it — that cutout has to know
   * where the sheet actually is. Measured rather than recomputed from
   * `inset-x-2` / `max-w-[440px]`, so the two can't drift apart.
   */
  const [panelX, setPanelX] = useState<{ left: number; right: number } | null>(
    null,
  )
  useEffect(() => {
    if (!open) return
    const el = panelRef.current
    if (!el) return
    const measure = () => {
      setSkyH(Math.max(0, window.innerHeight - el.offsetHeight))
      const r = el.getBoundingClientRect()
      setPanelX({ left: r.left, right: r.right })
    }
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
      {/* Read-phase field: opaque black carrying the LED texture, edge to edge.

          z-[70] is deliberate. This panel renders INSIDE SpiralUniverse, whose
          own layers go up to z-[60] — the spiral-centre avatar, an opaque black
          disc with the little creature on it. That disc is the "circle" that was
          still visible behind and below the face during a read, so the field has
          to outrank it; anything at or under 60 paints beneath it.

          It still passes UNDER the header. CircleView puts the whole spiral in a
          `relative z-10` wrapper and the header in a sibling `relative z-30`, so
          every z-index in here — 70 included — is trapped below the header's
          stacking context. That gets the texture running behind BACK/MENU rather
          than stopping short and leaving them on bare black, without needing to
          coordinate values with the header.

          Being fully opaque is what hides the sky. The scrim used to do this at
          55% black with a 2px backdrop blur, which left the spiral and its
          markers faintly legible behind the read.

          It carries NO texture — only the black. The texture lives entirely in
          the single overlay below. When both painted it, every region the
          overlay reached got two composited passes while the strip beside the
          sheet got one, which is exactly the tone difference around the text
          box. */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-[70] transition-opacity duration-300"
        style={{
          backgroundColor: "#000",
          opacity: open ? 1 : 0,
        }}
      />

      {/* Scrim — now purely the tap target. It carries no colour of its own:
          the field above is already opaque, so tinting here would only darken
          the texture (and dim the header, which sits under this layer). */}
      <button
        aria-hidden={!open}
        tabIndex={-1}
        onClick={onClose}
        className="fixed inset-0 z-[80] cursor-default"
        style={{
          background: "transparent",
          pointerEvents: open ? "auto" : "none",
        }}
      />

      {/* The same LED texture again, this time IN FRONT of the creature, so the
          avatar sits behind the screen's glass instead of floating on top of it.

          Why a second layer instead of the field doing both: the stage creature
          is rendered inside the panel (z-[90]), which outranks the field
          (z-[70]), so the field can only ever pass behind it.

          Two things make this safe rather than a repeat of the double-grid
          moiré that made the creature drop its own `lcd`:

          1. It is anchored to the viewport at top:0, exactly like the field, so
             both grids share an origin and the 2px lines land in the same
             columns/rows. One continuous screen, no seam where they meet, no
             beat pattern where they overlap.
          2. It is a SIBLING of the panel, never a child. The panel is
             transformed (translateY), and a transform makes it the containing
             block for fixed descendants — a `fixed inset-0` layer inside it
             would resolve against the panel box and drift with the slide,
             breaking the shared origin.

          It spans the FULL viewport and clips the sheet out of itself, instead
          of being a strip that stops at the sheet's top edge. As a strip it left
          the columns either side of the sheet uncovered, and since the field was
          also painting texture back then those columns got one pass where the
          sky got two — a darker, flatter band around the text box with a hard
          seam along the sheet's top. Now one layer covers every visible pixel of
          screen in a single pass, so the tone is identical from the very top
          down past the sheet's shoulders to the bottom corners.

          The cutout is a U-shaped polygon rather than a smaller rectangle
          because the sheet is flush with the bottom edge: trace the viewport,
          then dive down its left side, across its top, and back up its right.
          `clip-path` doesn't move the background origin, so the grid stays
          locked to the viewport on both sides of the cut and the lines continue
          straight past the sheet without a jog.

          Clipping (not just stopping above) is what keeps this off the sheet
          itself, whose chrome carries its own texture — the one place a second
          grid really would double up.

          Background is transparent: the field supplies the black. Any fill here
          would hide the avatar rather than veil it. */}
      {open && skyH > 0 && panelX && (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 z-[95]"
          style={{
            backgroundImage: ledTexture(
              LED_FIELD_GRID_ALPHA,
              LED_FIELD_STRIPE_BOOST,
            ),
            clipPath: `polygon(
              0 0,
              100% 0,
              100% 100%,
              ${panelX.right}px 100%,
              ${panelX.right}px ${skyH + dragY}px,
              ${panelX.left}px ${skyH + dragY}px,
              ${panelX.left}px 100%,
              0 100%
            )`,
          }}
        />
      )}

      {/* Panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-hidden={!open}
        /**
         * `inset-x-2` (not `inset-x-0 w-full`) so the 1px side borders are
         * always INSIDE the viewport.
         *
         * max-w-[440px] only clamps above 440px, so on every phone the panel
         * was exactly viewport-width — its left border sat in pixel column 0
         * and its right border in the very last column. Measured at 322px:
         * left 0, right 322, clientWidth 322. No overflow, but the right
         * border landed on the final sub-pixel boundary and rounded away, so
         * the outline looked cut off down that side while the left survived.
         *
         * An 8px gutter each side costs almost no reading width and keeps the
         * bottom flush, so it still reads as a sheet rising from the edge.
         */
        /* z-[90]: above both the read-phase field (70) and the scrim (80),
           which were raised past SpiralUniverse's own z-[60] layers. */
        className="fixed inset-x-2 bottom-0 z-[90] mx-auto w-auto max-w-[440px]"
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

          {/* A read already answered shows WHAT was said and offers a change,
              rather than two live commands that hide the existing choice.
              `chosen` takes precedence so a fresh press still gets its own
              confirmation, even when re-answering. */}
          {answered && !editing && !chosen ? (
            <AnsweredSummary
              verdict={answered}
              onEdit={() => setEditing(true)}
            />
          ) : (
            /* yes / no commands */
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
          )}
        </div>

        <style>{`@keyframes urpFadeIn { from { opacity: 0; } to { opacity: 1; } }`}</style>
      </div>
    </>
  )
}

/**
 * The answered state: a quiet row stating the verdict the user already gave,
 * in the same green/rose language as the commands it replaces, plus an edit
 * affordance. Deliberately calm — this is a record, not a prompt.
 */
function AnsweredSummary({
  verdict,
  onEdit,
}: {
  verdict: "agree" | "disagree"
  onEdit: () => void
}) {
  const yes = verdict === "agree"
  // Same palette the yes/no commands use, so the record reads as the same
  // system rather than new chrome.
  const c = yes ? "#5fa873" : "#b0606e"
  return (
    <div
      className="mt-6 flex items-center justify-between gap-3 rounded-lg px-3 py-3"
      style={{ border: `1px solid ${c}55`, background: `${c}14` }}
    >
      <span
        className="text-[12.5px] lowercase tracking-[1px]"
        style={{ color: c }}
      >
        {/* U+00D7, not U+2715: the pixel font has no glyph for the heavy
            multiplication X and renders a tofu box instead. */}
        <span style={{ opacity: 0.5 }}>[</span> {yes ? "\u2713" : "\u00D7"} you
        said {yes ? "yes" : "no"} <span style={{ opacity: 0.5 }}>]</span>
      </span>
      <button
        type="button"
        onClick={onEdit}
        className="shrink-0 rounded-md px-2 py-1 text-[10px] uppercase tracking-[1.5px]"
        style={{
          color: "#8a8578",
          background: "transparent",
          border: "1px solid #2a2a2a",
          fontFamily: "inherit",
          cursor: "pointer",
          transition: "color .18s ease, border-color .18s ease",
        }}
      >
        edit
      </button>
    </div>
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
          // U+00D7 rather than U+2715 — the pixel font ships no glyph for the
          // heavy X, so the button was rendering a tofu box next to "no".
          glyph: "\u00D7",
        }
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      aria-pressed={chosen}
      className="flex-1 rounded-lg px-2.5 py-3 text-[13px] tracking-wide"
      style={{
        background: palette.bg,
        border: `1px solid ${palette.border}`,
        color: palette.color,
        fontFamily: "inherit",
        /**
         * The confirmation must SNAP; only hover eases.
         *
         * With a blanket `transition-all`, the pressed styles animated in over
         * the default duration, so even though React committed the new state on
         * the next frame (~20ms) the button still LOOKED untouched — the green
         * wash didn't finish arriving until ~460ms. Since a press is meant to
         * feel instantaneous, `chosen` paints with no transition at all and the
         * idle/hover states keep their soft fade.
         */
        transition: chosen ? "none" : "background .18s ease, border-color .18s ease, color .18s ease, opacity .18s ease",
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
