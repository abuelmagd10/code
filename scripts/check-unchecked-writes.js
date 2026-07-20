/**
 * check-unchecked-writes.js
 * ---------------------------------------------------------------------------
 * Finds database writes whose result is thrown away:
 *
 *     await supabase.from("t").insert({...})      // <- error discarded
 *
 * versus
 *
 *     const { error } = await supabase.from("t").insert({...})
 *
 * Why this matters more than it looks
 * -----------------------------------
 * supabase-js does NOT throw on a failed write. It returns { data, error }. So
 * an unchecked write that violates a constraint, names a column that does not
 * exist, or omits a NOT NULL field simply... does nothing, and execution
 * carries on as though it succeeded.
 *
 * Four instances of exactly this were found and fixed in one day:
 *
 *   v3.74.743  protect_customer_branch_id wrote to GENERATED columns, so every
 *              branch reassignment by an owner failed — for as long as the
 *              trigger had existed.
 *   v3.74.753  the nightly integrity cron wrote a non-existent column and
 *              omitted a NOT NULL one. Zero audit rows, zero notifications,
 *              ever. It returned success every night.
 *   v3.74.754  the FX revaluation reminder used a category its CHECK constraint
 *              rejects. The owner has never been reminded to revalue currency
 *              before closing a month.
 *   v3.74.726  and the retired repair tool reported "تم بنجاح" while its first
 *              step called a function that does not exist.
 *
 * None of these announced themselves. Every one reported success.
 *
 * A ratchet, not a blocker
 * ------------------------
 * 96 call sites already discard their result. Rewriting all of them at once is
 * the kind of sweep that breaks one thing while fixing another, so the existing
 * ones are recorded as a baseline and NEW ones fail the build. The number is
 * meant to fall.
 *
 * Run:   node scripts/check-unchecked-writes.js
 * CI:    non-zero exit fails the build.
 * ---------------------------------------------------------------------------
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const SCAN_DIRS = ["app", "lib"];

/**
 * The count when this check was introduced. Lower it as call sites are fixed —
 * the script fails if the real number goes UP, and also if it drops without the
 * baseline being updated, so the debt cannot silently reappear later.
 *
 * Set to 213 after the first real run. My initial estimate was 96, from a
 * search that covered app/ with a .ts filter and silently omitted lib/ and
 * .tsx entirely — more than half the codebase. The script reporting the true
 * number is the only reason the baseline is not permanently wrong by 117.
 *
 * NOT all 213 are equal, and the list should not be worked through top to
 * bottom. The dangerous ones are the rollback paths that delete journal
 * entries after a failed operation:
 *
 *     lib/services/manual-journal-command.service.ts
 *     lib/services/customer-refund-command.service.ts
 *     lib/services/shareholder-capital-command.service.ts
 *     lib/services/bank-transfer-command.service.ts
 *     lib/period-closing.ts
 *
 * If one of those deletes fails quietly, the compensating rollback does not
 * happen and a half-written journal entry survives a failed transaction. That
 * is an accounting integrity problem, not a logging one. Audit-log inserts —
 * the bulk of the list — matter far less.
 */
const BASELINE = 213;

const WRITE_RE = /^\s*await\s+[\w.$]+\s*\.\s*from\s*\([^)]*\)\s*\.\s*(insert|update|upsert|delete)\s*\(/;

const isCommentLine = (line) => /^\s*(\/\/|\*)/.test(line);
const isUnchecked = (line) => !isCommentLine(line) && WRITE_RE.test(line);

/**
 * Self-test. A rule this blunt can drift in either direction: too loose and it
 * flags correct code, too tight and it stops seeing the thing it exists for.
 * Both ends are pinned here and checked on every run, because a check nobody
 * has watched fail is a check nobody knows works.
 *
 * The comment fixtures matter especially: several guards written this week
 * rejected their own documentation by matching prose as if it were code.
 */
const FIXTURES = [
  ['await admin.from("audit_logs").insert({', true, "the shape that broke the integrity cron"],
  ["      await supabase.from('notifications').insert({", true, "indented, single quotes"],
  ['await supabase.from("t").update({ x: 1 })', true, "update counts too"],
  ['const { error } = await admin.from("x").insert({', false, "result captured"],
  ['  const { data, error: e } = await supabase.from("x").update({', false, "renamed error"],
  ['// await admin.from("x").insert({', false, "a line comment is not code"],
  [' * await supabase.from("t").insert(...)', false, "nor is a doc block"],
];

const fixtureFailures = FIXTURES.filter(([line, expected]) => isUnchecked(line) !== expected);
if (fixtureFailures.length > 0) {
  console.error("X The rule itself is broken — self-test fixtures failed:\n");
  for (const [line, expected, why] of fixtureFailures) {
    console.error(`   ${why}`);
    console.error(`      expected ${expected}, got ${isUnchecked(line)}`);
    console.error(`      ${line.trim()}\n`);
  }
  process.exit(1);
}

function walk(dir, out = []) {
  const full = path.join(ROOT, dir);
  if (!fs.existsSync(full)) return out;
  const stack = [full];
  while (stack.length) {
    const d = stack.pop();
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, entry.name);
      if (entry.isDirectory()) {
        if (!/node_modules|\.next/.test(p)) stack.push(p);
      } else if (/\.tsx?$/.test(entry.name)) {
        out.push(p);
      }
    }
  }
  return out;
}

const findings = [];

for (const dir of SCAN_DIRS) {
  for (const file of walk(dir)) {
    const src = fs.readFileSync(file, "utf8");
    const lines = src.split("\n");
    let inBlockComment = false;

    lines.forEach((line, i) => {
      // Skip comments so documentation describing the pattern is not counted —
      // the mistake made repeatedly this week was matching prose as if it were
      // code.
      if (inBlockComment) {
        if (line.includes("*/")) inBlockComment = false;
        return;
      }
      if (/^\s*\/\*/.test(line)) {
        if (!line.includes("*/")) inBlockComment = true;
        return;
      }
      if (isUnchecked(line)) {
        findings.push({
          file: path.relative(ROOT, file).replace(/\\/g, "/"),
          line: i + 1,
          code: line.trim().slice(0, 90),
        });
      }
    });
  }
}

console.log(`Scanned ${SCAN_DIRS.join(", ")} for writes whose result is discarded.`);
console.log(`Found: ${findings.length}   Baseline: ${BASELINE}`);

if (findings.length > BASELINE) {
  const extra = findings.length - BASELINE;
  console.error(`\nX ${extra} NEW write(s) discard their result.\n`);
  console.error("supabase-js does not throw on failure — it returns { error }. An");
  console.error("unchecked write that violates a constraint does nothing, silently,");
  console.error("and the code continues as if it had worked.\n");
  for (const f of findings.slice(-Math.min(extra + 5, findings.length))) {
    console.error(`   ${f.file}:${f.line}`);
    console.error(`      ${f.code}`);
  }
  console.error("\nCapture the result:  const { error } = await ...   and act on it.");
  process.exit(1);
}

if (findings.length < BASELINE) {
  console.log(`\n+ ${BASELINE - findings.length} fewer than the baseline — good.`);
  console.log(`  Update BASELINE in this script to ${findings.length} so the gain is locked in.`);
  process.exit(1);
}

console.log("\n+ No new unchecked writes.");
console.log(`! ${findings.length} pre-existing ones remain. Tracked, not approved.`);
