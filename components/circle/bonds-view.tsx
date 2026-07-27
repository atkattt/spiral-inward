"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import type { Person } from "@/lib/db/schema"
import {
  RELATIONSHIP_LABELS,
  SELF_PERSON_ID,
  makeSelfPerson,
  type RelationshipKind,
} from "@/lib/relationships"
import { Starfield } from "@/components/starfield"
import { buildColorMap } from "@/lib/circle/colors"
import { useCircleData } from "@/components/circle/circle-data-provider"
import { AddPersonDialog } from "@/components/circle/add-person-dialog"
import { ConnectDialog } from "@/components/circle/connect-dialog"
import { PersonDetail, type Bond } from "@/components/circle/person-detail"

const MONO = "'Geist Pixel', ui-monospace, monospace"

/**
 * /bonds — the people in your sky, gathered in one quiet list.
 * Zero people: the add-person ritual opens immediately (bonds absorbs the
 * old "add person" menu entry). With people: each name in its person color,
 * tap → the existing person/bond view, "+ add someone" at the bottom.
 */
export function BondsView() {
  const { people, relationships } = useCircleData()
  // Zero people → the add flow IS the page's opening move.
  const [addOpen, setAddOpen] = useState(people.length === 0)
  const [selected, setSelected] = useState<Person | null>(null)
  const [connectFrom, setConnectFrom] = useState<Person | null>(null)

  const peopleById = useMemo(() => {
    const map = new Map<number, Person>()
    for (const p of people) map.set(p.id, p)
    // The user themself is a valid bond endpoint (the auto you↔them bond).
    map.set(SELF_PERSON_ID, makeSelfPerson(people[0]?.userId ?? "self"))
    return map
  }, [people])

  // Same stable per-person accents as the spiral.
  const colorById = useMemo(() => buildColorMap(people), [people])

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

  // Count of bonds per person, for the quiet meta line under each name.
  const bondCount = useMemo(() => {
    const map = new Map<number, number>()
    for (const r of relationships) {
      map.set(r.fromPersonId, (map.get(r.fromPersonId) ?? 0) + 1)
      map.set(r.toPersonId, (map.get(r.toPersonId) ?? 0) + 1)
    }
    return map
  }, [relationships])

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

      <div className="relative z-10 mx-auto flex w-full max-w-md flex-1 flex-col gap-10 px-5 pb-24 pt-6">
        {/* 1 — title, in the self page's serif voice */}
        <section className="flex flex-col gap-3">
          <p
            className="font-serif text-base font-light lowercase text-foreground"
            style={{ textWrap: "balance" }}
          >
            bonds
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
            the people in your life, added to your chart. the more you read
            about someone, the fuller their profile gets.
          </p>
        </section>

        {/* 2 — the people, or a quiet empty invitation */}
        <section className="flex flex-col gap-3">
          <span
            style={{
              fontSize: 10,
              letterSpacing: 2,
              textTransform: "uppercase",
              color: "#4a4a4a",
              fontFamily: MONO,
            }}
          >
            your people
          </span>

          {people.length === 0 ? (
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
              no one here yet
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {people.map((p) => {
                const accent = colorById.get(p.id) ?? "#9a9a9a"
                const count = bondCount.get(p.id) ?? 0
                return (
                  <li key={p.id}>
                    <button
                      onClick={() => setSelected(p)}
                      className="flex w-full items-center gap-3 rounded-2xl p-4 text-left transition-colors hover:bg-foreground/[0.03]"
                      style={{
                        background: "#070707",
                        border: "1px solid #1a1a1a",
                      }}
                    >
                      <span
                        aria-hidden="true"
                        className="inline-block size-2.5 shrink-0 rounded-[2px]"
                        style={{
                          backgroundColor: accent,
                          boxShadow: `0 0 10px 0 ${accent}aa`,
                        }}
                      />
                      <span className="flex flex-1 flex-col gap-0.5">
                        <span
                          style={{
                            fontFamily: MONO,
                            fontSize: 15,
                            letterSpacing: 0.5,
                            color: accent,
                          }}
                        >
                          {p.name}
                        </span>
                        <span
                          style={{
                            fontFamily: MONO,
                            fontSize: 10,
                            letterSpacing: 2,
                            textTransform: "uppercase",
                            color: "#4a4a4a",
                          }}
                        >
                          {count === 0
                            ? "no bonds yet"
                            : count === 1
                              ? "1 bond"
                              : `${count} bonds`}
                        </span>
                      </span>
                      <span
                        aria-hidden="true"
                        style={{
                          fontFamily: MONO,
                          fontSize: 12,
                          color: "#4a4a4a",
                        }}
                      >
                        {"›"}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}

          {/* add someone — a real bordered pill, same idiom as the
              "add to spiral" button on /self */}
          <button
            onClick={() => setAddOpen(true)}
            className="mt-2 self-center"
            style={{
              background: "transparent",
              border: "1px solid #f5f5f5",
              color: "#f5f5f5",
              fontFamily: MONO,
              fontSize: 10,
              letterSpacing: 2,
              textTransform: "uppercase",
              padding: "9px 18px",
              borderRadius: 30,
              cursor: "pointer",
              whiteSpace: "nowrap",
              transition: "border-color .2s, color .2s",
            }}
          >
            + add someone
          </button>
        </section>
      </div>

      <AddPersonDialog open={addOpen} onOpenChange={setAddOpen} />
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
