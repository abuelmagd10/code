/**
 * check-migration-matches-db.js
 * ---------------------------------------------------------------------------
 * A migration file is a claim: "this is what the database contains."
 * This script checks the claim against the database.
 *
 * Why this exists — two failures on 2026-07-26, in opposite directions
 * -------------------------------------------------------------------
 *  1. `20260508000200_allow_material_issue_tracking_updates.sql` had sat in the
 *     repo since May. Neither the function nor the trigger it creates existed
 *     in production. Consequence: every write to the material-issue tracking
 *     columns failed silently for months, so every production order read as
 *     "awaiting issue" forever, partial-issue tracking never worked, and the
 *     shortage/purchase-order chain was dead. Nobody knew, because a file in
 *     `supabase/migrations/` looks exactly like a file that was applied.
 *
 *  2. The same day, the reverse: a corrected migration was applied to both
 *     databases, but a stale earlier draft of the file was what got committed.
 *     The committed file described a guard reading a column that nothing
 *     maintains — applying it to a fresh database would refuse every
 *     legitimate product receipt. A landmine with a plausible filename.
 *
 * Neither direction is detectable by reading code, running tests, or reviewing
 * a diff. Only the database can settle it.
 *
 * What it checks, for each migration file given (default: the ones changed in
 * the working tree or staged):
 *   - every `CREATE [OR REPLACE] FUNCTION public.<name>` exists in the live DB
 *   - its body matches the live body (whitespace-normalised)
 *   - every `CREATE TRIGGER <name> ... ON <table>` exists in the live DB
 *
 * Usage:
 *   node scripts/check-migration-matches-db.js [file ...] [--require-db]
 *
 * Exit 0 = the files describe what is actually running.
 * ---------------------------------------------------------------------------
 */
require("dotenv").config({ path: [".env.local", ".env", ".env.development.local"] });

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const repoRoot = path.join(__dirname, "..");
const args = process.argv.slice(2);
const requireDb = args.includes("--require-db");
let files = args.filter((a) => !a.startsWith("--"));

// ── which files ────────────────────────────────────────────────────────────
// Default to migrations touched in this release: unstaged AND staged, because
// `git status` alone reports both and `git diff` alone misses what is staged —
// a distinction that has cost this project a red build before.
if (files.length === 0) {
  const seen = new Set();
  for (const cmd of ["git diff --name-only", "git diff --cached --name-only"]) {
    let out = "";
    try {
      out = execSync(cmd, { cwd: repoRoot, encoding: "utf8" });
    } catch {
      out = "";
    }
    for (const line of out.split("\n")) {
      const f = line.trim();
      if (f && /^supabase\/migrations\/.*\.sql$/.test(f)) seen.add(f);
    }
  }
  files = [...seen];
}

if (files.length === 0) {
  console.log("+ no migration files changed — nothing to verify against the database.");
  process.exit(0);
}

const dbUrl = process.env.PRODUCTION_SUPABASE_DB_URL;
if (!dbUrl) {
  const msg =
    "PRODUCTION_SUPABASE_DB_URL is not set — cannot verify the migration against the database.";
  if (requireDb) {
    console.error(`X ${msg}`);
    process.exit(1);
  }
  console.log(`! ${msg} Skipping (pass --require-db to make this fatal).`);
  process.exit(0);
}

let Client;
try {
  ({ Client } = require("pg"));
} catch {
  console.error("X npm install pg --save-dev");
  process.exit(1);
}

/** Collapse every run of whitespace so formatting differences are not findings. */
const norm = (s) => String(s).replace(/\r\n/g, "\n").replace(/\s+/g, " ").trim();

/**
 * Pull out the body between the outermost dollar-quote delimiters.
 * Postgres re-emits a canonical header, so only the body is comparable.
 */
function extractBody(text) {
  const m = /\$([A-Za-z_]*)\$/.exec(text);
  if (!m) return null;
  const tag = m[0];
  const start = text.indexOf(tag) + tag.length;
  const end = text.lastIndexOf(tag);
  if (end <= start) return null;
  return text.slice(start, end);
}

