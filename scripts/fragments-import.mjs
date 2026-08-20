#!/usr/bin/env node
// Fragments import — validates a file of fragments and upserts them. Safe by
// design: it NEVER deletes a row, NEVER changes an existing id, validates the
// WHOLE batch before writing anything, and verifies every write's returned row
// count (a zero-row PostgREST update is NOT an error, so we check explicitly).
//
// MATCHING
//   - Rows WITH an id      -> UPDATE that row by id (id is the filter, never in
//                             the body). If the id doesn't exist yet, it's a
//                             new row inserted WITH that id.
//   - Rows WITHOUT an id   -> UPSERT on the natural key (lens, trigger_type,
//                             condition): update the matching row in place
//                             (its id is preserved) or insert a new one (fresh
//                             id). Requires the natural-key unique index.
//
// MODES
//   default            DRY RUN — reports exactly what would change, writes nothing.
//   --apply            perform the writes.
//   --allow-unconfirmed-triggers   permit matcher-only trigger types
//                                   (mahadasha/antardasha/planet_in_nakshatra/...)
//                                   ONLY after you've widened the CHECK constraint.
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
  naturalKeyOf,
  resolveEnv,
  fail,
  insertWithId,
  patchById,
  upsertOnNaturalKey,
  validateRow,
  WRITABLE_COLUMNS,
} from "./lib/fragments-vocab.mjs"

const APPLY = process.argv.includes("--apply")
const ALLOW_UNCONFIRMED = process.argv.includes("--allow-unconfirmed-triggers")
const UPSERT_BATCH = 100

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
    const errs = validateRow(row, { allowUnconfirmedTriggers: ALLOW_UNCONFIRMED })
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

  // In-file natural-key collisions among no-id rows would make upsert ambiguous.
  const seen = new Map()
  const inFileDupes = []
  rows.forEach((row, i) => {
    if (isUuid(row.id)) return
    const k = naturalKeyOf(row)
    if (seen.has(k)) inFileDupes.push({ a: seen.get(k), b: i, k })
    else seen.set(k, i)
  })
  if (inFileDupes.length) {
    console.error(`\nBATCH REJECTED: ${inFileDupes.length} in-file natural-key collision(s):`)
    for (const d of inFileDupes.slice(0, 20)) {
      console.error(`  rows[${d.a}] and rows[${d.b}] share key ${d.k}`)
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
  const liveByNat = new Map(live.map((r) => [naturalKeyOf(r), r]))

  const plan = { updateById: [], insertById: [], updateByNat: [], insertByNat: [], noop: [] }
  const collisions = []

  for (const row of rows) {
    const nat = naturalKeyOf(row)
    if (isUuid(row.id)) {
      const existing = liveById.get(row.id)
      // Guard: would this row's natural key land on a DIFFERENT existing id?
      const natOwner = liveByNat.get(nat)
      if (natOwner && natOwner.id !== row.id) {
        collisions.push(
          `row id=${row.id} would take natural key already owned by id=${natOwner.id}`,
        )
        continue
      }
      if (existing) {
        const diff = changedFields(row, existing)
        if (diff.length === 0) plan.noop.push(row.id)
        else plan.updateById.push({ row, existing, diff })
      } else {
        plan.insertById.push({ row })
      }
    } else {
      const existing = liveByNat.get(nat)
      if (existing) {
        const diff = changedFields(row, existing)
        if (diff.length === 0) plan.noop.push(existing.id)
        else plan.updateByNat.push({ row, existing, diff })
      } else {
        plan.insertByNat.push({ row })
      }
    }
  }

  if (collisions.length) {
    console.error(`\nBATCH REJECTED: ${collisions.length} natural-key collision(s) with live rows:`)
    for (const c of collisions.slice(0, 20)) console.error(`  ${c}`)
    console.error(
      `\nChanging a row's (lens, trigger_type, condition) onto another row's key would ` +
        `require merging or a delete. Resolve manually; this tool never deletes.`,
    )
    process.exit(1)
  }

  // ---- 3. REPORT THE PLAN --------------------------------------------------
  console.log(`\nPLAN`)
  console.log(`  update by id .......... ${plan.updateById.length}`)
  console.log(`  insert by id (new) .... ${plan.insertById.length}`)
  console.log(`  update by natural key . ${plan.updateByNat.length}`)
  console.log(`  insert by natural key . ${plan.insertByNat.length}`)
  console.log(`  no-op (identical) ..... ${plan.noop.length}`)
  const writes =
    plan.updateById.length +
    plan.insertById.length +
    plan.updateByNat.length +
    plan.insertByNat.length

  const sample = [...plan.updateById, ...plan.updateByNat].slice(0, 15)
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
  // come from a transport failure. Every op is idempotent (PATCH by id / upsert
  // by natural key / insert of a specific new id), so re-running resumes safely.
  let applied = 0

  // 4a. natural-key upserts (batched)
  for (let i = 0; i < plan.insertByNat.length + plan.updateByNat.length; i += UPSERT_BATCH) {
    const chunk = [...plan.updateByNat, ...plan.insertByNat]
      .slice(i, i + UPSERT_BATCH)
      .map((p) => p.row)
    const rep = await upsertOnNaturalKey(env, chunk)
    if (rep.length !== chunk.length) {
      fail(
        `Upsert verification failed: sent ${chunk.length}, PostgREST returned ${rep.length}. ` +
          `Applied ${applied} rows before this. Re-run to resume.`,
      )
    }
    applied += rep.length
    console.log(`  upserted ${applied}/${writes}`)
  }

  // 4b. inserts that carry an explicit new id
  for (const { row } of plan.insertById) {
    const rep = await insertWithId(env, row)
    if (rep.length !== 1) {
      fail(`Insert id=${row.id} returned ${rep.length} rows (expected 1). Applied ${applied}. Re-run to resume.`)
    }
    applied += 1
  }

  // 4c. updates by id — verify each touched exactly one row (zero-row PATCH is
  //     silent success in PostgREST, so this check is the safeguard).
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

  console.log(`\nDONE. Wrote ${applied} row(s). Deleted 0. No ids changed.`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
