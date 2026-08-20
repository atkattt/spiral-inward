// ---------------------------------------------------------------------------
// Spiral Inward — client-side model for the read + agree/disagree loop.
// All placeholder copy for now; the real chart engine + blended-voice layer
// get wired in later. Nothing here calls a backend.
// ---------------------------------------------------------------------------

export type ReadCategory = "about-you" | "bond"

export type Read = {
  id: string
  text: string
  category: ReadCategory
  // For bond/person reads, the human this read is about.
  subjectName?: string
  // The chart section this read belongs to (a SectionKey from
  // lib/spiral/sections). Stamped when the spiral builds the read, so other
  // surfaces (history) can carry the SAME section accent as its star.
  section?: string
  // The lens (phase) this read belongs to — e.g. "vedic", "vedic_deep".
  // Stamped alongside `section` when the spiral builds the read, so /history
  // can group its sections under the lens that authored them.
  lens?: string
}

export const REASON_TAGS = [
  "not me",
  "used to be",
  "too harsh",
  "not sure",
  "skip",
] as const

export type ReasonTag = (typeof REASON_TAGS)[number]

export type DisagreedRead = Read & {
  reason: ReasonTag
  filedAt: number
}

export type TruthScope = "about-me" | "about-bond"

// A what-you-know entry: the user's own words, kept without commentary.
// The sky never talks back here (no reflections, no tensions).
export type Truth = {
  id: string
  text: string
  scope: TruthScope
  createdAt: number
  // "send to your self": the user chose to hand this entry to the self.
  // The entry stays in the list wearing a small dim creature-face mark, and
  // the self chat treats it as elevated grounding. Persisted in the row's
  // kind ("truth-about-me-sent") so it survives without a schema change.
  sentToSelf?: boolean
}

// --- Seed reads about the user (the "About you" spiral) ---------------------

export const SEED_SELF_READS: Read[] = [
  { id: "self-1", category: "about-you", text: "You build safety from what you can hold." },
  { id: "self-2", category: "about-you", text: "You give more than you ask for, and quietly call it fairness." },
  { id: "self-3", category: "about-you", text: "Rest feels like something you have to earn before you're allowed it." },
  { id: "self-4", category: "about-you", text: "You read a room before you let yourself enter it." },
  { id: "self-5", category: "about-you", text: "You keep the door open long after you've decided to leave." },
  { id: "self-6", category: "about-you", text: "You mistake intensity for closeness more often than you'd admit." },
  { id: "self-7", category: "about-you", text: "You would rather be useful to someone than fully known by them." },
  { id: "self-8", category: "about-you", text: "Your patience is real, but it has an edge you rarely show." },
]

// --- Generators for person + bond reads -------------------------------------

const PERSON_READ_TEMPLATES = [
  "{name} is someone you orbit more closely than you let on.",
  "You measure a little of your own weather against {name}.",
  "There's a version of you that only {name} has met.",
]

const BOND_READ_TEMPLATES = [
  "{name} taught you what steadiness was supposed to sound like.",
  "You soften around {name} in a way you rarely allow yourself.",
  "There's an old, unnamed debt running between you and {name}.",
  "You and {name} keep rehearsing a conversation neither of you starts.",
]

function pick<T>(arr: T[], seed: string): T {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  return arr[h % arr.length]
}

export function makePersonRead(personId: number, name: string): Read {
  return {
    id: `person-${personId}`,
    category: "bond",
    subjectName: name,
    text: pick(PERSON_READ_TEMPLATES, `p${personId}${name}`).replaceAll("{name}", name),
  }
}

export function makeBondRead(relationshipId: number, otherName: string): Read {
  return {
    id: `bond-${relationshipId}`,
    category: "bond",
    subjectName: otherName,
    text: pick(BOND_READ_TEMPLATES, `b${relationshipId}${otherName}`).replaceAll("{name}", otherName),
  }
}


