/**
 * backup-production.js
 * ---------------------------------------------------------------------------
 * A real backup of the production database, using pg_dump via the Supabase CLI.
 *
 * Why this exists
 * ---------------
 * On 2026-07-20 two facts were established within an hour of each other:
 *
 *   1. supabase/schema/*.sql does NOT rebuild the database. Restoring it into a
 *      clean project produced 6,045 failures out of 10,916 statements, and left
 *      5 triggers out of 501. See dump-db-schema.js for the full result.
 *
 *   2. The Supabase project is on the Free plan, which the dashboard states
 *      plainly: "Free Plan does not include project backups."
 *
 * Together those meant there was NO working backup of the production database
 * at all. Not a degraded one — none. 270 MB of live accounting data, 249 tables,
 * ~240,000 rows, and nothing that could bring it back.
 *
 * This script closes that gap without a paid plan.
 *
 * Why pg_dump and not our own dumper
 * ----------------------------------
 * Every failure class in the snapshot restore is something pg_dump solves by
 * design: dependency ordering, extensions, enum types, sequences, and DEFAULTs
 * that call functions. Our dumper cannot be extended into pg_dump, and should
 * not be. It stays what it is good at — a readable diff surface that already
 * caught a stale copy still granting three dropped functions to anon.
 *
 * What it produces
 * ----------------
 *   backups/<timestamp>/roles.sql   role definitions
 *   backups/<timestamp>/schema.sql  structure: tables, types, functions, RLS
 *   backups/<timestamp>/data.sql    the rows
 *
 * Three files rather than one because that is how Supabase restores them, and
 * because a schema-only restore is often what you actually want.
 *
 * A backup is not a backup until it has been restored
 * ---------------------------------------------------
 * That sentence is the entire lesson of 2026-07-20. Run
 * scripts/verify-backup.js afterwards — it restores this dump into the test
 * project and compares object counts against production. An unverified backup
 * is a belief, and beliefs were what today disproved.
 *
 * Setup (once)
 * ------------
 *   npx supabase login
 *   npx supabase link --project-ref hfvsbsizokxontflgdyn
 *
 * The link step asks for the production DATABASE password. Note that this is
 * NOT the password your application uses — the app authenticates with API keys.
 * If the database password was never recorded, reset it in the dashboard under
 * Connect -> Direct -> Reset password; doing so does not interrupt the running
 * application.
 *
 * Run:   node scripts/backup-production.js
 * ---------------------------------------------------------------------------
 */
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const PRODUCTION_REF = "hfvsbsizokxontflgdyn";
const ROOT = path.join(__dirname, "..");
const BACKUP_ROOT = path.join(ROOT, "backups");

const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const outDir = path.join(BACKUP_ROOT, stamp);

function linkedRef() {
  const p = path.join(ROOT, "supabase", ".temp", "project-ref");
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8").trim() : null;
}

/**
 * Connect by explicit URL, not by stored CLI state.
 *
 * The first version relied on `--linked`. `supabase link` completed without
 * ever asking for a database password, then every dump failed with:
 *
 *     FATAL: (EAUTHQUERY) unsupported or invalid secret format
 *
 * because the CLI was reusing a pooler URL cached in supabase/.temp from
 * 2026-05-25 and sending credentials that no longer applied. Nothing in the
 * link step reported that it had no password. The failure surfaced three steps
 * later, wearing the costume of a server problem.
 *
 * An explicit --db-url has no hidden state to be stale. It is also exactly how
 * the test database is reached in this repo, so there is one mechanism to
 * understand rather than two.
 */
require("dotenv").config({ path: [".env.local", ".env", ".env.development.local"] });

const prodUrl = process.env.PRODUCTION_SUPABASE_DB_URL;
if (!prodUrl) {
  console.error("X PRODUCTION_SUPABASE_DB_URL is not set in .env.local\n");
  console.error("  Supabase dashboard -> production project -> Connect -> Direct");
  console.error("  -> Session pooler -> URI, with the database password filled in.\n");
  console.error("  Session pooler, not Direct connection: the direct host is IPv6-only");
  console.error("  and unreachable from most networks. That cost us an hour today.\n");
  console.error("  PRODUCTION_SUPABASE_DB_URL=postgresql://postgres.<ref>:<password>@aws-...pooler.supabase.com:5432/postgres\n");
  console.error("  Use letters and digits only in the password. A '#' silently truncates");
  console.error("  the .env line, and @ / : break the URL.");
  process.exit(1);
}

if (!prodUrl.includes(PRODUCTION_REF)) {
  console.error("X PRODUCTION_SUPABASE_DB_URL does not point at the production project.");
  console.error(`  expected the ref ${PRODUCTION_REF} to appear in the URL.`);
  process.exit(1);
}

