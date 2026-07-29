"use client"

import { useEffect, useMemo, useRef, useState } from "react"
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

/**
 * `instant` renders every card fully typed out, with no animation and no
 * cursor. Used by /about, where the copy is reference material someone opened
 * deliberately — waiting for it to type itself out is friction. The threshold
 * screen leaves it off, where the typing is part of the first-run moment.
 */
export function StoryReadCards({ instant = false }: { instant?: boolean }) {
  return (
    <div className="mt-8 flex flex-col gap-5">
      {STORY_SECTIONS.map((section, i) => (
        <StoryReadCard
          key={section.title}
          section={section}
          index={i}
          total={STORY_SECTIONS.length}
          instant={instant}
        />
      ))}
    </div>
  )
}

function StoryReadCard({
  section,
  index,
  total,
  instant,
}: {
  section: StorySection
  index: number
  total: number
  instant: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  const fullLen = useMemo(
    () => section.body.reduce((n, s) => n + s.text.length, 0),
    [section],
  )
  // Seeded full when instant, so the copy is in the very first render (and in
  // the server-rendered HTML) rather than being filled in after mount.
  const [count, setCount] = useState(instant ? fullLen : 0)
  const [started, setStarted] = useState(false)

  const reduceMotion =
    typeof window !== "undefined" &&
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches

  // Begin typing when the card scrolls into view.
  useEffect(() => {
    if (instant || reduceMotion) {
      setCount(fullLen)
      return
    }
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setStarted(true)
          io.disconnect()
        }
      },
      { threshold: 0.35 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [fullLen, reduceMotion, instant])

  // Reveal characters once started.
  useEffect(() => {
    if (!started) return
    let i = 0
    let timer: ReturnType<typeof setTimeout>
    const tick = () => {
      i = Math.min(fullLen, i + CHARS_PER_TICK)
      setCount(i)
      if (i < fullLen) timer = setTimeout(tick, TYPE_MS)
    }
    timer = setTimeout(tick, 160)
    return () => clearTimeout(timer)
  }, [started, fullLen])

  const typing = count < fullLen

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
