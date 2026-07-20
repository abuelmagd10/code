/**
 * restore-into-test-db.js
 * ---------------------------------------------------------------------------
 * Restores supabase/schema/*.sql into the TEST project and reports what came
 * back. This is the test the snapshot has never had.
 *
 * Why this exists
 * ---------------
 * The header of dump-db-schema.js has said this from the day it was written:
 *
 *   "This snapshot is a fidelity record and a diff surface. It is NOT yet
 *    proven to rebuild the database on its own; that requires restoring it
 *    into a scratch project and comparing. Until that test is run and passes,
 *    treat this as 'we can see what production contains', not 'we can
 *    recreate it'."
 *
 * That sentence has been true and untested for as long as it has existed. On
 * 2026-07-20 a stale snapshot was found that would have restored three dropped
 * functions AND their anon grants — the file was wrong in a way nobody would
 * have discovered until a real disaster. Regenerating it fixed that instance.
 * It did not answer the larger question: does restoring this actually work?
 *
 * What this does
 * --------------
 *   1. Refuses to run against production. Hard stop on the production ref.
 *   2. Refuses to run against a database that already has tables, unless
 *      --force is passed. Restoring over live data is not a test.
 *   3. Applies schema.sql then functions.sql, statement by statement.
 *   4. Reports every failure with its statement, and a summary at the end.
 *
 * FAILURES ARE THE POINT. A clean run proves the backup works. A run with 200
 * errors is not a broken script — it is the answer to a question that has never
 * been asked, and every error is a thing that would have gone wrong during a
 * real recovery. Read them; do not suppress them.
 *
 * FIRST RUN — 2026-07-20
 * ----------------------
 *     10,916 statements    4,871 applied    6,045 failed
 *
 *     tables    249 -> 243      policies  797 -> 429
 *     functions 1204 -> 1053    triggers  501 -> 5
 *
 * The answer is no. The snapshot does not rebuild the database.
 *
 * Five triggers out of 501 is the number that matters: triggers are where COGS
 * posting, journal-balance enforcement and FIFO consumption live. The restored
 * database would accept data and quietly stop doing accounting, with under half
 * its row-level security policies in place.
 *
 * And 4,871 statements succeeded — so it would have LOOKED like it worked. That
 * is worse than an outright failure, and it is exactly what would have happened
 * during a real incident, under pressure, with no explanation.
 *
 * Causes, all structural, none fixable by tweaking:
 *   - no dependency ordering (foreign keys before the primary keys they need)
 *   - extensions never emitted        (type "vector" does not exist)
 *   - enum types never emitted        (type "discount_document_type" ...)
 *   - sequences never emitted         (relation "..._id_seq" does not exist)
 *   - DEFAULTs calling functions that schema.sql loads before functions.sql
 *
 * The fix is pg_dump — `supabase db dump` — which solves ordering, extensions,
 * types and sequences by design. This script stays, because re-running it is
 * how that replacement gets verified instead of assumed.
 *
 * Four separate obstacles were hit before the restore even started: a special
 * character in the database password, a '#' silently truncating the .env line,
 * and an IPv6-only direct host unreachable from an IPv4 network. Every one of
 * those would also have been hit during a real recovery.
 *
 * Setup
 * -----
 * Add to .env.local (values from Supabase dashboard -> Project Settings ->
 * API for the TEST project, never the production one):
 *
 *   TEST_SUPABASE_URL=https://<test-ref>.supabase.co
 *   TEST_SUPABASE_DB_URL=postgresql://postgres:<password>@<host>:5432/postgres
 *
 * The DB URL is under Project Settings -> Database -> Connection string (URI).
 *
 * Run:   node scripts/restore-into-test-db.js
 *        node scripts/restore-into-test-db.js --force   (allow non-empty target)
 * ---------------------------------------------------------------------------
 */
require("dotenv").config({ path: [".env.local", ".env", ".env.development.local"] });

const fs = require("fs");
const path = require("path");

const PRODUCTION_REF = "hfvsbsizokxontflgdyn";
const ROOT = path.join(__dirname, "..");
const SCHEMA_SQL = path.join(ROOT, "supabase", "schema", "schema.sql");
const FUNCTIONS_SQL = path.join(ROOT, "supabase", "schema", "functions.sql");

const force = process.argv.includes("--force");

const dbUrl = process.env.TEST_SUPABASE_DB_URL;
if (!dbUrl) {
  console.error("X TEST_SUPABASE_DB_URL is not set in .env.local\n");
  console.error("  Supabase dashboard -> TEST project -> Project Settings ->");
  console.error("  Database -> Connection string (URI). Use the TEST project.");
  process.exit(1);
}

