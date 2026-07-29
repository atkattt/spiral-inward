import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { getPeople, getRelationships } from "@/app/actions/circle"
import { loadSelfReads } from "@/lib/self/reads-data"
import { bondsUnlockState } from "@/lib/circle/bonds-unlock"
import { CircleDataProvider } from "@/components/circle/circle-data-provider"
import { BondsView } from "@/components/circle/bonds-view"

export const metadata = {
  title: "Bonds · Spiral Inward",
  description: "The people in your life, added to your chart.",
}

export default async function BondsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user) {
    const [people, relationships, selfReads] = await Promise.all([
      getPeople(),
      getRelationships(),
      loadSelfReads(supabase, user.id),
    ])

    // THE GATE, ENFORCED. Dimming the menu entry only hides the door; this
    // route is still reachable by typing the URL, so bonds is re-checked here
    // against the same shared rule the spiral and the menu use. Sending them
    // back to the sky is the honest answer — that's where the reads that open
    // bonds actually live.
    const lock = bondsUnlockState(
      selfReads.matched,
      new Set(Object.keys(selfReads.responses ?? {})),
    )
    if (!lock.unlocked) redirect("/circle")

    return (
      <CircleDataProvider
        guest={false}
        initialPeople={people}
        initialRelationships={relationships}
      >
        <BondsView />
      </CircleDataProvider>
    )
  }

  // Guests: same empty-start rule as the spiral — no one until they add them.
  // The gate above can't run here: a guest's chart lives in their browser, so
  // there are no server-side matched reads or responses to weigh. Their gate
  // is enforced client-side in the spiral/menu instead.
  const cookieStore = await cookies()
  if (cookieStore.get("spiral_guest")?.value === "1") {
    return (
      <CircleDataProvider guest initialPeople={[]} initialRelationships={[]}>
        <BondsView />
      </CircleDataProvider>
    )
  }

  redirect("/sign-in")
}
