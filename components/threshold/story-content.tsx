const fraunces = "'Geist Pixel', ui-monospace, monospace"

/**
 * Shared "what this is / where it's going" story copy. The words live here in
 * exactly one place, expressed as segment arrays so multiple presentations can
 * render them:
 *   - <StoryContent />     : static serif reading text (Threshold loader)
 *   - <StoryReadCards />   : animated terminal cards (the /about page)
 */

export type StorySegment = {
  text: string
  /** render as glowing white emphasis */
  glow?: boolean
  /** render dim + italic (used for the editable origin-story placeholder) */
  dim?: boolean
  /** optional font size override */
  fontSize?: number | string
  /** optional line height override */
  lineHeight?: number | string
}

export type StorySection = {
  title: string
  body: StorySegment[]
}

export const STORY_SECTIONS: StorySection[] = [
  {
    title: "What this is",
    body: [
      {
        text: "spiral inward starts with the exact time and place you were born. it reads that moment through vedic astrology and makes a first sketch of who you are.\n\nthat's just the first lens. keep going and new ones unlock: other schools of astrology, other ways of mapping a person. same birth moment, different angle every time.\n\nit won't tell you who you are. it ",
        fontSize: 12,
      },
      { text: "asks", glow: true, fontSize: 12 },
      {
        text: ". you decide what's true, and slowly the chart stops being the sky's guess and starts being ",
        fontSize: 12,
      },
      { text: "yours", glow: true, fontSize: 12 },
      { text: ".", fontSize: 12 },
    ],
  },
  {
    title: "How it works",
    body: [
      {
        text: "every read is a small claim about you. keep the ones that fit, release the ones that don't. both shape your chart.\n\nyou can add your own words too: things you know about yourself that no chart could guess. and you can add your people, to see how your charts connect.\n\nwork through enough reads and the next lens opens. the more you respond, the more the spiral becomes ",
        fontSize: 12,
      },
      { text: "yours", glow: true, fontSize: 12 },
      { text: ".", fontSize: 12 },
    ],
  },
  {
    title: "How it came to be",
    body: [
      // EDITABLE — replace this segment with your origin story.
      { text: "[ this paragraph is a placeholder — your origin story goes here ]", dim: true },
      { text: "\n\nFor now: it was made by someone who wanted a mirror that " },
      { text: "listens", glow: true },
      { text: " before it speaks." },
    ],
  },
]

/**
 * Static serif rendering of the story — used by the Threshold loading screen,
 * where the copy sits quietly beneath the loader as reading material.
 */
export function StoryContent() {
  return (
    <>
      {STORY_SECTIONS.map((section) => (
        <section key={section.title} className="mt-12">
          <h2
            className="text-2xl italic leading-tight"
            style={{ fontFamily: fraunces, color: "#e8e4da" }}
          >
            {section.title}
          </h2>
          <p className="mt-4 whitespace-pre-line text-pretty font-sans text-[15px] leading-relaxed text-muted-foreground">
            {section.body.map((seg, i) => (
              <Segment key={i} seg={seg} />
            ))}
          </p>
        </section>
      ))}
    </>
  )
}

function Segment({ seg }: { seg: StorySegment }) {
  if (seg.glow) {
    return (
      <span style={{ color: "#f5f5f5", textShadow: "0 0 10px rgba(255,255,255,0.45)" }}>
        {seg.text}
      </span>
    )
  }
  if (seg.dim) {
    return <span className="italic text-muted-foreground/60">{seg.text}</span>
  }
  return <>{seg.text}</>
}
