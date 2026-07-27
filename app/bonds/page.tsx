import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { getPeople, getRelationships } from "@/app/actions/circle"
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
    const [people, relationships] = await Promise.all([
      getPeople(),
      getRelationships(),
    ])
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
