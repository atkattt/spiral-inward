"use client"

import { useEffect, useRef, useState } from "react"
import { useSpiral } from "@/components/spiral/spiral-provider"
import type { Truth } from "@/lib/spiral/reads"
import { glassPanelStyle } from "@/lib/ui/glass"

// This section is treated exactly like the "what this is" story cards on
// /about (see components/threshold/story-read-cards.tsx): a translucent grey
// glass card, a bold white uppercase meta label, and 12px body text that types
// itself out behind a `›` prompt with a blinking cursor.
const MONO = "'Geist Pixel', ui-monospace, monospace"

// The story card's glass surface, now from the shared token rather than a
// third hand-copy of the same numbers.
const glassCardStyle: React.CSSProperties = {
  ...glassPanelStyle,
  padding: "16px 18px 18px",
  fontFamily: MONO,
}

// Body copy inside a glass card.
const glassBodyStyle: React.CSSProperties = {
  fontSize: 12,
  lineHeight: 1.6,
  letterSpacing: 0.4,
  color: "#f0f0f0",
  fontFamily: MONO,
  fontWeight: 500,
}

// Wells that sit *inside* the glass (composer, kept entries): recessed rather
// than opaque black, so they read as part of the same pane of glass.
const panelStyle: React.CSSProperties = {
  borderRadius: 11,
  border: "1px solid rgba(255,255,255,0.14)",
  background: "rgba(0,0,0,0.28)",
  padding: 16,
}

const HAIRLINE = "rgba(255,255,255,0.14)"

// Quiet uppercase micro-actions, lifted to read against the glass.
const actionStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  padding: 0,
  cursor: "pointer",
  fontFamily: MONO,
  fontSize: 10,
  letterSpacing: 2,
  textTransform: "uppercase",
  color: "rgba(255,255,255,0.7)",
}

/** The story card's meta line: small, wide-tracked, bold, white. */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        fontSize: 10,
        letterSpacing: 2,
        textTransform: "uppercase",
        color: "#ffffff",
        fontWeight: 700,
        fontFamily: MONO,
      }}
    >
      {children}
    </span>
  )
}

/**
 * The story cards' signature: the body types itself in once the card is in
 * view, behind a `›` prompt, with a blinking block cursor while it runs.
 * Renders instantly under prefers-reduced-motion.
 */
function TypedLine({ text }: { text: string }) {
  const ref = useRef<HTMLParagraphElement>(null)
  const [count, setCount] = useState(0)
  const [started, setStarted] = useState(false)

  useEffect(() => {
    if (
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ||
      !ref.current
    ) {
      setCount(text.length)
      return
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setStarted(true)
          io.disconnect()
        }
      },
      { threshold: 0.35 },
    )
    io.observe(ref.current)
    return () => io.disconnect()
  }, [text.length])

  useEffect(() => {
    if (!started) return
    let i = 0
    let timer: ReturnType<typeof setTimeout>
    const tick = () => {
      i = Math.min(text.length, i + 2)
      setCount(i)
      if (i < text.length) timer = setTimeout(tick, 14)
    }
    timer = setTimeout(tick, 160)
    return () => clearTimeout(timer)
  }, [started, text.length])

  const typing = count < text.length

  return (
    <p ref={ref} style={{ ...glassBodyStyle, whiteSpace: "pre-wrap" }}>
      <span style={{ color: "#cfcfcf" }}>{"› "}</span>
      {text.slice(0, count)}
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
      <style>{`@keyframes srcBlink { 50% { opacity: 0; } }`}</style>
    </p>
  )
}

