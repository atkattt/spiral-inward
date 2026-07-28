-- ===========================================================================
-- SUPABASE  --  public schema  (project ref euqkklpnvegrjecagzye)
-- ===========================================================================
-- Assembled 2026-07-28. This file is DOCUMENTATION of live state, not a
-- migration. See db/README.md.
--
-- HOW THIS WAS PRODUCED, AND WHY IT IS PART DUMP / PART RECONSTRUCTION
-- -------------------------------------------------------------------
-- There is no direct Postgres connection to Supabase in this environment and
-- no service-role key, so pg_dump / pg_catalog were unavailable. PostgREST's
-- OpenAPI endpoint also refuses the publishable (anon) key:
--     {"message":"Secret API key required"}
--
-- What WAS possible with the anon key, and is therefore real evidence:
--   * Table existence          -- every table below returned a live response.
--   * Column existence         -- an unknown column returns 42703, so each
--                                 column here was confirmed to exist.
--   * Column TYPES             -- PostgREST validates a filter's value against
--                                 the real column type BEFORE RLS decides row
--                                 visibility, so a malformed sentinel value
--                                 makes Postgres report the actual type
--                                 ("invalid input syntax for type uuid").
--   * jsonb vs json            -- jsonb has ordering operators, json does not;
--                                 ?order=col.asc succeeds only for jsonb.
--   * Foreign keys             -- a PostgREST embed (?select=*,other(*))
--                                 resolves ONLY when a real FK links the
--                                 tables.
--   * Unique constraints       -- ON CONFLICT is resolved at plan time, before
--                                 RLS rejects the row, so 42P10 ("no unique
--                                 or exclusion constraint matching") vs a
--                                 later error distinguishes absent from
--                                 present. Control probes on deliberately
--                                 bogus column pairs correctly returned 42P10,
--                                 confirming the test discriminates.
--   * Some nullability         -- a column that is NULL in all 709 readable
--                                 fragments rows cannot be NOT NULL.
--   * Column lists in full     -- fragments (709 rows) and lenses (3 rows) are
--                                 anon-readable, so their columns came back
--                                 directly from real rows.
--
-- What could NOT be observed, and is therefore RECONSTRUCTED from application
-- code and Supabase convention:
--   * NOT NULL and DEFAULT on most columns
--   * which unique index is the declared PRIMARY KEY
--   * every RLS POLICY (the policies themselves are not readable via the API;
--     only their EFFECT was observed -- see the note on each table)
--   * ON DELETE / ON UPDATE behaviour of the confirmed foreign keys
--   * CHECK constraints, including fragments_trigger_type_check
--   * the auth trigger that creates profiles rows
--
-- PER-LINE MARKERS
-- ----------------
--   [D] Dumped      -- observed directly from the live database.
--   [P] Proven      -- established by a discriminating probe (see above).
--   [R] RECONSTRUCTED -- NOT verified. Check this against the dashboard.
--
-- VERIFY-IN-DASHBOARD CHECKLIST (everything marked [R]):
--   1. NOT NULL / DEFAULT on all columns
--   2. PRIMARY KEY designations
--   3. All RLS policies on all ten tables
--   4. fragments_trigger_type_check -- its exact allowed-value list
--   5. read_responses.response check constraint (if any)
--   6. ON DELETE behaviour of all nine confirmed foreign keys
--   7. The on_auth_user_created trigger + handle_new_user() body
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- profiles  --  one row per auth user. Not anon-readable.
-- ---------------------------------------------------------------------------
-- Application code NEVER inserts into this table (only select / update /
-- delete -- verified by grep), so rows must be created by the auth trigger
-- at the bottom of this file.
--
-- Observed RLS effect: anon SELECT returns zero rows; anon INSERT is rejected
-- with 42501. Consistent with self-access-only policies.
--
-- Columns confirmed ABSENT (probed, returned 42703): email, updated_at,
-- full_name, name, avatar_url, onboarded, onboarding_complete. Note there is
-- no email column here -- email lives only in auth.users.

CREATE TABLE public.profiles (
    id            uuid                     NOT NULL,  -- [D] uuid  [P] unique index exists  [R] PK, FK -> auth.users(id)
    display_name  text,                               -- [D] exists, text  [R] nullability. Unused by application code.
    birth_date    date,                               -- [D] date            [R] nullability
    birth_time    time without time zone,             -- [D] time            [R] nullability
    birth_place   text,                               -- [D] text            [R] nullability. 'pending' = onboarding not finished.
    birth_lat     numeric,                            -- [D] numeric         [R] nullability, precision/scale
    birth_lng     numeric,                            -- [D] numeric         [R] nullability, precision/scale
    created_at    timestamp with time zone,           -- [D] timestamptz     [R] NOT NULL, DEFAULT now()
    timezone      text,                               -- [D] text            [R] nullability. IANA zone name.
    CONSTRAINT profiles_pkey PRIMARY KEY (id)         -- [P] unique index on (id)  [R] that it is the PK
);

-- [R] ENTIRE BLOCK RECONSTRUCTED -- policy bodies are not observable via the
-- API. Only the effect above was observed. Verify names and bodies.
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_select_own" ON public.profiles
    FOR SELECT USING (auth.uid() = id);
CREATE POLICY "profiles_update_own" ON public.profiles
    FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "profiles_delete_own" ON public.profiles
    FOR DELETE USING (auth.uid() = id);


-- ---------------------------------------------------------------------------
-- jungian_concepts  --  reference table. Not anon-readable (0 rows visible).
-- ---------------------------------------------------------------------------
-- Zero references anywhere in application code -- the probe below is the only
-- evidence for this table's shape.
-- Columns confirmed ABSENT: title, body, summary, updated_at, archetype.

CREATE TABLE public.jungian_concepts (
    id          uuid                     NOT NULL,  -- [D] uuid  [P] unique index exists  [R] PK, DEFAULT gen_random_uuid()
    slug        text                     NOT NULL,  -- [D] text  [P] UNIQUE index exists  [R] NOT NULL
    name        text,                               -- [D] text  [P] NO unique index       [R] nullability
    description text,                               -- [D] text                            [R] nullability
    created_at  timestamp with time zone,           -- [D] timestamptz                     [R] NOT NULL, DEFAULT now()
    CONSTRAINT jungian_concepts_pkey PRIMARY KEY (id),   -- [P] unique index  [R] PK designation
    CONSTRAINT jungian_concepts_slug_key UNIQUE (slug)   -- [P] proven by ON CONFLICT probe
);

-- [R] RECONSTRUCTED. Effect observed: anon SELECT returns zero rows, which is
-- notable -- this looks like reference data, yet unlike lenses/fragments it is
-- NOT anon-readable. Either it has no permissive read policy or it is empty;
-- the two are indistinguishable from outside. Worth checking.
ALTER TABLE public.jungian_concepts ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------------
-- lenses  --  the lens progression ladder. ANON-READABLE (3 rows).
-- ---------------------------------------------------------------------------
-- Column list below came back from real rows, so it is complete and exact.
-- There is NO id column (probed: 42703) -- slug is the key.
-- Live rows at dump time: vedic (sort_order 1, threshold 0, active),
-- plus two more (3 rows total); fragments reference only 'vedic' and
-- 'vedic_deep'.

CREATE TABLE public.lenses (
    slug             text    NOT NULL,  -- [D] text     [P] UNIQUE index exists  [R] PK designation
    name             text,              -- [D] text                              [R] nullability
    sort_order       integer,           -- [D] integer                           [R] nullability
    unlock_threshold numeric,           -- [D] numeric                           [R] nullability
    is_active        boolean,           -- [D] boolean                           [R] nullability, DEFAULT
    CONSTRAINT lenses_pkey PRIMARY KEY (slug)  -- [P] unique index on (slug)  [R] PK designation
);

-- [R] RECONSTRUCTED. Effect observed: anon CAN read all rows.
ALTER TABLE public.lenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lenses_readable_by_all" ON public.lenses
    FOR SELECT USING (true);

-- NOTE: unlock_threshold is read defensively in lib/self/lenses.ts, which
-- treats a value > 1 as a percentage and <= 1 as a fraction. The column is
-- plain numeric with no constraint pinning either convention.


-- ---------------------------------------------------------------------------
-- fragments  --  the authored interpretation library. ANON-READABLE (709 rows).
-- ---------------------------------------------------------------------------
-- Column list came back from real rows: complete and exact. All types below
-- are [D]. This is the one table where nullability is partly [P], because a
-- column that is NULL across all 709 rows cannot be NOT NULL.

CREATE TABLE public.fragments (
    id             uuid                     NOT NULL,  -- [D] uuid  [P] unique index exists  [R] PK, DEFAULT gen_random_uuid()
    trigger_type   text                     NOT NULL,  -- [D] text  [R] NOT NULL (non-null in all 709 rows, not proof)
    condition      jsonb,                              -- [D] jsonb (order-by test)  [R] nullability
    concept_id     uuid,                               -- [D] uuid  [P] NULLABLE (null in all 709 rows)  [P] FK -> jungian_concepts
    archetype      text,                               -- [D] text  [R] nullability
    title          text,                               -- [D] text  [R] nullability
    body           text,                               -- [D] text  [R] nullability
    self_questions text[],                             -- [D] ARRAY of text ("malformed array literal" + real rows are string arrays)
    weight         integer,                            -- [D] integer  [R] nullability. Live values: 4, 7, 8, 9.
    life_domain    text,                               -- [D] text  [R] nullability
    tone           text,                               -- [D] text  [R] nullability
    created_at     timestamp with time zone,           -- [D] timestamptz  [R] NOT NULL, DEFAULT now()
    updated_at     timestamp with time zone,           -- [D] timestamptz  [R] NOT NULL, DEFAULT now()
    symbol         text,                               -- [D] text  [P] NULLABLE (null in 664 of 709 rows)
    section        text,                               -- [D] text  [R] nullability
    lens           text,                               -- [D] text  [R] nullability, DEFAULT 'vedic'
    CONSTRAINT fragments_pkey PRIMARY KEY (id),        -- [P] unique index  [R] PK designation
    CONSTRAINT fragments_concept_id_fkey FOREIGN KEY (concept_id)
        REFERENCES public.jungian_concepts(id)          -- [P] FK confirmed by embed  [R] ON DELETE behaviour
);

-- [R] RECONSTRUCTED -- THE ALLOWED-VALUE LIST IS A LOWER BOUND, NOT THE
-- CONSTRAINT. The named constraint could not be read. What IS dumped: the six
-- DISTINCT trigger_type values actually present across all 709 rows. The real
-- constraint may permit additional values that currently have zero rows, and
-- may not even be an IN list. VERIFY THIS ONE IN THE DASHBOARD FIRST -- it is
-- the statement in this file most likely to be wrong.
ALTER TABLE public.fragments
    ADD CONSTRAINT fragments_trigger_type_check CHECK (
        trigger_type IN (
            'ascendant_sign',           -- [D] present in data
            'conjunction',              -- [D] present in data
            'moon_nakshatra',           -- [D] present in data
            'planet_in_house',          -- [D] present in data
            'planet_in_sign',           -- [D] present in data
            'planet_in_sign_and_house'  -- [D] present in data
        )
    );

-- [R] RECONSTRUCTED. Effect observed: anon CAN read all 709 rows; anon INSERT
-- is rejected with 42501.
ALTER TABLE public.fragments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fragments_readable_by_all" ON public.fragments
    FOR SELECT USING (true);

-- Other distinct live values, dumped from all 709 rows (NOT constraints --
-- recorded because they document the authored vocabulary):
--   lens        (2): vedic, vedic_deep
--   section    (12): cluster, growth, mind, moon, the center, the fire,
--                   the heart, the hunger, the private, the surface,
--                   the taste, the weight
--   tone        (8): confronting, direct, gentle, hopeful, neutral, tender,
--                   warm, wry
--   life_domain (7): crisis, emotion, identity, lineage, relationships,
--                   spirit, work


-- ---------------------------------------------------------------------------
-- charts  --  one computed chart per profile. Not anon-readable.
-- ---------------------------------------------------------------------------
-- All four chart payload columns are jsonb, confirmed by the order-by test.
-- Columns confirmed ABSENT: user_id, created_at, updated_at.

CREATE TABLE public.charts (
    id                  uuid                     NOT NULL,  -- [D] uuid  [P] unique index exists  [R] PK, DEFAULT gen_random_uuid()
    profile_id          uuid,                               -- [D] uuid  [P] FK -> profiles  [P] NO unique index (see note)
    planets             jsonb,                              -- [D] jsonb  [R] nullability
    ascendant           jsonb,                              -- [D] jsonb  [R] nullability
    houses              jsonb,                              -- [D] jsonb  [R] nullability
    dashas              jsonb,                              -- [D] jsonb  [R] nullability
    computed_at         timestamp with time zone,           -- [D] timestamptz  [R] nullability
    calculation_version text,                               -- [D] text  [R] nullability
    CONSTRAINT charts_pkey PRIMARY KEY (id),                -- [P] unique index  [R] PK designation
    CONSTRAINT charts_profile_id_fkey FOREIGN KEY (profile_id)
        REFERENCES public.profiles(id)                       -- [P] FK confirmed by embed  [R] ON DELETE behaviour
);

-- [P] DUMPED FACT worth keeping: there is NO unique index on charts.profile_id
-- (the ON CONFLICT probe returned 42P10). Nothing at the database level stops
-- a profile from having two chart rows. app/actions/birth-chart.ts compensates
-- by doing select-then-insert-or-update instead of an upsert, which is why it
-- cannot use onConflict here.

-- [R] RECONSTRUCTED. Effect observed: anon SELECT returns zero rows.
ALTER TABLE public.charts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "charts_select_own" ON public.charts
    FOR SELECT USING (auth.uid() = profile_id);
CREATE POLICY "charts_insert_own" ON public.charts
    FOR INSERT WITH CHECK (auth.uid() = profile_id);
CREATE POLICY "charts_update_own" ON public.charts
    FOR UPDATE USING (auth.uid() = profile_id);
CREATE POLICY "charts_delete_own" ON public.charts
    FOR DELETE USING (auth.uid() = profile_id);


-- ---------------------------------------------------------------------------
-- self_entries  --  written answers AND what-you-know truths. Not anon-readable.
-- ---------------------------------------------------------------------------
-- `kind` multiplexes several record types in one table (see app/actions/
-- truths.ts): 'answer' rows carry a fragment_id; 'truth-about-me' /
-- 'truth-about-bond' rows have fragment_id NULL and encode state as suffixes
-- ('-sent', '-sent-heard'). No constraint enforces any of this.
-- Columns confirmed ABSENT: updated_at.

CREATE TABLE public.self_entries (
    id          uuid                     NOT NULL,  -- [D] uuid  [P] unique index exists  [R] PK, DEFAULT gen_random_uuid()
    profile_id  uuid,                               -- [D] uuid  [P] FK -> profiles  [R] nullability
    fragment_id uuid,                               -- [D] uuid  [P] FK -> fragments  [R] nullability (NULL for truth rows)
    kind        text,                               -- [D] text  [R] nullability
    content     text,                               -- [D] text  [R] nullability
    created_at  timestamp with time zone,           -- [D] timestamptz  [R] NOT NULL, DEFAULT now()
    CONSTRAINT self_entries_pkey PRIMARY KEY (id),  -- [P] unique index  [R] PK designation
    CONSTRAINT self_entries_profile_id_fkey FOREIGN KEY (profile_id)
        REFERENCES public.profiles(id),              -- [P] FK confirmed  [R] ON DELETE behaviour
    CONSTRAINT self_entries_fragment_id_fkey FOREIGN KEY (fragment_id)
        REFERENCES public.fragments(id)              -- [P] FK confirmed  [R] ON DELETE behaviour
);

-- [P] DUMPED FACT: there is NO unique index on (profile_id, fragment_id)
-- (ON CONFLICT probe returned 42P10). This CONFIRMS the comment in
-- app/actions/self-reads.ts, which is why saveSelfAnswer does a manual
-- select-then-update instead of an upsert.

-- [R] RECONSTRUCTED. Effect observed: anon SELECT returns zero rows.
ALTER TABLE public.self_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "self_entries_select_own" ON public.self_entries
    FOR SELECT USING (auth.uid() = profile_id);
CREATE POLICY "self_entries_insert_own" ON public.self_entries
    FOR INSERT WITH CHECK (auth.uid() = profile_id);
CREATE POLICY "self_entries_update_own" ON public.self_entries
    FOR UPDATE USING (auth.uid() = profile_id);
CREATE POLICY "self_entries_delete_own" ON public.self_entries
    FOR DELETE USING (auth.uid() = profile_id);


-- ---------------------------------------------------------------------------
-- read_responses  --  agree/disagree per fragment. Not anon-readable.
-- ---------------------------------------------------------------------------
-- Columns confirmed ABSENT: updated_at.

CREATE TABLE public.read_responses (
    id          uuid                     NOT NULL,  -- [D] uuid  [P] unique index exists  [R] PK, DEFAULT gen_random_uuid()
    profile_id  uuid,                               -- [D] uuid  [P] FK -> profiles  [R] nullability
    fragment_id uuid,                               -- [D] uuid  [P] FK -> fragments  [R] nullability
    response    text,                               -- [D] text  [R] nullability
    created_at  timestamp with time zone,           -- [D] timestamptz  [R] NOT NULL, DEFAULT now()
    CONSTRAINT read_responses_pkey PRIMARY KEY (id),          -- [P] unique index  [R] PK designation
    CONSTRAINT read_responses_profile_id_fragment_id_key
        UNIQUE (profile_id, fragment_id),                     -- [P] PROVEN to exist (see below)
    CONSTRAINT read_responses_profile_id_fkey FOREIGN KEY (profile_id)
        REFERENCES public.profiles(id),                        -- [P] FK confirmed  [R] ON DELETE behaviour
    CONSTRAINT read_responses_fragment_id_fkey FOREIGN KEY (fragment_id)
        REFERENCES public.fragments(id)                        -- [P] FK confirmed  [R] ON DELETE behaviour
);

-- [P] The UNIQUE (profile_id, fragment_id) constraint is PROVEN, not assumed:
-- an ON CONFLICT probe on that exact pair got past query planning (rejected
-- later by RLS with 42501), while the same probe on a bogus pair
-- (profile_id, response) returned 42P10 "no unique or exclusion constraint
-- matching". Its NAME above is [R] -- only its existence was proven. This is
-- the constraint app/actions/self-reads.ts upserts against with
-- onConflict: "profile_id,fragment_id".

-- [R] RECONSTRUCTED. Effect observed: anon SELECT returns zero rows.
-- A CHECK limiting response to 'agree' / 'disagree' may or may not exist --
-- it could not be observed, and the application validates in code instead.
ALTER TABLE public.read_responses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read_responses_select_own" ON public.read_responses
    FOR SELECT USING (auth.uid() = profile_id);
CREATE POLICY "read_responses_insert_own" ON public.read_responses
    FOR INSERT WITH CHECK (auth.uid() = profile_id);
CREATE POLICY "read_responses_update_own" ON public.read_responses
    FOR UPDATE USING (auth.uid() = profile_id);
CREATE POLICY "read_responses_delete_own" ON public.read_responses
    FOR DELETE USING (auth.uid() = profile_id);


-- ---------------------------------------------------------------------------
-- user_lens_progress  --  which lenses a user has unlocked. Not anon-readable.
-- ---------------------------------------------------------------------------
-- INCONSISTENCY, dumped not inferred: this table keys on user_id, while every
-- other user-scoped table in this schema uses profile_id. Both hold the same
-- Supabase auth user id. lib/self/lenses.ts queries .eq("user_id", profileId)
-- accordingly. Also dumped: user_id has NO foreign key to profiles (the embed
-- probe found no relationship), unlike every other user-scoped table here.
-- Columns confirmed ABSENT: id, profile_id, created_at.

CREATE TABLE public.user_lens_progress (
    user_id     uuid                     NOT NULL,  -- [D] uuid  [P] NO FK to profiles  [R] NOT NULL
    lens_slug   text                     NOT NULL,  -- [D] text  [P] FK -> lenses  [R] NOT NULL
    unlocked_at timestamp with time zone,           -- [D] timestamptz  [R] NOT NULL, DEFAULT now()
    CONSTRAINT user_lens_progress_user_id_lens_slug_key
        UNIQUE (user_id, lens_slug),                 -- [P] PROVEN (control probe on lens_slug alone returned 42P10)
    CONSTRAINT user_lens_progress_lens_slug_fkey FOREIGN KEY (lens_slug)
        REFERENCES public.lenses(slug)               -- [P] FK confirmed by embed  [R] ON DELETE behaviour
);

-- [P] There is no `id` column, and UNIQUE (user_id, lens_slug) is proven. That
-- pair is very likely the PRIMARY KEY, but PK-vs-plain-unique could not be
-- distinguished from outside, so no PRIMARY KEY clause is asserted here.
--
-- Note: lib/self/lenses.ts inserts into this table WITHOUT onConflict and
-- comments that it makes "no constraint assumptions". The unique constraint
-- does exist, so a duplicate insert would raise 23505 rather than silently
-- duplicate. The code tolerates this by checking membership first.

-- [R] RECONSTRUCTED. Effect observed: anon SELECT returns zero rows.
ALTER TABLE public.user_lens_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_lens_progress_select_own" ON public.user_lens_progress
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "user_lens_progress_insert_own" ON public.user_lens_progress
    FOR INSERT WITH CHECK (auth.uid() = user_id);


-- ---------------------------------------------------------------------------
-- conversations  --  self-chat threads. Not anon-readable.
-- ---------------------------------------------------------------------------
-- Application code only ever DELETEs from this table (account.ts), so the
-- probe is the only evidence for its shape.
-- Columns confirmed ABSENT: user_id, updated_at, summary, lens.

CREATE TABLE public.conversations (
    id         uuid                     NOT NULL,  -- [D] uuid  [P] unique index exists  [R] PK, DEFAULT gen_random_uuid()
    profile_id uuid,                               -- [D] uuid  [P] FK -> profiles  [R] nullability
    title      text,                               -- [D] text  [R] nullability
    created_at timestamp with time zone,           -- [D] timestamptz  [R] NOT NULL, DEFAULT now()
    CONSTRAINT conversations_pkey PRIMARY KEY (id),  -- [P] unique index  [R] PK designation
    CONSTRAINT conversations_profile_id_fkey FOREIGN KEY (profile_id)
        REFERENCES public.profiles(id)               -- [P] FK confirmed  [R] ON DELETE behaviour
);

-- [R] RECONSTRUCTED. Effect observed: anon SELECT returns zero rows.
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "conversations_select_own" ON public.conversations
    FOR SELECT USING (auth.uid() = profile_id);
CREATE POLICY "conversations_insert_own" ON public.conversations
    FOR INSERT WITH CHECK (auth.uid() = profile_id);
CREATE POLICY "conversations_delete_own" ON public.conversations
    FOR DELETE USING (auth.uid() = profile_id);


-- ---------------------------------------------------------------------------
-- messages  --  turns within a conversation. Not anon-readable.
-- ---------------------------------------------------------------------------
-- Zero references anywhere in application code -- the probe is the only
-- evidence. Note there is NO profile_id here (confirmed 42703): ownership is
-- reached only through conversation_id, so any RLS policy must join to
-- conversations.
-- Columns confirmed ABSENT: profile_id, token_count, tokens, updated_at.

CREATE TABLE public.messages (
    id              uuid                     NOT NULL,  -- [D] uuid  [P] unique index exists  [R] PK, DEFAULT gen_random_uuid()
    conversation_id uuid,                               -- [D] uuid  [P] FK -> conversations  [R] nullability
    role            text,                               -- [D] text  [R] nullability
    content         text,                               -- [D] text  [R] nullability
    created_at      timestamp with time zone,           -- [D] timestamptz  [R] NOT NULL, DEFAULT now()
    CONSTRAINT messages_pkey PRIMARY KEY (id),          -- [P] unique index  [R] PK designation
    CONSTRAINT messages_conversation_id_fkey FOREIGN KEY (conversation_id)
        REFERENCES public.conversations(id)              -- [P] FK confirmed by embed  [R] ON DELETE behaviour
);

-- [R] RECONSTRUCTED, and the shape of this one is a guess beyond the usual:
-- with no profile_id column, ownership must be derived through the parent
-- conversation. A subquery policy like the below is the conventional way, but
-- it was NOT observed. Note also that account.ts deletes conversations by
-- profile_id without touching messages -- so either the FK cascades or message
-- rows are orphaned on account deletion. Worth checking both.
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "messages_select_own" ON public.messages
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.conversations c
            WHERE c.id = messages.conversation_id AND c.profile_id = auth.uid()
        )
    );
