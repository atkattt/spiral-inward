-- ===========================================================================
-- NEON  --  public schema
-- ===========================================================================
-- Dumped 2026-07-28 from the live database (DATABASE_URL) by querying
-- information_schema.columns, information_schema.sequences, pg_constraint,
-- pg_indexes, information_schema.triggers and pg_class.
--
-- EVERY statement in this file is DUMPED from the live database. Nothing here
-- is reconstructed or guessed. Column order matches ordinal_position; types,
-- nullability, defaults, constraint names and index definitions are verbatim
-- from the catalogs.
--
-- This is DOCUMENTATION of live state, not a migration. See db/README.md.
--
-- Identifiers are quoted camelCase because the tables were created from
-- lib/db/schema.ts (Drizzle) with camelCase column names, which Postgres
-- preserves only when quoted. "user" additionally needs quoting because it is
-- a reserved word.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- Sequences (owned by the serial primary keys below)
-- ---------------------------------------------------------------------------

CREATE SEQUENCE IF NOT EXISTS public.people_id_seq AS integer START WITH 1 INCREMENT BY 1;
CREATE SEQUENCE IF NOT EXISTS public.relationships_id_seq AS integer START WITH 1 INCREMENT BY 1;


-- ---------------------------------------------------------------------------
-- people  --  the user's circle. 6 rows at dump time.
-- ---------------------------------------------------------------------------
-- `userId` holds the Supabase auth user id as text. There is deliberately no
-- foreign key: the identity lives in a different database (Supabase auth),
-- so referential integrity cannot be enforced here.

CREATE TABLE public.people (
    id                 integer                     NOT NULL DEFAULT nextval('public.people_id_seq'::regclass),
    "userId"           text                        NOT NULL,
    name               text                        NOT NULL,
    "birthDate"        text,
    "birthTime"        text,
    "birthTimeUnknown" boolean                     NOT NULL DEFAULT false,
    "birthPlace"       text,
    "posX"             integer                     NOT NULL DEFAULT 50,
    "posY"             integer                     NOT NULL DEFAULT 50,
    "createdAt"        timestamp without time zone NOT NULL DEFAULT now(),
    CONSTRAINT people_pkey PRIMARY KEY (id)
);

ALTER SEQUENCE public.people_id_seq OWNED BY public.people.id;


-- ---------------------------------------------------------------------------
-- relationships  --  bonds between two people rows. 2 rows at dump time.
-- ---------------------------------------------------------------------------
-- NOTE (dumped fact, not a recommendation): "fromPersonId" and "toPersonId"
-- have NO foreign key to people.id. pg_constraint reports only the primary
-- key for this table. Deletion order is therefore enforced in application
-- code (app/actions/account.ts deletes relationships before people), not by
-- the database.

CREATE TABLE public.relationships (
    id             integer                     NOT NULL DEFAULT nextval('public.relationships_id_seq'::regclass),
    "userId"       text                        NOT NULL,
    "fromPersonId" integer                     NOT NULL,
    "toPersonId"   integer                     NOT NULL,
    kind           text                        NOT NULL,
    "createdAt"    timestamp without time zone NOT NULL DEFAULT now(),
    CONSTRAINT relationships_pkey PRIMARY KEY (id)
);

ALTER SEQUENCE public.relationships_id_seq OWNED BY public.relationships.id;


-- ---------------------------------------------------------------------------
-- user_progress  --  revealed frontier of the explorable universe.
-- One row per user. 1 row at dump time.
-- ---------------------------------------------------------------------------

CREATE TABLE public.user_progress (
    "userId"       text                        NOT NULL,
    "revealRadius" integer                     NOT NULL DEFAULT 240,
    "updatedAt"    timestamp without time zone NOT NULL DEFAULT now(),
    CONSTRAINT user_progress_pkey PRIMARY KEY ("userId")
);


-- ===========================================================================
-- ORPHANED BETTER AUTH TABLES  --  present in the live database, NOT in
-- lib/db/schema.ts, and not referenced anywhere in application code.
-- ===========================================================================
-- These four tables are DUMPED from the live database exactly as they exist.
-- They are included because this file documents live state, and a dump that
-- omitted them would misrepresent the database.
--
-- Context: lib/db/schema.ts says Better Auth "was never wired up, so its
-- table declarations were removed" — but only the DECLARATIONS were removed.
-- The tables themselves were created at some point and still exist. Grep
-- confirms no application code reads or writes them. Authentication is
-- entirely Supabase (Google OAuth).
--
-- They appear to be dead weight, but this file does not act on that — see
-- db/README.md. Verify they are empty before considering any cleanup.
-- ===========================================================================

