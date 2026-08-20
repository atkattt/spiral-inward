// Shared vocabulary, validators, and Supabase REST helpers for the fragments
// export/import tooling. This is the ONE place to update when the next lenses
// widen the vocabulary. Kept dependency-free (Node 18+ global fetch) so the
// scripts run with a plain `node scripts/...`.
//
// SOURCES OF TRUTH (keep in sync — these mirror app code, they don't import it,
// because these scripts run standalone outside the Next/TS build):
//   SECTION_KEYS   <- lib/spiral/sections.ts   (SECTION_ORDER)
//   TONES          <- lib/self/signatures.ts   (SignatureTone)
//   LIFE_DOMAINS   <- db/supabase-schema.sql    (live distinct values, 799 rows)
//   TRIGGER_TYPES  <- db/supabase-schema.sql    (fragments_trigger_type_check)

// ---------------------------------------------------------------------------
// Vocabularies
// ---------------------------------------------------------------------------

/** lib/spiral/sections.ts SECTION_ORDER — the keys ARE the display names. */
export const SECTION_KEYS = Object.freeze([
  "the surface",
  "the heart",
  "mind",
  "the fire",
  "the taste",
  "growth",
  "the weight",
  "the center",
  "cluster",
  "the hunger",
  "the private",
])

/** lib/self/signatures.ts SignatureTone — the 8 authored tones. */
export const TONES = Object.freeze([
  "warm",
  "tender",
  "gentle",
  "hopeful",
  "direct",
  "neutral",
  "wry",
  "confronting",
])

/** db/supabase-schema.sql — the 7 live life_domain values. */
export const LIFE_DOMAINS = Object.freeze([
  "crisis",
  "emotion",
  "identity",
  "lineage",
  "relationships",
  "spirit",
  "work",
])

// The trigger_type allow-list.
//
// CONFIRMED from the live catalog — this is the exact IN list of the
// fragments_trigger_type_check constraint on the Supabase table (read from the
// dashboard, not reconstructed from data). A trigger_type outside this set is
// rejected by Postgres with 23514/check_violation, so the importer refuses it
// up front. Widening this list requires an ALTER of the CHECK in the dashboard
// first, then editing this array to match.
//
// NOTE: several of these have NO branch in lib/matcher.ts (dasha, planet_nakshatra,
// house_lord, yoga) and the matcher implements names the CHECK does NOT allow
// (mahadasha, antardasha, planet_in_nakshatra, house_lord_in_house,
// planet_dignity). That divergence is documented in the mismatch report and is
// a matcher concern, not an import-validation one — the DB CHECK is the sole
// authority for what may be written.
export const TRIGGER_TYPES = Object.freeze([
  "planet_in_sign",
  "planet_in_house",
  "ascendant_sign",
  "planet_in_sign_and_house",
  "conjunction",
  "moon_nakshatra",
  "planet_nakshatra",
  "dasha",
  "house_lord",
  "yoga",
])

/** Columns the importer is allowed to write. `id` handled separately; the two
    timestamps are managed by us/DB and never trusted from the file. */
export const WRITABLE_COLUMNS = Object.freeze([
  "trigger_type",
  "condition",
  "concept_id",
  "archetype",
  "title",
  "body",
  "self_questions",
  "weight",
  "life_domain",
  "tone",
  "symbol",
  "section",
  "lens",
])

/** The natural key used for upserts + duplicate detection. */
export const NATURAL_KEY = Object.freeze(["lens", "trigger_type", "condition"])

export const EXPECTED_BASELINE_COUNT = 799

// ---------------------------------------------------------------------------
// Canonical JSON — stable, key-sorted stringify so two `condition` objects that
// differ only in key order (Postgres jsonb normalizes them) compare equal on
// the JS side for natural-key grouping and diffing.
// ---------------------------------------------------------------------------

export function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`
  const keys = Object.keys(value).sort()
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(",")}}`
}

