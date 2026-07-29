"use client"

import { useCallback, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import type { Person } from "@/lib/db/schema"
import {
  RELATIONSHIP_LABELS,
  SELF_PERSON_ID,
  makeSelfPerson,
  type RelationshipKind,
} from "@/lib/relationships"
import { clearBirthStash } from "@/lib/birth-data"
import { toast } from "@/components/ui/terminal-toast"
import { eraseJourney } from "@/app/actions/account"
import { ConnectDialog } from "@/components/circle/connect-dialog"
import { PersonDetail, type Bond } from "@/components/circle/person-detail"
import { SpiralUniverse } from "@/components/circle/spiral-universe"
import type { UniverseFragment } from "@/lib/spiral/universe-reads"

import type { Mood } from "@/components/circle/SelfAvatar"
import { buildColorMap } from "@/lib/circle/colors"
import { useCircleData } from "@/components/circle/circle-data-provider"

import {
  LogOut,
  ArrowLeft,
  Clock,
  Lock,
  Menu,
  X,
  Info,
  Star,
  User,
  Users,
} from "lucide-react"
import {
  BONDS_UNLOCK_SECTIONS,
  type BondsUnlock,
} from "@/lib/circle/bonds-unlock"

export function CircleView({
  userName,
  initialRevealRadius,
  answerCount = 0,
  userId,
  matchedReads,
  initialResponses,
  guestFragments,
  lensRanks,
}: {
  userName: string
  initialRevealRadius: number
  /** written answers so far — one permanent aura glyph each on the creature */
  answerCount?: number
  /** stable per-user seed so the creature regrows the exact same being */
  userId?: string
  /** authed: matched fragments from the /self pipeline — the read objects */
  matchedReads?: UniverseFragment[]
  /** authed: saved agree/disagree per fragment id, from read_responses */
  initialResponses?: Record<string, "agree" | "disagree">
  /** guest: raw fragments, matched client-side against the stashed chart */
  guestFragments?: UniverseFragment[]
  /** lens slug → depth (lenses.sort_order); feeds the star rule's tiebreak */
  lensRanks?: Record<string, number>
}) {
  const router = useRouter()
  const { guest, people, relationships } = useCircleData()
  const [selected, setSelected] = useState<Person | null>(null)
  const [connectFrom, setConnectFrom] = useState<Person | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  // Leave confirmation: signed-in users choose between erasing the journey
  // or just signing out (progress kept).
  const [leaveConfirm, setLeaveConfirm] = useState(false)
  /**
   * Set while a read is open, so the top-left control becomes "back to the
   * circle" instead of the app-level exit. Null the rest of the time.
   */
  const [backToCircle, setBackToCircle] = useState<(() => void) | null>(null)
  // Wrapped in an extra arrow on purpose: useState treats a bare function
  // argument as an updater, so passing the action directly would CALL it and
  // store its undefined return — closing the panel the instant it opened.
  const handleBackChange = useCallback(
    (fn: (() => void) | null) => setBackToCircle(() => fn),
    [],
  )
  /**
   * The bonds gate, published by SpiralUniverse (which owns the live verdicts,
   * including this session's). Starts CLOSED on purpose: the alternative is
   * flashing an open Bonds link on first paint and yanking it away a frame
   * later, and the spiral corrects this immediately on mount.
   */
  const [bondsLock, setBondsLock] = useState<BondsUnlock>({
    completedSections: 0,
    threshold: BONDS_UNLOCK_SECTIONS,
    remaining: BONDS_UNLOCK_SECTIONS,
    visible: false,
    unlocked: false,
  })
  // Same phrasing as the spiral's "not yet" dialog — one unit ("a read" = a
  // star and all its smaller ones), so the two explanations can't contradict.
  const bondsLockNote = `answer ${bondsLock.remaining} more read${
    bondsLock.remaining === 1 ? "" : "s"
  } — a star and all its smaller ones — to open bonds`

  const [erasing, setErasing] = useState(false)
  // The central avatar's resting expression. Per-read reactions (agree /
  // disagree / curious + color) are now driven inside SpiralUniverse itself
  // when an object is tapped, so the base mood here just stays idle.
  const mood: Mood = "idle"

  const peopleById = useMemo(() => {
    const map = new Map<number, Person>()
    for (const p of people) map.set(p.id, p)
    // The user themself is a valid bond endpoint (the auto you↔them bond).
    map.set(SELF_PERSON_ID, makeSelfPerson(people[0]?.userId ?? "self"))
    return map
  }, [people])

  // Stable per-person accent color, assigned in the order people were added.
  const colorById = useMemo(() => buildColorMap(people), [people])

  // Bonds for the currently selected person.
  const selectedBonds = useMemo<Bond[]>(() => {
    if (!selected) return []
    return relationships
      .filter(
        (r) => r.fromPersonId === selected.id || r.toPersonId === selected.id,
      )
      .map((r) => {
        const otherId =
          r.fromPersonId === selected.id ? r.toPersonId : r.fromPersonId
        const other = peopleById.get(otherId)
        if (!other) return null
        return {
          relationship: r,
          other,
          label: RELATIONSHIP_LABELS[r.kind as RelationshipKind] ?? r.kind,
        }
      })
      .filter((x): x is Bond => x !== null)
  }, [selected, relationships, peopleById])

  function clearLocalStash() {
    // Clear the onboarding ritual's stashed birth data + computed chart (and
    // its ownership stamp) so returning starts the ritual fresh instead of
    // silently reusing them — and so the next account to sign in on this
    // browser can never inherit this person's chart.
    clearBirthStash()
  }

  // Sign out WITHOUT erasing saved progress. Hard navigation through the
  // server-side sign-out route: (1) the SpiralProvider lives in the root
  // layout, so soft navigation would carry in-memory state into the next
  // visit; (2) client-side cookie deletion is silently dropped in the
  // cross-site iframe preview — only the server can reliably expire the
  // sb-* cookies (and the guest cookie) with the right SameSite attributes.
  function signOutOnly() {
    clearLocalStash()
    window.location.href = "/auth/signout"
  }

  // Erase the whole journey server-side (reads, entries, people, avatar
  // growth), then sign out. Returning starts the experience from the top.
  async function eraseAndLeave() {
    setErasing(true)
    if (!guest) {
      const { error } = await eraseJourney()
      if (error) {
        // Do NOT sign out on a failed erase — the user would come back to a
        // half-erased journey believing it was reset. Tell them and stay,
        // with the failing step named so it can actually be diagnosed.
        toast("the sky couldn't let go — try again in a moment", {
          description: error,
        })
        setErasing(false)
        setLeaveConfirm(false)
        return
      }
    }
    signOutOnly()
  }

  function handleLeaveClick() {
    // Guests keep nothing server-side — leaving is already a full reset,
    // no need to ask.
    if (guest) {
      signOutOnly()
      return
    }
    setLeaveConfirm(true)
  }

  return (
    <main className="relative flex min-h-[100dvh] flex-col overflow-hidden">
      {/* Header: exit on the left, burger menu on the top-right corner.
          White text; ALWAYS present — even while the camera is zoomed into
          a read, the user must be able to reach the menu and leave. */}
      <header className="relative z-30 flex items-center justify-between px-5 pt-6">
        {/* One control, two meanings. While a read is open this is the way OUT
            OF THE READ; only on the bare sky does it leave the app. Same slot
            and same styling either way, so nothing shifts as it changes — but
            the icon and label change with it, so it never silently does the
            more destructive thing. */}
        <button
          onClick={backToCircle ?? handleLeaveClick}
          aria-label={
            backToCircle
              ? "Back to the circle"
              : guest
                ? "Exit"
                : "Leave and erase your journey"
          }
          className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-white transition-colors hover:text-white/80"
        >
          {backToCircle ? (
            <ArrowLeft className="size-3.5" />
          ) : (
            <LogOut className="size-3.5" />
          )}
          {backToCircle ? "Back" : guest ? "Exit" : "Leave"}
        </button>

        {/* Entry points collapsed into a burger menu that drops down */}
        <div className="relative">
          <button
            onClick={() => setMenuOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-white transition-colors hover:text-white/80"
          >
            {menuOpen ? <X className="size-3.5" /> : <Menu className="size-3.5" />}
            Menu
          </button>

          {menuOpen && (
            <>
              {/* Click-away layer so tapping outside closes the menu */}
              <button
                aria-hidden="true"
                tabIndex={-1}
                onClick={() => setMenuOpen(false)}
                className="fixed inset-0 z-0 cursor-default"
              />
              <div
                role="menu"
                aria-label="Menu"
                className="absolute right-0 top-full z-10 mt-3 flex w-56 flex-col overflow-hidden rounded-lg shadow-xl"
                style={{
                  backgroundColor: "#070707",
                  border: "1px solid #1a1a1a",
                  fontFamily:
                    "'Geist Pixel', ui-monospace, monospace",
                }}
              >
                {/* No "Menu" heading here: the trigger directly above already
                    says MENU, so repeating it just pushed the real entries
                    down. The panel is labelled for screen readers instead. */}
                <MenuItem
                  first
                  icon={<Star className="size-4" />}
                  label="Self"
                  href="/self"
                  onNavigate={() => setMenuOpen(false)}
                />
                <MenuItem
                  icon={<Users className="size-4" />}
                  label="Bonds"
                  href="/bonds"
                  onNavigate={() => setMenuOpen(false)}
                  locked={!bondsLock.unlocked}
                  lockNote={bondsLockNote}
                  // Tapping the closed door explains itself rather than doing
                  // nothing, which would just read as a broken menu.
                  onClick={() => {
                    setMenuOpen(false)
                    toast("bonds aren't open yet", {
                      description: bondsLockNote,
                    })
                  }}
                />
                <MenuItem
                  icon={<Clock className="size-4" />}
                  label="Your reads"
                  href="/history"
                  onNavigate={() => setMenuOpen(false)}
                />
                <MenuItem
                  icon={<Info className="size-4" />}
                  label="About"
                  href="/about"
                  onNavigate={() => setMenuOpen(false)}
                />
                <MenuItem
                  icon={<User className="size-4" />}
                  label="Account"
                  href="/profile"
                  onNavigate={() => setMenuOpen(false)}
                />
              </div>
            </>
          )}
        </div>
      </header>

      {/* Constellation canvas — always rendered so the self creature and its
          circle are visible from the very first visit, even before anyone has
          been added to the circle. */}
      <div className="relative z-10 flex-1">
        <SpiralUniverse
          people={people}
          relationships={relationships}
          colorById={colorById}
          mood={mood}
          answerCount={answerCount}
          userId={userId}
          guest={guest}
          initialRevealRadius={initialRevealRadius}
          matchedReads={matchedReads}
          initialResponses={initialResponses}
          guestFragments={guestFragments}
          lensRanks={lensRanks}
          onBackChange={handleBackChange}
          onBondsLockChange={setBondsLock}
        />
      </div>

      {/* Leave confirmation — a small centered sheet in the app's terminal
          idiom. Mobile-first: full-width card with generous tap targets. */}
      {leaveConfirm && (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-5 sm:items-center">
          <button
            aria-hidden="true"
            tabIndex={-1}
            onClick={() => !erasing && setLeaveConfirm(false)}
            className="absolute inset-0 cursor-default bg-black/70"
          />
          <div
            role="alertdialog"
            aria-label="leaving?"
            className="relative flex w-full max-w-sm flex-col gap-4 rounded-2xl p-5"
            style={{
              backgroundColor: "#070707",
              border: "1px solid #1a1a1a",
              fontFamily: "'Geist Pixel', ui-monospace, monospace",
            }}
          >
            <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground/60">
              leaving?
            </p>
            <p
              className="text-pretty"
              style={{
                fontSize: 13.5,
                lineHeight: 1.65,
                letterSpacing: 0.3,
                color: "#8a8a8a",
              }}
            >
              <span style={{ color: "#555" }}>{"› "}</span>
              erase your journey and start over next time — or just sign out
              and keep everything as it is?
            </p>
            <div className="flex flex-col gap-2.5">
              <button
                onClick={eraseAndLeave}
                disabled={erasing}
                className="w-full rounded-full border px-4 py-3 text-[11px] uppercase tracking-widest transition-colors disabled:opacity-50"
                style={{
                  borderColor: "rgba(224,122,122,0.4)",
                  color: "#e07a7a",
                }}
              >
                {erasing ? "erasing…" : "erase & leave"}
              </button>
              <button
                onClick={signOutOnly}
                disabled={erasing}
                className="w-full rounded-full border border-border px-4 py-3 text-[11px] uppercase tracking-widest text-foreground transition-colors hover:bg-foreground/[0.04] disabled:opacity-50"
              >
                just sign out
              </button>
              <button
                onClick={() => setLeaveConfirm(false)}
                disabled={erasing}
                className="w-full px-4 py-2 text-[10px] uppercase tracking-widest text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
              >
                stay
              </button>
            </div>
          </div>
        </div>
      )}

      <PersonDetail
        person={selected}
        bonds={selectedBonds}
        accentColor={selected ? colorById.get(selected.id) : undefined}
        onClose={() => setSelected(null)}
        onConnect={(p) => {
          setSelected(null)
          setConnectFrom(p)
        }}
      />
      <ConnectDialog
        from={connectFrom}
        people={people}
        onClose={() => setConnectFrom(null)}
      />
    </main>
  )
}

function MenuItem({
  icon,
  label,
  onClick,
  href,
  onNavigate,
  locked,
  lockNote,
  first,
}: {
  icon: React.ReactNode
  label: string
  onClick?: () => void
  href?: string
  onNavigate?: () => void
  /** Renders as a closed door: dimmed, lock glyph, and never navigates. */
  locked?: boolean
  /** Why it's closed — announced to screen readers, shown under the label. */
  lockNote?: string
  /**
   * Top row: drops the divider, which would otherwise sit directly on the
   * panel's own top border and read as a doubled hairline.
   */
  first?: boolean
}) {
  // White label + icon: at text-muted-foreground these read as dim beige
  // against the near-black panel, closer to disabled than to the app's
  // terminal chrome (the header's EXIT/MENU are already pure white).
  const base =
    "flex w-full items-center gap-2 px-3 py-3 text-left font-mono text-[11px] uppercase tracking-widest transition-colors"
  const className = locked
    ? `${base} cursor-not-allowed text-white/35`
    : `${base} text-white hover:bg-white/[0.06]`
  const style = first ? undefined : { borderTop: "1px solid #1a1a1a" }

  const inner = (
    <>
      <span className={locked ? "text-white/25" : "text-white/60"}>{">"}</span>
      <span className={locked ? "text-white/35" : "text-white"}>{icon}</span>
      <span>{label}</span>
      {locked && <Lock className="ml-auto size-3" aria-hidden="true" />}
    </>
  )

  // A locked entry stays focusable and keeps its role so the reason is
  // reachable by keyboard and screen reader — rendering a <span> or dropping
  // it entirely would just make bonds silently vanish.
  if (locked) {
    return (
      <button
        role="menuitem"
        type="button"
        aria-disabled="true"
        aria-label={lockNote ? `${label} — ${lockNote}` : label}
        onClick={onClick}
        className={className}
        style={style}
      >
        {inner}
      </button>
    )
  }

  if (href) {
    return (
      <Link
        role="menuitem"
        href={href}
        onClick={onNavigate}
        className={className}
        style={style}
      >
        {inner}
      </Link>
    )
  }
  return (
    <button role="menuitem" onClick={onClick} className={className} style={style}>
      {inner}
    </button>
  )
}


