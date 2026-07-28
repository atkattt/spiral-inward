// Throwaway: validates that db/*.sql parses and is internally consistent.
// Everything runs inside a transaction that is ALWAYS rolled back, and every
// `public.` reference is remapped to a scratch schema, so no real object is
// ever touched. Deleted immediately after use.
import fs from "node:fs"
import pg from "pg"

const SCRATCH = "_sqlcheck_scratch"

// Split on semicolons, but never inside a $$-quoted function body.
function statements(sql) {
  const out = []
  let buf = ""
  let dollar = false
  for (const line of sql.split("\n")) {
    const bare = line.replace(/--.*$/, "")
    if ((bare.match(/\$\$/g) || []).length % 2 === 1) dollar = !dollar
    buf += line + "\n"
    if (!dollar && /;\s*(--.*)?$/.test(bare)) {
      const s = buf
        .split("\n")
        .map((l) => l.replace(/^\s*--.*$/, ""))
        .join("\n")
        .trim()
      if (s.replace(/;/g, "").trim()) out.push(s)
      buf = ""
    }
  }
  if (buf.trim()) out.push(buf.trim())
  return out
}

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
})
await client.connect()

let failures = 0
try {
  await client.query("BEGIN")
  await client.query(`CREATE SCHEMA ${SCRATCH}`)

  // Stubs so the Supabase file's auth references resolve inside the scratch txn.
  await client.query("CREATE SCHEMA IF NOT EXISTS auth")
  await client.query("CREATE TABLE auth.users (id uuid PRIMARY KEY)")
  await client.query(
    "CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $f$ SELECT NULL::uuid $f$",
  )

  for (const file of ["db/neon-schema.sql", "db/supabase-schema.sql"]) {
    const raw = fs.readFileSync(file, "utf8").replaceAll("public.", `${SCRATCH}.`)
    const stmts = statements(raw)
    let ok = 0
    console.log(`\n=== ${file} — ${stmts.length} statements ===`)
    for (const s of stmts) {
      try {
        await client.query(`SAVEPOINT sp`)
        await client.query(s)
        await client.query(`RELEASE SAVEPOINT sp`)
        ok++
      } catch (e) {
        await client.query(`ROLLBACK TO SAVEPOINT sp`)
        failures++
        console.log(`  FAIL ${e.code}: ${e.message}`)
        console.log(`       ${s.replace(/\s+/g, " ").slice(0, 130)}`)
      }
    }
    console.log(`  ${ok}/${stmts.length} executed cleanly`)
  }
} finally {
  await client.query("ROLLBACK")
  const { rows } = await client.query(
    `select count(*)::int n from information_schema.schemata where schema_name in ($1,'auth')`,
    [SCRATCH],
  )
  console.log(`\nrolled back — scratch/auth schemas remaining: ${rows[0].n} (must be 0)`)
  const { rows: t } = await client.query(
    `select count(*)::int n from information_schema.tables where table_schema='public'`,
  )
  console.log(`public tables still present: ${t[0].n} (must be 7)`)
  await client.end()
}
console.log(failures ? `\nTOTAL FAILURES: ${failures}` : "\nno failures")