/** The natural-key signature string for a row. */
export function naturalKeyOf(row) {
  return canonicalJson({
    lens: row.lens,
    trigger_type: row.trigger_type,
    condition: row.condition ?? null,
  })
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isUuid(v) {
  return typeof v === "string" && UUID_RE.test(v)
}

// ---------------------------------------------------------------------------
// Row validation. Returns an array of human-readable error strings (empty ==
// valid). The importer collects these across the WHOLE batch and refuses to
// write anything if any row fails.
// ---------------------------------------------------------------------------

export function validateRow(row, { allowUnconfirmedTriggers = false } = {}) {
  const errors = []
  const req = (field) => {
    const v = row[field]
    if (v === undefined || v === null || (typeof v === "string" && v.trim() === "")) {
      errors.push(`${field} is null/blank (required)`)
      return false
    }
    return true
  }

  // id is optional, but if present it must be a real uuid — a malformed id
  // would either fail the write or, worse, mint an unintended row.
  if (row.id !== undefined && row.id !== null && !isUuid(row.id)) {
    errors.push(`id "${String(row.id)}" is not a valid uuid`)
  }

  if (req("tone") && !TONES.includes(String(row.tone).trim().toLowerCase())) {
    errors.push(`tone "${row.tone}" not in vocabulary [${TONES.join(", ")}]`)
  }
  if (
    req("life_domain") &&
    !LIFE_DOMAINS.includes(String(row.life_domain).trim().toLowerCase())
  ) {
    errors.push(
      `life_domain "${row.life_domain}" not in vocabulary [${LIFE_DOMAINS.join(", ")}]`,
    )
  }
  if (
    req("section") &&
    !SECTION_KEYS.includes(String(row.section).trim().toLowerCase())
  ) {
    errors.push(`section "${row.section}" is not a known SectionKey`)
  }
  if (req("lens")) {
    // lens itself isn't a closed vocabulary (new lenses are the whole point),
    // only required non-null. Registering it in the `lenses` table is a
    // separate step the importer reminds you about.
  }
  if (req("weight")) {
    if (!Number.isInteger(row.weight)) {
      errors.push(`weight "${row.weight}" must be an integer`)
    }
  }
  if (req("condition")) {
    if (typeof row.condition !== "object" || Array.isArray(row.condition)) {
      errors.push(`condition must be a JSON object, got ${typeof row.condition}`)
    }
  }
  if (req("trigger_type")) {
    const tt = String(row.trigger_type).trim()
    const allowed = allowUnconfirmedTriggers
      ? [...TRIGGER_TYPES_CONFIRMED, ...TRIGGER_TYPES_MATCHER_ONLY]
      : TRIGGER_TYPES_CONFIRMED
    if (!allowed.includes(tt)) {
      const hint = TRIGGER_TYPES_MATCHER_ONLY.includes(tt)
        ? ` — implemented in matcher but has no confirmed CHECK entry; widen the CHECK, then re-run with --allow-unconfirmed-triggers`
        : ""
      errors.push(`trigger_type "${tt}" not allowed [${allowed.join(", ")}]${hint}`)
    }
  }

  return errors
}

// ---------------------------------------------------------------------------
// Supabase PostgREST helpers
// ---------------------------------------------------------------------------

export function resolveEnv({ needWrite } = {}) {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || ""
  const anon =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || ""
  // A service-role / secret key is REQUIRED to write, because fragments RLS
  // only grants SELECT to anon (anon INSERT/UPDATE returns 42501).
  const service =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    ""

  if (!url) fail("Missing NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) in env.")
  const key = needWrite ? service : service || anon
  if (needWrite && !service) {
    fail(
      "Writing requires a service-role key. Set SUPABASE_SERVICE_ROLE_KEY in the\n" +
        "environment (fragments RLS blocks anon writes). Read-only paths (export,\n" +
        "import --dry-run) work with NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    )
  }
  if (!key) fail("No Supabase key available in env.")
  return { url: url.replace(/\/+$/, ""), key, usingService: Boolean(service) }
}

export function fail(msg) {
  console.error(`\nERROR: ${msg}\n`)
  process.exit(1)
}

function headers(key, extra = {}) {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    ...extra,
  }
}

/** Fetch every fragments row, following PostgREST's 1000-row page cap. */
export async function fetchAllFragments({ url, key }, columns = "*") {
  const pageSize = 1000
  let from = 0
  const all = []
  let total = null
  for (;;) {
    const res = await fetch(
      `${url}/rest/v1/fragments?select=${encodeURIComponent(columns)}&order=id.asc`,
      {
        headers: headers(key, {
          Prefer: "count=exact",
          Range: `${from}-${from + pageSize - 1}`,
        }),
      },
    )
    if (!res.ok) {
      fail(`Fetch failed (${res.status}): ${await res.text()}`)
    }
    const batch = await res.json()
    all.push(...batch)
    const cr = res.headers.get("content-range") // e.g. "0-999/799"
    if (total === null && cr && cr.includes("/")) {
      const t = cr.split("/")[1]
      total = t === "*" ? null : Number(t)
    }
    if (batch.length < pageSize) break
    from += pageSize
  }
  return { rows: all, total: total ?? all.length }
}

/** PATCH one row by id. Returns the representation array (length should be 1).
    id/created_at are never sent in the body — id is immutable, created_at is
    preserved. */
export async function patchById({ url, key }, id, body) {
  const res = await fetch(
    `${url}/rest/v1/fragments?id=eq.${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      headers: headers(key, { Prefer: "return=representation" }),
      body: JSON.stringify(sanitizeBody(body, { includeId: false })),
    },
  )
  const text = await res.text()
  if (!res.ok) throw new Error(`PATCH id=${id} → ${res.status}: ${text}`)
  return JSON.parse(text)
}

/** Plain INSERT that carries an explicit (new, non-colliding) id. */
export async function insertWithId({ url, key }, row) {
  const res = await fetch(`${url}/rest/v1/fragments`, {
    method: "POST",
    headers: headers(key, { Prefer: "return=representation" }),
    body: JSON.stringify([sanitizeBody(row, { includeId: true })]),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`INSERT id=${row.id} → ${res.status}: ${text}`)
  return JSON.parse(text)
}

/** Upsert a batch on the natural key. Requires the (lens,trigger_type,
    condition) unique index; without it PostgREST returns 42P10. id is NOT sent,
    so conflicts keep the existing row's id and inserts get a fresh one. */
export async function upsertOnNaturalKey({ url, key }, rows) {
  const res = await fetch(
    `${url}/rest/v1/fragments?on_conflict=${NATURAL_KEY.join(",")}`,
    {
      method: "POST",
      headers: headers(key, {
        Prefer: "resolution=merge-duplicates,return=representation",
      }),
      body: JSON.stringify(rows.map((r) => sanitizeBody(r, { includeId: false }))),
    },
  )
  const text = await res.text()
  if (!res.ok) {
    if (res.status === 400 && text.includes("42P10")) {
      throw new Error(
        `Upsert failed: no unique index on (${NATURAL_KEY.join(", ")}). ` +
          `Run db/migrations/2026-08-20_fragments_natural_key_unique.sql first.`,
      )
    }
    throw new Error(`UPSERT → ${res.status}: ${text}`)
  }
  return JSON.parse(text)
}

/** Whitelist columns and stamp updated_at. Drops anything not writable so a
    stray column in the file can never reach the table. */
function sanitizeBody(row, { includeId }) {
  const out = {}
  for (const col of WRITABLE_COLUMNS) {
    if (row[col] !== undefined) out[col] = row[col]
  }
  if (includeId && row.id !== undefined && row.id !== null) out.id = row.id
  out.updated_at = new Date().toISOString()
  return out
}
