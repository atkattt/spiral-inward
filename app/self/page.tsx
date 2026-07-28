import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { SelfSpaceView } from "@/components/self/self-space-view"
import { loadSelfReads } from "@/lib/self/reads-data"

export const metadata = {
  title: "Self · Spiral Inward",
  description: "Your self, being built.",
}

export default async function SelfPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    const cookieStore = await cookies()
    if (cookieStore.get("spiral_guest")?.value !== "1") redirect("/sign-in")
    // Guests can see the shape of the page, but there's no chart to read and
    // the conversation stays locked.
    return <SelfSpaceView reads={null} />
  }

  // The chat gate is derived from the reads themselves now (both vedic phases
  // cleared), so the reveal radius is no longer fetched here.
  const reads = await loadSelfReads(supabase, user.id)
  return <SelfSpaceView reads={reads} userId={user.id} />
}
