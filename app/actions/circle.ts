"use server"

import { createClient } from "@/lib/supabase/server"
import { db } from "@/lib/db"
import { people, relationships } from "@/lib/db/schema"
import { and, asc, eq, inArray, or } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { SELF_PERSON_ID } from "@/lib/relationships"

async function getUserId() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error("Unauthorized")
  return user.id
}

export async function getPeople() {
  const userId = await getUserId()
  return db
    .select()
    .from(people)
    .where(eq(people.userId, userId))
    .orderBy(asc(people.createdAt))
}

export async function getRelationships() {
  const userId = await getUserId()
  return db
    .select()
    .from(relationships)
    .where(eq(relationships.userId, userId))
    .orderBy(asc(relationships.createdAt))
}

type AddPersonInput = {
  name: string
  birthDate?: string | null
  birthTime?: string | null
  birthTimeUnknown: boolean
  birthPlace?: string | null
  /** who they are TO YOU — creates the you↔them bond on add */
  kind?: string | null
}

export async function addPerson(input: AddPersonInput) {
  const userId = await getUserId()

  // Scatter the new star somewhere within the circle (10%-90% range).
  const posX = Math.floor(15 + Math.random() * 70)
  const posY = Math.floor(15 + Math.random() * 70)

  const [created] = await db
    .insert(people)
    .values({
      userId,
      name: input.name.trim(),
      birthDate: input.birthDate?.trim() || null,
      birthTime: input.birthTimeUnknown ? null : input.birthTime?.trim() || null,
      birthTimeUnknown: input.birthTimeUnknown,
      birthPlace: input.birthPlace?.trim() || null,
      posX,
      posY,
    })
    .returning()

  // A person in your sky is never unbound: adding them IS the bond to your
  // self. SELF_PERSON_ID (0) stands in for you as the from-endpoint.
  await db.insert(relationships).values({
    userId,
    fromPersonId: SELF_PERSON_ID,
    toPersonId: created.id,
    kind: input.kind?.trim() || "friend",
  })

  revalidatePath("/circle")
  return created
}

export async function updatePerson(id: number, input: AddPersonInput) {
  const userId = await getUserId()
  await db
    .update(people)
    .set({
      name: input.name.trim(),
      birthDate: input.birthDate?.trim() || null,
      birthTime: input.birthTimeUnknown ? null : input.birthTime?.trim() || null,
      birthTimeUnknown: input.birthTimeUnknown,
      birthPlace: input.birthPlace?.trim() || null,
    })
    .where(and(eq(people.id, id), eq(people.userId, userId)))

  revalidatePath("/circle")
}

export async function deletePerson(id: number) {
  const userId = await getUserId()

  // Remove any bonds touching this person first.
  await db
    .delete(relationships)
    .where(
      and(
        eq(relationships.userId, userId),
        or(
          eq(relationships.fromPersonId, id),
          eq(relationships.toPersonId, id),
        ),
      ),
    )

  await db
    .delete(people)
    .where(and(eq(people.id, id), eq(people.userId, userId)))

  revalidatePath("/circle")
}

export async function addRelationship(
  fromPersonId: number,
  toPersonId: number,
  kind: string,
) {
  const userId = await getUserId()
  if (fromPersonId === toPersonId) throw new Error("Cannot connect a person to themselves")

  // Verify both endpoints belong to this user. SELF_PERSON_ID stands in for
  // the user themself and needs no people row.
  const realIds = [fromPersonId, toPersonId].filter(
    (id) => id !== SELF_PERSON_ID,
  )
  const owned = await db
    .select({ id: people.id })
    .from(people)
    .where(and(eq(people.userId, userId), inArray(people.id, realIds)))
  if (owned.length !== realIds.length) throw new Error("Invalid people")

  const [created] = await db
    .insert(relationships)
    .values({ userId, fromPersonId, toPersonId, kind })
    .returning()

  revalidatePath("/circle")
  return created
}

export async function deleteRelationship(id: number) {
  const userId = await getUserId()
  await db
    .delete(relationships)
    .where(and(eq(relationships.id, id), eq(relationships.userId, userId)))

  revalidatePath("/circle")
}
