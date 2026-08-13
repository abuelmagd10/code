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
const selftest = process.argv.includes("--selftest");

// **وفخٌّ لا يُشغَّل ليس فخّاً**: الفخُّ الذاتىُّ لا يحتاجُ قاعدةً، فلا يجوزُ
// أن يُتخطّى لأنّ القاعدةَ غيرُ موصولة. ويُقرأُ حكمُه قبلَ أىِّ خروجٍ مبكّر.
if (!selftest && !url) {
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
  ({ Client } = require("./lib/live-db"));
} catch {
  console.error("X npm install pg --save-dev");
  process.exit(1);
}

// Deliberate exceptions: pre-login screens that must work for a visitor.
// Each is limited some other way and none reads company-scoped data.
//
// v3.75.27 — THE LIST NO LONGER LIVES HERE. It lives in the database, in
// public.anon_prelogin_exceptions(), and this script ASKS for it.
//
// Why: v3.75.27 made "a visitor may reach a SECURITY DEFINER function only if
// a policy knocks on it, or it is a declared pre-login door" a law enforced by
// a migration AND by assert_baseline_v3_75_27_check(). If the list were also
// written here by hand, two mouths in one house would answer the same question
// - and the day they disagreed, the build would pass while the database
// disagreed with it, or the reverse. One home, asked live.
//
// A copy kept here as a fallback would be the same bug wearing a hat: if the
// database cannot be asked, this script REFUSES rather than judging from
// memory. A security policy is not written from memory.
//
// v3.75.28 — AND NO LICENCE WITHOUT A KNOCKER. The list above kept three names
// after their reason had died: two that no line of the application had called
// for months (and no live request had touched in 24h), and one that was
// declared "pre-login" while being CLOSED to anon and called AFTER login
// 7098 times a day. None of them was harmful. All three were REASSURING - a
// reader of the list would believe a door needed to be open that did not.
//
// The defect was never the names. It was that A DECLARATION OUTLIVES ITS
// REASON IN SILENCE. So the rule is now enforced from both ends:
//   - the database asserts no declared name is already closed (baseline _28_),
//   - and this script asserts EVERY declared name is actually CALLED BY THE
//     APPLICATION CODE. A door nobody knocks on does not get a licence.
const fs = require("fs");
const path = require("path");

const PRELOGIN_SQL = "SELECT public.anon_prelogin_exceptions() AS names";

const repoRoot = path.join(__dirname, "..");
const CODE_ROOTS = ["app", "lib", "components", "hooks"];
const CODE_EXT = new Set([".ts", ".tsx", ".js", ".jsx"]);

/**
 * A comment is not an instruction. A name mentioned only in prose does not
 * knock on anything, so comments are blanked before the search - otherwise the
 * very line explaining "we removed this call" would keep the licence alive.
 */
function maskComments(src) {
  const a = src.split("");
  let i = 0;
  while (i < a.length) {
    const two = src.slice(i, i + 2);
    if (two === "//" && src[i - 1] !== ":") {
      let k = i;
      while (k < a.length && a[k] !== "\n") { a[k] = " "; k++; }
      i = k;
      continue;
    }
    if (two === "/*") {
      const k = src.indexOf("*/", i + 2);
      const end = k === -1 ? a.length : k + 2;
      for (let j = i; j < end; j++) if (a[j] !== "\n") a[j] = " ";
      i = end;
      continue;
    }
    i++;
  }
  return a.join("");
}

/** Does this source actually call the named function through the API? */
function callsFunction(src, name) {
  const m = maskComments(src);
  const esc = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // rpc("name") / rpc('name') / a REST path ending in /rpc/name
  return new RegExp(`rpc\\(\\s*["'\`]${esc}["'\`]|/rpc/${esc}\\b`).test(m);
}

function walkCode(roots, readDir, readFile) {
  const out = [];
  const stack = [...roots];
  while (stack.length > 0) {
    const dir = stack.pop();
    let entries = [];
    try { entries = readDir(dir); } catch { continue; }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === "node_modules" || e.name === ".next" || e.name === "_to_delete") continue;
        stack.push(full);
      } else if (CODE_EXT.has(path.extname(e.name))) {
        out.push({ file: full, src: readFile(full) });
      }
    }
  }
  return out;
}

/** Which declared names does no file call? */
function unknockedNames(names, files) {
  return names.filter((n) => !files.some((f) => callsFunction(f.src, n))).sort();
}

