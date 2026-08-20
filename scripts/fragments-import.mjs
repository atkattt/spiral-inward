#!/usr/bin/env node
// Fragments import — validates a file of fragments and upserts them. Safe by
// design: it NEVER deletes a row, NEVER changes an existing id, validates the
// WHOLE batch before writing anything, and verifies every write's returned row
// count (a zero-row PostgREST update is NOT an error, so we check explicitly).
//
// MATCHING — id is the ONLY match key.
//   - Rows WITH an id      -> UPDATE that row by id (id is the filter, never in
//                             the body). If the id doesn't exist live yet, it's
//                             inserted WITH that id (e.g. restoring from a backup).
//   - Rows WITHOUT an id   -> ALWAYS a new INSERT; the DB mints a fresh uuid.
//                             They are NEVER matched against existing rows.
//
//   There is deliberately no natural-key match/upsert path: (lens, trigger_type,
//   condition) is non-unique (many fragments share one placement), so matching
//   on it is ambiguous and unsafe. To revise an existing fragment, edit the
//   exported row IN PLACE so it keeps its id.
//
// MODES
//   default            DRY RUN — reports exactly what would change, writes nothing.
//   --apply            perform the writes.
//
// USAGE
//   node --env-file-if-exists=/vercel/share/.env.project \
//     scripts/fragments-import.mjs --file db/fragments/fragments.<stamp>.json
//   # add --apply to actually write (requires SUPABASE_SERVICE_ROLE_KEY).
//
// The file may be either a bare array of rows or the export envelope
// { rows: [...] }.

import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import {
  canonicalJson,
  fetchAllFragments,
  isUuid,
  resolveEnv,
  fail,
  insertRow,
  patchById,
  validateRow,
  WRITABLE_COLUMNS,
} from "./lib/fragments-vocab.mjs"

const APPLY = process.argv.includes("--apply")

function arg(name) {
  const i = process.argv.indexOf(name)
  return i === -1 ? undefined : process.argv[i + 1]
}

function loadRows(path) {
  let parsed
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"))
  } catch (e) {
    fail(`Could not read/parse ${path}: ${e.message}`)
  }
  const rows = Array.isArray(parsed) ? parsed : parsed.rows
  if (!Array.isArray(rows)) fail("File has no rows array.")
  return rows
}

/** Which writable columns differ between an incoming row and the live row. */
function changedFields(incoming, existing) {
  const changed = []
  for (const col of WRITABLE_COLUMNS) {
    if (incoming[col] === undefined) continue
    const a = col === "condition" ? canonicalJson(incoming[col]) : JSON.stringify(incoming[col])
    const b = col === "condition" ? canonicalJson(existing[col]) : JSON.stringify(existing[col])
    if (a !== b) changed.push(col)
  }
  return changed
}

