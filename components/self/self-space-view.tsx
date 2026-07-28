"use client"

import { useCallback, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { ArrowLeft, Lock } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import SelfCreature, { type SelfCreatureHandle } from "@/components/self/self-creature"
import { Starfield } from "@/components/starfield"
import { SelfChat } from "@/components/self/self-chat"
import { SelfReads } from "@/components/self/self-reads"
import { SelfView } from "@/components/spiral/self-view"
import {
  chatUnlockedFrom,
  lensLabel,
  type LensClearState,
} from "@/lib/self/unlock"
import { sectionClearProgress } from "@/lib/self/lenses"
import { lensRankFromRecord } from "@/lib/spiral/sections"
import type { AvatarSignals } from "@/lib/self/avatar-slots"
import type { SelfReadsData } from "@/lib/self/reads-data"

const MONO =
  "'Geist Pixel', ui-monospace, monospace"

export function SelfSpaceView({
  reads,
  userId,
}: {
  reads: SelfReadsData | null
  /** stable per-user seed so the creature regrows the exact same being */
  userId?: string
}) {

  // THE SAME BEING AS /circle: structure from the shared section-clear rule
  // over the same matched fragments + read_responses, disposition from the
  // same agree/disagree tally, aura from the same answer count — so whatever
  // the self looks like at the center of the spiral, it looks identical here.
  const creatureRef = useRef<SelfCreatureHandle>(null)
  // Judging reads now lives on the spiral (/circle); here the set is a
  // read-only seed from what's already been answered.
  const [respondedIds] = useState<Set<string>>(
    () => new Set(reads ? Object.keys(reads.responses) : []),
  )
  const [answeredIds, setAnsweredIds] = useState<Set<string>>(
    () => new Set(reads ? Object.keys(reads.answers) : []),
  )
  // The chat gate: both vedic phases finished, by the same section-clear rule
  // the spiral and the creature already use. Answers saved this session are
  // judgements-in-progress, not clears, so this intentionally keys off
  // `respondedIds` (agree/disagree) exactly like the lens progression does.
  const { states: lensStates, unlocked } = useMemo(
    () =>
      chatUnlockedFrom(
        reads?.matched ?? [],
        respondedIds,
        reads?.lensRanks,
      ),
    [reads, respondedIds],
  )

  const creatureSignals = useMemo<AvatarSignals>(() => {
    let agrees = 0
    let disagrees = 0
    for (const v of Object.values(reads?.responses ?? {})) {
      if (v === "agree") agrees++
      else disagrees++
    }
    // Same star rule AND same lens depths as /circle, so the being that shows
    // up here is derived from the identical star in every constellation.
    const { done, total } = sectionClearProgress(
      reads?.matched ?? [],
      respondedIds,
      lensRankFromRecord(reads?.lensRanks),
    )
    return {
      agrees,
      disagrees,
      // answers written this session count immediately, so a new aura glyph
      // accretes the moment the user saves one.
      answers: answeredIds.size,
      cleared: done,
      constellations: total,
    }
  }, [reads, respondedIds, answeredIds])

  const handleAnswer = useCallback((fragmentId: string) => {
    creatureRef.current?.react("submit")
    setAnsweredIds((prev) =>
      prev.has(fragmentId) ? prev : new Set(prev).add(fragmentId),
    )
  }, [])

  return (
    <main className="relative flex min-h-[100dvh] flex-col bg-background">
      <Starfield count={70} />

      <header className="relative z-20 flex items-center px-5 pt-6">
        <Link
          href="/circle"
          className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          back
        </Link>
      </header>

      <div className="relative z-10 mx-auto flex w-full max-w-md flex-1 flex-col gap-10 px-5 pb-24 pt-6">
        {/* 1 — The self creature: an evolving ASCII being. Same "screen"
            framing as the spiral center in /circle (opaque backdrop disc, subtle
            ring, overflow-hidden circle) but the form inside now grows through
            five discrete stages driven by real engagement. */}
        <section className="flex flex-col items-center gap-3">
          <div className="relative" style={{ width: 230, height: 230 }}>
            {/* Dark radial backdrop so the core reads cleanly, matching /circle */}
            <div
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={{
                width: 172,
                height: 172,
                backgroundColor: "var(--background)",
                border: "1px solid oklch(0.95 0 0 / 0.55)",
              }}
            />
            <div className="relative flex h-full w-full items-center justify-center overflow-hidden">
              <SelfCreature
                ref={creatureRef}
                signals={creatureSignals}
                seed={userId}
                size={230}
                color="#e8e4da"
                lcd
                lcdSize={172}
              />
            </div>
          </div>
          <p
            className="text-center font-serif text-base font-light lowercase text-foreground"
            style={{ textWrap: "balance" }}
          >
            this is you, still taking shape
          </p>
        </section>

        {/* 2 — Talk to your self (gated) */}
        <section className="flex flex-col gap-3">
          <SectionLabel centered>talk to your self</SectionLabel>
          {unlocked ? <SelfChat /> : <LockedChat states={lensStates} />}
        </section>

        {/* 3 — What you know: write things down in your own words, keep them,
            send them to the self. Lives here now instead of its own page. */}
        <SelfView />

        {/* 4 — The growing chart: only APPROVED reads surface here, grouped
            and colored by the same section accents as the spiral's stars. It
            fills in as the journey is walked — never shown in full up front. */}
        <section className="flex flex-col gap-5">
          <SectionLabel>your chart, so far</SectionLabel>
          {reads ? (
            <SelfReads data={reads} onAnswer={handleAnswer} />
          ) : (
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
              <GoogleSignInLink />
              {" to save your chart and see it grow."}
            </p>
          )}
        </section>
      </div>
    </main>
  )
}

/**
 * "sign in" as an inline text link that launches Google OAuth directly —
 * same iframe-aware flow as the auth form (Google blocks its page inside
 * iframes, so in the v0 preview it opens in a new tab).
 */
function GoogleSignInLink() {
  const [busy, setBusy] = useState(false)

  async function handleGoogle() {
    if (busy) return
    setBusy(true)
    const supabase = createClient()
    const inIframe = window.self !== window.top
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=/self`,
        skipBrowserRedirect: inIframe,
        // Force Google's account chooser instead of silently reusing the
        // browser's active Google session — see the note in auth-form.tsx.
        queryParams: { prompt: "select_account" },
      },
    })
    if (error) {
      setBusy(false)
      return
    }
    if (inIframe && data?.url) {
      window.open(data.url, "_blank", "noopener,noreferrer")
      setBusy(false)
    }
    // Outside an iframe the browser navigates away to Google.
  }

  return (
    <button
      type="button"
      onClick={handleGoogle}
      disabled={busy}
      style={{
        background: "none",
        border: "none",
        padding: 0,
        font: "inherit",
        fontFamily: MONO,
        letterSpacing: "inherit",
        color: "#c9c9c9",
        textDecoration: "underline",
        textUnderlineOffset: 3,
        cursor: busy ? "wait" : "pointer",
      }}
    >
      {busy ? "one moment…" : "sign in"}
    </button>
  )
}

function SectionLabel({
  children,
  centered,
}: {
  children: React.ReactNode
  centered?: boolean
}) {
  return (
    <span
      style={{
        fontSize: 10,
        letterSpacing: 2,
        textTransform: "uppercase",
        color: "#4a4a4a",
        fontFamily: MONO,
        textAlign: centered ? "center" : undefined,
      }}
    >
      {children}
    </span>
  )
}

/** Locked state: the conversation opens once both vedic phases are finished. */
function LockedChat({ states }: { states: LensClearState[] }) {
  return (
    <div
      className="flex flex-col items-center gap-4 rounded-2xl px-6 py-9 text-center"
      style={{ background: "#070707", border: "1px solid #1a1a1a" }}
    >
      <div
        className="flex size-10 items-center justify-center rounded-full"
        style={{ border: "1px solid #2a2a2a", color: "#6a6a6a" }}
      >
        <Lock className="size-4" />
      </div>
      <p
        style={{
          fontSize: 13.5,
          lineHeight: 1.65,
          letterSpacing: 0.3,
          color: "#8a8a8a",
          fontFamily: MONO,
          maxWidth: 260,
        }}
      >
        this opens when you&apos;ve finished both vedic lenses. keep going.
      </p>

      {/* Where each phase stands — one quiet line per lens, no bar. */}
      <div className="mt-1 flex flex-col items-center gap-1.5">
        {states.map((s) => (
          <span
            key={s.slug}
            style={{
              fontSize: 11,
              letterSpacing: 0.6,
              color: s.complete ? "#8a8a8a" : "#4a4a4a",
              fontFamily: MONO,
            }}
          >
            {lensLabel(s.slug)}
            {" — "}
            {/* A phase with nothing matched yet reads as "locked" rather than
                "0 of 0", which would look like a bug. */}
            {s.empty
              ? "locked"
              : s.complete
                ? "cleared"
                : `${s.done} of ${s.total} cleared`}
          </span>
        ))}
      </div>
    </div>
  )
}
