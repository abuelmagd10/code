/**
 * verify-signup-path.js
 * ---------------------------------------------------------------------------
 * Smoke test for the single most expensive path in the product: a new customer
 * creating their company. Runs the real INSERT as an *authenticated* user
 * inside a transaction, checks the bootstrap seeded correctly, then ROLLS BACK.
 * Nothing is left behind.
 *
 * Why this exists — 2026-07-26
 * ----------------------------
 * A real prospect saw "فشل في إنشاء الشركة" and nothing else. The cause:
 *
 *   INSERT companies
 *     -> trg_seed_company_accounts
 *        -> seed_default_chart_of_accounts -> sync_company_chart_of_accounts
 *           -> INSERT chart_of_accounts
 *              -> audit_trigger_function -> create_audit_log
 *                 -> assert_company_access  ->  RAISE "غير مصرح"
 *
 * assert_company_access looked only at `company_members`. The membership row is
 * written by the client *after* the company INSERT returns — so for the length
 * of that one statement the creator is a stranger to their own company, and
 * every bootstrap trigger that logs an audit row kills the signup. The whole
 * statement rolls back, so there is no partial company and no trace in the
 * product: the funnel simply stops converting, silently.
 *
 * Nothing caught it. Type-checking cannot see it, the critical tests do not
 * create companies, and the error surfaces only to the person least able to
 * report it. So it needs its own check, and the check must use a real
 * authenticated identity - as service_role the INSERT succeeds either way,
 * which is exactly why it looked fine from every console.
 *
 * A subtlety worth keeping: the raise uses ERRCODE 57014 (query_canceled)
 * deliberately, because PL/pgSQL `WHEN OTHERS` does NOT trap that class - so
 * calling functions cannot swallow an authorisation failure by accident. Any
 * handler here must name `query_canceled` explicitly.
 *
 * Usage: node scripts/verify-signup-path.js
 * ---------------------------------------------------------------------------
 */
require("dotenv").config({ path: [".env.local", ".env", ".env.development.local"] });

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

const MIN_ACCOUNTS = 50; // a real seed is ~94; anything less means a broken bootstrap

(async () => {
  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();

  // A real user id is needed so auth.uid() is not null. Any existing owner
  // works: the company being created is new, so no membership row exists for
  // it - which is precisely the condition that used to fail.
  const { rows: owners } = await client.query(
    `SELECT user_id FROM public.companies WHERE user_id IS NOT NULL LIMIT 1`
  );
  if (owners.length === 0) {
    console.error("X no existing company owner to borrow an identity from");
    await client.end();
    process.exit(1);
  }
  const uid = owners[0].user_id;

  let failed = false;
  try {
    await client.query("BEGIN");
    await client.query(
      `SELECT set_config('request.jwt.claims',
                         json_build_object('sub', $1::text, 'role', 'authenticated')::text, true)`,
      [uid]
    );
    await client.query(`SELECT set_config('role', 'authenticated', true)`);

    const { rows: created } = await client.query(
      `INSERT INTO public.companies (name, user_id, email, base_currency, enabled_modules)
       VALUES ('__signup_smoke_test__', $1, 'smoke@example.invalid', 'EGP',
               ARRAY['manufacturing','payroll','fixed_assets','services'])
       RETURNING id`,
      [uid]
    );
    const companyId = created[0].id;

    await client.query(`SELECT set_config('role', 'service_role', true)`);

    const { rows: counts } = await client.query(
      `SELECT (SELECT COUNT(*) FROM public.chart_of_accounts WHERE company_id = $1) AS accounts,
              (SELECT COUNT(*) FROM public.branches          WHERE company_id = $1) AS branches,
              (SELECT COUNT(*) FROM public.warehouses        WHERE company_id = $1) AS warehouses`,
      [companyId]
    );
    const { accounts, branches, warehouses } = counts[0];

    const problems = [];
    if (Number(accounts) < MIN_ACCOUNTS) {
      problems.push(`chart of accounts seeded only ${accounts} account(s), expected >= ${MIN_ACCOUNTS}`);
    }
    if (Number(branches) < 1) problems.push("no default branch was created");
    if (Number(warehouses) < 1) problems.push("no main warehouse was created");

    if (problems.length > 0) {
      console.error("X the signup path completes but the bootstrap is incomplete:");
      for (const p of problems) console.error(`    - ${p}`);
      failed = true;
    } else {
      console.log(
        `+ signup path works for an authenticated user ` +
          `(${accounts} accounts, ${branches} branch, ${warehouses} warehouse) - rolled back.`
      );
    }
  } catch (err) {
    const msg = String(err.message || err);
    console.error("X a new customer CANNOT create a company right now.");
    console.error(`    ${msg}`);
    if (err.code) console.error(`    SQLSTATE ${err.code}`);
    if (err.where) console.error(`    where: ${String(err.where).split("\n")[0]}`);
    console.error(
      "\n  This is the first screen a paying customer sees. Treat it as the\n" +
        "  highest-severity failure in the project."
    );
    failed = true;
  } finally {
    try {
      await client.query("ROLLBACK");
    } catch { /* connection may already be unusable */ }
    await client.end();
  }

  process.exit(failed ? 1 : 0);
})().catch((err) => {
  console.error(
    "X failed:",
    String(err.message || err).replace(/postgres(ql)?:\/\/[^\s"']+/g, "postgresql://<redacted>")
  );
  process.exit(1);
});
