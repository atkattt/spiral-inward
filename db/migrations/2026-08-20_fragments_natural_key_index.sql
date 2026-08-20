-- Migration: NON-UNIQUE lookup index on the fragments natural key
-- Date: 2026-08-20
--
-- WHY
--   The runtime matcher and the import tooling both look fragments up by
--   (lens, trigger_type, condition). This btree index speeds those lookups.
--
--   It is deliberately NOT UNIQUE. Multiple fragments intentionally share one
--   placement — the export's duplicate report shows ~165 (lens, trigger_type,
--   condition) groups with several rows each (different-toned reads for the same
--   placement, chosen among by weight at runtime). A unique index would be a
--   lie about the data and would reject legitimate rows, so the natural key is
--   never used as a write-match/upsert key. The importer matches on `id` only.
--   `condition` is jsonb (default btree operator class), so it indexes directly.
--
-- HOW TO APPLY (this is NOT auto-applied — the db/ files are documentation, and
-- this project has no service-role key wired into v0):
--   Supabase Dashboard -> SQL Editor -> paste the statement below -> Run.
--
--   No preflight is needed: a non-unique index has nothing to reconcile and
--   builds regardless of how many rows share a key.

-- CONCURRENTLY avoids locking the table against reads/writes while it builds.
-- It cannot run inside a transaction block — run it on its own (the Supabase
-- SQL Editor runs it outside an explicit transaction, so this is fine).
CREATE INDEX CONCURRENTLY IF NOT EXISTS fragments_natural_key_idx
    ON public.fragments (lens, trigger_type, condition);

-- If CONCURRENTLY is ever a problem in your environment, the plain form is:
--   CREATE INDEX IF NOT EXISTS fragments_natural_key_idx
--       ON public.fragments (lens, trigger_type, condition);

-- ROLLBACK
--   DROP INDEX IF EXISTS public.fragments_natural_key_idx;
