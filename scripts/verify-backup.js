/**
 * verify-backup.js
 * ---------------------------------------------------------------------------
 * Restores a backup into the TEST project and compares it against production.
 *
 * A backup is not a backup until it has been restored. On 2026-07-20 the
 * checked-in schema snapshot was believed to be a recovery plan for months. The
 * first time anyone actually restored it, 6,045 of 10,916 statements failed and
 * 496 of 501 triggers never arrived — and 4,871 statements SUCCEEDED, so the
 * result looked like a working database.
 *
 * That is the failure this script exists to prevent: not a backup that fails
 * loudly, but one that appears to work.
 *
 * What it does
 * ------------
 *   1. Refuses to touch production.
 *   2. Wipes the public schema of the TEST project.
 *   3. Applies roles.sql, schema.sql, data.sql in that order.
 *   4. Counts tables, functions, policies, triggers and rows in the restored
 *      database and compares them to production.
 *   5. Fails unless the structure matches.
 *
 * Step 4 is the part that matters. Counting applied statements only tells you
 * the file was read. Comparing the RESULT to production tells you whether you
 * could actually trade on it tomorrow.
 *
 * Run:   node scripts/verify-backup.js backups/<timestamp>
 * ---------------------------------------------------------------------------
 */
require("dotenv").config({ path: [".env.local", ".env", ".env.development.local"] });

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const PRODUCTION_REF = "hfvsbsizokxontflgdyn";
const ROOT = path.join(__dirname, "..");

const folder = process.argv[2];
if (!folder) {
  console.error("Usage: node scripts/verify-backup.js backups/<timestamp>");
  process.exit(1);
}
const dir = path.isAbsolute(folder) ? folder : path.join(ROOT, folder);
if (!fs.existsSync(dir)) {
  console.error(`X no such folder: ${dir}`);
  process.exit(1);
}

const dbUrl = process.env.TEST_SUPABASE_DB_URL;
if (!dbUrl) {
  console.error("X TEST_SUPABASE_DB_URL is not set in .env.local");
  process.exit(1);
}
if (dbUrl.includes(PRODUCTION_REF)) {
  console.error("X TEST_SUPABASE_DB_URL points at PRODUCTION. Refusing.");
  console.error("  This script DROPS the public schema. It must never run there.");
  process.exit(1);
}

/**
 * Production figures, refreshed 2026-07-20. A restore that does not reproduce
 * these is not a recovery, whatever the statement count says.
 */
const PRODUCTION = { tables: 249, functions: 1204, policies: 797, triggers: 501 };

/**
 * Production row count, and the floor a restore must clear.
 *
 * The first version of this script compared structure only. It printed the row
 * count as a bare line and never judged it — so a run that restored 249 tables,
 * 1208 functions and 507 triggers with ZERO ROWS ended with:
 *
 *     + The backup reproduces production's structure. This one you can rely on.
 *
 * The data load had died at data.sql line 132660 with "connection to server was
 * lost", and the verification tool said the backup was reliable.
 *
 * This is the exact failure this script was written to catch, committed by this
 * script. Structure without data is not a restored business: it is an empty ERP
 * with all the machinery and none of the invoices. Checking the impressive
 * numbers and skipping the one that says whether anything is actually there is
 * how every other silent failure today worked.
 *
 * The floor is deliberately generous — data grows, and this is a smoke test,
 * not a reconciliation. Its job is to separate "the rows arrived" from "the
 * rows did not".
 */
// Production carries 239,872 rows, but 209,092 of those are system_logs — API
// request logs, deliberately excluded from the data dump because they are 87%
// of the volume, worthless in a recovery, and were the reason the first restore
// died half-way through. What must come back is everything else.
const PRODUCTION_ROWS = 239872 - 209092;
const ROW_FLOOR = Math.floor(PRODUCTION_ROWS * 0.5);

let Client;
try {
  ({ Client } = require("pg"));
} catch {
  console.error("X npm install pg --save-dev");
  process.exit(1);
}

/**
 * Replay a .sql file, using whatever psql is actually available.
 *
 * The first version required psql on PATH and, when it was missing, told the
 * owner to install the PostgreSQL client tools. That was unnecessary: the
 * Supabase CLI had already pulled public.ecr.aws/supabase/postgres during the
 * backup, and that image contains psql. Docker was demonstrably working — it
 * had just downloaded 50 layers a few minutes earlier.
 *
 * Sending someone to install software they already have, because the check
 * asked "is psql on PATH" instead of "can I run psql", is the same narrow
 * question that has caused most of today's wrong turns.
 */
const PG_IMAGE = "public.ecr.aws/supabase/postgres:17.6.1.038";

const canRun = (cmd, args) => {
  try {
    execFileSync(cmd, args, { stdio: "ignore", shell: process.platform === "win32" });
    return true;
  } catch {
    return false;
  }
};

const runner = (() => {
  if (canRun("psql", ["--version"])) return "psql";
  if (canRun("docker", ["--version"])) return "docker";
  return null;
})();

