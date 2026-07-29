"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { STORY_SECTIONS, type StorySection } from "@/components/threshold/story-content"

/**
 * StoryReadCards
 * Renders the project story as terminal "read" cards that match the spiral's
 * "A READ ABOUT YOU" component: a dark bordered card, a mono uppercase meta
 * line with a counter, and grey mono body text that types itself out behind a
 * `›` prompt with a blinking cursor. Each card types when it scrolls into view.
 */

// Everything renders in Geist Pixel now. Kept as named constants so both the
// card and its inner text share the same typeface.
const MONO = '"Geist Pixel", sans-serif'
const PIXEL = '"Geist Pixel", sans-serif'
const TYPE_MS = 14
const CHARS_PER_TICK = 2
/** Beat between one card finishing and the next appearing. */
const HANDOFF_MS = 460

/**
 * `instant` renders every card fully typed out, with no animation and no
 * cursor. Used by /about, where the copy is reference material someone opened
 * deliberately — waiting for it to type itself out is friction. The threshold
 * screen leaves it off, where the typing is part of the first-run moment.
 */
export function StoryReadCards({
  instant = false,
  onAllDone,
}: {
  instant?: boolean
  /** Fires once every card has finished typing. The threshold screen uses this
   *  to stop the circle's loading sweep and reveal the CTA. */
  onAllDone?: () => void
}) {
  const total = STORY_SECTIONS.length
  const wrapRef = useRef<HTMLDivElement>(null)

  // Cards are now revealed as a SEQUENCE owned here rather than each card
  // watching the viewport on its own: card n types, and only when it finishes
  // does card n+1 appear and start. `doneCount` is how many have completed, so
  // the card at index === doneCount is the one currently typing.
  const [doneCount, setDoneCount] = useState(0)
  // The sequence waits for the block to scroll into view, so the copy isn't
  // already typed out by the time the user scrolls down to it.
  const [started, setStarted] = useState(false)
  // Read in an effect, not during render: using it to decide what to render
  // would disagree with the server's HTML and break hydration.
  const [reduceMotion, setReduceMotion] = useState(false)

  useEffect(() => {
    setReduceMotion(
      typeof window !== "undefined" &&
        !!window.matchMedia &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    )
  }, [])

  const sequential = !instant && !reduceMotion

  useEffect(() => {
    if (!sequential) return
    const el = wrapRef.current
    if (!el) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setStarted(true)
          io.disconnect()
        }
      },
      { threshold: 0.1 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [sequential])

  const advance = useCallback((index: number) => {
    // Guard with max() so a late timer from an unmounted/replayed card can
    // never walk the sequence backwards.
    setDoneCount((c) => Math.max(c, index + 1))
  }, [])

  // Held in a ref so a changing parent callback identity can't re-fire this.
  const allDoneRef = useRef(onAllDone)
  useEffect(() => {
    allDoneRef.current = onAllDone
  }, [onAllDone])

  // Signal completion. When not sequential (instant / reduced motion) there is
  // no typing to wait for, so everything is already "done" immediately —
  // otherwise the CTA would never appear for those users.
  const complete = !sequential || doneCount >= total
  useEffect(() => {
    if (complete) allDoneRef.current?.()
  }, [complete])

  return (
    <div ref={wrapRef} className="mt-8 flex flex-col gap-5">
      {STORY_SECTIONS.map((section, i) => {
        // Not yet this card's turn — keep it out of the flow entirely so it
        // "appears" on cue instead of sitting there empty.
        if (sequential && i > doneCount) return null
        return (
          <StoryReadCard
            key={section.title}
            section={section}
            index={i}
            instant={!sequential}
            active={sequential ? started && i === doneCount : false}
            appear={sequential && i > 0}
            onDone={advance}
          />
        )
      })}

      <style>{`
        @keyframes srcCardIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: none; }
        }
      `}</style>
    </div>
  )
}

