/**
 * check-db-connection.js
 * ---------------------------------------------------------------------------
 * Answers one question: are the credentials wrong, or is the tool wrong?
 *
 * `supabase db dump` failed against the session pooler with:
 *
 *     FATAL: password authentication failed for user "postgres"
 *
 * while the configured URL carries the user "postgres.<ref>" — the form the
 * session pooler requires. The suffix is being dropped somewhere inside the
 * CLI, which would make this a tool problem, not a password problem.
 *
 * That is a hypothesis, and acting on a hypothesis is how an afternoon gets
 * spent installing software that was never the issue. This connects with the
 * `pg` driver, which passes the username through untouched:
 *
 *   - connects  -> the credentials are correct and the CLI is at fault
 *   - rejected  -> the password really is wrong, and no tooling change helps
 *
 * Prints nothing that could expose a password.
 *
 * Run:  node scripts/check-db-connection.js production
 *       node scripts/check-db-connection.js test
 * ---------------------------------------------------------------------------
 */
require("dotenv").config({ path: [".env.local", ".env", ".env.development.local"] });

const which = (process.argv[2] || "production").toLowerCase();
const varName =
  which === "test" ? "TEST_SUPABASE_DB_URL" : "PRODUCTION_SUPABASE_DB_URL";

const url = process.env[varName];
if (!url) {
  console.error(`X ${varName} is not set in .env.local`);
  process.exit(1);
}

let Client;
try {
  ({ Client } = require("pg"));
} catch {
  console.error("X npm install pg --save-dev");
  process.exit(1);
}

const at = url.lastIndexOf("@");
const user = (url.match(/^postgres(?:ql)?:\/\/([^:]+):/) || [])[1] || "<unreadable>";
const host = at > -1 ? url.slice(at + 1) : "<none>";

console.log(`target : ${which}`);
console.log(`user   : ${user}`);
console.log(`host   : ${host}\n`);

(async () => {
  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  try {
    await client.connect();
    const { rows } = await client.query(
      `SELECT current_user, current_database(),
              (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                WHERE n.nspname='public' AND c.relkind IN ('r','p')) AS tables`
    );
    await client.end();

    console.log("+ CONNECTED.");
    console.log(`  connected as : ${rows[0].current_user}`);
    console.log(`  database     : ${rows[0].current_database}`);
    console.log(`  public tables: ${rows[0].tables}\n`);
    console.log("The credentials are correct. The Supabase CLI is dropping the");
    console.log('".<ref>" suffix from the username, so the pooler sees "postgres"');
    console.log("and refuses it. Use pg_dump directly instead of the CLI.");
    process.exit(0);
  } catch (err) {
    const msg = String(err.message || err);
    console.error("X NOT CONNECTED.");
    console.error(`  ${msg.split("\n")[0]}\n`);
    if (/password authentication failed/i.test(msg)) {
      console.error("  The password is genuinely wrong. No change of tool will fix this.");
      console.error("  Reset it: dashboard -> Connect -> Direct -> Reset password,");
      console.error("  letters and digits only, then update .env.local.");
    } else if (/ENOTFOUND|EAI_AGAIN/.test(msg)) {
      console.error("  The host does not resolve. The direct host is IPv6-only;");
      console.error("  use the Session pooler URI instead.");
    } else if (/ETIMEDOUT|ECONNREFUSED/.test(msg)) {
      console.error("  The host resolves but refuses the connection — usually a");
      console.error("  firewall, or the wrong port.");
    }
    process.exit(1);
  }
})();