const ref = linkedRef();
if (ref && ref !== PRODUCTION_REF) {
  console.log(`! CLI is linked to ${ref}, but this script uses the URL above instead.`);
}

/**
 * Check Docker before starting, not after three failures.
 *
 * `supabase db dump` runs pg_dump inside a container. With Docker Desktop
 * stopped — which is the default state after every Windows restart — each of
 * the three dumps failed with about twenty lines of registry connection errors:
 *
 *     open //./pipe/dockerDesktopLinuxEngine: The system cannot find the file
 *     specified
 *
 * Sixty lines of output for one fact: Docker is not running. The information
 * was all there and none of it was legible, which is its own kind of silence.
 */
try {
  execFileSync("docker", ["info"], {
    stdio: "ignore",
    shell: process.platform === "win32",
  });
} catch {
  console.error("X Docker is not running.\n");
  console.error("  The Supabase CLI runs pg_dump inside a container, so Docker Desktop");
  console.error("  must be started first. It does not start automatically after a");
  console.error("  Windows restart.\n");
  console.error("  Start Docker Desktop, wait for its icon to settle, then run this again.");
  process.exit(1);
}

fs.mkdirSync(outDir, { recursive: true });

/**
 * Each dump is a separate CLI call. If one fails the others still run, so a
 * partial backup is visible as a partial backup rather than silently missing a
 * piece — the failure mode this whole day has been about.
 */
/**
 * system_logs is excluded from the data dump.
 *
 * It is 209,092 rows — 86.9% of every row in the database — and 108 MB. It
 * holds one entry per API request ("GET /api/sidebar/approval-badges"), and a
 * scheduled job already deletes anything older than 30 days.
 *
 * It is also what broke the first restore. The 57 MB data file died part-way
 * through the system_logs INSERTs with "connection to server was lost", and
 * everything after that point — every table dumped alphabetically later — never
 * loaded. Zero rows restored, because of request logs.
 *
 * Weighed plainly: the accounting data this backup exists to protect is under
 * 1% of the volume. Journal entry lines are 922 rows. Invoices, customers,
 * payments, all of it fits in a few megabytes. Carrying 108 MB of API traffic
 * logs alongside it made the backup slower, larger, and — as demonstrated —
 * unable to complete.
 *
 * Losing 30 days of request logs in a disaster costs nothing. Losing the
 * journal costs the business. Excluding it is not a compromise on the backup;
 * it is what makes the backup work.
 *
 * NOTE: audit_logs is deliberately NOT excluded. It is 1,916 rows and it is the
 * record of who did what — the first thing an auditor asks for, and the thing
 * the in-app backup already leaves out.
 */
const EXCLUDED_DATA_TABLES = ["public.system_logs"];

/**
 * Ask the CLI which exclude flag it supports instead of assuming one.
 *
 * The first attempt passed --exclude-table-data, which is a pg_dump flag. The
 * Supabase CLI wraps pg_dump but does not forward it:
 *
 *     ERROR  Unrecognized flag: --exclude-table-data in command supabase db dump
 *
 * That was a guess about someone else's tool, made twice in one session — the
 * earlier one being that the CLI was stripping a username when in fact the
 * password was simply wrong. Reading --help costs one subprocess and removes
 * the guess entirely.
 *
 * If no exclude flag exists, the dump runs without one and system_logs is
 * filtered out of the resulting file instead. Either way the outcome is the
 * same; only the mechanism differs.
 */
function detectExcludeFlag() {
  try {
    const help = execFileSync("npx", ["--yes", "supabase", "db", "dump", "--help"], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      shell: process.platform === "win32",
    });
    for (const flag of ["--exclude-table-data", "--exclude-table", "--exclude", "-x"]) {
      if (help.includes(flag)) return flag;
    }
  } catch {
    /* fall through to post-filtering */
  }
  return null;
}

const excludeFlag = detectExcludeFlag();
const excludeArgs = excludeFlag
  ? EXCLUDED_DATA_TABLES.flatMap((t) => [excludeFlag, t])
  : [];

if (excludeFlag) {
  console.log(`Excluding ${EXCLUDED_DATA_TABLES.join(", ")} via ${excludeFlag}.`);
} else {
  console.log(`The CLI has no exclude flag; ${EXCLUDED_DATA_TABLES.join(", ")} will be`);
  console.log("filtered out of data.sql after the dump instead.");
}

const parts = [
  { name: "roles.sql", args: ["db", "dump", "--db-url", prodUrl, "--role-only"] },
  { name: "schema.sql", args: ["db", "dump", "--db-url", prodUrl] },
  { name: "data.sql", args: ["db", "dump", "--db-url", prodUrl, "--data-only", ...excludeArgs] },
];

