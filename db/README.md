# `db/` — schema documentation

Two files describing the live state of the two databases this app uses:

| File | Database | Provenance |
| --- | --- | --- |
| `neon-schema.sql` | Neon Postgres | 100% dumped from live catalogs |
| `supabase-schema.sql` | Supabase Postgres (`public`) | Part dumped / part reconstructed — **see markers** |

## These are not migrations

They are a **snapshot of what the databases currently look like**, written to be
read and reviewed. They are not a migration history, and running them is not a
workflow.

Do not apply either file to a live database. Neither is idempotent against a
populated database, `supabase-schema.sql` contains statements that were never
executed anywhere (see below), and applying a `CREATE TABLE` over a table
holding 709 fragment rows is not a recoverable operation. When the schema needs
to change, change it in Supabase/Neon (or via a real migration tool) and then
**re-dump into these files** so they keep describing reality.

Treat a diff in these files as a *report* that the schema changed, never as the
mechanism that changes it.

## What lives where

The split is historical: the astrology/reads engine was built on Supabase, and
the "circle" graph feature was added later on Neon. There is no single database.

**Supabase** — identity plus everything content- and reading-related.
Authentication is Supabase Google OAuth; it is the sole source of user identity.

- `profiles` — one row per auth user, birth data. Created by a trigger, never by app code.
- `charts` — computed natal chart (`planets`, `ascendant`, `houses`, `dashas` as `jsonb`).
- `fragments` — the 709-row interpretive text corpus. Publicly readable.
- `lenses` — the 3 progression stages. Publicly readable.
- `user_lens_progress` — which lenses a user has unlocked.
- `read_responses` — a user's agree/disagree/unsure per fragment.
- `self_entries` — free-text answers to fragment questions.
- `conversations`, `messages` — chat tables that **no application code touches**.
- `jungian_concepts` — concept rows referenced by `fragments.concept_id`.

**Neon** — the circle graph only, accessed through Drizzle (`lib/db/schema.ts`).

- `people` — the user's circle (6 rows).
- `relationships` — bonds between two `people` rows (2 rows).
- `user_progress` — revealed radius of the explorable universe (1 row).
- `user`, `session`, `account`, `verification` — **orphaned Better Auth tables.**
  They exist in the database but are absent from `lib/db/schema.ts` and unused by
  any code. Documented because this file documents reality; not cleaned up here.

Nothing joins across the two databases. Neon rows carry the Supabase auth user
id in a plain `text` `"userId"` column with **no foreign key**, because the
referenced identity lives in a different database entirely. Neon also has **no
RLS** — every Neon query is scoped by `"userId"` in application code, and that
scoping is the only thing separating one user's rows from another's.

## Reading `supabase-schema.sql`

This is the important caveat. There is no direct Postgres connection to Supabase
in this environment and no service-role key, so `pg_dump` was not an option;
PostgREST's OpenAPI endpoint rejects the publishable key with
`Secret API key required`. The file was therefore assembled from what the anon
key *could* prove, and every line carries a marker:

- `[D] Dumped` — observed directly from the live database.
- `[P] Proven` — established by a discriminating probe (a bad filter value makes
  Postgres report the real column type before RLS applies; `jsonb` sorts and
  `json` does not; a PostgREST embed only resolves across a real foreign key;
  `ON CONFLICT` reports `42P10` only when no unique index matches).
- `[R] RECONSTRUCTED` — **inferred from application code, not verified.**

Table names, column names, column types, `jsonb`-vs-`json`, nine foreign keys and
several unique constraints are `[D]`/`[P]` — real evidence.

**Everything `[R]` needs checking against the dashboard.** That includes all 24
`CREATE POLICY` statements, every `NOT NULL`/`DEFAULT`, the `PRIMARY KEY`
designations, all `ON DELETE` behaviour, the `CHECK` constraints, and the
`on_auth_user_created` trigger with its `handle_new_user()` body. For the RLS
policies only their *effect* was observable (anon reads return rows, or zero
rows, or `42501`); the policy bodies are a plausible reconstruction consistent
with that effect, and the real ones may differ in name, count, or `USING` clause
while producing identical behaviour.

Two `[R]` items are weaker than the rest and are flagged inline:

- `fragments_trigger_type_check` — the allowed-value list is a **lower bound**,
  derived from the values actually present across 709 rows. The real constraint
  may permit values not yet used.
- `messages` / `conversations` — no code reads them, so their shape rests on the
  column probe alone with no usage to corroborate intent.

The header of `supabase-schema.sql` carries a 7-item verify-in-dashboard
checklist covering exactly these gaps.

`neon-schema.sql` has no such caveat: `DATABASE_URL` grants direct access, so it
was dumped from `information_schema` and `pg_catalog` and every statement is
`[D]`.

## Re-dumping

Neon can be re-dumped programmatically — query `information_schema.columns`,
`pg_constraint`, `pg_indexes`, `information_schema.triggers` and `pg_class`
(`DATABASE_URL` is available to scripts via
`node --env-file-if-exists=/vercel/share/.env.project`).

Supabase cannot, until either a service-role key or a direct connection string
is available. With one, `pg_dump --schema-only --schema=public` would replace the
reconstructed two-thirds of that file with a real dump — which is the correct
long-term fix for the `[R]` markers.
