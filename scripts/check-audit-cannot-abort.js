/**
 * check-audit-cannot-abort.js
 * ---------------------------------------------------------------------------
 * An audit log records what happened. It must never be able to prevent it.
 *
 * Why this exists — 2026-07-26
 * ----------------------------
 * A real customer could not create their company. The chain ended here:
 *
 *   INSERT companies -> seed chart of accounts -> audit_trigger_function
 *     -> create_audit_log -> assert_company_access -> RAISE (57014)
 *
 * The audit logger asserted company membership. The person creating a company
 * is not yet a member of it, so the assertion failed and took the whole signup
 * down with it. The trigger DID have an exception handler - but `WHEN OTHERS`
 * in PL/pgSQL does not trap `query_canceled` (57014), and 57014 is precisely
 * the code the authorisation check raises on purpose so that callers cannot
 * swallow it. The safety net had a hole shaped exactly like the falling object.
 *
 * Investigating further, three of the five audit trigger functions had NO
 * exception handler at all - on customers, products, bills, invoices and
 * purchase_orders. Any audit hiccup on those tables would abort the business
 * write outright.
 *
 * What this checks, against the LIVE database (source of truth, not the repo):
 *   1. every audit trigger function calls create_audit_log_internal, the
 *      logger that records without authorising
 *   2. every one of them handles BOTH `query_canceled` and `OTHERS`
 *   3. create_audit_log_internal contains no authorisation assertion
 *   4. create_audit_log (the public RPC) still DOES assert, so audit rows
 *      cannot be forged for another company through a direct call
 *
 * Comments are stripped before matching. The comments in these functions
 * mention `assert_company_access` to explain why it is absent - a check that
 * forbade the string would forbid the explanation. This project has hit that
 * trap eight times; strip first, then judge.
 *
 * Usage: node scripts/check-audit-cannot-abort.js [--require-db]
 * ---------------------------------------------------------------------------
 */
require("dotenv").config({ path: [".env.local", ".env", ".env.development.local"] });

const requireDb = process.argv.includes("--require-db");
const url = process.env.PRODUCTION_SUPABASE_DB_URL;

if (!url) {
  const msg = "PRODUCTION_SUPABASE_DB_URL is not set - cannot verify the audit path.";
  if (requireDb) {
    console.error(`X ${msg}`);
    process.exit(1);
  }
  console.log(`! ${msg} Skipping (pass --require-db to make this fatal).`);
  process.exit(0);
}

let Client;
try {
  ({ Client } = require("./lib/live-db"));
} catch {
  console.error("X npm install pg --save-dev");
  process.exit(1);
}

const stripComments = (s) => String(s || "").replace(/--[^\n]*/g, "");

(async () => {
  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();

  // Every function that writes an audit row from a trigger context.
  const { rows: triggerFns } = await client.query(
    `SELECT p.proname, p.prosrc
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.prorettype = 'trigger'::regtype
        AND p.prosrc ILIKE '%create_audit_log%'
      ORDER BY p.proname`
  );

  const { rows: loggers } = await client.query(
    `SELECT p.proname, p.prosrc
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname IN ('create_audit_log', 'create_audit_log_internal')
      ORDER BY p.proname`
  );

  await client.end();

  const problems = [];

  if (triggerFns.length === 0) {
    problems.push("no audit trigger functions found at all - is this the right database?");
  }

  for (const fn of triggerFns) {
    const code = stripComments(fn.prosrc);

    if (!/create_audit_log_internal/i.test(code)) {
      problems.push(
        `${fn.proname}: calls the authorising logger instead of create_audit_log_internal.\n` +
          `    A trigger fires after RLS already permitted the write; asserting again\n` +
          `    there can only ever refuse something that was already allowed.`
      );
    }
    if (!/when\s+query_canceled/i.test(code)) {
      problems.push(
        `${fn.proname}: does not handle query_canceled (57014).\n` +
          `    WHEN OTHERS does NOT trap that class, so an authorisation failure in\n` +
          `    the audit path would abort the business operation being recorded.`
      );
    }
    if (!/when\s+others/i.test(code)) {
      problems.push(`${fn.proname}: has no WHEN OTHERS handler - any audit failure aborts the write.`);
    }
  }

  const internal = loggers.find((l) => l.proname === "create_audit_log_internal");
  if (!internal) {
    problems.push("create_audit_log_internal does not exist - the split was never applied.");
  } else if (/assert_company_access/i.test(stripComments(internal.prosrc))) {
    problems.push(
      "create_audit_log_internal asserts company access.\n" +
        "    That is the exact defect that stopped a real customer from signing up."
    );
  }

  const publicLogger = loggers.find((l) => l.proname === "create_audit_log");
  if (!publicLogger) {
    problems.push("create_audit_log does not exist.");
  } else if (!/assert_company_access/i.test(stripComments(publicLogger.prosrc))) {
    problems.push(
      "create_audit_log no longer asserts company access.\n" +
        "    It is callable directly, so without the assertion an audit row could be\n" +
        "    forged against another company. The assertion belongs HERE, not in the\n" +
        "    trigger path."
    );
  }

  if (problems.length > 0) {
    console.error(`X the audit trail can abort the operations it records (${problems.length} issue(s)):\n`);
    for (const p of problems) console.error(`  - ${p}\n`);
    console.error("An audit log is a witness, not a judge.");
    process.exit(1);
  }

  console.log(
    `+ audit trail cannot abort a business operation ` +
      `(${triggerFns.length} trigger function(s) verified; internal logger does not authorise; ` +
      `the public RPC still does).`
  );
})().catch((err) => {
  console.error(
    "X failed:",
    String(err.message || err).replace(/postgres(ql)?:\/\/[^\s"']+/g, "postgresql://<redacted>")
  );
  process.exit(1);
});