function StoryReadCard({
  section,
  index,
  instant,
  active,
  appear,
  onDone,
}: {
  section: StorySection
  index: number
  instant: boolean
  /** This card's turn: type now. */
  active: boolean
  /** Fade/rise in on arrival (every card except the first). */
  appear: boolean
  /** Called once the last character lands, handing the turn to the next card. */
  onDone: (index: number) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const fullLen = useMemo(
    () => section.body.reduce((n, s) => n + s.text.length, 0),
    [section],
  )
  // Seeded full when instant, so the copy is in the very first render (and in
  // the server-rendered HTML) rather than being filled in after mount.
  const [count, setCount] = useState(instant ? fullLen : 0)

  // Keeps the completion callback out of the typing effect's dependencies, so a
  // new function identity from the parent can't restart the animation midway.
  const doneRef = useRef(onDone)
  useEffect(() => {
    doneRef.current = onDone
  }, [onDone])

  useEffect(() => {
    if (!instant) return
    setCount(fullLen)
  }, [instant, fullLen])

  // Type out this card, then hand off to the next one.
  useEffect(() => {
    if (instant || !active) return
    let i = 0
    let timer: ReturnType<typeof setTimeout>
    const tick = () => {
      i = Math.min(fullLen, i + CHARS_PER_TICK)
      setCount(i)
      if (i < fullLen) {
        timer = setTimeout(tick, TYPE_MS)
      } else {
        // Small beat on the finished card before the next one slides in, so the
        // sequence reads as deliberate rather than as one continuous scroll.
        timer = setTimeout(() => doneRef.current(index), HANDOFF_MS)
      }
    }
    timer = setTimeout(tick, 160)
    return () => clearTimeout(timer)
  }, [active, instant, fullLen, index])

  const typing = !instant && active && count < fullLen

  return (
    <div
      ref={ref}
      style={{
        width: "100%",
        // Translucent grey glass card to match the /onboarding surface.
        border: "1px solid rgba(255,255,255,0.18)",
        borderRadius: 13,
        background: "rgba(120,120,120,0.30)",
        backdropFilter: "blur(12px) saturate(120%)",
        WebkitBackdropFilter: "blur(12px) saturate(120%)",
        boxShadow:
          "0 16px 40px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.14)",
        padding: "16px 18px 18px",
        fontFamily: MONO,
        // Only the cards after the first animate in; the first is already on
        // screen when the sequence starts.
        animation: appear ? "srcCardIn .5s cubic-bezier(.22,.61,.36,1) both" : undefined,
      }}
    >
      {/* meta line: section title (left), index counter (right) */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: 10,
          letterSpacing: 2,
          textTransform: "uppercase",
          color: "#ffffff",
          marginBottom: 18,
          textAlign: "left",
          fontWeight: 700,
        }}
      >
        <span style={{ fontFamily: PIXEL }}>{section.title}</span>
      </div>

      {/* the typed body */}
      <div
        style={{
          fontSize: 12,
          lineHeight: 1.6,
          letterSpacing: 0.4,
          color: "#f0f0f0",
          fontFamily: PIXEL,
          fontWeight: 500,
          whiteSpace: "pre-wrap",
        }}
      >
        <span style={{ color: "#cfcfcf" }}>{"› "}</span>
        <TypedBody section={section} count={count} />
        {typing && (
          <span
            style={{
              display: "inline-block",
              width: 8,
              height: 16,
              background: "#ffffff",
              marginLeft: 1,
              verticalAlign: -3,
              animation: "srcBlink 1.05s steps(1) infinite",
            }}
          />
        )}
      </div>

      <style>{`@keyframes srcBlink { 50% { opacity: 0; } }`}</style>
    </div>
  )
}

/** Renders the first `count` characters across the section's segments,
 *  preserving glow / dim styling on the revealed slices. */
function TypedBody({ section, count }: { section: StorySection; count: number }) {
  const nodes: React.ReactNode[] = []
  let remaining = count
  for (let i = 0; i < section.body.length; i++) {
    if (remaining <= 0) break
    const seg = section.body[i]
    const slice = seg.text.slice(0, remaining)
    remaining -= slice.length
    const overrideStyle: Record<string, any> = {}
    if (seg.fontSize) overrideStyle.fontSize = seg.fontSize
    if (seg.lineHeight) overrideStyle.lineHeight = seg.lineHeight
    if (seg.glow) {
      nodes.push(
        <span
          key={i}
          style={{
            color: "#ffffff",
            fontWeight: 600,
            textShadow: "0 0 10px rgba(255,255,255,0.45)",
            ...overrideStyle,
          }}
        >
          {slice}
        </span>,
      )
    } else if (seg.dim) {
      nodes.push(
        <span
          key={i}
          style={{ color: "rgba(255,255,255,0.6)", fontStyle: "italic", ...overrideStyle }}
        >
          {slice}
        </span>,
      )
    } else {
      nodes.push(<span key={i} style={overrideStyle}>{slice}</span>)
    }
  }
  return <>{nodes}</>
}
