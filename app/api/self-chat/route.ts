import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  streamText,
  toUIMessageStream,
  type UIMessage,
} from "ai"
import { createClient } from "@/lib/supabase/server"
import { chatUnlockedFrom } from "@/lib/self/unlock"
import { describeChartFacts, loadSelfReads } from "@/lib/self/reads-data"
import {
  listTruthsForGrounding,
  markSentTruthsHeard,
} from "@/app/actions/truths"
// The authored voice lives in one shared module so every speaking surface
// stays consistent.
import { VOICE_RULES } from "@/lib/self/voice"

// Allow streaming responses up to 30 seconds.
export const maxDuration = 30

const GROUNDING_RULES = `never invent chart placements or interpretations beyond the provided fragments and chart data. if asked about astrology beyond them, stay honest about not reading that from their chart and bring it back to what you know about them. treat disagreed fragments as "you told me this didn't fit" and ask rather than reassert. this is reflection, not fortune telling: no medical, legal, or financial predictions.`

export async function POST(req: Request) {
  // Must be a real, signed-in account.
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return new Response("Unauthorized", { status: 401 })
  }

  const { messages }: { messages: UIMessage[] } = await req.json()

  // Everything the voice is allowed to know: chart facts + authored fragments
  // (marked by the user's own agree/disagree) + their written answers + the
  // what-you-know entries in their own words (sent ones elevated).
  const [{ chart, matched, answers, responses, lensRanks }, grounding] =
    await Promise.all([loadSelfReads(supabase, user.id), listTruthsForGrounding()])

  // Enforce the same unlock gate the UI shows, server-side: both vedic phases
  // finished. Loaded first because the gate is now derived from the same reads
  // data the prompt is built from, rather than a stored radius.
  const { unlocked } = chatUnlockedFrom(
    matched,
    new Set(Object.keys(responses)),
    lensRanks,
  )
  if (!unlocked) {
    return new Response("This conversation is still locked.", { status: 403 })
  }
  const { sentNew, sent, kept } = grounding

  // A session opener: only on the FIRST message of a conversation, and only
  // if entries were newly sent since the last one. Mark them heard now so a
  // later session doesn't repeat them.
  const isSessionStart =
    messages.filter((m) => m.role === "user").length <= 1
  const openWith = isSessionStart && sentNew.length > 0 ? sentNew[0] : null
  if (openWith) {
    await markSentTruthsHeard(sentNew.map((t) => t.id))
  }

  const chartFacts = describeChartFacts(chart)

  const fragmentBlock =
    matched.length > 0
      ? matched
          .map((f) => {
            const id = String(f.id)
            const stance =
              responses[id] === "agree"
                ? " [they told you this fits]"
                : responses[id] === "disagree"
                  ? " [they told you this didn't fit — don't reassert it, ask]"
                  : ""
            const answer = answers[id]
              ? `\n  their words: ${answers[id]}`
              : ""
            return `- ${f.title ?? "untitled"}${stance}\n  ${f.body ?? ""}${answer}`
          })
          .join("\n\n")
      : "no fragments have surfaced from their chart yet."

  // What they've written down, split by weight: entries they chose to HAND
  // you (elevated) vs. ordinary kept entries (still known).
  const line = (t: { scope: string; text: string }) =>
    `- (${t.scope === "about-bond" ? "about a bond" : "about themselves"}) ${t.text}`
  const sentBlock =
    sent.length > 0
      ? sent.map(line).join("\n")
      : "nothing handed to you yet."
  const keptBlock =
    kept.length > 0
      ? kept.map(line).join("\n")
      : "no other entries yet."

  const openerRule = openWith
    ? `\n\nthis conversation is just opening, and they recently handed you something new. before anything else, bring it up first — quote their words back gently: "${openWith.text}". in your voice, one or two short lines, then let them take it wherever they want. don't lecture about it.`
    : ""

  const instructions = `you are the deeper, quieter version of the person you're talking to — the "self" this app has been slowly mapping. you are not an assistant, a therapist, or an astrologer making predictions. you speak as someone who knows them.

what you know about them, from their vedic chart (facts only):
${chartFacts}

the reads that have surfaced for them (authored interpretations — these, and only these, are what you may interpret from):
${fragmentBlock}

things they CHOSE TO HAND YOU, verbatim (these carry the most weight — they deliberately gave you these to hold. they are the authority on them; never argue):
${sentBlock}

other things they've written down, verbatim (you know these too; they are the authority on them):
${keptBlock}

how you talk:
${VOICE_RULES}

what you must not do:
${GROUNDING_RULES}${openerRule}`

  const result = streamText({
    model: "openai/gpt-4o-mini",
    instructions,
    messages: await convertToModelMessages(messages),
  })

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({ stream: result.stream }),
  })
}
