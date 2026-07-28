export type AdminAccess =
  | { kind: "sign-in" }
  | { kind: "deny"; reason: "not-owner" | "unconfigured" }
  | { kind: "allow" }

/**
 * Pure access decision for internal tooling (/brain, /chart-test).
 *
 * Kept free of any Next.js or Supabase imports so it can be unit-tested
 * directly — Google is the only auth provider, so a test cannot mint a real
 * session to exercise the owner / non-owner branches end to end.
 *
 * FAILS CLOSED: a missing or blank adminId denies everyone rather than falling
 * back to "any signed-in user", which would silently reopen exactly the hole
 * this gate exists to close if the env var were ever dropped from an
 * environment.
 */
export function resolveAdminAccess(
  userId: string | null | undefined,
  adminId: string | null | undefined,
): AdminAccess {
  if (!userId) return { kind: "sign-in" }

  const owner = adminId?.trim()
  if (!owner) return { kind: "deny", reason: "unconfigured" }

  return userId === owner
    ? { kind: "allow" }
    : { kind: "deny", reason: "not-owner" }
}
