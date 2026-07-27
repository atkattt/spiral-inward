"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { ArrowLeft } from "lucide-react"
import { cn } from "@/lib/utils"
import { Starfield } from "@/components/starfield"
import { useSpiral } from "@/components/spiral/spiral-provider"
import {
  SECTION_COLORS,
  sectionOf,
} from "@/lib/spiral/sections"
import type { DisagreedRead, Read } from "@/lib/spiral/reads"

const MONO = "'Geist Pixel', ui-monospace, monospace"

type Stance = "all" | "kept" | "released" | "bonds"

// A unified history row — a read plus whether it was kept (agreed) or released
// (disagreed). Released rows carry the disagree reason.
type Entry =
  | { stance: "kept"; read: Read }
  | { stance: "released"; read: DisagreedRead }

const TABS: { id: Stance; label: string }[] = [
  { id: "all", label: "all" },
  { id: "kept", label: "kept" },
  { id: "released", label: "released" },
  { id: "bonds", label: "bonds" },
]

// Bond reads aren't part of a chart section — they get their own warm rose,
// distinct from any section accent. Reads with no section (old seeds) fall
// back to a quiet grey so the row still reads in the idiom.
const BOND_ACCENT = "#d98a9a"
const FALLBACK_ACCENT = "#8a8a8a"

/** The accent a read carries everywhere: its section color, same as its star
    on the spiral (and its box in /self's "your chart, so far"). */
function accentFor(read: Read): string {
  if (read.category === "bond") return BOND_ACCENT
  const key = sectionOf(read.section)
  return key ? SECTION_COLORS[key] : FALLBACK_ACCENT
}

