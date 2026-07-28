/**
 * Resolved Supabase connection settings.
 *
 * These are PUBLIC values (the project URL and the anon/publishable key) and are
 * shipped to the browser via the NEXT_PUBLIC_* env vars.
 *
 * There are deliberately NO fallback values here. A hardcoded fallback means a
 * misconfigured environment silently connects to whatever project was baked into
 * the source, instead of failing — which risks preview/development traffic
 * reading and writing production data unnoticed. Missing configuration must be
 * loud and immediate.
 *
 * NOTE: `process.env.NEXT_PUBLIC_*` is inlined at build time, so these must be
 * present in the *build* environment, not just at runtime.
 */
function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `[spiral-inward] Missing required environment variable: ${name}. ` +
        `Set it in your Vercel project (Production, Preview, and Development) ` +
        `and in .env.development.local for local work. See .env.example.`,
    )
  }
  return value
}

export const SUPABASE_URL = required(
  "NEXT_PUBLIC_SUPABASE_URL",
  process.env.NEXT_PUBLIC_SUPABASE_URL,
)

export const SUPABASE_ANON_KEY = required(
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
)
