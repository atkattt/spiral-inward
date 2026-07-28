import { drizzle } from "drizzle-orm/node-postgres"
import { Pool } from "pg"
import * as schema from "./schema"

/**
 * Neon connection (people / relationships / user_progress).
 *
 * Previously this passed `process.env.DATABASE_URL` straight into the Pool. When
 * that var was missing, `pg` fell back to libpq defaults (localhost, the OS
 * user) and failed later with an opaque connection error far from the real
 * cause. Fail loudly at startup instead.
 */
const connectionString = process.env.DATABASE_URL

if (!connectionString) {
  throw new Error(
    "[spiral-inward] Missing required environment variable: DATABASE_URL. " +
      "This is the Neon Postgres connection string used for people, relationships, " +
      "and lens progression. See .env.example.",
  )
}

export const pool = new Pool({ connectionString })
export const db = drizzle(pool, { schema })
