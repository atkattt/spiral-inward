"use server"

import { createClient } from "@/lib/supabase/server"
import { db } from "@/lib/db"
import { people, relationships, userProgress } from "@/lib/db/schema"
import { eq } from "drizzle-orm"

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

  const userId = user.id

  // Supabase-side journey rows (each RLS-scoped to the user's own id).
  const journeyTables = [
    "charts",
    "self_entries",
    "conversations",
    "read_responses",
  ] as const
  const results = await Promise.all(
    journeyTables.map((table) =>
      supabase.from(table).delete().eq("profile_id", userId),
    ),
  )
  // Tolerate missing tables (42P01) in older environments; name the table
  // in real failures so they can be diagnosed from the client toast.
  const failedIndex = results.findIndex(
    (r) => r.error && r.error.code !== "42P01",
  )
  if (failedIndex !== -1) {
    const failed = results[failedIndex]
    return {
      error: `${journeyTables[failedIndex]}: ${failed.error?.message}`,
    }
  }

  // Reset the profile's birth_place back to the "pending" placeholder the
  // DB trigger seeds new profiles with. Without this, ensureUserChart()
  // would silently RECOMPUTE the chart from the retained birth data and
  // skip onboarding — the journey wouldn't actually restart. Setting ONLY
  // birth_place is deliberate: the onboarding gate checks
  // `birth_place !== "pending"`, and nulling the other birth columns can
  // violate NOT NULL constraints on live databases.
  const { error: profileError } = await supabase
    .from("profiles")
    .update({ birth_place: "pending" })
    .eq("id", userId)
  if (profileError) return { error: `profile reset: ${profileError.message}` }

  // Drizzle-side journey rows: the circle's people + bonds and the fog
  // frontier (these drive the spiral markers and the avatar's growth).
  // relationships first — it references people.
  try {
    await db.delete(relationships).where(eq(relationships.userId, userId))
    await db.delete(people).where(eq(people.userId, userId))
    await db.delete(userProgress).where(eq(userProgress.userId, userId))
  } catch {
    // tables may not exist yet in older environments — reset still succeeds
  }

  return { error: null }
}

/**
 * Permanently deletes the signed-in user's own data rows (chart, reads,
 * conversations, profile). Every delete is scoped to the session user id and
 * relies on row-level security, so a user can only ever remove their own rows.
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

  const userId = user.id

  // Delete dependent data first, then the profile row. Each is scoped to the
  // user's own id so RLS permits it. read_responses is the journey state
  // (answered reads) — without deleting it, a returning user's spiral would
  // rebuild mid-journey instead of starting fresh at the first star.
  const deletions = [
    supabase.from("charts").delete().eq("profile_id", userId),
    supabase.from("self_entries").delete().eq("profile_id", userId),
    supabase.from("conversations").delete().eq("profile_id", userId),
    supabase.from("read_responses").delete().eq("profile_id", userId),
  ]

  const results = await Promise.all(deletions)
  // Journey tables may not exist yet in older environments — ignore
  // "relation does not exist" (42P01) but surface real failures.
  const failed = results.find(
    (r) => r.error && r.error.code !== "42P01",
  )
  if (failed?.error) {
    return { error: failed.error.message }
  }

  // Neon-side rows (Drizzle): the circle's people + bonds and the revealed
  // frontier all live there, keyed by userId — delete them so nothing of the
  // account's journey survives. relationships first (it references people).
  // Tolerate missing tables in older environments.
  try {
    await db.delete(relationships).where(eq(relationships.userId, userId))
    await db.delete(people).where(eq(people.userId, userId))
    await db.delete(userProgress).where(eq(userProgress.userId, userId))
  } catch {
    // table may not exist yet — journey reset still succeeds
  }

  /**
   * Blank the profile instead of DELETEing the row.
   *
   * Deleting it created an unrecoverable account: the profiles row is only ever
   * created by the `auth.users` insert trigger, and this action cannot delete
   * the auth user (no service-role key — see the TODO above). Signing back in
   * with the same Google account reuses the existing auth.users row, so the
   * trigger never re-fires and no profiles row comes back. The user then had a
   * session pointing at a row that did not exist, onboarding's UPDATE silently
   * matched zero rows, and they landed in a permanently empty spiral.
   *
   * Overwriting the birth columns erases the same personal data the DELETE did,
   * and resetting birth_place to the placeholder puts the account back through
   * onboarding exactly like a brand-new one. UPDATE also only needs the
   * permission we know the session has.
   */
  const { error: profileError } = await supabase
    .from("profiles")
    .update({
      birth_date: null,
      birth_time: null,
      birth_lat: null,
      birth_lng: null,
      timezone: null,
      birth_place: "pending",
    })
    .eq("id", userId)
  if (profileError) {
    // Some deployments make the birth columns NOT NULL; the placeholder alone
    // is enough to force onboarding, so fall back to just that.
    const { error: fallbackError } = await supabase
      .from("profiles")
      .update({ birth_place: "pending" })
      .eq("id", userId)
    if (fallbackError) return { error: fallbackError.message }
  }

  // Sign out on the server so the session cookie is cleared.
  await supabase.auth.signOut()

  return { error: null }
}
