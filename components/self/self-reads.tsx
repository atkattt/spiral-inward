"use client"

import { useMemo, useState, useTransition } from "react"
import { saveSelfAnswer } from "@/app/actions/self-reads"
import {
  toQuestions,
  type FragmentRow,
  type SelfReadsData,
} from "@/lib/self/reads-data"
import {
  SECTION_COLORS,
  SECTION_ORDER,
  sectionFor,
  type SectionKey,
} from "@/lib/spiral/sections"

const MONO =
  "'Geist Pixel', ui-monospace, monospace"

/**
 * THE GROWING CHART — a reactive space, not a full dossier. Only reads the
 * user has APPROVED ("this fits", answered agree on the spiral) appear here,
 * so the chart assembles itself piece by piece as the journey is walked.
 * Boxes are grouped by chart section and carry the SAME accent colors as the
 * section's stars in /circle, so the two views stay one system.
 */
export function SelfReads({
  data,
  onAnswer,
}: {
  data: SelfReadsData
  /** fired when the user saves an answer (drives the creature reaction) */
  onAnswer?: (fragmentId: string) => void
}) {
  // Approved = agreed. Disagreed and unanswered reads stay invisible here —
  // the chart only ever contains what the user has claimed as theirs.
  const approved = useMemo(
    () =>
      data.matched.filter(
        (f) => data.responses[String(f.id)] === "agree",
      ),
    [data.matched, data.responses],
  )

  // Group by section in the spiral's fixed walking order.
  const groups = useMemo(() => {
    const bySection = new Map<SectionKey, FragmentRow[]>()
    for (const f of approved) {
      const key = sectionFor(
        (f as Record<string, unknown>).section as string | null,
        f.trigger_type,
        f.condition,
      )
      const list = bySection.get(key) ?? []
      list.push(f)
      bySection.set(key, list)
    }
    return SECTION_ORDER.filter((s) => bySection.has(s)).map((s) => ({
      section: s,
      color: SECTION_COLORS[s],
      fragments: bySection.get(s)!,
    }))
  }, [approved])

  const total = data.matched.length

  if (approved.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <LensProgress lens={data.lens} />
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
          nothing here yet. walk the spiral — every read you claim as yours
          appears here, and your chart builds itself.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4">
        <LensProgress lens={data.lens} />
        {/* quiet growth meter — how much of the chart has surfaced */}
        <p
          style={{
            fontSize: 10,
            letterSpacing: 1.5,
            textTransform: "uppercase",
            color: "#4a4a4a",
            fontFamily: MONO,
          }}
        >
          {approved.length} of {total} reads claimed
        </p>
      </div>

      {groups.map((g) => (
        <section key={g.section} className="flex flex-col gap-3">
          {/* section header — same accent as its stars on the spiral */}
          <div className="flex items-center gap-2">
            <SectionStar color={g.color} />
            <span
              style={{
                fontSize: 10,
                letterSpacing: 2,
                textTransform: "uppercase",
                color: g.color,
                fontFamily: MONO,
              }}
            >
              {g.section}
            </span>
            <span
              aria-hidden="true"
              className="h-px flex-1"
              style={{ background: `${g.color}33` }}
            />
          </div>

          <div className="flex flex-col gap-3">
            {g.fragments.map((f) => (
              <FragmentBox
                key={String(f.id)}
                fragment={f}
                color={g.color}
                initialAnswer={data.answers[String(f.id)] ?? ""}
                onAnswer={onAnswer}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

/**
 * Lens progression — a quiet line for the current lens, and the next lens as
 * a locked row underneath. A frontier lens (unlocked but no reads authored
 * yet) is shown as coming instead of a 0-of-0 count. Lowercase, no ceremony.
 */
function LensProgress({ lens }: { lens: SelfReadsData["lens"] }) {
  if (!lens) return null

  const line =
    lens.total > 0
      ? `${lens.current.name.toLowerCase()} · ${lens.answered} of ${lens.total} reads answered`
      : `${lens.current.name.toLowerCase()} · coming soon`

  return (
    <div className="flex flex-col gap-1.5">
      <p
        style={{
          fontSize: 10,
          letterSpacing: 1.5,
          color: "#6a6a6a",
          fontFamily: MONO,
        }}
      >
        {line}
      </p>
      {lens.total > 0 && lens.next && (
        <>
          <p
            style={{
              fontSize: 10,
              letterSpacing: 1.5,
              color: "#3a3a3a",
              fontFamily: MONO,
            }}
          >
            {lens.clearedProgress
              ? `${lens.next.name.toLowerCase()} — unlocks when every constellation is cleared`
              : `${lens.next.name.toLowerCase()} · unlocks as you answer more reads`}
          </p>
          {lens.clearedProgress && (
            <p
              style={{
                fontSize: 10,
                letterSpacing: 1.5,
                color: "#3a3a3a",
                fontFamily: MONO,
              }}
            >
              {lens.clearedProgress.done} of {lens.clearedProgress.total}{" "}
              cleared
            </p>
          )}
        </>
      )}
    </div>
  )
}

/** Small geometric star matching the spiral's major-read markers. */
function SectionStar({ color }: { color: string }) {
  return (
    <svg
      width={11}
      height={11}
      viewBox="0 0 24 24"
      fill={color}
      aria-hidden="true"
      style={{
        display: "block",
        filter: `drop-shadow(0 0 4px ${color}aa)`,
      }}
    >
      <path d="M12 1.8l3.1 7.2 7.8.66-5.92 5.13 1.78 7.62L12 18.34l-6.76 4.07 1.78-7.62L1.1 9.66l7.8-.66L12 1.8z" />
    </svg>
  )
}

/**
 * One claimed read — a chart box carrying its section's accent: tinted
 * border, colored glyph marker (star for majors, dot for minors), and the
 * reflection space underneath.
 */
function FragmentBox({
  fragment,
  color,
  initialAnswer,
  onAnswer,
}: {
  fragment: FragmentRow
  color: string
  initialAnswer: string
  onAnswer?: (fragmentId: string) => void
}) {
  const questions = toQuestions(fragment.self_questions)
  const isMajor = (fragment.weight ?? 0) >= 7

  return (
    <article
      className="flex flex-col gap-3 rounded-xl px-4 py-4"
      style={{
        background: "#070707",
        border: `1px solid ${color}2e`,
        boxShadow: `inset 2px 0 0 ${color}66`,
      }}
    >
      {fragment.title && (
        <h3
          className="flex items-baseline gap-2"
          style={{
            fontSize: 14,
            lineHeight: 1.5,
            letterSpacing: 0.4,
            fontFamily: MONO,
            color: "#f0ede6",
            textShadow: `0 0 10px ${color}44`,
          }}
        >
          <span aria-hidden="true" style={{ color, fontSize: 12 }}>
            {isMajor ? "\u2726" : "\u00b7"}
          </span>
          {fragment.title}
        </h3>
      )}
      {fragment.body && (
        <p
          style={{
            fontSize: 13,
            lineHeight: 1.7,
            letterSpacing: 0.3,
            color: "#9a9a9a",
            fontFamily: MONO,
          }}
        >
          {fragment.body}
        </p>
      )}

      {/* reflection — the user's own words, kept editable */}
      {questions.length > 0 && (
        <AnswerBlock
          fragmentId={String(fragment.id)}
          color={color}
          questions={questions}
          initialAnswer={initialAnswer}
          onAnswer={onAnswer}
        />
      )}
    </article>
  )
}

function AnswerBlock({
  fragmentId,
  color,
  questions,
  initialAnswer,
  onAnswer,
}: {
  fragmentId: string
  color: string
  questions: string[]
  initialAnswer: string
  onAnswer?: (fragmentId: string) => void
}) {
  const [answer, setAnswer] = useState(initialAnswer)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(initialAnswer)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function save() {
    const text = draft.trim()
    if (!text || pending) return
    setError(null)
    startTransition(async () => {
      const res = await saveSelfAnswer(fragmentId, text)
      if (res.ok) {
        setAnswer(text)
        setEditing(false)
        onAnswer?.(fragmentId) // animate the creature (soft shimmer)
      } else {
        setError(res.error)
      }
    })
  }

  // Collapsed prompt until they choose to reflect.
  if (!editing && answer.length === 0) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        style={{
          fontFamily: MONO,
          fontSize: 10,
          letterSpacing: 1.5,
          textTransform: "uppercase",
          color: `${color}99`,
          background: "transparent",
          border: "none",
          padding: 0,
          alignSelf: "flex-start",
          cursor: "pointer",
        }}
      >
        + add your words
      </button>
    )
  }

  return (
    <div
      className="mt-1 flex flex-col gap-3 pl-4"
      style={{ borderLeft: `1px solid ${color}44` }}
    >
      <ul className="flex flex-col gap-1.5">
        {questions.map((q, i) => (
          <li
            key={i}
            style={{
              fontSize: 12.5,
              lineHeight: 1.6,
              letterSpacing: 0.3,
              color: "#7a7a7a",
              fontFamily: MONO,
            }}
          >
            {q}
          </li>
        ))}
      </ul>

      {editing ? (
        <div className="flex flex-col gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={3}
            placeholder="say it in your own words…"
            className="w-full resize-none rounded-md bg-transparent px-3 py-2 outline-none"
            style={{
              fontFamily: MONO,
              fontSize: 13,
              lineHeight: 1.6,
              letterSpacing: 0.3,
              color: "#dcdcdc",
              border: `1px solid ${color}33`,
            }}
          />
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={save}
              disabled={!draft.trim() || pending}
              style={{
                fontFamily: MONO,
                fontSize: 10,
                letterSpacing: 1.5,
                textTransform: "uppercase",
                color: draft.trim() && !pending ? "#cfcfcf" : "#3a3a3a",
                background: "transparent",
                border: "none",
                padding: 0,
                cursor: draft.trim() && !pending ? "pointer" : "default",
              }}
            >
              {pending ? "saving…" : "save"}
            </button>
            <button
              type="button"
              onClick={() => {
                setDraft(answer)
                setEditing(false)
                setError(null)
              }}
              style={{
                fontFamily: MONO,
                fontSize: 10,
                letterSpacing: 1.5,
                textTransform: "uppercase",
                color: "#3f3f3f",
                background: "transparent",
                border: "none",
                padding: 0,
                cursor: "pointer",
              }}
            >
              cancel
            </button>
          </div>
          {error && (
            <p style={{ fontSize: 11, color: "#d98a9a", fontFamily: MONO }}>
              {error}
            </p>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <p
            style={{
              fontSize: 13,
              lineHeight: 1.65,
              letterSpacing: 0.3,
              color: "#c4c4c4",
              fontFamily: MONO,
              whiteSpace: "pre-wrap",
            }}
          >
            {answer}
          </p>
          <button
            type="button"
            onClick={() => {
              setDraft(answer)
              setEditing(true)
            }}
            style={{
              fontFamily: MONO,
              fontSize: 10,
              letterSpacing: 1.5,
              textTransform: "uppercase",
              color: "#3f3f3f",
              background: "transparent",
              border: "none",
              padding: 0,
              alignSelf: "flex-start",
              cursor: "pointer",
            }}
          >
            edit
          </button>
        </div>
      )}
    </div>
  )
}
