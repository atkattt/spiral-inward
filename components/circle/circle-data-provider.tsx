"use client"

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react"
import { useRouter } from "next/navigation"
import type { Person, Relationship } from "@/lib/db/schema"
import { SELF_PERSON_ID } from "@/lib/relationships"
import {
  addPerson as addPersonAction,
  addRelationship as addRelationshipAction,
  deletePerson as deletePersonAction,
  deleteRelationship as deleteRelationshipAction,
} from "@/app/actions/circle"

export type AddPersonInput = {
  name: string
  birthDate?: string | null
  birthTime?: string | null
  birthTimeUnknown: boolean
  birthPlace?: string | null
  /** who they are TO YOU — creates the you↔them bond on add */
  kind?: string | null
}

type CircleData = {
  guest: boolean
  people: Person[]
  relationships: Relationship[]
  addPerson: (input: AddPersonInput) => Promise<void>
  addRelationship: (
    fromId: number,
    toId: number,
    kind: string,
  ) => Promise<void>
  deletePerson: (id: number) => Promise<void>
  deleteRelationship: (id: number) => Promise<void>
}

const CircleDataContext = createContext<CircleData | null>(null)

export function CircleDataProvider({
  guest,
  initialPeople,
  initialRelationships,
  children,
}: {
  guest: boolean
  initialPeople: Person[]
  initialRelationships: Relationship[]
  children: React.ReactNode
}) {
  const router = useRouter()

  // Guest state lives entirely in the client; authed mode reads the server
  // props directly and re-syncs after each mutation via router.refresh().
  const [guestPeople, setGuestPeople] = useState<Person[]>(initialPeople)
  const [guestRels, setGuestRels] = useState<Relationship[]>(
    initialRelationships,
  )
  const seq = useRef(-1000)

  const people = guest ? guestPeople : initialPeople
  const relationships = guest ? guestRels : initialRelationships

  const addPerson = useCallback(
    async (input: AddPersonInput) => {
      if (guest) {
        const person: Person = {
          id: seq.current--,
          userId: "guest",
          name: input.name.trim(),
          birthDate: input.birthDate?.trim() || null,
          birthTime: input.birthTimeUnknown
            ? null
            : input.birthTime?.trim() || null,
          birthTimeUnknown: input.birthTimeUnknown,
          birthPlace: input.birthPlace?.trim() || null,
          posX: Math.floor(15 + Math.random() * 70),
          posY: Math.floor(15 + Math.random() * 70),
          createdAt: new Date(),
        }
        setGuestPeople((p) => [...p, person])
        // Same rule as the server: adding someone bonds them to your self.
        setGuestRels((r) => [
          ...r,
          {
            id: seq.current--,
            userId: "guest",
            fromPersonId: SELF_PERSON_ID,
            toPersonId: person.id,
            kind: input.kind?.trim() || "friend",
            createdAt: new Date(),
          },
        ])
        return
      }
      await addPersonAction(input)
      router.refresh()
    },
    [guest, router],
  )

  const addRelationship = useCallback(
    async (fromId: number, toId: number, kind: string) => {
      if (guest) {
        const rel: Relationship = {
          id: seq.current--,
          userId: "guest",
          fromPersonId: fromId,
          toPersonId: toId,
          kind,
          createdAt: new Date(),
        }
        setGuestRels((r) => [...r, rel])
        return
      }
      await addRelationshipAction(fromId, toId, kind)
      router.refresh()
    },
    [guest, router],
  )

  const deletePerson = useCallback(
    async (id: number) => {
      if (guest) {
        setGuestRels((r) =>
          r.filter((x) => x.fromPersonId !== id && x.toPersonId !== id),
        )
        setGuestPeople((p) => p.filter((x) => x.id !== id))
        return
      }
      await deletePersonAction(id)
      router.refresh()
    },
    [guest, router],
  )

  const deleteRelationship = useCallback(
    async (id: number) => {
      if (guest) {
        setGuestRels((r) => r.filter((x) => x.id !== id))
        return
      }
      await deleteRelationshipAction(id)
      router.refresh()
    },
    [guest, router],
  )

  const value = useMemo<CircleData>(
    () => ({
      guest,
      people,
      relationships,
      addPerson,
      addRelationship,
      deletePerson,
      deleteRelationship,
    }),
    [
      guest,
      people,
      relationships,
      addPerson,
      addRelationship,
      deletePerson,
      deleteRelationship,
    ],
  )

  return (
    <CircleDataContext.Provider value={value}>
      {children}
    </CircleDataContext.Provider>
  )
}

export function useCircleData() {
  const ctx = useContext(CircleDataContext)
  if (!ctx)
    throw new Error("useCircleData must be used within CircleDataProvider")
  return ctx
}
