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
 * They are not equal, and the list should not be worked through top to bottom.
 * The dangerous ones were the rollback paths that delete a journal entry after
 * a failed operation: if that delete fails quietly the compensation never
 * happens, and a half-written entry survives a failed transaction with no
 * document explaining it. That is accounting integrity, not logging.
 *
 * v3.74.756 fixed the six command services in that class — manual-journal,
 * customer-refund, customer-voucher, shareholder-capital, bank-transfer and
 * supplier-refund-receipt — via lib/services/rollback-journal-entry.ts, which
 * checks both deletes and logs ROLLBACK_INCOMPLETE if either fails. 213 → 201.
 *
 * v3.74.757 finished the class: period-closing, pre-receipt-refund,
 * pre-shipment-refund, sales-return-cash-disbursement and
 * manufacturing-accounting, eleven sites in all, plus one status update that
 * would have left cash paid out against an unposted entry. 201 → 189.
 *
 * Every journal-entry rollback in lib/ now reports its own failure.
 *
 * v3.74.758 finished the ledger-rollback work: the five depreciation-reversal
 * sites and the capital-contribution reversal, including a posting update that
 * would otherwise have left a contribution reversed in the app and intact in
 * the ledger. 189 → 179.
 *
 * Two entries from that list turned out NOT to need anything, and both are
 * worth recording so nobody re-opens them:
 *
 *   app/api/hr/payroll/payments — already checks both deletes. I had carried
 *   it over from a different search's output and never re-read it.
 *
 *   app/invoices/[id]/edit/page.tsx — the journal delete + re-post block sits
 *   inside a /* ... *​/ spanning lines 543-1024, headed "Legacy direct UI
 *   mutation path retained as a reference only ... Do not re-enable this
 *   block". It does not run; live edits go through the API. This scanner was
 *   right to skip it, and a hand-check without block-comment tracking was what
 *   made it look like a live defect.
 *
 * The remainder are largely audit-log inserts, where a failure costs a log
 * line rather than a ledger.
 */
/**
 * v3.74.773 — 179 down to 145, by retiring three tools rather than fixing them.
 *
 * A full diagnostic of the remaining sites (see the release notes) found that
 * the most dangerous ones were concentrated in tools that could not work:
 *
 *   app/api/repair-invoice            deleted an invoice's journal lines and
 *                                     inventory movements and rebuilt them, with
 *                                     11 unchecked writes. A failure mid-rebuild
 *                                     left the ledger DELETED and returned 200.
 *
 *   app/api/fix-sent-invoice-journals inserted a journal header, then its lines
 *                                     unchecked. A rejected line insert produced
 *                                     a posted entry with no lines. Several of
 *                                     its functions returned true regardless.
 *
 *   app/reports/update-account-balances
 *                                     inserted SINGLE-SIDED lines to force
 *                                     invoice entries to balance — and ran on
 *                                     page load, not on a button. Tested against
 *                                     a restored copy of production: the database
 *                                     refuses it ("Cannot add lines to a posted
 *                                     journal entry"), and the unchecked write
 *                                     swallowed the refusal. It failed every time
 *                                     it ran, silently, for as long as it existed.
 *
 * All three also valued COGS from products.cost_price rather than FIFO lots —
 * the defect that removed four database functions in v3.74.726 and v3.74.759.
 *
 * The balance snapshot report itself was kept; only the balancing function was
 * removed from it.
 */
