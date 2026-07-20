/**
 * dump-db-schema.js
 * ---------------------------------------------------------------------------
 * Companion to dump-db-functions.js, which mirrors function BODIES.
 * This mirrors everything else: tables, constraints, indexes, triggers, RLS
 * policies, and grants — into `supabase/schema/schema.sql`.
 *
 * Why this exists
 * ---------------
 * Before v3.74.734 the only part of the database held in the repository was
 * function bodies. Living solely inside the production project were:
 *
 *     249 tables / 4,397 columns
 *     797 RLS policies      <- the entire row-level security model
 *     501 triggers          <- where FIFO and COGS automation actually fires
 *   1,202 indexes
 *   1,795 constraints
 *     every function grant
 *
 * The migration folder cannot stand in for this. 661 migration versions are
 * recorded as applied and only 49 match a file in supabase/migrations — the
 * rest were applied through the SQL editor or MCP, which records a timestamp
 * rather than the filename. So the folder cannot tell anyone what production
 * actually contains.
 *
 * The grants matter most of all. pg_get_functiondef does not emit ACLs, so
 * functions.sql structurally cannot hold them. Rebuilding from the repo without
 * this file would recreate every function with PostgreSQL's default EXECUTE to
 * PUBLIC — silently undoing the v3.74.727-731 lockdown.
 *
 * This snapshot is a fidelity record and a diff surface. It is NOT a restore
 * script, and that is no longer a caution — it is a measured result.
 *
 * PROVEN, 2026-07-20 (v3.74.769)
 * ------------------------------
 * The sentence that used to sit here said this had "NOT yet proven to rebuild
 * the database" and that the test required a scratch project. That test was
 * finally run. It failed:
 *
 *     10,916 statements    4,871 applied    6,045 failed
 *
 *     tables    249 -> 243
 *     functions 1204 -> 1053
 *     policies  797  -> 429
 *     triggers  501  -> 5
 *
 * Five triggers out of 501. Triggers are where COGS posting, journal balance
 * enforcement and FIFO consumption live. A database restored from this file
 * accepts data and silently stops doing accounting. Fewer than half the RLS
 * policies came back, so it also leaks between companies.
 *
 * The dangerous part is not the failure count. It is that 4,871 statements
 * SUCCEEDED: the result looks like a working system.
 *
 * Why it cannot work
 * ------------------
 *   1. No dependency ordering. Foreign keys are emitted before the primary keys
 *      they reference, so most constraints fail with "there is no unique
 *      constraint matching given keys".
 *   2. Extensions are never emitted -> type "vector" does not exist.
 *   3. Custom enum types are never emitted -> type "discount_document_type"
 *      does not exist.
 *   4. Sequences are never emitted -> relation "system_audit_log_id_seq" does
 *      not exist.
 *   5. Column DEFAULTs referencing functions run before functions.sql exists.
 *
 * And one fidelity bug worth its own line: audit_logs.entity and
 * audit_logs.entity_id are GENERATED ALWAYS columns, and this dump writes them
 * as DEFAULT expressions. Postgres rejects it — which is fortunate, because if
 * it had been accepted the restored table would behave differently from
 * production in a way nothing would report.
 *
 * What this file IS for
 * ---------------------
 * Seeing what production contains, and diffing it. That is real value and it
 * has already been paid: on 2026-07-20 the checked-in copy was found still
 * granting three dropped, dangerous functions to anon. Without this snapshot
 * nobody would have noticed until a rebuild silently restored them.
 *
 * For actual disaster recovery use pg_dump, which handles ordering, extensions,
 * types and sequences by design: `supabase db dump`. Do not extend this script
 * to try to become pg_dump.
 *
 * Re-run the proof with: node scripts/restore-into-test-db.js
 *
 * Run:   node scripts/dump-db-schema.js
 * Env:   .env.local with NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL)
 *        and SUPABASE_SERVICE_ROLE_KEY.
 * ---------------------------------------------------------------------------
 */