CREATE TABLE public."user" (
    id              text                        NOT NULL,
    name            text                        NOT NULL,
    email           text                        NOT NULL,
    "emailVerified" boolean                     NOT NULL DEFAULT false,
    image           text,
    "createdAt"     timestamp without time zone NOT NULL DEFAULT now(),
    "updatedAt"     timestamp without time zone NOT NULL DEFAULT now(),
    CONSTRAINT user_pkey PRIMARY KEY (id),
    CONSTRAINT user_email_key UNIQUE (email)
);

CREATE TABLE public.session (
    id          text                        NOT NULL,
    "expiresAt" timestamp without time zone NOT NULL,
    token       text                        NOT NULL,
    "createdAt" timestamp without time zone NOT NULL DEFAULT now(),
    "updatedAt" timestamp without time zone NOT NULL DEFAULT now(),
    "ipAddress" text,
    "userAgent" text,
    "userId"    text                        NOT NULL,
    CONSTRAINT session_pkey PRIMARY KEY (id),
    CONSTRAINT session_token_key UNIQUE (token),
    CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId")
        REFERENCES public."user"(id) ON DELETE CASCADE
);

CREATE TABLE public.account (
    id                      text                        NOT NULL,
    "accountId"             text                        NOT NULL,
    "providerId"            text                        NOT NULL,
    "userId"                text                        NOT NULL,
    "accessToken"           text,
    "refreshToken"          text,
    "idToken"               text,
    "accessTokenExpiresAt"  timestamp without time zone,
    "refreshTokenExpiresAt" timestamp without time zone,
    scope                   text,
    password                text,
    "createdAt"             timestamp without time zone NOT NULL DEFAULT now(),
    "updatedAt"             timestamp without time zone NOT NULL DEFAULT now(),
    CONSTRAINT account_pkey PRIMARY KEY (id),
    CONSTRAINT "account_userId_fkey" FOREIGN KEY ("userId")
        REFERENCES public."user"(id) ON DELETE CASCADE
);

CREATE TABLE public.verification (
    id          text                        NOT NULL,
    identifier  text                        NOT NULL,
    value       text                        NOT NULL,
    "expiresAt" timestamp without time zone NOT NULL,
    "createdAt" timestamp without time zone          DEFAULT now(),
    "updatedAt" timestamp without time zone          DEFAULT now(),
    CONSTRAINT verification_pkey PRIMARY KEY (id)
);


-- ---------------------------------------------------------------------------
-- Indexes (complete — pg_indexes returns exactly these nine)
-- ---------------------------------------------------------------------------
-- All nine are the unique indexes backing the primary keys and unique
-- constraints above. There are NO secondary indexes.
--
-- Dumped observation: no index exists on people."userId", relationships."userId",
-- or any other non-key column, so per-user lookups are sequential scans. At
-- 6 and 2 rows this is irrelevant; noted only because a schema review would
-- otherwise have to re-derive it.
--
--   CREATE UNIQUE INDEX people_pkey ON public.people USING btree (id);
--   CREATE UNIQUE INDEX relationships_pkey ON public.relationships USING btree (id);
--   CREATE UNIQUE INDEX user_progress_pkey ON public.user_progress USING btree ("userId");
--   CREATE UNIQUE INDEX user_pkey ON public."user" USING btree (id);
--   CREATE UNIQUE INDEX user_email_key ON public."user" USING btree (email);
--   CREATE UNIQUE INDEX session_pkey ON public.session USING btree (id);
--   CREATE UNIQUE INDEX session_token_key ON public.session USING btree (token);
--   CREATE UNIQUE INDEX account_pkey ON public.account USING btree (id);
--   CREATE UNIQUE INDEX verification_pkey ON public.verification USING btree (id);


-- ---------------------------------------------------------------------------
-- Triggers:      none (information_schema.triggers returns 0 rows)
-- Row security:  DISABLED on all seven tables (pg_class.relrowsecurity = false)
-- ---------------------------------------------------------------------------
-- There is no RLS here and no Neon-side auth. Every query is scoped by
-- "userId" in application code (Drizzle `where eq(table.userId, userId)`).
-- That scoping is the ONLY thing separating users' rows in this database.
-- ---------------------------------------------------------------------------
