-- Migration: unique index on the fragments natural key
-- Date: 2026-08-20
--
-- WHY
--   The import tooling upserts fragments on (lens, trigger_type, condition)
--   when a row carries no id. PostgREST's ON CONFLICT / merge-duplicates needs a
--   matching unique index to target, and the index also prevents two rows from
--   ever sharing that key (which would make natural-key upserts ambiguous).
--   `condition` is jsonb, which has a default btree operator class, so it can
--   participate in a btree unique index directly.
--
-- HOW TO APPLY (this is NOT auto-applied — the db/ files are documentation, and
-- this project has no service-role key wired into v0):
--   Supabase Dashboard -> SQL Editor -> paste the statement below -> Run.
--
-- PREFLIGHT — reconcile duplicates first, or CREATE will fail.
--   `scripts/fragments-export.mjs` prints a natural-key duplicate report. You
--   can also check in SQL:
--
--     SELECT lens, trigger_type, condition, count(*), array_agg(id)
--     FROM public.fragments
--     GROUP BY lens, trigger_type, condition
--     HAVING count(*) > 1;
--
--   Expected result at the 799-row baseline: ZERO rows (no duplicates). If any
--   rows come back, they must be merged/removed before the index can be built.

-- CONCURRENTLY avoids locking the table against reads/writes while it builds.
-- It cannot run inside a transaction block — run it on its own (the Supabase
-- SQL Editor runs it outside an explicit transaction, so this is fine).
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS fragments_natural_key_uniq
    ON public.fragments (lens, trigger_type, condition);

-- If CONCURRENTLY is ever a problem in your environment, the plain form is:
--   CREATE UNIQUE INDEX IF NOT EXISTS fragments_natural_key_uniq
--       ON public.fragments (lens, trigger_type, condition);

-- ROLLBACK
--   DROP INDEX IF EXISTS public.fragments_natural_key_uniq;
