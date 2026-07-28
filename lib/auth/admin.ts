import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { resolveAdminAccess } from "@/lib/auth/access"

/**
 * Gate for internal tooling (/brain, /chart-test) — owner only.
 *
 *   - signed out            -> /sign-in
 *   - signed in, not owner  -> /circle (quiet; not an error page, so a curious
 *                              user just lands back in the app)
 *   - signed in, owner      -> returns the user
 *
 * The decision itself lives in lib/auth/access.ts as a pure function so it can
 * be unit-tested. Checked at request time rather than module load, so a missing
 * env var cannot take down unrelated pages the way lib/supabase/config.ts would.
 */
export async function requireAdmin() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const access = resolveAdminAccess(user?.id, process.env.ADMIN_USER_ID)

  if (access.kind === "sign-in") redirect("/sign-in")

  if (access.kind === "deny") {
    if (access.reason === "unconfigured") {
      console.warn(
        "[spiral-inward] ADMIN_USER_ID is not set; denying access to internal " +
          "tooling. Set it in the Vercel project (Production, Preview, and " +
          "Development). See .env.example.",
      )
    }
    redirect("/circle")
  }

  // Non-null here: kind === "allow" is only reachable with a userId.
  return user!
}