const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const path = require("path");
require("dotenv").config({
  path: [
    path.join(__dirname, "..", ".env.local"),
    path.join(__dirname, "..", ".env"),
    path.join(__dirname, "..", ".env.development.local"),
  ],
});

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error(
    "X Missing env. Need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local"
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/**
 * Minimum sizes the snapshot must reach to be considered real.
 *
 * A truncated or partially-failed export that still "succeeds" is worse than a
 * hard failure: it would be committed as the baseline and quietly under-report
 * what production contains. These floors are set well below the counts observed
 * at the time of writing (249 / 797 / 501 / 1795), so ordinary growth never
 * trips them, but a collapsed export does.
 */
const FLOORS = {
  "CREATE TABLE": 200,
  "CREATE POLICY": 700,
  "ADD CONSTRAINT": 1500,
};

/**
 * Counting triggers takes a regex, and both obvious approaches are wrong.
 *
 * v3.74.734 first counted "CREATE TRIGGER" and got 499 against the database's
 * 501: two are CONSTRAINT triggers, emitted as "CREATE CONSTRAINT TRIGGER" —
 * and they happen to be trg_enforce_journal_balance and
 * trg_recurring_template_balance, the double-entry balance enforcers.
 *
 * Widening to the bare word "TRIGGER" then reported 1359, because TRIGGER is
 * also a table privilege: every "GRANT DELETE, INSERT, REFERENCES, SELECT,
 * TRIGGER, ..." line matched. That wrong figure was written into the snapshot's
 * own header — a file whose entire job is to state what production contains.
 *
 * Match the statement, not the word.
 */
const TRIGGER_RE = /CREATE (?:CONSTRAINT )?TRIGGER /g;
const TRIGGER_FLOOR = 450;

(async () => {
  console.log("Fetching live schema (tables, policies, triggers, grants)...");
  const { data, error } = await supabase.rpc("export_public_schema");

  if (error) {
    console.error("X RPC export_public_schema failed:", error.message);
    console.error("  Ensure migration v3.74.734 (export_public_schema) is applied.");
    process.exit(1);
  }

  const body = typeof data === "string" ? data : String(data ?? "");
  if (!body.trim()) {
    console.error("X Export returned empty. Aborting so we don't wipe the file.");
    process.exit(1);
  }

  const count = (needle) => body.split(needle).length - 1;
  const triggerCount = (body.match(TRIGGER_RE) || []).length;

  const shortfalls = Object.entries(FLOORS)
    .map(([needle, floor]) => [needle, count(needle), floor])
    .concat([["CREATE [CONSTRAINT] TRIGGER", triggerCount, TRIGGER_FLOOR]])
    .filter(([, actual, floor]) => actual < floor);

  if (shortfalls.length > 0) {
    console.error("X Export looks truncated — refusing to overwrite the baseline:");
    for (const [needle, actual, floor] of shortfalls) {
      console.error(`    ${needle}: ${actual} (expected at least ${floor})`);
    }
    process.exit(1);
  }

  const outDir = path.join(__dirname, "..", "supabase", "schema");
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, "schema.sql");

  const header =
    "-- =====================================================================\n" +
    "-- AUTO-GENERATED SNAPSHOT — tables, constraints, indexes, triggers,\n" +
    "-- RLS policies and grants. Function BODIES live in functions.sql.\n" +
    "--\n" +
    "-- DO NOT edit by hand. Regenerate with:  node scripts/dump-db-schema.js\n" +
    "--\n" +
    "-- This is a fidelity record and a diff surface. It has NOT been proven to\n" +
    "-- rebuild the database unaided — that needs a restore into a scratch\n" +
    "-- project and a comparison. Until then: we can see what production holds,\n" +
    "-- not yet recreate it.\n" +
    "--\n" +
    "-- Generated: " + new Date().toISOString() + "\n" +
    "-- Tables: " + count("CREATE TABLE") +
    " | Policies: " + count("CREATE POLICY") +
    " | Triggers: " + triggerCount +
    " | Constraints: " + count("ADD CONSTRAINT") + "\n" +
    "-- =====================================================================\n\n";

  fs.writeFileSync(outFile, header + body, "utf8");
  console.log(
    "+ Wrote " + path.relative(path.join(__dirname, ".."), outFile) +
    ` (${count("CREATE TABLE")} tables, ${count("CREATE POLICY")} policies, ` +
    `${triggerCount} triggers, ${body.length} chars)`
  );
})().catch((e) => {
  console.error("X Unexpected error:", e && e.message ? e.message : e);
  process.exit(1);
});