// Refusing production is the first thing this file does, deliberately. The test
// harness carries the same refusal for the same reason.
if (dbUrl.includes(PRODUCTION_REF)) {
  console.error("X TEST_SUPABASE_DB_URL points at PRODUCTION. Refusing.\n");
  console.error(`  Production ref ${PRODUCTION_REF} must never be a restore target.`);
  process.exit(1);
}

/**
 * Explain a malformed connection string WITHOUT printing the password.
 *
 * "Invalid URL" from the pg client says nothing about which part is wrong, and
 * the obvious debugging move — print the string — leaks the credential into a
 * terminal and a scrollback buffer. So this reports the SHAPE and masks the
 * secret.
 *
 * The overwhelmingly common cause is a password containing a character that is
 * structural in a URL. Supabase's own dashboard warns about it: @ turns into a
 * host separator, / into a path, : into a port, # into a fragment. The password
 * is generated before anyone thinks about URL syntax.
 */
function explainConnectionString(raw) {
  const problems = [];
  const value = raw.trim();

  if (value !== raw) problems.push("there is leading or trailing whitespace around the value");
  if (/^["']|["']$/.test(value)) problems.push("the value is wrapped in quotes — remove them");
  if (!/^postgres(ql)?:\/\//.test(value)) {
    problems.push("it does not start with postgresql:// — check the beginning of the line");
  }
  if (/[؀-ۿ]/.test(value)) {
    problems.push("it still contains Arabic text — the placeholder was not replaced");
  }

  // Structure: postgresql://USER:PASSWORD@HOST:PORT/DB
  const afterScheme = value.replace(/^postgres(ql)?:\/\//, "");
  const lastAt = afterScheme.lastIndexOf("@");
  if (lastAt === -1) {
    problems.push("there is no @ separating the password from the host");
    // The host is missing entirely, which almost never happens from a typo —
    // the line was cut short. dotenv treats an unquoted # as the start of a
    // comment, so a password containing # silently truncates the value at that
    // character. The file on disk looks complete; what the process receives is
    // not. Nothing reports this.
    problems.push(
      "the value looks CUT SHORT rather than mistyped — if the password contains #, " +
      "dotenv treats it as the start of a comment and discards the rest of the line"
    );
  } else {
    const credentials = afterScheme.slice(0, lastAt);
    const hostPart = afterScheme.slice(lastAt + 1);
    const colon = credentials.indexOf(":");
    const password = colon === -1 ? "" : credentials.slice(colon + 1);

    if (colon === -1) problems.push("there is no : between the user and the password");
    if (!password) problems.push("the password is empty");

    // Characters that are structural in a URL and must be percent-encoded.
    const offenders = [...new Set((password.match(/[@/:?#[\]%\\ ]/g) || []))];
    if (offenders.length > 0) {
      problems.push(
        `the password contains ${offenders.length} character(s) that are structural in a URL: ` +
        offenders.map((c) => (c === " " ? "space" : c)).join(" ")
      );
    }
    if (credentials.slice(0, colon === -1 ? undefined : colon) !== "postgres") {
      problems.push("the user before : is not 'postgres'");
    }
    if (!/^[\w.-]+:\d+\/\w+$/.test(hostPart)) {
      problems.push(`the part after @ should look like host:5432/postgres — it is "${hostPart}"`);
    }
  }

  // Mask everything between the first : after the scheme and the LAST @.
  //
  // The first version used /:\/\/([^:]*):([^@]*)@/ — [^@]* stops at the FIRST
  // @. When the password itself contains an @, which is exactly the case this
  // function exists to diagnose, the mask ended early and printed the tail of
  // the password to the terminal. A masking routine that leaks precisely when
  // the secret is unusual is worse than none, because it is trusted.
  //
  // Splitting on lastIndexOf("@") is correct because the host section cannot
  // contain an @, so the final one always separates credentials from host.
  const maskUrl = (s) => {
    const schemeEnd = s.indexOf("://");
    if (schemeEnd === -1) return "<not a url>";
    const head = s.slice(0, schemeEnd + 3);
    const body = s.slice(schemeEnd + 3);
    const at = body.lastIndexOf("@");
    if (at === -1) {
      // No @ at all. The earlier version returned the body unchanged here, which
      // printed the password in the one case where the string is malformed —
      // and malformed is the only case this function ever runs in. Mask
      // everything after the first colon regardless of how broken the value is.
      const c = body.indexOf(":");
      return c === -1 ? `${head}<no credentials found>` : `${head}${body.slice(0, c)}:${"*".repeat(10)}`;
    }
    const creds = body.slice(0, at);
    const host = body.slice(at + 1);
    const colon = creds.indexOf(":");
    const user = colon === -1 ? creds : creds.slice(0, colon);
    return `${head}${user}:${"*".repeat(10)}@${host}`;
  };

  return { problems, masked: maskUrl(value) };
}

try {
  // eslint-disable-next-line no-new
  new URL(dbUrl);
} catch {
  const { problems, masked } = explainConnectionString(dbUrl);
  console.error("X TEST_SUPABASE_DB_URL is not a valid URL.\n");
  console.error(`  What was read (password masked):\n    ${masked}\n`);
  if (problems.length > 0) {
    console.error("  Likely cause(s):");
    for (const p of problems) console.error(`    - ${p}`);
  } else {
    console.error("  The shape looks right, so a character in the password is probably at fault.");
  }
  console.error("\n  Simplest fix: reset the database password to letters and digits only.");
  console.error("  Supabase dashboard -> Connect -> Direct -> Reset password.");
  console.error("  A 24-character alphanumeric password needs no encoding at all.");
  process.exit(1);
}

let Client;
try {
  ({ Client } = require("pg"));
} catch {
  console.error("X The 'pg' package is required.\n");
  console.error("  npm install pg --save-dev");
  process.exit(1);
}

/**
 * Split SQL on semicolons that end a statement, respecting dollar-quoted bodies
 * ($$ ... $$ and $function$ ... $function$), single quotes, and comments.
 * Function bodies are full of semicolons; splitting naively shreds every one of
 * the 1204 definitions into fragments that all fail.
 */
function splitStatements(sql) {
  const out = [];
  let buf = "";
  let i = 0;
  let inSingle = false;
  let inDouble = false;
  let inLineComment = false;
  let inBlockComment = false;
  let dollarTag = null;

  while (i < sql.length) {
    const ch = sql[i];
    const rest = sql.slice(i);

    if (inLineComment) {
      buf += ch;
      if (ch === "\n") inLineComment = false;
      i++;
      continue;
    }
    if (inBlockComment) {
      buf += ch;
      if (rest.startsWith("*/")) { buf += "/"; i += 2; inBlockComment = false; continue; }
      i++;
      continue;
    }
    if (dollarTag) {
      if (rest.startsWith(dollarTag)) { buf += dollarTag; i += dollarTag.length; dollarTag = null; continue; }
      buf += ch; i++; continue;
    }
    if (inSingle) {
      // '' inside a string literal is an escaped quote, not the end of it.
      //
      // The first version of this branch mutated `i` inside a ternary
      // expression while also assigning to `inSingle`. It left inSingle stuck
      // true, so the whole of functions.sql was consumed as one unterminated
      // string literal: 1204 function definitions collapsed into a single
      // statement that then got filtered out as a comment. The splitter
      // reported zero statements for a 2 MB file.
      //
      // Caught by testing the splitter against the real files before ever
      // connecting to a database. Written plainly now.
      if (ch === "'" && sql[i + 1] === "'") {
        buf += "''";
        i += 2;
        continue;
      }
      buf += ch;
      if (ch === "'") inSingle = false;
      i++;
      continue;
    }
    // Double-quoted IDENTIFIERS must be tracked separately, because Postgres
    // allows an apostrophe inside one:
    //
    //   CREATE POLICY "Users can view their company's settings" ON ...
    //
    // Without this state the ' in company's opened a string literal that ran to
    // the next quote somewhere far below, and everything after it was swallowed.
    // schema.sql holds 5299 GRANT/REVOKE lines; the splitter was emitting ONE
    // statement that contained the word GRANT, and it was a CREATE POLICY.
    //
    // A restore built on that would have rebuilt the database with none of its
    // permissions — which is precisely the failure schema.sql exists to prevent,
    // reintroduced by the tool meant to verify it. Found by counting the grants
    // in the file against the grants in the parse, before connecting anything.
    if (inDouble) {
      buf += ch;
      if (ch === '"') inDouble = false;
      i++;
      continue;
    }

    if (rest.startsWith("--")) { inLineComment = true; buf += ch; i++; continue; }
    if (rest.startsWith("/*")) { inBlockComment = true; buf += ch; i++; continue; }
    if (ch === '"') { inDouble = true; buf += ch; i++; continue; }
    if (ch === "'") { inSingle = true; buf += ch; i++; continue; }

    const dollar = /^\$[A-Za-z_]*\$/.exec(rest);
    if (dollar) { dollarTag = dollar[0]; buf += dollarTag; i += dollarTag.length; continue; }

    if (ch === ";") {
      const stmt = buf.trim();
      if (stmt) out.push(stmt);
      buf = "";
      i++;
      continue;
    }
    buf += ch;
    i++;
  }
  const tail = buf.trim();
  if (tail) out.push(tail);
  return out;
}

async function applyFile(client, file, label) {
  if (!fs.existsSync(file)) {
    console.error(`X missing ${file}`);
    return { ok: 0, failed: 0, errors: [`missing file: ${file}`] };
  }
  const sql = fs.readFileSync(file, "utf8");

  // A statement is skippable only if there is NO CODE in it at all — not merely
  // because it opens with a comment.
  //
  // The first filter here was `!/^\s*(--|\/\*)/.test(s)`, which drops anything
  // STARTING with a comment. Every function in functions.sql is preceded by a
  // banner comment, so all 1204 definitions were discarded and the script
  // reported zero statements for a 2 MB file.
  //
  // I then misdiagnosed it as a quote-handling bug in the splitter, rewrote
  // that, and the symptom did not move — because the splitter had been correct
  // the whole time, returning exactly 1204 statements, matching pg_proc. Only
  // measuring the output before and after the filter found it.
  //
  // "Starts with a comment" is not "is a comment". Same mistake as treating a
  // wrapper as a reader, or a name as an identity.
  const hasCode = (s) =>
    s
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*--.*$/gm, "")
      .trim().length > 0;

  const statements = splitStatements(sql).filter(hasCode);

  console.log(`\n=== ${label} — ${statements.length} statements ===`);
  let ok = 0;
  const errors = [];

  for (let n = 0; n < statements.length; n++) {
    const stmt = statements[n];
    try {
      await client.query(stmt);
      ok++;
    } catch (err) {
      errors.push({
        index: n + 1,
        message: String(err.message || err).split("\n")[0],
        statement: stmt.slice(0, 160).replace(/\s+/g, " "),
      });
    }
    if ((n + 1) % 250 === 0) {
      process.stdout.write(`  ${n + 1}/${statements.length} (${errors.length} failed)\r`);
    }
  }
  console.log(`  ${statements.length}/${statements.length} — ${ok} applied, ${errors.length} failed`);
  return { ok, failed: errors.length, errors };
}

(async () => {
  const client = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();

  const { rows } = await client.query(
    `SELECT count(*)::int AS tables FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind IN ('r','p')`
  );
  const existingTables = rows[0].tables;

  if (existingTables > 0 && !force) {
    console.error(`X target already has ${existingTables} table(s) in public.`);
    console.error("  Restoring over existing objects does not test anything.");
    console.error("  Reset the test project, or pass --force if you know why.");
    await client.end();
    process.exit(1);
  }

  console.log(`Target has ${existingTables} table(s). Restoring the snapshot...`);

  const a = await applyFile(client, SCHEMA_SQL, "schema.sql (tables, policies, triggers, grants)");
  const b = await applyFile(client, FUNCTIONS_SQL, "functions.sql (function bodies)");

  const after = await client.query(
    `SELECT
       (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
         WHERE n.nspname='public' AND c.relkind IN ('r','p'))            AS tables,
       (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
         WHERE n.nspname='public')                                       AS functions,
       (SELECT count(*) FROM pg_policy)                                  AS policies,
       (SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal)          AS triggers`
  );
  await client.end();

  const r = after.rows[0];
  const totalFailed = a.failed + b.failed;

  console.log("\n=== RESULT ===");
  console.log(`applied: ${a.ok + b.ok}   failed: ${totalFailed}`);
  console.log(`\nrebuilt: ${r.tables} tables, ${r.functions} functions, ${r.policies} policies, ${r.triggers} triggers`);
  console.log("production has: 249 tables, 1204 functions, 797 policies, 501 triggers");

  if (totalFailed > 0) {
    console.log(`\n--- first 25 failures of ${totalFailed} ---`);
    for (const e of [...a.errors, ...b.errors].slice(0, 25)) {
      console.log(`\n  [${e.index}] ${e.message}`);
      console.log(`       ${e.statement}`);
    }
    console.log("\nThese are not script bugs to hide. Each one is something that would");
    console.log("have gone wrong during a real recovery, surfaced for the first time.");
  } else {
    console.log("\n+ Every statement applied. The snapshot rebuilds the database.");
  }

  process.exit(totalFailed > 0 ? 1 : 0);
})().catch((err) => {
  console.error("\nX restore aborted:", err.message);
  process.exit(1);
});