/**
 * Both paths receive the same arguments. Under Docker the backup folder is
 * mounted at /b, so file paths are rewritten to match.
 */
function replay(file, extraCommand) {
  // keepalives: the 57 MB data load died at line 132660 with
  // "SSL SYSCALL error: EOF detected — connection to server was lost". The
  // session pooler drops a connection it believes has gone idle, and a long
  // COPY looks idle from the outside because no new query is issued. TCP
  // keepalives tell it otherwise.
  //
  // ON_ERROR_STOP stays 0 so one bad statement does not abandon the rest, but
  // the row count at the end is what decides success now — not the absence of
  // errors, and certainly not the structural counts alone.
  const base = [
    "-v", "ON_ERROR_STOP=0",
    "-q",
    "--set", "keepalives=1",
    "--set", "keepalives_idle=30",
    "--set", "keepalives_interval=10",
    "--set", "keepalives_count=5",
  ];
  const cmd = extraCommand ? ["-c", extraCommand] : [];

  if (runner === "psql") {
    return execFileSync("psql", [dbUrl, ...base, ...cmd, "-f", path.join(dir, file)], {
      stdio: ["ignore", "ignore", "pipe"],
      shell: process.platform === "win32",
      maxBuffer: 64 * 1024 * 1024,
    });
  }
  return execFileSync(
    "docker",
    ["run", "--rm", "-v", `${dir}:/b`, PG_IMAGE, "psql", dbUrl, ...base, ...cmd, "-f", `/b/${file}`],
    {
      stdio: ["ignore", "ignore", "pipe"],
      shell: process.platform === "win32",
      maxBuffer: 64 * 1024 * 1024,
    }
  );
}

