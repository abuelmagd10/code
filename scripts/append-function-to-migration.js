/**
 * append-function-to-migration.js
 * ---------------------------------------------------------------------------
 * Appends a function's LIVE definition to a migration file.
 *
 * Why not just paste it
 * ---------------------
 * A migration is supposed to be the record of what was applied. If I retype a
 * 200-line PL/pgSQL body into the file by hand, the file records what I typed,
 * not what is running. Those are the same thing only until they are not, and a
 * single transposed line in a function that posts to the ledger is not the kind
 * of difference that announces itself.
 *
 * pg_get_functiondef reads the definition Postgres actually holds. The file
 * then cannot drift from production, because it was never a copy.
 *
 * Usage:
 *   node scripts/append-function-to-migration.js <migration-file> <function-name>
 *
 * Example:
 *   node scripts/append-function-to-migration.js \
 *     supabase/migrations/20260721000002_v3_74_775_trace_booking_custody_return.sql \
 *     fn_post_booking_custody_return
 * ---------------------------------------------------------------------------
 */
require("dotenv").config({ path: [".env.local", ".env", ".env.development.local"] });

const fs = require("fs");
const path = require("path");

const [, , migrationFile, functionName] = process.argv;
if (!migrationFile || !functionName) {
  console.error("Usage: node scripts/append-function-to-migration.js <migration-file> <function-name>");
  process.exit(1);
}

const file = path.isAbsolute(migrationFile)
  ? migrationFile
  : path.join(__dirname, "..", migrationFile);

if (!fs.existsSync(file)) {
  console.error(`X no such migration file: ${file}`);
  process.exit(1);
}

const url = process.env.PRODUCTION_SUPABASE_DB_URL;
if (!url) {
  console.error("X PRODUCTION_SUPABASE_DB_URL is not set in .env.local");
  process.exit(1);
}

let Client;
try {
  ({ Client } = require("pg"));
} catch {
  console.error("X npm install pg --save-dev");
  process.exit(1);
}

(async () => {
  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();

  const { rows } = await client.query(
    `SELECT pg_get_functiondef(p.oid) AS def, p.oid::regprocedure::text AS sig
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = $1`,
    [functionName]
  );
  await client.end();

  if (rows.length === 0) {
    console.error(`X no function named ${functionName} in the public schema`);
    process.exit(1);
  }
  if (rows.length > 1) {
    // Overloads have bitten this project repeatedly. Refuse rather than guess.
    console.error(`X ${functionName} has ${rows.length} overloads — refusing to guess:`);
    for (const r of rows) console.error(`    ${r.sig}`);
    process.exit(1);
  }

  const existing = fs.readFileSync(file, "utf8");
  if (existing.includes(`FUNCTION public.${functionName}(`)) {
    console.log(`! ${path.basename(file)} already contains ${functionName} — nothing appended.`);
    process.exit(0);
  }

  fs.appendFileSync(file, "\n" + rows[0].def.trim() + ";\n");
  console.log(`+ appended ${rows[0].sig}`);
  console.log(`  to ${path.basename(file)}  (${rows[0].def.length} chars, straight from the database)`);
})().catch((err) => {
  console.error(
    "X failed:",
    String(err.message || err).replace(/postgres(ql)?:\/\/[^\s"']+/g, "postgresql://<redacted>")
  );
  process.exit(1);
});