/**
 * v3.74.780 — THE CHECKER WAS BLIND TO HALF OF WHAT IT LOOKS FOR.
 *
 * The rule below used to be a single-LINE regex anchored with ^\s*await. That
 * only ever matched a write formatted on one line:
 *
 *     await supabase.from("t").update({ ... })
 *
 * But the dominant style in this codebase is broken across lines:
 *
 *     await supabase
 *       .from("payslips")
 *       .update({ ... })
 *
 * and the anchor made every one of those invisible. It also missed anything
 * not at the start of its line, such as the very common:
 *
 *     try { await admin.from("audit_logs").insert({ ... }) } catch {}
 *
 * How it surfaced: during v3.74.779 six unchecked writes were removed from the
 * expenses pages and the reported number did not move at all. 145 before, 145
 * after. Had that been taken as "no change worth noting" the blindness would
 * still be here.
 *
 * This is the same failure this script exists to catch, and it had it: a tool
 * that reports success while doing a fraction of its job. It has been the
 * gatekeeper on every release since it was written.
 *
 * A correction to the record: the first estimate of the gap, quoted in the
 * v3.74.779 release notes, was 281 total / 136 invisible. That was measured in
 * a hurry with no comment-stripping, so it counted example code inside doc
 * blocks — including the examples in THIS file's own header. The careful
 * statement-aware number is 272 total, 127 of them previously invisible.
 *
 * WHAT COUNTS AS UNCHECKED NOW
 * ----------------------------
 * The write is flagged when the `await` begins a statement — nothing is holding
 * the result. Preceded by `=`, `(`, `,`, `:` or `return`, the value goes
 * somewhere and the caller can inspect it, so it is left alone. A `.then(` or
 * `.catch(` on the call is also treated as handled.
 *
 * Note that try/catch around a write does NOT make it checked, and the script
 * says so deliberately: supabase-js does not throw on a failed write, so the
 * catch never runs. That shape is the most misleading one in the codebase.
 */
const BASELINE = 272;

/**
 * Blank out comments and string bodies while preserving every byte offset and
 * newline, so reported line numbers stay true and prose describing this pattern
 * is never mistaken for code. Several guards written this month rejected their
 * own documentation for exactly that reason.
 */
function blankComments(src) {
  const out = src.split("");
  const blank = (a, b) => { for (let k = a; k < b; k++) if (out[k] !== "\n") out[k] = " "; };
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (c === '"' || c === "'" || c === "`") {
      const q = c; i++;
      while (i < n && src[i] !== q) { if (src[i] === "\\") i++; i++; }
      i++; continue;
    }
    if (c === "/" && d === "/") { let j = src.indexOf("\n", i); if (j < 0) j = n; blank(i, j); i = j; continue; }
    if (c === "/" && d === "*") { let j = src.indexOf("*/", i); j = j < 0 ? n : j + 2; blank(i, j); i = j; continue; }
    i++;
  }
  return out.join("");
}