const results = [];

console.log("\nDumping production. The CLI pulls a Postgres container on first run,");
console.log("so the first dump takes a few minutes.\n");

/**
 * Retry on dropped connections.
 *
 * The session pooler drops long-lived connections without warning:
 *
 *     pg_dump: error: query failed: SSL SYSCALL error: EOF detected
 *     detail: Query was: FETCH 100 FROM _pg_dump_cursor
 *
 * It is transient — the very same dump had succeeded minutes earlier at four
 * times the size. A backup tool that gives up on the first network hiccup is a
 * backup tool that quietly stops producing backups, and nobody notices until
 * the day it is needed.
 *
 * Only connection-level failures are retried. A genuine error — a bad flag, a
 * wrong password, a missing table — repeats identically and must surface at
 * once rather than three times more slowly.
 */
const RETRIES = 3;
const isTransient = (text) =>
  /SSL SYSCALL error|EOF detected|connection to server was lost|server closed the connection|ECONNRESET|timeout/i.test(
    text
  );

const sleep = (ms) => {
  const until = Date.now() + ms;
  while (Date.now() < until) { /* deliberate: keeps the sequence readable and ordered */ }
};

for (const part of parts) {
  const target = path.join(outDir, part.name);
  console.log(`  ${part.name} ...`);
  let attempt = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
  attempt++;
  try {
    // stdin and stderr are INHERITED, not captured.
    //
    // The first version used stdio ["ignore","ignore","pipe"] to keep the
    // output tidy. `supabase db dump` prompts for the database password, and
    // with stdin ignored the prompt was invisible and unanswerable: the script
    // sat there forever showing "roles.sql ..." with no indication it was
    // waiting for anything. A hang that looks like work is the same failure as
    // a success that does nothing — it just wastes a different resource.
    //
    // Tidiness is not worth a silent deadlock. The password is typed by the
    // owner directly into the CLI; it never passes through this script.
    // stderr is CAPTURED here, and echoed below — the opposite of the psql
    // replay in verify-backup.js, deliberately.
    //
    // The retry logic reads the error text to decide whether a failure is a
    // dropped connection or a real fault. When stderr was inherited for the
    // sake of a password prompt, that text never reached the code, and the
    // retry silently stopped working: the pooler dropped a connection and the
    // script gave up on the first attempt without ever printing "retrying".
    // A safety net that cannot see the fall is not a safety net.
    //
    // Capturing is safe here where it was not for psql: the CLI emits tens of
    // lines, psql restoring a 3.5 MB schema emits a flood. And stdin no longer
    // needs to be interactive — the connection URL is passed explicitly, so
    // there is no password prompt to answer.
    const out = execFileSync("npx", ["--yes", "supabase", ...part.args, "-f", target], {
      cwd: ROOT,
      stdio: ["ignore", "ignore", "pipe"],
      encoding: "utf8",
      shell: process.platform === "win32",
      maxBuffer: 32 * 1024 * 1024,
    });
    // pg_dump's circular-foreign-key warnings arrive here on success. They are
    // worth seeing once: they are the reason the restore defers FK checks.
    if (out && /warning:/i.test(out)) {
      const warnings = out.split("\n").filter((l) => /circular foreign-key/i.test(l)).length;
      if (warnings > 0) console.log(`      ${warnings} circular foreign-key warning(s) — expected`);
    }
    // If the CLI could not exclude system_logs, strip it here. Its rows are
    // INSERT INTO "public"."system_logs" ... statements, one per line, so this
    // is a line filter rather than SQL parsing — no statement spans lines in
    // this dump format, which was confirmed by inspecting the previous file
    // around the point where the restore died.
    if (!excludeFlag && part.name === "data.sql" && fs.existsSync(target)) {
      const raw = fs.readFileSync(target, "utf8").split("\n");
      const isExcluded = (line) =>
        EXCLUDED_DATA_TABLES.some((t) => {
          const bare = t.replace(/^public\./, "");
          return (
            line.includes(`INSERT INTO "public"."${bare}"`) ||
            line.includes(`INSERT INTO public.${bare} `) ||
            line.startsWith(`COPY public.${bare} `) ||
            line.startsWith(`COPY "public"."${bare}"`)
          );
        });
      // Skip the WHOLE statement, not the line that starts it.
      //
      // This dump writes multi-row INSERTs: one header line followed by up to
      // 100,000 lines of value tuples, terminated by a line ending in ";".
      // system_logs occupies three such statements and ~208,594 of the file's
      // 242,621 lines.
      //
      // The first version of this filter matched only the header lines. It
      // removed 3 lines out of 242,621, left 208,591 orphaned value tuples
      // behind, and they would have attached themselves to whichever INSERT
      // came before — loading API request logs into an accounting table. The
      // backup would have restored without error and been quietly wrong, which
      // is the worst outcome available and the one this whole day has been
      // about.
      //
      // Caught because the line count did not move and the file size did not
      // change. A filter that claims to remove 87% of a file and shrinks it by
      // nothing has not removed anything.
      let inStatement = false;
      let inCopy = false;
      const kept = raw.filter((line) => {
        if (inCopy) {
          if (line === "\\.") inCopy = false;
          return false;
        }
        if (inStatement) {
          if (/;\s*$/.test(line)) inStatement = false;
          return false;
        }
        if (isExcluded(line)) {
          if (/^COPY /.test(line)) inCopy = true;
          else if (!/;\s*$/.test(line)) inStatement = true;
          return false;
        }
        return true;
      });
      const before = raw.length;
      const beforeBytes = Buffer.byteLength(raw.join("\n"));
      fs.writeFileSync(target, kept.join("\n"));
      const afterBytes = Buffer.byteLength(kept.join("\n"));
      const removed = before - kept.length;
      console.log(
        `      removed ${removed} line(s), ` +
        `${((beforeBytes - afterBytes) / 1048576).toFixed(1)} MB of ${EXCLUDED_DATA_TABLES[0]}`
      );
      // A filter that removes almost nothing has not worked. Fail loudly rather
      // than hand over a file that still contains what it promised to strip.
      if (removed < 1000) {
        throw new Error(
          `only ${removed} lines removed — the exclusion did not work, and the file may now be malformed`
        );
      }
    }

    const size = fs.existsSync(target) ? fs.statSync(target).size : 0;
    if (size === 0) throw new Error("the file is empty");
    console.log(`      ${(size / 1024 / 1024).toFixed(2)} MB`);
    results.push({ name: part.name, ok: true, size });
    break;
  } catch (err) {
    // execFileSync puts the ENTIRE command line into err.message, and the
    // command line now contains --db-url with the production password in it.
    // Printing the error raw would put that password on the terminal and into
    // the scrollback — and errors are precisely when someone copies the output
    // to ask for help.
    //
    // Third masking bug caught today. The first two were found by reading
    // output that had already been printed; this one was found before the
    // script ever ran, by asking where the password could travel rather than
    // assuming it stayed put.
    const redact = (s) =>
      String(s).replace(/postgres(ql)?:\/\/[^\s"']+/g, "postgresql://<redacted>");
    // stderr is captured now, so the CLI's real message is in err.stderr and
    // has NOT been printed. Show it — a failed backup with no visible reason is
    // how someone concludes "it just doesn't work" and stops running it.
    const stderrText = String(err.stderr || "");
    if (stderrText.trim()) {
      const lines = stderrText.trim().split("\n");
      for (const l of lines.slice(-6)) console.log(`      ${redact(l)}`);
    }

    const detail = redact(err.message || err).trim().split("\n").slice(-2).join(" ");
    const transient = isTransient(String(err.message || "") + stderrText);

    if (transient && attempt < RETRIES) {
      console.log(`      connection dropped — retrying (${attempt}/${RETRIES - 1})`);
      try { fs.rmSync(target, { force: true }); } catch { /* nothing to remove */ }
      sleep(3000 * attempt);
      continue;
    }

    console.log(`      FAILED — ${detail}`);
    if (transient) {
      console.log(`      still dropping after ${RETRIES} attempts — try again in a minute.`);
    }
    results.push({ name: part.name, ok: false, detail });
    break;
  }
  }
}

const failed = results.filter((r) => !r.ok);
const totalMb = results.filter((r) => r.ok).reduce((s, r) => s + r.size, 0) / 1024 / 1024;

console.log("\n=== RESULT ===");
console.log(`folder : backups/${stamp}`);
console.log(`files  : ${results.length - failed.length}/${results.length}   ${totalMb.toFixed(2)} MB`);

if (failed.length > 0) {
  console.error(`\nX ${failed.length} part(s) failed. This backup is INCOMPLETE.`);
  console.error("  Do not treat this folder as a usable backup.");
  process.exit(1);
}

// Production is ~270 MB. A dump far below that means something was skipped, and
// a small file that looks like a success is the exact shape of failure this
// codebase keeps producing.
if (totalMb < 5) {
  console.error(`\nX The dump is only ${totalMb.toFixed(2)} MB against a 270 MB database.`);
  console.error("  It completed without error, which makes it more dangerous, not less.");
  console.error("  Inspect the files before relying on this.");
  process.exit(1);
}

console.log("\n+ Backup written.");
console.log("\nIt is not a backup yet — it is a file. Prove it:");
console.log(`   node scripts/verify-backup.js backups/${stamp}`);