async function main() {
  const file = arg("--file")
  if (!file) fail("Pass --file <path> (e.g. a db/fragments/*.json export).")
  const path = resolve(process.cwd(), file)
  const rows = loadRows(path)
  console.log(`Loaded ${rows.length} rows from ${path}`)
  console.log(APPLY ? "MODE: APPLY (will write)\n" : "MODE: DRY RUN (no writes)\n")

  // ---- 1. VALIDATE THE WHOLE BATCH FIRST -----------------------------------
  const failures = []
  rows.forEach((row, i) => {
    const errs = validateRow(row)
    if (errs.length) failures.push({ i, id: row.id, errs })
  })
  if (failures.length) {
    console.error(`VALIDATION FAILED for ${failures.length} of ${rows.length} rows.`)
    console.error(`Nothing will be written (batch rejected).\n`)
    for (const f of failures.slice(0, 50)) {
      console.error(`  row[${f.i}]${f.id ? ` id=${f.id}` : ""}: ${f.errs.join("; ")}`)
    }
    if (failures.length > 50) console.error(`  ...and ${failures.length - 50} more.`)
    process.exit(1)
  }
  console.log("Validation passed for all rows.")

  // In-file DUPLICATE ID check. No-id rows are always plain inserts, so they
  // can't collide; but two rows sharing an id would make the by-id write
  // ambiguous (which revision wins?), so reject that up front.
  const idSeen = new Map()
  const dupeIds = []
  rows.forEach((row, i) => {
    if (!isUuid(row.id)) return
    if (idSeen.has(row.id)) dupeIds.push({ a: idSeen.get(row.id), b: i, id: row.id })
    else idSeen.set(row.id, i)
  })
  if (dupeIds.length) {
    console.error(`\nBATCH REJECTED: ${dupeIds.length} duplicate id(s) in the file:`)
    for (const d of dupeIds.slice(0, 20)) {
      console.error(`  rows[${d.a}] and rows[${d.b}] share id ${d.id}`)
    }
    process.exit(1)
  }

  // ---- 2. PREFLIGHT AGAINST LIVE DATA --------------------------------------
  const env = resolveEnv({ needWrite: APPLY })
  console.log(
    `Target: ${env.url}  (key: ${env.usingService ? "service-role" : "anon (read-only)"})`,
  )
  const { rows: live } = await fetchAllFragments(env, "*")
  const liveById = new Map(live.map((r) => [r.id, r]))

  // id is the ONLY match key:
  //   has id + live      -> update (or no-op if identical)
  //   has id + not live  -> insert carrying that id (backup restore)
  //   no id              -> insert new, DB mints the id
  const plan = { updateById: [], insertById: [], insertNew: [], noop: [] }

  for (const row of rows) {
    if (isUuid(row.id)) {
      const existing = liveById.get(row.id)
      if (existing) {
        const diff = changedFields(row, existing)
        if (diff.length === 0) plan.noop.push(row.id)
        else plan.updateById.push({ row, existing, diff })
      } else {
        plan.insertById.push({ row })
      }
    } else {
      plan.insertNew.push({ row })
    }
  }

  // ---- 3. REPORT THE PLAN --------------------------------------------------
  console.log(`\nPLAN`)
  console.log(`  update by id .............. ${plan.updateById.length}`)
  console.log(`  insert by id (restore) .... ${plan.insertById.length}`)
  console.log(`  insert new (no id) ........ ${plan.insertNew.length}`)
  console.log(`  no-op (identical) ......... ${plan.noop.length}`)
  const writes = plan.updateById.length + plan.insertById.length + plan.insertNew.length

  const sample = plan.updateById.slice(0, 15)
  if (sample.length) {
    console.log(`\n  sample updates (id : changed fields):`)
    for (const u of sample) console.log(`    ${u.existing.id} : ${u.diff.join(", ")}`)
  }

  if (!APPLY) {
    console.log(`\nDRY RUN complete. ${writes} row(s) would be written, 0 deleted. Re-run with --apply to write.`)
    return
  }
  if (writes === 0) {
    console.log(`\nNothing to write. Done.`)
    return
  }

  // ---- 4. APPLY + VERIFY EVERY WRITE ---------------------------------------
  // Validation already guaranteed the data is sound, so partial writes can only
  // come from a transport failure. Updates by id and inserts of a specific id
  // are idempotent, so re-running resumes safely. New (no-id) inserts are NOT
  // idempotent — a re-run would insert them again — so they go LAST, after the
  // safe ops, and the log tells you how many landed if a later step fails.
  let applied = 0

  // 4a. updates by id — verify each touched exactly one row (a zero-row PATCH is
  //     silent success in PostgREST, so this explicit check is the safeguard).
  for (const { row } of plan.updateById) {
    const rep = await patchById(env, row.id, row)
    if (rep.length !== 1) {
      fail(
        `Update id=${row.id} matched ${rep.length} rows (expected 1). ` +
          `A zero-row update is not a DB error — treating it as a failure. ` +
          `Applied ${applied}. Re-run to resume.`,
      )
    }
    applied += 1
    console.log(`  updated by id ${row.id}`)
  }

  // 4b. inserts that carry an explicit id (restoring a row that isn't live).
  for (const { row } of plan.insertById) {
    const rep = await insertRow(env, row)
    if (rep.length !== 1) {
      fail(`Insert id=${row.id} returned ${rep.length} rows (expected 1). Applied ${applied}. Re-run to resume.`)
    }
    applied += 1
    console.log(`  inserted by id ${row.id}`)
  }

  // 4c. brand-new inserts (no id) — DB mints the uuid. Done last (not idempotent).
  for (const { row } of plan.insertNew) {
    const rep = await insertRow(env, row)
    if (rep.length !== 1) {
      fail(`Insert (new) returned ${rep.length} rows (expected 1). Applied ${applied}. Re-run would RE-INSERT the remaining new rows — de-dupe first.`)
    }
    applied += 1
    console.log(`  inserted new ${rep[0]?.id ?? "?"}`)
  }

  console.log(`\nDONE. Wrote ${applied} row(s). Deleted 0. No ids changed.`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
