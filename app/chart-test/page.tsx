import { ChartTestView } from "@/components/chart-test/chart-test-view"
import { requireAdmin } from "@/lib/auth/admin"

export const dynamic = "force-dynamic"

export const metadata = {
  title: "Chart Test · Spiral Inward",
  description: "Internal chart engine harness.",
}

export default async function ChartTestPage() {
  // Owner only: signed out -> /sign-in, signed in but not the owner -> /circle.
  await requireAdmin()

  return <ChartTestView />
}