export function SelfView() {
  const { truths, addTruth } = useSpiral()
  const [text, setText] = useState("")

  function handleSubmit() {
    const trimmed = text.trim()
    if (!trimmed) return
    addTruth(trimmed, "about-me")
    setText("")
  }

  // An embeddable section (no page shell) — it lives inside /self's layout,
  // presented as a story-style glass read card.
  return (
    <section className="flex flex-col gap-6" style={glassCardStyle}>
      {/* 1 — Meta line + typed intro, exactly the story card's opening */}
      <div className="flex flex-col gap-4">
        <SectionLabel>what you know</SectionLabel>
        <TypedLine text="write anything you know about yourself. a trait, a habit, a feeling. whatever you add here shapes your chart." />
      </div>

      {/* 2 — The composer */}
      <div style={panelStyle}>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          placeholder="i'm someone who…"
          className="w-full resize-none bg-transparent outline-none placeholder:text-white/40"
          style={{
            ...glassBodyStyle,
            color: "#ffffff",
            caretColor: "#ffffff",
          }}
        />
        <div
          className="mt-3 flex items-center justify-center pt-3"
          style={{ borderTop: `1px solid ${HAIRLINE}` }}
        >
          <button
            onClick={handleSubmit}
            disabled={!text.trim()}
            style={{
              background: "transparent",
              border: `1px solid ${
                text.trim() ? "#ffffff" : "rgba(255,255,255,0.25)"
              }`,
              color: text.trim() ? "#ffffff" : "rgba(255,255,255,0.45)",
              fontFamily: MONO,
              fontSize: 10,
              letterSpacing: 2,
              textTransform: "uppercase",
              padding: "9px 18px",
              borderRadius: 30,
              cursor: text.trim() ? "pointer" : "default",
              transition: "border-color .2s, color .2s",
              whiteSpace: "nowrap",
            }}
          >
            add to spiral
          </button>
        </div>
      </div>

      {/* 3 — Kept entries. Saving quietly settles the entry into the list —
          no sky commentary. Tap (mobile) or hover (desktop) an entry to
          reveal its three quiet actions. */}
      {truths.length > 0 && (
        <div className="flex flex-col gap-3">
          <SectionLabel>kept</SectionLabel>
          <ul className="flex flex-col gap-4">
            {truths.map((t) => (
              <EntryCard key={t.id} truth={t} />
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

// The creature's minimal face, as a tiny inline glyph — its eyes ("o o" at
// full size) reduced to two dots. Used as the send action's icon and as the
// permanent dim mark a sent entry wears.
const FACE_GLYPH = "[..]"

/**
 * One kept entry. The card is the user's words alone; actions stay hidden
 * until hover (desktop) or tap (mobile — first tap reveals, actions then
 * work normally). "send to your self" hands the entry to the self — the
 * text briefly drifts toward the action, then the entry stays, wearing a
 * small dim creature-face mark. Edit swaps the text for an inline textarea
 * on the same card; delete asks "let this one go?" in place.
 */
function EntryCard({ truth }: { truth: Truth }) {
  const { editTruth, deleteTruth, sendTruth } = useSpiral()
  const [revealed, setRevealed] = useState(false)
  const [mode, setMode] = useState<"view" | "edit" | "confirm-delete">("view")
  const [draft, setDraft] = useState(truth.text)
  // "sending" plays the essence-travel animation before the mark settles in.
  const [sending, setSending] = useState(false)
  const [markLabel, setMarkLabel] = useState(false)

  function startSend() {
    if (truth.sentToSelf || sending) return
    setSending(true)
    // Let the drift + pulse play, then commit — the mark fades in with the
    // state change.
    setTimeout(() => {
      sendTruth(truth.id)
      setSending(false)
    }, 700)
  }

  function saveEdit() {
    const trimmed = draft.trim()
    if (trimmed && trimmed !== truth.text) editTruth(truth.id, trimmed)
    setMode("view")
  }

  return (
    <li
      className="group animate-sky-beat"
      onMouseEnter={() => setRevealed(true)}
      onMouseLeave={() => mode === "view" && setRevealed(false)}
    >
      <div
        className="relative"
        style={{ ...panelStyle, border: "1px solid rgba(255,255,255,0.2)" }}
        onClick={() => !revealed && setRevealed(true)}
      >
        {/* Permanent mark on a sent entry: the tiny creature face, dim, in
            the corner. Tap it to see what it means. */}
        {truth.sentToSelf && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              setMarkLabel((v) => !v)
            }}
            aria-label="your self holds this"
            className="absolute right-3 top-2.5 flex items-center gap-2"
            style={{
              background: "none",
              border: "none",
              padding: 0,
              cursor: "pointer",
              fontFamily: MONO,
              fontSize: 10,
              letterSpacing: 1,
              color: "rgba(255,255,255,0.5)",
            }}
          >
            {markLabel && (
              <span style={{ color: "rgba(255,255,255,0.7)" }}>
                your self holds this
              </span>
            )}
            {FACE_GLYPH}
          </button>
        )}

        {mode === "edit" ? (
          <>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={3}
              autoFocus
              className="w-full resize-none bg-transparent outline-none"
              style={{
                ...glassBodyStyle,
                color: "#ffffff",
                caretColor: "#ffffff",
              }}
            />
            <div className="mt-2 flex gap-5">
              <button
                onClick={saveEdit}
                style={{ ...actionStyle, color: "#ffffff" }}
              >
                save
              </button>
              <button
                onClick={() => {
                  setDraft(truth.text)
                  setMode("view")
                }}
                style={actionStyle}
              >
                cancel
              </button>
            </div>
          </>
        ) : (
          <>
            <p
              className={`text-pretty ${sending ? "animate-send-essence" : ""}`}
              style={{
                ...glassBodyStyle,
                paddingRight: truth.sentToSelf ? 36 : undefined,
              }}
            >
              {truth.text}
            </p>

            {mode === "confirm-delete" ? (
              <div className="mt-3 flex items-center gap-5">
                <span
                  style={{
                    fontFamily: MONO,
                    fontSize: 11,
                    letterSpacing: 1,
                    color: "rgba(255,255,255,0.8)",
                  }}
                >
                  let this one go?
                </span>
                <button
                  onClick={() => deleteTruth(truth.id)}
                  style={{ ...actionStyle, color: "#d98a9a" }}
                >
                  yes
                </button>
                <button onClick={() => setMode("view")} style={actionStyle}>
                  no
                </button>
              </div>
            ) : (
              <div
                className={`mt-3 flex items-center gap-5 transition-opacity duration-200 md:opacity-0 md:group-hover:opacity-100 ${
                  revealed ? "opacity-100" : "opacity-0"
                }`}
              >
                {!truth.sentToSelf && (
                  <button
                    onClick={startSend}
                    disabled={sending}
                    className="inline-flex items-center gap-1.5"
                    style={{
                      ...actionStyle,
                      color: sending ? "#ffffff" : "rgba(255,255,255,0.7)",
                    }}
                  >
                    <span aria-hidden="true">{FACE_GLYPH}</span>
                    send to your self
                  </button>
                )}
                <button
                  onClick={() => {
                    setDraft(truth.text)
                    setMode("edit")
                  }}
                  style={actionStyle}
                >
                  edit
                </button>
                <button
                  onClick={() => setMode("confirm-delete")}
                  style={actionStyle}
                >
                  delete
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </li>
  )
}
