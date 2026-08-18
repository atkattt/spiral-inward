// Behavior presets for the read-open scene: HOW the creature carries itself
// while a given read is open, driven by the fragment's TONE with LIFE_DOMAIN
// as a subtle modifier. All the tunable numbers live here.
//
// tone → the base personality:
//   gentle      — slow deep breathing, soft sway, sleepy long blinks,
//                 mostly resting with an occasional small shuffle. calm.
//   confronting — stiller and more direct: planted stance, minimal bounce,
//                 steady gaze (rare blinks), an occasional sharp little
//                 turn/lean toward the panel text, as if looking at you.
//   hopeful     — lighter and springier: small upward hops, quicker blinks,
//                 more side-to-side wandering, an occasional happy wiggle.
//   neutral     — the creature's normal idle behavior.
//
// life_domain → layered on top, subtle:
//   crisis        — a faint ember-like flicker in the creature's glow
//   spirit        — slower everything + occasional drift up a few px, settle
//   work          — busier shuffling
//   relationships — leans slightly toward the panel
//   identity / lineage — none

/**
 * The central avatar's resting expression.
 *
 * Distinct from ReadMood below: this is a single named EXPRESSION (a face),
 * while ReadMood is a bundle of behavior timings for an open read. Transient
 * values (agree / disagree / submit) were designed to decay back to "idle";
 * persistent ones hold until changed.
 *
 * Lives here rather than in a component because it outlived the component that
 * declared it — SelfCreature renders the avatar now, and this type is passed
 * through SpiralUniverse for API compatibility.
 */
export type Mood =
  | "idle"
  | "agree"
  | "disagree"
  | "submit"
  | "curious"
  | "content"
  | "overwhelmed"
  | "sleepy"

export type ReadMoodTone = "gentle" | "confronting" | "hopeful" | "neutral"

export type ReadMood = {
  tone: ReadMoodTone
  /** creatureBreathe cycle, seconds (neutral is 4.5) */
  breatheDuration: number
  /** blink loop: wait range + how long lids stay closed, ms */
  blinkMinMs: number
  blinkMaxMs: number
  blinkHoldMs: number
  /** crisis: faint ember flicker layered into the glow */
  ember: boolean
  /**
   * CSS animation shorthand for the stage wrapper (the creature's walk /
   * stance on the panel's floor). Keyframes live in globals.css.
   */
  stageAnimation: string
  /** spirit: outer-wrapper drift animation (separate element — transforms
      can't share one element with stageAnimation) */
  driftAnimation?: string
  /** relationships: constant slight lean toward the panel text, degrees */
  leanDeg: number
}

// ---- tone presets (tune freely) --------------------------------------------

const TONE_PRESETS: Record<ReadMoodTone, Omit<ReadMood, "tone">> = {
  gentle: {
    breatheDuration: 7.5, // slow, deep
    blinkMinMs: 5000,
    blinkMaxMs: 10000,
    blinkHoldMs: 380, // sleepy long blinks
    ember: false,
    // mostly resting; one soft sway + a small shuffle late in a long cycle
    stageAnimation: "stage-rest 11s ease-in-out infinite",
    leanDeg: 0,
  },
  confronting: {
    breatheDuration: 6, // stiller
    blinkMinMs: 12000,
    blinkMaxMs: 22000, // steady gaze — rare blinks
    blinkHoldMs: 110,
    ember: false,
    // planted: long holds, then a sharp little turn/lean toward the text
    stageAnimation: "stage-planted 9s ease-in-out infinite",
    leanDeg: 0,
  },
  hopeful: {
    breatheDuration: 3.2, // lighter, quicker
    blinkMinMs: 2200,
    blinkMaxMs: 5000, // quicker blinks
    blinkHoldMs: 130,
    ember: false,
    // springy: hops, side-to-side wandering, an occasional happy wiggle
    stageAnimation: "stage-springy 4.2s ease-in-out infinite",
    leanDeg: 0,
  },
  neutral: {
    breatheDuration: 4.5, // the creature's normal idle
    blinkMinMs: 4000,
    blinkMaxMs: 9000,
    blinkHoldMs: 150,
    ember: false,
    stageAnimation: "stage-shuffle 4.5s ease-in-out infinite",
    leanDeg: 0,
  },
}

// ---- life_domain modifiers (subtle, layered on top) -------------------------

function applyDomain(mood: ReadMood, domain: string): ReadMood {
  switch (domain) {
    case "crisis":
      return { ...mood, ember: true }
    case "spirit": {
      // slower everything + an occasional upward drift and settle
      const slower = (anim: string) =>
        anim.replace(/([\d.]+)s/, (_, n) => `${(Number(n) * 1.4).toFixed(1)}s`)
      return {
        ...mood,
        breatheDuration: mood.breatheDuration * 1.4,
        blinkMinMs: mood.blinkMinMs * 1.4,
        blinkMaxMs: mood.blinkMaxMs * 1.4,
        stageAnimation: slower(mood.stageAnimation),
        driftAnimation: "stage-drift 13s ease-in-out infinite",
      }
    }
    case "work": {
      // busier shuffling: same walk, meaningfully faster
      const busier = (anim: string) =>
        anim.replace(/([\d.]+)s/, (_, n) => `${(Number(n) * 0.6).toFixed(1)}s`)
      return { ...mood, stageAnimation: busier(mood.stageAnimation) }
    }
    case "relationships":
      return { ...mood, leanDeg: 3 }
    default:
      // identity, lineage, unknown → no modifier
      return mood
  }
}

// ---- public: fragment (tone, life_domain) → mood -----------------------------

export function moodForRead(
  tone: string | null | undefined,
  lifeDomain: string | null | undefined,
): ReadMood {
  const t = (tone ?? "").trim().toLowerCase()
  const preset =
    t === "gentle" || t === "confronting" || t === "hopeful"
      ? TONE_PRESETS[t]
      : TONE_PRESETS.neutral
  const base: ReadMood = {
    tone: (t in TONE_PRESETS ? t : "neutral") as ReadMoodTone,
    ...preset,
  }
  return applyDomain(base, (lifeDomain ?? "").trim().toLowerCase())
}

export const NEUTRAL_MOOD: ReadMood = {
  tone: "neutral",
  ...TONE_PRESETS.neutral,
}