export function HistoryView() {
  const {
    agreed,
    disagreed,
    restore,
    disagree,
    reflectionPoints,
    hasUnsavedReflection,
    saveReflection,
  } = useSpiral()
  const router = useRouter()
  const [tab, setTab] = useState<Stance>("all")
  const [leaving, setLeaving] = useState<string | null>(null)

  // Commit the current kept/released picture and send it to the self creature,
  // then take the user to watch it take shape.
  function handleSave() {
    const points = saveReflection()
    toast("reflection saved — your self is taking it in", {
      description: `${points} decision${points === 1 ? "" : "s"} woven into who you are.`,
    })
    window.setTimeout(() => router.push("/self"), 650)
  }

  // Kept first (most recently agreed at the top), then released. Both lists are
  // already stored newest-first by the provider.
  const entries = useMemo<Entry[]>(() => {
    const kept: Entry[] = agreed.map((read) => ({ stance: "kept", read }))
    const released: Entry[] = disagreed.map((read) => ({ stance: "released", read }))
    if (tab === "kept") return kept
    if (tab === "released") return released
    const all = [...kept, ...released]
    if (tab === "bonds") return all.filter((e) => e.read.category === "bond")
    return all
  }, [agreed, disagreed, tab])

  const counts = useMemo(
    () => ({
      all: agreed.length + disagreed.length,
      kept: agreed.length,
      released: disagreed.length,
      bonds: [...agreed, ...disagreed].filter((r) => r.category === "bond").length,
    }),
    [agreed, disagreed],
  )

  // Move a kept read back out onto the "released" side.
  function handleRelease(read: Read) {
    setLeaving(read.id)
    toast("released — moved to what you let go")
    window.setTimeout(() => {
      disagree(read, "used to be")
      setLeaving(null)
    }, 400)
  }

  // Pull a released read back onto the spiral / into what you keep.
  function handleRestore(read: DisagreedRead) {
    setLeaving(read.id)
    toast("pulled back onto your spiral")
    window.setTimeout(() => {
      restore(read.id)
      setLeaving(null)
    }, 400)
  }

  return (
    <main className="relative flex min-h-[100dvh] flex-col bg-background">
      <Starfield count={70} />

      {/* header — identical chrome to /self */}
      <header className="relative z-20 flex items-center px-5 pt-6">
        <Link
          href="/circle"
          className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          back
        </Link>
      </header>

      <div className="relative z-10 mx-auto flex w-full max-w-md flex-1 flex-col gap-10 px-5 pb-36 pt-6">
        {/* 1 — title, in the self page's serif voice */}
        <section className="flex flex-col gap-3">
          <p
            className="text-pretty font-serif text-base font-light lowercase text-foreground"
            style={{ textWrap: "balance" }}
          >
            your reads
          </p>
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
            all your reads in one place. tap any of them to reread, keep, or
            remove.
          </p>
        </section>

        {/* 2 — stance filter: quiet ●/○ text toggles, like /what-you-know */}
        <section className="flex flex-col gap-3">
          <SectionLabel>filter</SectionLabel>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {TABS.map((t) => {
              const active = tab === t.id
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  style={{
                    background: "none",
                    border: "none",
                    padding: 0,
                    cursor: "pointer",
                    fontFamily: MONO,
                    fontSize: 11,
                    letterSpacing: 1.5,
                    color: active ? "#e8e4da" : "#5a5a5a",
                    transition: "color .2s",
                  }}
                >
                  <span aria-hidden="true">{active ? "● " : "○ "}</span>
                  {t.label}
                  <span style={{ color: active ? "#8a8a8a" : "#3f3f3f" }}>
                    {" "}
                    {counts[t.id]}
                  </span>
                </button>
              )
            })}
          </div>
        </section>

        {/* 3 — the list */}
        <section className="flex flex-col gap-3">
          <SectionLabel>
            {tab === "all" ? "every decision" : tab}
          </SectionLabel>

          {entries.length === 0 ? (
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
              {tab === "kept"
                ? "nothing kept yet. what resonates with you will gather here."
                : tab === "released"
                  ? "nothing released yet. what you let go of will be filed here."
                  : tab === "bonds"
                    ? "no bonds yet. reads about the people in your orbit will gather here."
                    : "your history is empty. answer the reads on your spiral and they'll gather here."}
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {entries.map((entry) => {
                const { read, stance } = entry
                const kept = stance === "kept"
                const isBond = read.category === "bond"
                const accent = accentFor(read)
                return (
                  <li
                    key={`${stance}-${read.id}`}
                    className={cn(
                      "flex flex-col gap-3 rounded-xl px-4 py-4",
                      leaving === read.id && "animate-card-fade-out",
                    )}
                    style={{
                      background: "#070707",
                      // The read's own section accent, same as its star on the
                      // spiral. Kept rows wear it stronger; released rows have
                      // let it fade.
                      border: `1px solid ${accent}${kept ? "52" : "24"}`,
                      boxShadow: `inset 2px 0 0 ${accent}${kept ? "88" : "3d"}`,
                      opacity: kept ? 1 : 0.72,
                    }}
                  >
                    {/* glyph + read text */}
                    <p
                      className="flex items-baseline gap-2 text-pretty"
                      style={{
                        fontSize: 13.5,
                        lineHeight: 1.65,
                        letterSpacing: 0.3,
                        fontFamily: MONO,
                        color: kept ? "#e8e4da" : "#9a9a9a",
                        textShadow: kept ? `0 0 10px ${accent}44` : undefined,
                      }}
                    >
                      <span
                        aria-hidden="true"
                        style={{ color: accent, fontSize: 12, flexShrink: 0 }}
                      >
                        {isBond ? "\u2661" : "\u2726"}
                      </span>
                      {read.text}
                    </p>

                    {/* meta + stance flip */}
                    <div className="flex items-center justify-between gap-3 pl-[22px]">
                      <span
                        style={{
                          fontSize: 10,
                          letterSpacing: 1.5,
                          fontFamily: MONO,
                          color: `${accent}b8`,
                        }}
                      >
                        {kept
                          ? `kept · ${
                              isBond
                                ? "bond"
                                : (sectionOf(read.section) ?? "about you")
                            }`
                          : `released · ${(read as DisagreedRead).reason}`}
                        {read.subjectName ? ` · ${read.subjectName}` : ""}
                      </span>

                      {/* Every row can flip its stance: kept → release,
                          released → bring back. */}
                      {kept ? (
                        <button
                          onClick={() => handleRelease(read)}
                          style={actionStyle}
                          className="transition-colors hover:!text-foreground"
                        >
                          release
                        </button>
                      ) : (
                        <button
                          onClick={() => handleRestore(read as DisagreedRead)}
                          style={actionStyle}
                          className="transition-colors hover:!text-foreground"
                        >
                          bring back
                        </button>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </div>

      {/* Sticky SAVE bar — commits the current reflection and feeds it to the
          self creature that's building your portrait. Same pill-outline idiom
          as the what-you-know composer. */}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30">
        <div className="mx-auto max-w-md bg-gradient-to-t from-background via-background/95 to-transparent px-5 pb-6 pt-8">
          <button
            onClick={handleSave}
            disabled={!hasUnsavedReflection}
            className="pointer-events-auto flex w-full items-center justify-center rounded-full py-3.5 transition-colors"
            style={{
              fontFamily: MONO,
              fontSize: 11,
              letterSpacing: 2,
              textTransform: "lowercase",
              background: hasUnsavedReflection ? "transparent" : "transparent",
              border: `1px solid ${
                hasUnsavedReflection
                  ? "rgba(255,255,255,0.4)"
                  : "rgba(255,255,255,0.12)"
              }`,
              color: hasUnsavedReflection ? "#e8e4da" : "#4a4a4a",
              cursor: hasUnsavedReflection ? "pointer" : "not-allowed",
            }}
          >
            {hasUnsavedReflection
              ? "save & feed your self ⏎"
              : "all reflections saved"}
          </button>
          <p
            className="mt-2.5 text-center"
            style={{
              fontFamily: MONO,
              fontSize: 10,
              letterSpacing: 1.5,
              color: "#4a4a4a",
            }}
          >
            {reflectionPoints} decision{reflectionPoints === 1 ? "" : "s"} shaping
            who you are
          </p>
        </div>
      </div>
    </main>
  )
}

// The tiny uppercase section label from /self ("talk to your self",
// "your chart, so far") — same tokens exactly.
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

// Quiet lowercase row actions, matching what-you-know's edit/delete.
const actionStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  padding: 0,
  cursor: "pointer",
  fontFamily: MONO,
  fontSize: 10,
  letterSpacing: 2,
  textTransform: "lowercase",
  color: "rgba(255,255,255,0.5)",
  whiteSpace: "nowrap",
}
