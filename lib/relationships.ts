export const RELATIONSHIP_KINDS = [
  "mother",
  "father",
  "sibling",
  "partner",
  "friend",
] as const

export type RelationshipKind = (typeof RELATIONSHIP_KINDS)[number]

export const RELATIONSHIP_LABELS: Record<RelationshipKind, string> = {
  mother: "Mother",
  father: "Father",
  sibling: "Sibling",
  partner: "Partner",
  friend: "Friend",
}

// ---------------------------------------------------------------------------
// The self as a bond endpoint. Relationships connect two `people` rows, but
// YOU are not a people row — so the sentinel id 0 (never issued by serial
// sequences, and the `relationships` table has no FK by design) stands in
// for the user. Adding a person automatically creates a you↔them bond.
// ---------------------------------------------------------------------------

export const SELF_PERSON_ID = 0

/** True if this bond endpoint is the user themself. */
export function isSelfId(personId: number): boolean {
  return personId === SELF_PERSON_ID
}

/**
 * A synthetic Person standing in for the user wherever bond lists resolve
 * their endpoints through a people map (person detail, bonds page).
 */
export function makeSelfPerson(userId: string): import("@/lib/db/schema").Person {
  return {
    id: SELF_PERSON_ID,
    userId,
    name: "you",
    birthDate: null,
    birthTime: null,
    birthTimeUnknown: true,
    birthPlace: null,
    posX: 50,
    posY: 50,
    createdAt: new Date(0),
  }
}