if (process.argv.includes("--selftest")) {
  let bad = 0;
  const ok = (label, actual, expected) => {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    if (a === e) console.log(`  ok  ${label}  (توقّعتُ ${e} فجاء ${a})`);
    else { console.error(`  X  ${label}  (توقّعتُ ${e} فجاء ${a})`); bad++; }
  };

  ok("يرى النداءَ بعلامتَى اقتباس مزدوجتين",
     callsFunction('supabase.rpc("find_user_by_login", { p_login: x })', "find_user_by_login"), true);
  ok("ويراه بعلامةٍ مفردة",
     callsFunction("await supabase.rpc('auth_email_state', { p_email })", "auth_email_state"), true);
  ok("ويراه بعلامةٍ خلفيّة",
     callsFunction("supabase.rpc(`auth_email_state`)", "auth_email_state"), true);
  ok("ويرى مسارَ REST المباشر",
     callsFunction('fetch("/rest/v1/rpc/find_user_by_login")', "find_user_by_login"), true);
  ok("ولا يخدعه ذكرٌ داخل تعليقٍ سطرىّ — التعليقُ ليس تعليمة",
     callsFunction('// supabase.rpc("find_user_by_login")', "find_user_by_login"), false);
  ok("ولا ذكرٌ داخل تعليقٍ كتلىّ",
     callsFunction('/* was: supabase.rpc("find_user_by_login") */', "find_user_by_login"), false);
  ok("ولا اسمٌ مذكورٌ بلا نداء — والجوارُ ليس انتماءً",
     callsFunction('const doc = "find_user_by_login is a function"', "find_user_by_login"), false);
  ok("ولا يخلطُ اسماً بادئتُه نفسُها",
     callsFunction('supabase.rpc("find_user_by_login_v2")', "find_user_by_login"), false);
  ok("ويرى الاسمَ الصحيحَ حتى لو جاورَه غيرُه",
     callsFunction('supabase.rpc("x"); supabase.rpc("auth_email_state")', "auth_email_state"), true);

  const files = [{ file: "a.ts", src: 'supabase.rpc("alive")' }];
  ok("فيمرُّ اسمٌ يناديه سطر", unknockedNames(["alive"], files), []);
  ok("ويسقطُ اسمٌ لا يناديه أحد", unknockedNames(["alive", "orphan"], files), ["orphan"]);
  ok("ويسقطُ الجميعُ حين لا ملفَّ أصلاً — وبحثٌ لا يجد ليس دليلَ حياة",
     unknockedNames(["alive"], []), ["alive"]);

  console.log(`  الفخُّ الذاتىّ: 12 اتّجاهاً، ${bad === 0 ? "كلُّها صحيحة." : bad + " منها سقط."}`);
  process.exit(bad === 0 ? 0 : 1);
}

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
  let allowedNames = null;
  try {
    // The law first, then the measurement. If the house cannot be asked, this
    // script has no business deciding what a visitor may reach.
    const pre = await client.query(PRELOGIN_SQL);
    allowedNames = pre.rows[0] && pre.rows[0].names;
    ({ rows } = await client.query(SQL));
  } finally {
    await client.end();
  }

  if (!Array.isArray(allowedNames)) {
    console.error(
      "X the database did not answer public.anon_prelogin_exceptions().\n" +
        "  That function is the ONE home for the pre-login exceptions (v3.75.27).\n" +
        "  I will not judge this from a list written here by hand.\n" +
        "  Fix: apply migration 20260813000005 (v3.75.27)."
    );
    process.exit(1);
  }

  const ALLOWED = new Set(allowedNames);

  // **ولا رخصةَ بلا طارق** (v3.75.28): a declared pre-login exception must be
  // a door the application actually knocks on. Otherwise the declaration keeps
  // a door open for nobody and reassures whoever reads it.
  const codeFiles = walkCode(
    CODE_ROOTS.filter((d) => fs.existsSync(path.join(repoRoot, d))).map((d) => path.join(repoRoot, d)),
    (dir) => fs.readdirSync(dir, { withFileTypes: true }),
    (f) => fs.readFileSync(f, "utf8")
  );
  if (codeFiles.length === 0) {
    // **وبحثٌ لا يجد ليس دليلَ غياب**: a search that scanned nothing proves
    // nothing, and must not be read as "every declaration is dead".
    console.error("X لم أقرأ ملفَّ شفرةٍ واحداً — لا يُحكَمُ على إعلانٍ ببحثٍ لم يقرأ شيئاً.");
    process.exit(1);
  }
  const unknocked = unknockedNames([...ALLOWED], codeFiles);
  if (unknocked.length > 0) {
    console.error(
      `X ${unknocked.length} pre-login exception(s) are declared in the database but NO line of the\n` +
        `  application calls them (${codeFiles.length} file(s) scanned):\n`
    );
    for (const n of unknocked) console.error(`  - ${n}`);
    console.error(
      "\n  A declaration outlives its reason in silence. Either the screen that\n" +
        "  needed it was removed - then drop the name from the database's\n" +
        "  public.anon_prelogin_exceptions() in a migration, and the v3.75.27 law\n" +
        "  will shut the door by itself - or the caller moved and should be found."
    );
    process.exit(1);
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
      `(${ALLOWED.size} documented pre-login exception(s), read from the database's ` +
      `own anon_prelogin_exceptions() - not from a list written here; ` +
      `functions used inside RLS policies are excluded by design).`
  );
})().catch((err) => {
  console.error(
    "X failed:",
    String(err.message || err).replace(/postgres(ql)?:\/\/[^\s"']+/g, "postgresql://<redacted>")
  );
  process.exit(1);
});
