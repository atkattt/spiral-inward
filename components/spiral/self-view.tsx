"use client"

import { useState } from "react"
import { useSpiral } from "@/components/spiral/spiral-provider"
import type { Truth } from "@/lib/spiral/reads"

// The /self page's visual idiom, matched exactly: #070707 panels with
// #1a1a1a hairlines (rounded-2xl), tiny uppercase #4a4a4a section labels,
// 13.5px mono body in dim greys with "›" prefixes.
const MONO = "'Geist Pixel', ui-monospace, monospace"

// Same surface as /self's locked-chat panel.
const panelStyle: React.CSSProperties = {
  borderRadius: 16,
  border: "1px solid #1a1a1a",
  background: "#070707",
  padding: 16,
}

// Quiet uppercase micro-actions — the same register as /self's tiny labels
// ("back", section labels, "% toward opening").
const actionStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  padding: 0,
  cursor: "pointer",
  fontFamily: MONO,
  fontSize: 10,
  letterSpacing: 2,
  textTransform: "uppercase",
  color: "#6a6a6a",
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        fontSize: 10,
        letterSpacing: 2,
        textTransform: "uppercase",
        color: "#4a4a4a",
        fontFamily: MONO,
      }}
    >
      {children}
    </span>
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

  // An embeddable section (no page shell) — it lives inside /self's layout.
  // The whole "what you know" block sits in its own curved card, the same
  // rounded idiom the onboarding ritual card uses.
  return (
    <section
      className="flex flex-col gap-6"
      style={{
        background: "#070707",
        border: "1px solid #1a1a1a",
        borderRadius: 28,
        padding: 20,
      }}
    >
      {/* 1 — Section intro, in /self's mono subline voice */}
      <div className="flex flex-col gap-3">
        <SectionLabel>what you know</SectionLabel>
        <p
          style={{
            fontSize: 13.5,
            lineHeight: 1.65,
            letterSpacing: 0.3,
            color: "#6a6a6a",
            fontFamily: MONO,
          }}
        >
          <span style={{ color: "#555" }}>{"› "}</span>
          write anything you know about yourself. a trait, a habit, a
          feeling. whatever you add here shapes your chart.
        </p>
      </div>

      {/* 2 — The composer */}
      <div style={panelStyle}>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          placeholder="i'm someone who…"
          className="w-full resize-none bg-transparent outline-none placeholder:text-[#4a4a4a]"
          style={{
            fontFamily: MONO,
            fontSize: 13.5,
            letterSpacing: 0.3,
            lineHeight: 1.65,
            color: "#e8e4da",
            caretColor: "#e8e4da",
          }}
        />
        <div
          className="mt-3 flex items-center justify-center pt-3"
          style={{ borderTop: "1px solid #1a1a1a" }}
        >
          <button
            onClick={handleSubmit}
            disabled={!text.trim()}
            style={{
              background: "transparent",
              border: `1px solid ${text.trim() ? "#f5f5f5" : "#2a2a2a"}`,
              color: text.trim() ? "#f5f5f5" : "#4a4a4a",
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
        style={{ ...panelStyle, border: "1px solid #2a2a2a" }}
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
              color: "#4a4a4a",
            }}
          >
            {markLabel && (
              <span style={{ color: "#6a6a6a" }}>your self holds this</span>
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
                fontFamily: MONO,
                fontSize: 13.5,
                letterSpacing: 0.3,
                lineHeight: 1.65,
                color: "#e8e4da",
                caretColor: "#e8e4da",
              }}
            />
            <div className="mt-2 flex gap-5">
              <button
                onClick={saveEdit}
                style={{ ...actionStyle, color: "#f5f5f5" }}
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
                fontFamily: MONO,
                fontSize: 13.5,
                letterSpacing: 0.3,
                lineHeight: 1.65,
                color: "#e8e4da",
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
                    color: "#8a8a8a",
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
                      color: sending ? "#f5f5f5" : "#8a8a8a",
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
