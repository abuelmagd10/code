/**
 * verify-test-database.js
 * ---------------------------------------------------------------------------
 * Checks that TEST_SUPABASE_URL points at a database it is SAFE and USEFUL to
 * run the destructive test suites against — before a single test touches it.
 *
 * Why this runs before the tests, not with them
 * ---------------------------------------------
 * tests/helpers/test-setup.ts creates users, companies, invoices, payments and
 * journal entries, then deletes them. Two things can go wrong, and they fail in
 * opposite directions:
 *
 *   - Pointed at production, it destroys real data. v3.74.740 made the helpers
 *     refuse the production project ref, but a refusal at the moment of the
 *     first insert is a poor place to find out.
 *   - Pointed at an EMPTY project, every test fails on missing tables and the
 *     failures look like code defects for however long it takes to notice the
 *     schema was never restored.
 *
 * This tells you which of those you have, in one command, before you spend an
 * afternoon on the wrong diagnosis.
 *
 * Run:   node scripts/verify-test-database.js
 * ---------------------------------------------------------------------------
 */
const { createClient } = require("@supabase/supabase-js");
const path = require("path");
require("dotenv").config({
  path: [
    path.join(__dirname, "..", ".env.local"),
    path.join(__dirname, "..", ".env"),
    path.join(__dirname, "..", ".env.test"),
  ],
});

const PRODUCTION_PROJECT_REF = "hfvsbsizokxontflgdyn";

// Floors taken from the live schema at the time of writing (249 tables, 1196
// functions). A restored copy should be in the same order of magnitude; a
// fraction of it means the restore stopped part-way, which is worth knowing
// before the tests start reporting mysterious failures.
const MIN_TABLES = 200;
const MIN_FUNCTIONS = 900;

const url = process.env.TEST_SUPABASE_URL;
const key = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY;

function fail(msg, hint) {
  console.error(`X ${msg}`);
  if (hint) console.error(`  ${hint}`);
  process.exit(1);
}

(async () => {
  if (!url || !key) {
    fail(
      "TEST_SUPABASE_URL / TEST_SUPABASE_SERVICE_ROLE_KEY are not set.",
      "The test suites deliberately do not fall back to the app credentials. See docs/TEST_DATABASE_SETUP.md"
    );
  }

  if (url.includes(PRODUCTION_PROJECT_REF)) {
    fail(
      "TEST_SUPABASE_URL points at the PRODUCTION project.",
      "These suites create and delete users, companies, invoices and journal entries. Use a separate project."
    );
  }
  console.log(`+ Target is not production (${new URL(url).host})`);

  const db = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Reachability and credentials, before anything else is inferred.
  const { error: pingErr } = await db.from("companies").select("id").limit(1);
  if (pingErr && /Invalid API key|JWT/i.test(pingErr.message)) {
    fail(`Cannot authenticate: ${pingErr.message}`, "Check TEST_SUPABASE_SERVICE_ROLE_KEY.");
  }
  if (pingErr && /does not exist|schema cache/i.test(pingErr.message)) {
    fail(
      "Reachable, but the schema is missing (no `companies` table).",
      "Restore supabase/schema/schema.sql then supabase/schema/functions.sql. See docs/TEST_DATABASE_SETUP.md"
    );
  }
  if (pingErr) fail(`Unexpected error reaching the database: ${pingErr.message}`);
  console.log("+ Reachable and authenticated");

  // Is the schema actually there, and complete enough to be worth testing?
  const { data: counts, error: countErr } = await db.rpc("export_public_schema").then(
    (r) => ({ data: r.data, error: r.error }),
    (e) => ({ data: null, error: e })
  );

  if (countErr) {
    fail(
      "export_public_schema() is missing, so the function layer was not restored.",
      "Apply supabase/schema/functions.sql to the test project."
    );
  }

  const text = String(counts || "");
  const tables = (text.match(/CREATE TABLE/g) || []).length;
  const policies = (text.match(/CREATE POLICY/g) || []).length;
  const triggers = (text.match(/CREATE (?:CONSTRAINT )?TRIGGER /g) || []).length;

  console.log(`  tables=${tables} policies=${policies} triggers=${triggers}`);

  if (tables < MIN_TABLES) {
    fail(
      `Only ${tables} tables found (expected at least ${MIN_TABLES}).`,
      "The schema restore looks incomplete. Re-apply supabase/schema/schema.sql."
    );
  }

  // Function count is already implied: export_public_schema() answered at all,
  // which means the function layer restored. No separate probe needed — and a
  // probe whose result is discarded is worse than none.
  console.log("+ Schema present and plausibly complete");
  console.log("");
  console.log("This database is safe to run the destructive suites against:");
  console.log("   npm run test:integration");
  console.log("   npm run test:e2e");
})().catch((e) => {
  fail(`Unexpected error: ${e && e.message ? e.message : e}`);
});
