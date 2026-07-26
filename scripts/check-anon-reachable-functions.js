/**
 * check-anon-reachable-functions.js
 * ---------------------------------------------------------------------------
 * A SECURITY DEFINER function that reads company data must not be callable by
 * someone who has not signed in.
 *
 * Why this exists — 2026-07-26
 * ----------------------------
 * The system-integrity panel on the owner's dashboard reported one medium
 * drift: "functions that read company data and can be called without signing
 * in", naming plw_next_payment_no — written hours earlier in 3.74.841.
 *
 * The cause is a Postgres default that is easy to miss: CREATE FUNCTION grants
 * EXECUTE to PUBLIC, and PUBLIC includes `anon`. Granting explicitly to
 * `authenticated` afterwards does NOT remove the inherited grant, so a line
 * that looks like it restricts the function restricts nothing. Auditing
 * everything written that day found TEN such functions, not one.
 *
 * The exposure was modest and the workflow functions checked the caller's role
 * internally anyway - but a defence left open because another one is holding
 * is not a design, it is a coincidence.
 *
 * This mirrors the database's own ic_anon_reachable_readers() check so the same
 * finding fails the build instead of waiting to be noticed on a dashboard.
 *
 * Flags a function when ALL of these hold:
 *   - SECURITY DEFINER (runs with the owner's rights)
 *   - EXECUTE granted to anon
 *   - not a trigger, and takes arguments (so a caller can aim it)
 *   - reads rather than writes
 *   - mentions company_id, i.e. it is company-scoped data
 *   - has neither assert_company_access nor auth.uid() to identify the caller
 *   - AND is not referenced inside an RLS policy expression
 *
 * That last condition is not a convenience, it is a correctness requirement,
 * and leaving it out was a mistake worth recording. The first version of this
 * script dropped it and immediately flagged nine functions the dashboard check
 * had not: can_access_invoice_items, can_access_journal_lines,
 * ic_user_can_access_consolidation_group and the like. Every one of them is
 * called from inside an RLS policy — one of them from thirty-two policies. A
 * function used in a policy MUST be executable by the roles that policy is
 * evaluated for; revoking EXECUTE would not have tightened anything, it would
 * have broken row-level security across invoices, bills, journal lines, bank
 * reconciliation, vendor credits, discounts and intercompany.
 *
 * A guard that flags correct code is not merely noisy - it argues for breaking
 * something that works. False positives deserve the same suspicion as false
 * negatives.
 *
 * Usage: node scripts/check-anon-reachable-functions.js [--require-db]
 * ---------------------------------------------------------------------------
 */
require("dotenv").config({ path: [".env.local", ".env", ".env.development.local"] });

const requireDb = process.argv.includes("--require-db");
const url = process.env.PRODUCTION_SUPABASE_DB_URL;

if (!url) {
  const msg = "PRODUCTION_SUPABASE_DB_URL is not set - cannot check anon-reachable functions.";
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

// Deliberate exceptions: pre-login screens that must work for a visitor.
// Each is limited some other way and none reads company-scoped data.
const ALLOWED = new Set([
  "find_user_by_login",
  "check_username_available",
  "generate_username_from_email",
  "get_user_company_status",
  // v3.74.839 — the verification screen asks this BEFORE the user signs in.
  // Rate-limited inside the function itself (8/min per IP) and returns one bit:
  // confirmed or not, with a missing address indistinguishable from unconfirmed.
  "auth_email_state",
]);

// Mirrors the database's own ic_anon_reachable_readers(), including the
// RLS-policy exclusion. Keep the two in step: if that function is tightened,
// tighten this, and vice versa.
const SQL = `
  WITH policy_text AS (
    SELECT string_agg(coalesce(pg_get_expr(pol.polqual, pol.polrelid), '') || ' ' ||
                      coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), ''), ' ') AS body
      FROM pg_policy pol
  )
  SELECT p.proname, p.oid::regprocedure::text AS signature
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   CROSS JOIN policy_text pt
   WHERE n.nspname = 'public'
     AND p.prosecdef
     AND has_function_privilege('anon', p.oid, 'EXECUTE')
     AND p.prorettype <> 'trigger'::regtype
     AND p.prosrc !~* '\\m(INSERT INTO|UPDATE |DELETE FROM)\\M'
     AND p.prosrc NOT ILIKE '%assert_company_access%'
     AND p.prosrc NOT ILIKE '%auth.uid()%'
     AND p.prosrc ~* 'company_id'
     AND pg_get_function_identity_arguments(p.oid) <> ''
     -- called from inside an RLS policy ⇒ anon MUST keep EXECUTE, or the
     -- policy cannot be evaluated at all
     AND pt.body !~ ('\\m' || p.proname || '\\s*\\(')
   ORDER BY 1
`;

(async () => {
  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();
  let rows = [];
  try {
    ({ rows } = await client.query(SQL));
  } finally {
    await client.end();
  }

  const offenders = rows.filter((r) => !ALLOWED.has(r.proname));

  if (offenders.length > 0) {
    console.error(
      `X ${offenders.length} SECURITY DEFINER function(s) read company data and are callable ` +
        `without signing in:\n`
    );
    for (const o of offenders) console.error(`  - ${o.signature}`);
    console.error(
      "\n  CREATE FUNCTION grants EXECUTE to PUBLIC, and PUBLIC includes anon.\n" +
        "  Granting to `authenticated` does NOT remove that. Add, explicitly:\n\n" +
        "    REVOKE ALL ON FUNCTION public.<name>(<args>) FROM PUBLIC, anon;\n" +
        "    GRANT EXECUTE ON FUNCTION public.<name>(<args>) TO authenticated, service_role;\n\n" +
        "  For a helper only ever called from inside another SECURITY DEFINER\n" +
        "  function, revoke from `authenticated` too - it runs as the owner there.\n\n" +
        "  BUT FIRST: check whether the function is used inside an RLS policy.\n" +
        "  If it is, anon must keep EXECUTE or the policy cannot be evaluated —\n" +
        "  revoking would break row-level security rather than tighten it:\n\n" +
        "    SELECT polrelid::regclass, polname FROM pg_policy\n" +
        "     WHERE pg_get_expr(polqual, polrelid) LIKE '%<name>%';"
    );
    process.exit(1);
  }

  console.log(
    `+ no anon-reachable company readers ` +
      `(${ALLOWED.size} documented pre-login exception(s); ` +
      `functions used inside RLS policies are excluded by design).`
  );
})().catch((err) => {
  console.error(
    "X failed:",
    String(err.message || err).replace(/postgres(ql)?:\/\/[^\s"']+/g, "postgresql://<redacted>")
  );
  process.exit(1);
});
