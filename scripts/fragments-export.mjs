#!/usr/bin/env node
// Fragments export — pulls EVERY fragments row (including id) to a versioned
// JSON file under db/fragments/. This file is both the working copy you revise
// and the point-in-time backup you can re-import to restore.
//
// JSON, not CSV, on purpose: `condition` is jsonb and `self_questions` is a
// text[]; CSV would flatten/mangle both and lose the exact shape needed to
// round-trip. JSON preserves them verbatim.
//
// USAGE
//   node --env-file-if-exists=/vercel/share/.env.project scripts/fragments-export.mjs
//   # options:
//   #   --out <path>   write to a specific file instead of the timestamped default
//   #   --pretty       pretty-print (default is compact, one row per line-ish)
//
// Read-only. Works with NEXT_PUBLIC_SUPABASE_ANON_KEY (fragments are
// anon-readable); a service-role key also works if present.

import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import {
  EXPECTED_BASELINE_COUNT,
  fetchAllFragments,
  naturalKeyOf,
  resolveEnv,
} from "./lib/fragments-vocab.mjs"

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, "..")

function arg(name) {
  const i = process.argv.indexOf(name)
  return i === -1 ? undefined : process.argv[i + 1]
}
const hasFlag = (name) => process.argv.includes(name)

async function main() {
  const env = resolveEnv({ needWrite: false })
  console.log(`Source: ${env.url}  (key: ${env.usingService ? "service-role" : "anon"})`)

  const { rows, total } = await fetchAllFragments(env, "*")

  // Row-count report + baseline assertion.
  console.log(`\nFetched ${rows.length} rows (server count header: ${total}).`)
  if (rows.length !== total) {
    console.warn(
      `WARNING: fetched ${rows.length} but server reported ${total}. Pagination may be incomplete.`,
    )
  }
  if (rows.length === EXPECTED_BASELINE_COUNT) {
    console.log(`OK: matches the expected baseline of ${EXPECTED_BASELINE_COUNT}.`)
  } else {
    console.warn(
      `NOTE: count ${rows.length} != baseline ${EXPECTED_BASELINE_COUNT}. ` +
        `Expected once new lenses are imported; flagged so a silent truncation can't hide.`,
    )
  }

  // Distribution, useful for eyeballing a healthy export.
  const byLens = {}
  for (const r of rows) byLens[r.lens] = (byLens[r.lens] || 0) + 1
  console.log(`Lens distribution: ${JSON.stringify(byLens)}`)

  // Duplicate report on the natural key. If any group has >1 row, the unique
  // index migration would FAIL until they're reconciled — surface it now.
  const groups = new Map()
  for (const r of rows) {
    const k = naturalKeyOf(r)
    const g = groups.get(k)
    if (g) g.push(r.id)
    else groups.set(k, [r.id])
  }
  const dupes = [...groups.entries()].filter(([, ids]) => ids.length > 1)
  if (dupes.length === 0) {
    console.log(
      `Natural-key check: no duplicates on (lens, trigger_type, condition). ` +
        `The unique index can be created safely.`,
    )
  } else {
    console.warn(
      `\nDUPLICATES FOUND on (lens, trigger_type, condition) — ${dupes.length} collision group(s).\n` +
        `The unique index will FAIL until these are reconciled:`,
    )
    for (const [k, ids] of dupes.slice(0, 20)) {
      console.warn(`  ${ids.length}x  ids=[${ids.join(", ")}]  key=${k}`)
    }
    if (dupes.length > 20) console.warn(`  ...and ${dupes.length - 20} more.`)
  }

  // Write the versioned file.
  const stamp = new Date().toISOString().replace(/[:.]/g, "-")
  const outPath = arg("--out")
    ? resolve(process.cwd(), arg("--out"))
    : join(REPO_ROOT, "db", "fragments", `fragments.${stamp}.json`)
  mkdirSync(dirname(outPath), { recursive: true })

  const payload = {
    exportedAt: new Date().toISOString(),
    source: new URL(env.url).host,
    count: rows.length,
    naturalKey: ["lens", "trigger_type", "condition"],
    rows,
  }
  writeFileSync(
    outPath,
    hasFlag("--pretty") ? JSON.stringify(payload, null, 2) : JSON.stringify(payload),
  )
  console.log(`\nWrote ${rows.length} rows -> ${outPath}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
