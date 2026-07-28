import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { ChartTestView } from "@/components/chart-test/chart-test-view"

export const metadata = {
  title: "Chart Test · Spiral Inward",
  description: "Internal chart engine harness.",
}

export default async function ChartTestPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Internal tooling — real accounts only. No guest bypass here (unlike
  // /self and /circle), since there's nothing for a guest to see.
  if (!user) redirect("/sign-in")

  return <ChartTestView />
}
