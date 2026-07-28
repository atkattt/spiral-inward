"use server"

import type { SupabaseClient } from "@supabase/supabase-js"
import { createClient } from "@/lib/supabase/server"
import { db } from "@/lib/db"
import { people, relationships, userProgress } from "@/lib/db/schema"
import { eq } from "drizzle-orm"

/**
 * The user's journey lives in TWO databases:
 *   - Supabase: charts, self_entries, conversations, read_responses
 *   - Neon:     people, relationships, user_progress  (no FK to Supabase)
 *
 * Both reset paths below share this clearer so they can never drift apart.
 *
 * Every delete is VERIFIED. The previous version had two silent-failure holes
 * that let a "reset" account come back mid-journey — answered reads still lit
 * up, the frontier still wide open, old people still on the spiral:
 *
 *   1. Supabase deletes were fired without `.select()`. PostgREST reports
 *      success for a delete that matched ZERO rows, so nothing distinguished
 *      "erased 40 responses" from "erased nothing".
 *   2. The three Neon deletes shared ONE `try { … } catch {}` that swallowed
 *      every error. A single failure on `relationships` silently skipped
 *      `people` AND `user_progress` too, and reported success.
 *
 * Now each statement reports its own row count, a real failure names its table,
 * and only a genuinely missing table (42P01, older environments) is tolerated.
 */

/** Supabase journey tables, all keyed by `profile_id` and RLS-scoped. */
const SUPABASE_JOURNEY_TABLES = [
  "charts",
  "self_entries",
  "conversations",
  "read_responses",
] as const

/** Postgres `undefined_table` — tolerated so older environments still reset. */
const UNDEFINED_TABLE = "42P01"

type ClearResult = {
  error: string | null
  counts: Record<string, number>
}

async function clearJourneyRows(
  supabase: SupabaseClient,
  userId: string,
): Promise<ClearResult> {
  const counts: Record<string, number> = {}

  // --- Supabase side -------------------------------------------------------
  // `.select("id")` makes the delete report the rows it actually removed.
  // Every one of these tables has both a select_own and delete_own RLS policy,
  // so a zero count here means the rows genuinely weren't there, not that RLS
  // quietly refused.
  const results = await Promise.all(
    SUPABASE_JOURNEY_TABLES.map((table) =>
      supabase.from(table).delete().eq("profile_id", userId).select("id"),
    ),
  )

  for (const [i, result] of results.entries()) {
    const table = SUPABASE_JOURNEY_TABLES[i]
    if (result.error && result.error.code !== UNDEFINED_TABLE) {
      return { error: `${table}: ${result.error.message}`, counts }
    }
    counts[table] = result.data?.length ?? 0
  }

  // --- Neon side -----------------------------------------------------------
  // Deleted one at a time, each with its OWN error handling, so one failure
  // can't silently skip the rest. `relationships` goes first: it references
  // people.
  const neonDeletes = [
    {
      table: "relationships",
      run: () =>
        db.delete(relationships).where(eq(relationships.userId, userId)),
    },
    { table: "people", run: () => db.delete(people).where(eq(people.userId, userId)) },
    {
      table: "user_progress",
      run: () => db.delete(userProgress).where(eq(userProgress.userId, userId)),
    },
  ]

  for (const { table, run } of neonDeletes) {
    try {
      const result = (await run()) as { rowCount?: number | null }
      counts[table] = result?.rowCount ?? 0
    } catch (e) {
      const err = e as { code?: string; message?: string }
      // Missing table in an older environment is fine; anything else is a real
      // failure and must NOT be reported as a successful reset.
      if (err?.code === UNDEFINED_TABLE) {
        counts[table] = 0
        continue
      }
      return {
        error: `${table}: ${err?.message ?? "delete failed"}`,
        counts,
      }
    }
  }

  return { error: null, counts }
}

/**
 * Reset the profile's birth_place to the "pending" placeholder the DB trigger
 * seeds new profiles with. The onboarding gate checks
 * `birth_place !== "pending"`, so without this `ensureUserChart()` would
 * silently RECOMPUTE the chart from retained birth data and skip onboarding.
 *
 * Setting ONLY birth_place is deliberate: nulling the other birth columns can
 * violate NOT NULL constraints on live databases.
 */
async function resetBirthPlace(
  supabase: SupabaseClient,
  userId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("profiles")
    .update({ birth_place: "pending" })
    .eq("id", userId)
    .select("id")

  if (error) return `profile reset: ${error.message}`
  // A zero-row update means the profile row is gone. There is no
  // profiles_insert_own RLS policy, so the app cannot recreate it — say so
  // plainly instead of reporting a reset that didn't happen.
  if (!data || data.length === 0) {
    return "profile row is missing — the account can't be reset from here"
  }
  return null
}

/**
 * Erases the signed-in user's JOURNEY — chart, reads, entries, conversations,
 * people, bonds, and the revealed frontier — while keeping the auth account
 * and profile. Returning after this starts the experience from the very
 * beginning (onboarding ritual, ungrown avatar), signed in as the same user.
 */
export async function eraseJourney(): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { error: "not signed in" }

  const { error, counts } = await clearJourneyRows(supabase, user.id)
  if (error) {
    console.error("[spiral-inward] eraseJourney failed:", error, counts)
    return { error }
  }

  const profileError = await resetBirthPlace(supabase, user.id)
  if (profileError) {
    console.error("[spiral-inward] eraseJourney profile reset:", profileError)
    return { error: profileError }
  }

  return { error: null }
}

/**
 * Permanently deletes the signed-in user's own data rows (chart, reads,
 * conversations, people, bonds, frontier) and returns the profile to its
 * pre-onboarding state. Every delete is scoped to the session user id and
 * relies on row-level security, so a user can only ever remove their own rows.
 *
 * The profile ROW is deliberately kept (blanked, not deleted): it is only ever
 * created by the `auth.users` insert trigger, and this action cannot delete the
 * auth user (no service-role key — see the TODO below). Deleting the row while
 * the auth user survived produced an account that could never be used again,
 * because re-signing in reuses the same auth user, the trigger never re-fires,
 * and there is no profiles_insert_own policy to recreate it.
 *
 * Because the row survives, nothing is cleaned up by FK cascade any more — so
 * every journey table above is deleted EXPLICITLY and VERIFIED.
 *
 * TODO: This does NOT delete the underlying Supabase auth user — that requires
 * the service-role key (admin.deleteUser) which isn't available to the client
 * session. Once a service-role key is added, call
 * `supabase.auth.admin.deleteUser(userId)` from a trusted server context to
 * fully remove the account.
 */
export async function deleteAccount(): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { error: "not signed in" }

  const { error, counts } = await clearJourneyRows(supabase, user.id)
  if (error) {
    console.error("[spiral-inward] deleteAccount failed:", error, counts)
    return { error }
  }

  const profileError = await resetBirthPlace(supabase, user.id)
  if (profileError) {
    console.error("[spiral-inward] deleteAccount profile reset:", profileError)
    return { error: profileError }
  }

  // Sign out on the server so the session cookie is cleared.
  await supabase.auth.signOut()

  return { error: null }
}
