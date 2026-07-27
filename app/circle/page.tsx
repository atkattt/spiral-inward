import { createClient } from "@/lib/supabase/server"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { getPeople, getRelationships } from "@/app/actions/circle"
import { getRevealRadius } from "@/app/actions/progress"
import { loadAnswerCount, loadSelfReads, withRetry } from "@/lib/self/reads-data"
import type { UniverseFragment } from "@/lib/spiral/universe-reads"
import { CircleView } from "@/components/circle/circle-view"
import { CircleDataProvider } from "@/components/circle/circle-data-provider"
import { BirthChartBootstrap } from "@/components/birth-chart-bootstrap"

// Starting frontier for fresh / guest universes (mirrors BASE_REVEAL_RADIUS).
const BASE_REVEAL_RADIUS = 240

// Serialize a matched fragment row down to exactly what the universe needs.
function toUniverseFragment(row: {
  id: unknown
  title?: unknown
  body?: unknown
  symbol?: unknown
  tone?: unknown
  section?: unknown
  life_domain?: unknown
  trigger_type?: unknown
  condition?: unknown
  weight?: unknown
}): UniverseFragment {
  return {
    id: String(row.id),
    title: typeof row.title === "string" ? row.title : "",
    body: typeof row.body === "string" ? row.body : "",
    symbol: typeof row.symbol === "string" ? row.symbol : null,
    tone: typeof row.tone === "string" ? row.tone : null,
    section: typeof row.section === "string" ? row.section : null,
    life_domain: typeof row.life_domain === "string" ? row.life_domain : null,
    trigger_type: typeof row.trigger_type === "string" ? row.trigger_type : null,
    condition: row.condition ?? null,
    weight: typeof row.weight === "number" ? row.weight : null,
  }
}

export default async function CirclePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user) {
    const [people, relationships, revealRadius, answerCount, selfReads] =
      await Promise.all([
        getPeople(),
        getRelationships(),
        getRevealRadius(),
        loadAnswerCount(supabase, user.id),
        loadSelfReads(supabase, user.id),
      ])

    // The universe's read objects = the user's matched fragments — the SAME
    // pipeline /self uses (chart → matchFragments → fragments table), with
    // the SAME saved agree/disagree responses.
    const matchedReads = selfReads.matched.map(toUniverseFragment)

    const userName =
      (user.user_metadata?.name as string | undefined) ||
      user.email?.split("@")[0] ||
      "You"

    return (
      <CircleDataProvider
        guest={false}
        initialPeople={people}
        initialRelationships={relationships}
      >
        <BirthChartBootstrap userId={user.id} />
        <CircleView
          userName={userName}
          initialRevealRadius={revealRadius}
          answerCount={answerCount}
          userId={user.id}
          matchedReads={matchedReads}
          initialResponses={selfReads.responses}
        />
      </CircleDataProvider>
    )
  }

  // No account: allow a guest walkthrough if they entered via "Look around".
  const cookieStore = await cookies()
  if (cookieStore.get("spiral_guest")?.value === "1") {
    // Guests match fragments CLIENT-side against the chart their onboarding
    // ritual stashed in local/sessionStorage — so we ship the raw fragment
    // list and let the universe run the same deterministic matcher. NEVER
    // swallow a query error here: an empty list silently erases every star
    // from the spiral (retry once, then fail loudly).
    // Guests have no lens progress rows — they only ever see the FIRST lens
    // (lowest sort_order), same starting point as a fresh account.
    const firstLensSlug = await (async () => {
      try {
        const { data } = await supabase
          .from("lenses")
          .select("slug")
          .eq("is_active", true)
          .order("sort_order", { ascending: true })
          .limit(1)
          .maybeSingle()
        return (data?.slug as string | undefined) ?? "vedic"
      } catch {
        return "vedic"
      }
    })()
    const fragmentRows = await withRetry(async () => {
      const { data, error } = await supabase
        .from("fragments")
        .select("*")
        .eq("lens", firstLensSlug)
      if (error) throw new Error(`fragments query failed: ${error.message}`)
      return data ?? []
    })
    const guestFragments = fragmentRows.map(toUniverseFragment)

    // Guests start with an empty constellation — no one appears on the
    // spiral until they add someone themselves (same as a fresh account).
    return (
      <CircleDataProvider guest initialPeople={[]} initialRelationships={[]}>
        <CircleView
          userName="Wanderer"
          initialRevealRadius={BASE_REVEAL_RADIUS}
          guestFragments={guestFragments}
        />
      </CircleDataProvider>
    )
  }

  redirect("/sign-in")
}