// The table name must be a string literal. Verified across app/ and lib/: there
// are zero writes that pass a variable table name, so requiring a literal costs
// nothing and keeps the pattern from over-matching.
const WRITE_RE =
  /await\s+[\w.$]+\s*\.\s*from\s*\(\s*["'`][^"'`]*["'`]\s*\)\s*\.\s*(insert|update|upsert|delete)\s*\(/g;

/**
 * Walk forward from a write to the end of its statement, tracking bracket
 * depth, and report whether the statement chains .then/.catch.
 *
 * The statement ends at the first `;` at depth 0, or at a line break at depth 0
 * that is not continued by a leading `.` on the next line (which is how the
 * multi-line builder style continues a chain).
 */
function statementHasHandler(src, start) {
  let depth = 0;
  const n = src.length;
  for (let i = start; i < n; i++) {
    const c = src[i];
    if (c === "(" || c === "[" || c === "{") { depth++; continue; }
    if (c === ")" || c === "]" || c === "}") { depth--; if (depth < 0) break; continue; }
    if (depth === 0) {
      if (c === ";") break;
      if (c === "\n") {
        let j = i + 1;
        while (j < n && /\s/.test(src[j])) j++;
        if (src[j] !== ".") break;   // chain did not continue
      }
      if (c === "." && /^\.\s*(then|catch)\s*\(/.test(src.slice(i, i + 20))) return true;
    }
  }
  return false;
}

/**
 * Find every write in a source string whose result nothing receives.
 * Returns [{ line, code }].
 */
function scanSource(src) {
  const clean = blankComments(src);
  const hits = [];
  WRITE_RE.lastIndex = 0;
  let m;
  while ((m = WRITE_RE.exec(clean)) !== null) {
    // Walk back to the first meaningful character before `await`.
    let k = m.index - 1;
    while (k >= 0 && /\s/.test(clean[k])) k--;
    const prev = k < 0 ? "" : clean[k];

    // Default to UNCHECKED, and only excuse the write when something is
    // demonstrably receiving its result.
    //
    // The first version had this backwards: it asked "does a `;` `{` or `}`
    // come before the await?" and treated anything else as checked. This
    // codebase does not use semicolons, so a statement following another
    // statement is separated by nothing but a newline:
    //
    //     journalPosted = true
    //     await supabase
    //       .from("expenses")
    //       .update({ ... })
    //
    // The character before that `await` is `e`, so the rule called it checked
    // and walked past it. Testing the fixed script against the pre-v3.74.779
    // expenses pages is what exposed it: six unchecked writes were removed in
    // that release and the new rule could only find three.
    //
    // These are the contexts where the value actually goes somewhere. Anything
    // else — an identifier, `)`, `}`, `;`, a literal, start of file — means a
    // new statement began and nobody caught the result.
    // k < 0 means the write is the very first thing in the source: nothing can
    // be receiving it. Tested explicitly because "abc".includes("") is TRUE in
    // JavaScript, so an empty `prev` would otherwise excuse the write — which
    // is exactly what the self-test fixtures caught on the first run.
    const consumed =
      k >= 0 && (
      "=(,[:?&|+-*/%!<>^~".includes(prev) ||
      /\b(return|yield|await|typeof|new|of|in)\s*$/.test(clean.slice(Math.max(0, k - 9), k + 1)));
    if (consumed) continue;

    // A .then/.catch on THIS call handles it — but it has to be on this call.
    //
    // The first version of this looked for .then/.catch anywhere in the next
    // 800 characters, and promptly hid a real one:
    // app/purchase-orders/[id]/edit/page.tsx:543 is an unchecked insert into
    // bill_items, and the .catch it matched was 23 lines below on
    // `await response.json().catch(...)` — a different call entirely.
    //
    // That is the same mistake as matching a function name in prose instead of
    // its call site: near the target is not the target. So walk to the end of
    // this statement and look only inside it.
    if (statementHasHandler(clean, m.index)) continue;

    hits.push({
      line: clean.slice(0, m.index).split("\n").length,
      code: src.slice(m.index, m.index + 90).replace(/\s+/g, " ").trim(),
    });
  }
  return hits;
}

/**
 * Self-test. A rule this blunt can drift in either direction: too loose and it
 * flags correct code, too tight and it stops seeing the thing it exists for.
 * Both ends are pinned here and checked on every run, because a check nobody
 * has watched fail is a check nobody knows works.
 *
 * The multi-line fixtures are the ones that would have caught v3.74.780's bug
 * on the day the script was written. They are not optional.
 */
const FIXTURES = [
  ['await admin.from("audit_logs").insert({ a: 1 })', 1, "the shape that broke the integrity cron"],
  ["  await supabase.from('notifications').insert({ a: 1 })", 1, "indented, single quotes"],
  ['await supabase.from("t").update({ x: 1 })', 1, "update counts too"],

  // The blind spot itself.
  ['await supabase\n  .from("payslips")\n  .update({ x: 1 })', 1, "MULTI-LINE write"],
  ['await admin\n  .from("t")\n  .delete()\n  .eq("id", 1)', 1, "multi-line delete"],
  ['try { await admin.from("audit_logs").insert({ a: 1 }) } catch {}', 1,
    "try/catch does NOT check it - supabase-js does not throw"],
  ['if (x) {\n  await supabase.from("t").upsert({ a: 1 })\n}', 1, "inside a block"],

  // No semicolons in this codebase, so one statement follows another with only
  // a newline between them. The character before `await` is then `e` (of
  // `true`), not `;`. The first version of the inverted rule called that
  // "checked" and skipped it. This is the exact shape it skipped.
  ['journalPosted = true\nawait supabase\n  .from("expenses")\n  .update({ a: 1 })', 1,
    "ASI: statement after statement, no semicolon"],
  ['const n = 1\nawait admin.from("t").delete().eq("id", n)', 1, "ASI, single line write"],
  ['await admin.from("t").insert({ a: 1 })', 1, "first thing in the file - nothing can receive it"],

  // ...and the other direction: these really are consumed.
  ['const r = await supabase.from("x").insert({ a: 1 })', 0, "assigned to a plain const"],
  ['foo(await supabase.from("x").insert({ a: 1 }))', 0, "passed as an argument"],
  ['const rows = [await supabase.from("x").insert({ a: 1 })]', 0, "inside an array literal"],
  ['const f = async () => await supabase.from("x").insert({ a: 1 })', 0, "arrow body is a return"],

  // Results that someone receives.
  ['const { error } = await admin.from("x").insert({ a: 1 })', 0, "result captured"],
  ['const { data, error: e } = await supabase.from("x").update({ a: 1 })', 0, "renamed error"],
  ['const { error } = await supabase\n  .from("x")\n  .update({ a: 1 })', 0, "multi-line, captured"],
  ['return await supabase.from("x").insert({ a: 1 })', 0, "handed to the caller"],
  ['await supabase.from("x").insert({ a: 1 }).then(r => r)', 0, "handled by .then"],

  // Prose must never count as code.
  ['// await admin.from("x").insert({ a: 1 })', 0, "a line comment is not code"],
  ['/**\n * await supabase.from("t").insert({ a: 1 })\n */', 0, "nor is a doc block"],
];

const fixtureFailures = FIXTURES.filter(([snippet, expected]) => scanSource(snippet).length !== expected);
if (fixtureFailures.length > 0) {
  console.error("X The rule itself is broken - self-test fixtures failed:\n");
  for (const [snippet, expected, why] of fixtureFailures) {
    console.error(`   ${why}`);
    console.error(`      expected ${expected}, got ${scanSource(snippet).length}`);
    console.error(`      ${snippet.replace(/\n/g, "\\n").slice(0, 100)}\n`);
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
    const rel = path.relative(ROOT, file).replace(/\\/g, "/");
    for (const h of scanSource(fs.readFileSync(file, "utf8"))) {
      findings.push({ file: rel, line: h.line, code: h.code });
    }
  }
}

// --list prints every finding. Added while fixing this script: comparing two
// versions of the rule is impossible when the only output is a count, and a
// count was exactly what hid the blindness for as long as it lasted.
if (process.argv.includes("--list")) {
  for (const f of findings) console.log(`${f.file}:${f.line}\t${f.code}`);
  process.exit(0);
}

console.log(`Scanned ${SCAN_DIRS.join(", ")} for writes whose result is discarded.`);
console.log(`Found: ${findings.length}   Baseline: ${BASELINE}`);

if (findings.length > BASELINE) {
  const extra = findings.length - BASELINE;
  console.error(`\nX ${extra} NEW write(s) discard their result.\n`);
  console.error("supabase-js does not throw on failure - it returns { error }. An");
  console.error("unchecked write that violates a constraint does nothing, silently,");
  console.error("and the code continues as if it had worked.\n");
  for (const f of findings.slice(-Math.min(extra + 5, findings.length))) {
    console.error(`   ${f.file}:${f.line}`);
    console.error(`      ${f.code}`);
  }
  process.exit(1);
}

if (findings.length < BASELINE) {
  console.log(`\n+ ${BASELINE - findings.length} fewer than the baseline.`);
  console.log(`  Lower BASELINE to ${findings.length} in ${path.basename(__filename)} so the debt cannot`);
  console.log("  silently come back.");
  process.exit(1);
}

console.log("\n+ No new unchecked writes.");
console.log(`! ${findings.length} pre-existing ones remain. Tracked, not approved.`);