CREATE POLICY "messages_insert_own" ON public.messages
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.conversations c
            WHERE c.id = messages.conversation_id AND c.profile_id = auth.uid()
        )
    );


-- ===========================================================================
-- AUTH TRIGGER  --  creates a profiles row for each new auth user
-- ===========================================================================
-- [R] ENTIRELY RECONSTRUCTED. Neither the function body nor the trigger is
-- observable through the API. VERIFY THIS WHOLE BLOCK IN THE DASHBOARD.
--
-- The evidence that it exists is nonetheless strong:
--   * Application code NEVER inserts into profiles -- only select, update and
--     delete (verified by grep across app/, components/, lib/). Yet signed-in
--     users have profiles rows, so something else creates them.
--   * app/actions/birth-chart.ts names the mechanism directly:
--       "The placeholder birth_place the DB trigger seeds new profiles with"
--       const PLACEHOLDER_PLACE = "pending"
--   * app/actions/account.ts resets birth_place to 'pending' to send a user
--     back through onboarding, calling it "the placeholder the DB trigger
--     seeds new profiles with".
--
-- What is genuinely unknown: the function and trigger NAMES (the ones below
-- are the Supabase convention, not observed); whether SECURITY DEFINER is
-- set; which columns besides birth_place are seeded and with what values;
-- whether display_name is populated from the OAuth metadata (nothing in the
-- application reads display_name, so its seeding is unconstrained by code);
-- and whether birth_date / birth_time / birth_lat / birth_lng are seeded with
-- placeholders or left NULL. account.ts notes that "nulling the other birth
-- columns can violate NOT NULL constraints on live databases", which HINTS
-- that some of them are NOT NULL and therefore must be seeded -- but that is
-- an inference from a code comment, not an observation.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.profiles (id, birth_place)
    VALUES (NEW.id, 'pending')
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- ===========================================================================
-- Row counts visible to the anon role at dump time (post-RLS, so a 0 means
-- "not readable by anon" OR "empty" -- the two are indistinguishable):
--   fragments           709   (readable)
--   lenses                3   (readable)
--   profiles              0     charts               0
--   self_entries          0     read_responses       0
--   user_lens_progress    0     conversations        0
--   messages              0     jungian_concepts     0
-- ===========================================================================
