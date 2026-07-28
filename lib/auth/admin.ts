import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"

/**
 * Gate for internal tooling (/brain, /chart-test) — owner only.
 *
 * Three outcomes:
 *   - signed out            -> /sign-in
 *   - signed in, not owner  -> /circle (quiet; not an error page, so a curious
 *                              user just lands back in the app)
 *   - signed in, owner      -> returns the user
 *
 * Deliberately FAILS CLOSED: if ADMIN_USER_ID is unset or blank, nobody is
 * treated as the owner and everyone signed in is bounced to /circle. The
 * alternative (treating "unset" as "allow any signed-in user") would silently
 * reopen exactly the hole this gate exists to close if the env var were ever
 * dropped from an environment.
 *
 * This is checked at request time, not module load, so a missing value cannot
 * take down unrelated pages the way lib/supabase/config.ts would.
 */
export async function requireAdmin() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect("/sign-in")

  const adminId = process.env.ADMIN_USER_ID?.trim()

  if (!adminId) {
    console.warn(
      "[spiral-inward] ADMIN_USER_ID is not set; denying access to internal " +
        "tooling. Set it in the Vercel project (Production, Preview, and " +
        "Development) and in .env.development.local. See .env.example.",
    )
    redirect("/circle")
  }

  if (user.id !== adminId) redirect("/circle")

  return user
}