/** Every `CREATE [OR REPLACE] FUNCTION public.name(...) ... $tag$body$tag$` block. */
function parseFunctions(sql) {
  const out = [];
  const re = /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?"?([A-Za-z0-9_]+)"?\s*\(/gi;
  let m;
  while ((m = re.exec(sql)) !== null) {
    const name = m[1];
    const rest = sql.slice(m.index);
    const tagMatch = /\$([A-Za-z_]*)\$/.exec(rest);
    if (!tagMatch) continue;
    const tag = tagMatch[0];
    const bodyStart = rest.indexOf(tag) + tag.length;
    const bodyEnd = rest.indexOf(tag, bodyStart);
    if (bodyEnd < 0) continue;
    out.push({ name, body: rest.slice(bodyStart, bodyEnd) });
  }
  return out;
}

/** Every `CREATE TRIGGER name ... ON [public.]table`. */
function parseTriggers(sql) {
  const out = [];
  const re =
    /CREATE\s+(?:OR\s+REPLACE\s+)?(?:CONSTRAINT\s+)?TRIGGER\s+"?([A-Za-z0-9_]+)"?[\s\S]{0,400}?\sON\s+(?:public\.)?"?([A-Za-z0-9_]+)"?/gi;
  let m;
  while ((m = re.exec(sql)) !== null) out.push({ name: m[1], table: m[2] });
  return out;
}

(async () => {
  const client = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();

  const problems = [];
  let checkedFns = 0;
  let checkedTriggers = 0;

  for (const rel of files) {
    const abs = path.join(repoRoot, rel);
    if (!fs.existsSync(abs)) continue;
    const sql = fs.readFileSync(abs, "utf8");
    const base = path.basename(rel);

    for (const fn of parseFunctions(sql)) {
      checkedFns++;
      const { rows } = await client.query(
        `SELECT pg_get_functiondef(p.oid) AS def
           FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'public' AND p.proname = $1`,
        [fn.name]
      );

      if (rows.length === 0) {
        problems.push(
          `${base}: the file creates public.${fn.name}() but NO SUCH FUNCTION exists in the database.\n` +
            `    The file claims a change that never reached the database.`
        );
        continue;
      }

      // Overloads: accept if ANY overload matches, but say so when none do.
      const fileBody = norm(fn.body);
      const matched = rows.some((r) => norm(extractBody(r.def) || "") === fileBody);
      if (!matched) {
        problems.push(
          `${base}: public.${fn.name}() exists, but its live body DIFFERS from the file.\n` +
            `    Either the file was not applied, or a stale draft was committed.\n` +
            `    Fix with: node scripts/append-function-to-migration.js <file> ${fn.name}`
        );
      }
    }

    for (const tg of parseTriggers(sql)) {
      checkedTriggers++;
      const { rows } = await client.query(
        `SELECT 1
           FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
           JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE NOT t.tgisinternal AND n.nspname = 'public'
            AND t.tgname = $1 AND c.relname = $2`,
        [tg.name, tg.table]
      );
      if (rows.length === 0) {
        problems.push(
          `${base}: the file creates trigger ${tg.name} on ${tg.table}, but it is NOT in the database.`
        );
      }
    }
  }

  await client.end();

  if (problems.length > 0) {
    console.error(
      `X ${problems.length} migration claim(s) the database does not support:\n`
    );
    for (const p of problems) console.error(`  - ${p}\n`);
    console.error(
      "A migration file records what was applied. If it says something the live\n" +
        "database has never heard of, one of the two is wrong — and applying that\n" +
        "file to a fresh database would reproduce the wrong one."
    );
    process.exit(1);
  }

  console.log(
    `+ ${files.length} migration file(s) match the database ` +
      `(${checkedFns} function(s), ${checkedTriggers} trigger(s) verified).`
  );
})().catch((err) => {
  console.error(
    "X failed:",
    String(err.message || err).replace(/postgres(ql)?:\/\/[^\s"']+/g, "postgresql://<redacted>")
  );
  process.exit(1);
});