(async () => {
  if (!runner) {
    console.error("X Neither psql nor docker is available.\n");
    console.error("  A pg_dump file must be replayed by psql — it contains COPY blocks and");
    console.error("  session settings that a plain query runner cannot execute.\n");
    console.error("  Docker is the easier route: the Supabase CLI already pulled an image");
    console.error("  containing psql while taking the backup. Start Docker Desktop and");
    console.error("  run this again.");
    process.exit(1);
  }
  console.log(`Using ${runner === "psql" ? "psql from PATH" : "psql inside the Supabase Postgres image"}.\n`);

  const client = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();

  /**
   * Wipe in batches, not in one statement.
   *
   * `DROP SCHEMA public CASCADE` takes a lock on every dependent object inside
   * a single transaction. Against a test database still holding the remains of
   * an earlier restore — 243 tables, 1053 functions, 429 policies — that
   * exceeded max_locks_per_transaction and failed with "out of shared memory".
   * Supabase does not expose that setting, so the statement cannot simply be
   * given more room.
   *
   * Dropping in batches keeps each transaction's lock count small. Tables go
   * first with CASCADE, which removes their policies, triggers, constraints and
   * indexes along with them; functions follow, since nothing depends on them by
   * then; the schema itself is dropped last and is empty by that point.
   */
  console.log("Wiping the test schema...");

  const batchDrop = async (label, listSql, dropSql, size) => {
    let removed = 0;
    for (;;) {
      const { rows } = await client.query(listSql, [size]);
      if (rows.length === 0) break;
      for (const r of rows) {
        try {
          await client.query(dropSql(r));
          removed++;
        } catch {
          /* already gone via a CASCADE from a sibling — expected, not an error */
        }
      }
      process.stdout.write(`  ${label}: ${removed}\r`);
    }
    if (removed > 0) console.log(`  ${label}: ${removed} dropped   `);
  };

  await batchDrop(
    "tables",
    `SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relkind IN ('r','p') LIMIT $1`,
    // Quote the identifier properly: wrap in double quotes and double any
    // internal ones. The first attempt used JSON.stringify followed by a
    // replace of '"' with '"', which is a no-op dressed up as escaping — it
    // happened to work only because no table name contains a quote.
    (r) => `DROP TABLE IF EXISTS public."${String(r.relname).replace(/"/g, '""')}" CASCADE`,
    25
  );

  await batchDrop(
    "functions",
    `SELECT p.oid::regprocedure::text AS sig FROM pg_proc p
      JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' LIMIT $1`,
    (r) => `DROP FUNCTION IF EXISTS ${r.sig} CASCADE`,
    50
  );

  await client.query("DROP SCHEMA IF EXISTS public CASCADE;");
  await client.query("CREATE SCHEMA public;");
  await client.query("GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;");
  await client.end();
  console.log("  schema recreated\n");

  const order = ["roles.sql", "schema.sql", "data.sql"];
  for (const file of order) {
    const p = path.join(dir, file);
    if (!fs.existsSync(p)) {
      console.log(`  ${file} — absent, skipping`);
      continue;
    }
    process.stdout.write(`  ${file} ... `);

    // data.sql is replayed with session_replication_role = replica.
    //
    // pg_dump warned about this explicitly while dumping, sixteen times:
    //
    //   warning: there are circular foreign-key constraints among these tables:
    //     companies, chart_of_accounts
    //     invoices, sales_orders
    //     purchase_orders, bills, goods_receipts
    //   hint: You might not be able to restore the dump without using
    //         --disable-triggers or temporarily dropping the constraints.
    //
    // Rows in a circular relationship cannot be inserted in any order that
    // satisfies every foreign key as it goes: whichever table is loaded first
    // references one that does not exist yet. Setting session_replication_role
    // to 'replica' suspends foreign-key checks AND triggers for the session,
    // which is the standard way to replay a data-only dump and is exactly what
    // pg_dump's own --disable-triggers does.
    //
    // Constraints are re-validated below, so nothing is quietly waived — the
    // data still has to be consistent, it just is not checked row by row on the
    // way in.
    //
    // Ignoring that warning would have produced a backup whose schema restores
    // perfectly and whose DATA does not. Verified as working, and useless.
    const prelude = file === "data.sql" ? "SET session_replication_role = 'replica';" : null;

    try {
      replay(file, prelude);
      console.log(prelude ? "applied (FK checks deferred)" : "applied");
    } catch (err) {
      // execFileSync puts the whole command line in err.message, and that line
      // carries the connection URL with its password. Fourth place today where
      // a credential could ride out on an error message — this one was looked
      // for rather than discovered after the fact.
      const redact = (s) =>
        String(s).replace(/postgres(ql)?:\/\/[^\s"']+/g, "postgresql://<redacted>");
      const tail = redact(err.stderr || err.message).trim().split("\n").slice(-2).join(" ");
      console.log(`errors — ${tail}`);
    }
  }

  // Put enforcement back and make the database prove the data is sound. A
  // restore that only "worked" because checking was switched off is not a
  // restore.
  const revalidate = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  await revalidate.connect();
  await revalidate.query("SET session_replication_role = 'origin';");
  const { rows: unvalidatedFks } = await revalidate.query(`
    SELECT conrelid::regclass::text AS table_name, conname
    FROM pg_constraint
    WHERE contype = 'f' AND NOT convalidated
    ORDER BY 1 LIMIT 10
  `);
  await revalidate.end();

  if (unvalidatedFks.length > 0) {
    console.log(`\n! ${unvalidatedFks.length} foreign key(s) were not validated after load:`);
    for (const fk of unvalidatedFks) console.log(`    ${fk.table_name}.${fk.conname}`);
  }

  const check = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  await check.connect();
  const { rows } = await check.query(`
    SELECT
      (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='public' AND c.relkind IN ('r','p'))        AS tables,
      (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
        WHERE n.nspname='public')                                   AS functions,
      (SELECT count(*) FROM pg_policy)                              AS policies,
      (SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal)      AS triggers,
      (SELECT coalesce(sum(n_live_tup),0)::bigint FROM pg_stat_user_tables) AS rows
  `);
  await check.end();

  const got = rows[0];
  console.log("\n=== RESTORED vs PRODUCTION ===");
  let bad = 0;
  for (const key of ["tables", "functions", "policies", "triggers"]) {
    const g = Number(got[key]);
    const want = PRODUCTION[key];
    const ok = g >= want;
    if (!ok) bad++;
    console.log(`  ${(ok ? "+" : "X")} ${key.padEnd(10)} ${String(g).padStart(5)} / ${want}`);
  }
  const restoredRows = Number(got.rows);
  const rowsOk = restoredRows >= ROW_FLOOR;
  if (!rowsOk) bad++;
  console.log(
    `  ${rowsOk ? "+" : "X"} ${"rows".padEnd(10)} ${String(restoredRows).padStart(5)} / ${PRODUCTION_ROWS} (floor ${ROW_FLOOR})`
  );

  if (bad > 0) {
    console.error(`\nX ${bad} check(s) failed. This backup would NOT restore your system.`);
    if (!rowsOk) {
      console.error("\n  The DATA did not arrive.");
      if (restoredRows === 0) {
        console.error("  Not one row. The structure is perfect and the business is missing:");
        console.error("  every table, function and trigger, and no invoices, customers or");
        console.error("  journal entries. An empty ERP is not a recovered ERP.");
      }
      console.error("\n  Check the data.sql line reported above. A dropped connection part-way");
      console.error("  through usually means the session pooler timed out on a long load.");
    }
    if (Number(got.triggers) < PRODUCTION.triggers) {
      console.error("\n  Triggers matter most among the structural checks: they are where COGS");
      console.error("  posting, journal balance enforcement and FIFO consumption live. A");
      console.error("  database missing them accepts data and quietly stops doing accounting.");
    }
    process.exit(1);
  }

  console.log("\n+ Structure AND data both reproduce production. This one you can rely on.");
})().catch((err) => {
  // The catch-all path leaks too if it prints raw. Found by grepping for every
  // place an error reaches the terminal, rather than fixing the one that had
  // just been noticed.
  console.error(
    "\nX verification aborted:",
    String(err.message || err).replace(/postgres(ql)?:\/\/[^\s"']+/g, "postgresql://<redacted>")
  );
  process.exit(1);
});
