"use client"

import { useEffect, useRef, useState } from "react"
import SelfAvatar, { type Mood } from "@/components/circle/SelfAvatar"
import { chartRead } from "@/lib/spiral/chart-read"
import { useReducedMotion } from "@/lib/use-reduced-motion"

const MONO =
  "'Geist Pixel', ui-monospace, monospace"
// Glowing-white accent — never gold.
const GLOW = { color: "#f5f5f5", textShadow: "0 0 10px rgba(255,255,255,0.45)" }
const TYPE_MS = 18

/**
 * A bottom sheet that opens when the SelfAvatar at the center of the spiral is
 * tapped. Shows a poetic chart "read" that PROPOSES rather than pronounces.
 * Styled to match the spiral's "A READ ABOUT YOU" terminal card: black card,
 * grey mono body typed behind a `›` prompt, bracketed commands. Always mounted
 * so it can animate both in and out; visibility is driven by `open`.
 */
export function AvatarReadSheet({
  open,
  onClose,
  mood = "idle",
  growth = 0.5,
}: {
  open: boolean
  onClose: () => void
  mood?: Mood
  growth?: number
}) {
  const [expanded, setExpanded] = useState(false)

  // Type the summary out (terminal voice) each time the sheet opens.
  const summaryText = chartRead.summary.text
  const [typed, setTyped] = useState(0)
  // Hydration-safe; see lib/use-reduced-motion.ts. Only read inside the
  // typewriter effect below, so the SSR'd markup never branches on it.
  const reduceMotion = useReducedMotion()

  useEffect(() => {
    if (!open) {
      setTyped(0)
      setExpanded(false)
      return
    }
    if (reduceMotion) {
      setTyped(summaryText.length)
      return
    }
    let i = 0
    let timer: ReturnType<typeof setTimeout>
    const tick = () => {
      i = Math.min(summaryText.length, i + 1)
      setTyped(i)
      if (i < summaryText.length) timer = setTimeout(tick, TYPE_MS)
    }
    timer = setTimeout(tick, 320)
    return () => clearTimeout(timer)
  }, [open, summaryText, reduceMotion])

  const typingDone = typed >= summaryText.length

  // Lightweight swipe-down-to-close.
  const startY = useRef<number | null>(null)
  const [dragY, setDragY] = useState(0)

  function onTouchStart(e: React.TouchEvent) {
    startY.current = e.touches[0].clientY
  }
  function onTouchMove(e: React.TouchEvent) {
    if (startY.current == null) return
    const delta = e.touches[0].clientY - startY.current
    setDragY(Math.max(0, delta))
  }
  function onTouchEnd() {
    if (dragY > 110) onClose()
    setDragY(0)
    startY.current = null
  }

  return (
    <div
      className={`fixed inset-0 z-50 ${open ? "" : "pointer-events-none"}`}
      aria-hidden={!open}
    >
      {/* Scrim: dim + blur, closes on tap */}
      <button
        aria-label="Close"
        onClick={onClose}
        className={`absolute inset-0 h-full w-full bg-background/70 backdrop-blur-sm transition-opacity duration-300 ${
          open ? "opacity-100" : "opacity-0"
        }`}
      />

      {/* Panel — terminal card */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Your chart"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        /* inset-x-2 rather than inset-x-0 + w-full, for the same reason as
           UniverseReadPanel: max-w-md only clamps above 448px, so on a phone
           this sheet was exactly viewport-width and its 1px side borders sat in
           the outermost pixel columns — the right one rounded away and the
           outline looked cut off down that edge. */
        className="absolute inset-x-2 bottom-0 mx-auto flex max-h-[88dvh] w-auto max-w-md flex-col overflow-hidden rounded-t-2xl"
        style={{
          background: "#070707",
          borderTop: "1px solid #1a1a1a",
          borderLeft: "1px solid #1a1a1a",
          borderRight: "1px solid #1a1a1a",
          fontFamily: MONO,
          transform: open ? `translateY(${dragY}px)` : "translateY(100%)",
          transition:
            dragY > 0 ? "none" : "transform 0.35s cubic-bezier(0.22,1,0.36,1)",
        }}
      >
        {/* Drag handle */}
        <div className="flex shrink-0 justify-center pb-1 pt-3">
          <span
            className="h-1 w-10 rounded-full"
            style={{ background: "#2a2a2a" }}
          />
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-10 pt-2">
          {/* Mini avatar */}
          <div className="flex justify-center">
            <SelfAvatar mood={mood} growth={growth} size={84} />
          </div>

          {/* meta line: eyebrow (left), terminal tag (right) */}
          <div
            className="mt-4 flex items-center justify-between"
            style={{
              fontSize: 10,
              letterSpacing: 2,
              textTransform: "uppercase",
              color: "#4a4a4a",
            }}
          >
            <span>{chartRead.eyebrow}</span>
            <span>read</span>
          </div>

          {/* Poetic summary, typed behind a › prompt, key phrase glowing white */}
          <div
            className="mt-4"
            style={{
              fontSize: 15,
              lineHeight: 1.6,
              letterSpacing: 0.4,
              color: "#9a9a9a",
              whiteSpace: "pre-wrap",
              minHeight: 72,
            }}
          >
            <span style={{ color: "#555" }}>{"› "}</span>
            <EmphasisTyped
              text={summaryText}
              emphasis={chartRead.summary.emphasis}
              count={typed}
            />
            {!typingDone && (
              <span
                style={{
                  display: "inline-block",
                  width: 8,
                  height: 16,
                  background: "#9a9a9a",
                  marginLeft: 1,
                  verticalAlign: -3,
                  animation: "arsBlink 1.05s steps(1) infinite",
                }}
              />
            )}
          </div>

          {/* Go deeper — bracketed terminal command */}
          <div
            className="mt-7"
            style={{
              opacity: typingDone ? 1 : 0,
              transition: "opacity .4s",
              pointerEvents: typingDone ? "auto" : "none",
            }}
          >
            <CommandButton
              onClick={() => setExpanded((v) => !v)}
              label={expanded ? "show less" : "go deeper"}
            />
          </div>

          {/* Full structured read — animates open via max-height */}
          <div
            className="overflow-hidden transition-[max-height,opacity] duration-500 ease-out"
            style={{
              maxHeight: expanded ? 2000 : 0,
              opacity: expanded ? 1 : 0,
            }}
          >
            <div className="mt-7 flex flex-col gap-6">
              {chartRead.sections.map((s) => (
                <section key={s.label}>
                  <div
                    className="flex items-baseline justify-between gap-3 pb-2"
                    style={{ borderBottom: "1px solid #1a1a1a" }}
                  >
                    <span
                      style={{
                        fontSize: 10,
                        letterSpacing: 2,
                        textTransform: "uppercase",
                        color: "#4a4a4a",
                      }}
                    >
                      {s.label}
                    </span>
                    <span
                      className="text-right"
                      style={{ ...GLOW, fontSize: 11, letterSpacing: 0.5 }}
                    >
                      {s.value}
                    </span>
                  </div>
                  <p
                    className="mt-3"
                    style={{
                      fontSize: 13.5,
                      lineHeight: 1.65,
                      letterSpacing: 0.3,
                      color: "#8a8a8a",
                    }}
                  >
                    <span style={{ color: "#555" }}>{"› "}</span>
                    {s.body}
                  </p>
                </section>
              ))}
            </div>
          </div>

          {/* Closing guardrail line */}
          <p
            className="mt-9"
            style={{
              fontSize: 10,
              lineHeight: 1.7,
              letterSpacing: 1,
              color: "#555",
            }}
          >
            {chartRead.closing}
          </p>
        </div>

        <style>{`@keyframes arsBlink { 50% { opacity: 0; } }`}</style>
      </div>
    </div>
  )
}

function CommandButton({
  onClick,
  label,
}: {
  onClick: () => void
  label: string
}) {
  const [hover, setHover] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        fontFamily: "inherit",
        fontSize: 12,
        letterSpacing: 1,
        border: `1px solid ${hover ? "#3a3a3a" : "#1f1f1f"}`,
        borderRadius: 8,
        padding: "11px 16px",
        cursor: "pointer",
        background: hover ? "rgba(255,255,255,0.03)" : "transparent",
        color: hover ? "#cfcfcf" : "#7a7a7a",
        transition: "all .16s",
        width: "100%",
        textAlign: "center",
      }}
    >
      <span style={{ opacity: 0.5 }}>[</span> {label}{" "}
      <span style={{ opacity: 0.5 }}>]</span>
    </button>
  )
}

/** Types out `text` to `count` characters, glowing-white on the `emphasis`
 *  substring once it is revealed. */
function EmphasisTyped({
  text,
  emphasis,
  count,
}: {
  text: string
  emphasis: string
  count: number
}) {
  const shown = text.slice(0, count)
  const idx = text.indexOf(emphasis)
  if (idx === -1) return <>{shown}</>

  const end = idx + emphasis.length
  const before = shown.slice(0, Math.min(count, idx))
  const mid = count > idx ? shown.slice(idx, Math.min(count, end)) : ""
  const after = count > end ? shown.slice(end) : ""

  return (
    <>
      {before}
      {mid && <span style={GLOW}>{mid}</span>}
      {after}
    </>
  )
}
