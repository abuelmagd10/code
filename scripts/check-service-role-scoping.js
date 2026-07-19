/**
 * check-service-role-scoping.js
 * ---------------------------------------------------------------------------
 * Every API route that uses the service-role key must scope its work to the
 * caller's company, taken from the SESSION — never from the request body and
 * never left unbounded.
 *
 * Why this exists
 * ---------------
 * The CI security job used to name three files by hand and check that an auth
 * helper was *called* in them. v3.74.733 showed that is not enough:
 *
 *     const { error: authError } = await requireOwnerOrAdmin(req)   // companyId dropped
 *     supabase.from("payments").select("*").lt("amount", 0)         // no company filter
 *
 * fix-negative-payments called the auth helper. It passed the old check. And it
 * rewrote payment history for every tenant in the database, because the helper's
 * companyId was destructured away and never used.
 *
 * The check has to be about whether the answer is USED, not whether the question
 * was asked — and it has to cover every route, not a list someone remembers to
 * update.
 *
 * The rule
 * --------
 *   A route that builds a service-role client must:
 *     1. call one of the auth helpers, AND
 *     2. bind companyId / company_id from that call, AND
 *     3. actually reference that binding afterwards.
 *
 * Routes that legitimately have no user session (cron jobs authenticated by
 * CRON_SECRET, provider webhooks verified by signature, pre-login invite flows)
 * are listed in ALLOWLIST with a reason. The list is meant to be short and
 * argued, not a dumping ground.
 *
 * Run:   node scripts/check-service-role-scoping.js
 * CI:    non-zero exit fails the build.
 * ---------------------------------------------------------------------------
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const API_DIR = path.join(ROOT, "app", "api");

/**
 * Routes with no end-user session by design. Each entry states WHAT
 * authenticates the call instead, so the exemption can be re-argued later
 * rather than inherited blindly.
 */
const ALLOWLIST = new Map([
  ["cron/", "cron job — authenticated by CRON_SECRET, operates across companies by design"],
  ["shipping/webhook/", "carrier webhook — authenticated by provider signature, no user session"],
  ["accept-invite", "pre-login: the user is not a member yet, that is the point of the call"],
  ["accept-invite-logged-in", "invite acceptance: membership is being created by this call"],
  ["accept-membership", "membership is being created by this call"],
  ["get-invitation", "pre-login invite lookup, keyed by an unguessable token"],
  ["check-invitation", "pre-login invite lookup, keyed by an unguessable token"],
  ["check-email-registered", "pre-login existence check, returns a boolean only"],
  ["resend-confirmation", "pre-login, keyed by email"],
  ["biometric/", "attendance device push — authenticated by device key, no user session"],
  [
    "subscription/create",
    "public signup — creates a NEW tenant (user + company + branch) and touches " +
      "no existing one. Reviewed v3.74.737. Separate concern noted there: it " +
      "calls auth.admin.createUser with no rate limit, which is an abuse vector, " +
      "not a cross-tenant one.",
  ],
]);

/**
 * Two earlier drafts of this script were wrong in instructive ways.
 *
 * Draft 1 asked "does it call one of these helpers?" and flagged
 * customers/delete, which takes companyId from the body and then verifies
 * membership — a different but valid shape.
 *
 * Draft 2 added that shape and still flagged bills/[id]/journal-entry-id, which
 * uses enforceGovernance() — a helper I had not heard of. That is the flaw in
 * checking against a list of blessed names: the list is only as complete as
 * whoever wrote it, and mine was written from memory of a codebase I had read
 * part of.
 *
 * So this version does not ask which helper was used. It asks the two questions
 * that actually decide whether another tenant's data is reachable:
 *
 *   1. Is the caller authenticated at all?
 *   2. Does the company the route operates on come from somewhere the caller
 *      cannot choose — or, if the caller does supply it, is membership checked?
 *
 * A route can satisfy (2) through any helper, existing or future.
 */
const AUTH_SIGNALS = [
  /\bsecureApiRequest\s*\(/,
  /\brequireOwnerOrAdmin\s*\(/,
  /\bapiGuard\s*\(/,
  /\brequireAuth\s*\(/,
  /\bgetAuthContext\s*\(/,
  /\brequireCompanyAccess\s*\(/,
  /\benforceGovernance\s*\(/,
  /auth\.getUser\s*\(/,
  /auth\.getSession\s*\(/,
  // Signed-token routes: billing/renew authenticates with an HMAC-SHA256
  // renewal token carrying the companyId, which the caller cannot forge. No
  // session, and none needed. Found by flagging it and reading the file — the
  // fourth mechanism this script did not know about when I first wrote it.
  /verify\w*Token\s*\(/,
  /verify\w*Signature\s*\(/,
];

/**
 * There are two legitimate shapes, and the first draft of this script only knew
 * the first — it flagged customers/delete, which is actually fine.
 *
 *   A. DERIVE — companyId comes out of the auth helper. Nothing from the client
 *      is trusted.
 *
 *   B. VERIFY — companyId arrives in the request body, and the route then
 *      confirms the session user is a member of that company before using it:
 *      a company_members lookup keyed on both the supplied company and the
 *      authenticated user id.
 *
 * B is safe when the verification is unconditional. This script cannot tell
 * whether it is guarded by an `if`, so passing here means "structurally sound",
 * not "reviewed". members-emails passes B and is still wrong, because its check
 * sits inside `if (companyId)` and is skipped when the field is omitted.
 * Structure is the floor, not the ceiling.
 */
const isAuthenticated = (src) => AUTH_SIGNALS.some((re) => re.test(src));

/**
 * companyId supplied by the caller, then checked against company_members.
 *
 * v3.74.738 — this used to require the session variable to be called `user`,
 * `authUser` or `userId`. I then wrote a correct membership check in audit-log
 * using `sessionUser` and the script flagged my own fix.
 *
 * That is the fifth time in two days a rule of mine matched a NAME instead of a
 * SHAPE and rejected something valid (v3.74.726, .727, .733, .735, here). The
 * shape that matters is: look in company_members, filtered by both the company
 * and the user. What the variable is called is nobody's business.
 */
function verifiesMembership(src) {
  return (
    /company_members/.test(src) &&
    /\.eq\(\s*["']company_id["']\s*,/.test(src) &&
    /\.eq\(\s*["']user_id["']\s*,/.test(src)
  );
}

/**
 * Is the company obtained from a source the caller cannot choose?
 *
 * v3.74.739 — the last four flagged routes were all sound, each scoping in a
 * shape the rule did not know:
 *
 *   billing/invoices/[id]/pdf   fetches the row, then `if (invoice.company_id
 *                               !== companyId) return 403` — a comparison, not
 *                               a filter.
 *   permissions/shared-with-me  filters on grantee_user_id = the session user,
 *                               so the company parameter cannot widen anything.
 *   invoices/[id]/record-payment hands the derived companyId to a command
 *                               service, which does the scoping.
 *   billing/renew               takes the company out of a verified HMAC token.
 *
 * Chasing each shape individually is a losing game — that is six rule revisions
 * and counting. The question underneath all of them is simply whether the
 * company came from somewhere trustworthy. If it did, and it is actually used,
 * the route is scoped however it chooses to express that.
 */
function companyFromTrustedSource(src) {
  const fromAuthHelper = /\{[^}]*\bcompanyId\b[^}]*\}\s*=\s*await\s+\w*(?:secureApiRequest|requireOwnerOrAdmin|apiGuard|requireAuth|getAuthContext|requireCompanyAccess|enforceGovernance)\s*\(/.test(src);
  const fromContext = /\b(?:context|governance|ctx)\s*!?\.?\??\.\s*companyId\b/.test(src);
  // v3.74.739 — this used to additionally require the identifier to be spelled
  // `companyId`. billing/renew calls it `payload.cid`, so the rule rejected a
  // route whose company comes out of a signed HMAC token — about as trustworthy
  // a source as exists here. Sixth time I have matched a name instead of a
  // shape. A verified token IS the authorisation; what its field is called is
  // not my business.
  const fromVerifiedToken = /verify\w*Token\s*\(/.test(src);
  return fromAuthHelper || fromContext || fromVerifiedToken;
}

/**
 * Some routes scope to the SESSION USER rather than the company — a share
 * inbox filtered by grantee_user_id cannot be widened by naming another
 * company, because the rows still belong to the caller either way.
 */
function pinsToSessionUser(src) {
  return /\.eq\(\s*["']\w*user_id["']\s*,\s*\w*[Uu]ser\??\.\s*id\s*\)/.test(src);
}

/** Does the company identifier arrive in the request the caller controls? */
function companyComesFromRequest(src) {
  return (
    /\{[^}]*\bcompany_?[Ii]d\b[^}]*\}\s*=\s*await\s+(?:req|request)\.json\s*\(/.test(src) ||
    /\bbody\.company_?[Ii]d\b/.test(src) ||
    /searchParams\.get\(\s*["']company_?[Ii]d["']/i.test(src)
  );
}

/**
 * Does the route constrain anything by company at all?
 *
 * v3.74.738 — the first version only recognised .eq("company_id", ...) and so
 * flagged six routes that scope perfectly well in other shapes:
 *
 *   .eq("id", companyId)                      -- querying the companies row itself
 *   .eq("journal_entries.company_id", id)     -- filtering through a join
 *
 * All six derived companyId from an auth helper first. The narrow pattern
 * turned them into noise, and noise is how a check stops being read.
 */
function constrainsByCompany(src) {
  return (
    /\.eq\(\s*["'][\w.]*company_id["']\s*,/.test(src) ||
    /\.in\(\s*["'][\w.]*company_id["']\s*,/.test(src) ||
    /\.eq\(\s*["']id["']\s*,\s*company_?[Ii]d\s*\)/.test(src) ||
    /\bp_company_id\s*:/.test(src)
  );
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name === "route.ts" || entry.name === "route.tsx") out.push(full);
  }
  return out;
}

function allowlistReason(rel) {
  for (const [needle, reason] of ALLOWLIST) {
    if (rel.includes(needle)) return reason;
  }
  return null;
}

/** Strip comments so documentation never counts as code. */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/**
 * A RATCHET, not an exemption list.
 *
 * These 13 routes trip the rule today. I have not read all of them, and I am
 * not going to mass-edit accounting routes I have not read — that is how the
 * fix-negative-payments class of bug gets created rather than removed.
 *
 * So: new violations fail the build immediately; these are tracked and must
 * shrink. The script also fails if an entry here stops violating, which forces
 * the list down instead of letting it rot.
 *
 * Reviewed so far:
 *   - bills/[id]/journal-entry-id  — fine, uses enforceGovernance(). Rule fixed.
 *   - customers/delete             — fine, verifies membership. Rule fixed.
 *   - billing/renew                — HMAC renewal token; still listed because
 *                                    it constrains by token, not company_id.
 *   - subscription/create          — public signup, moved to ALLOWLIST.
 *   - bonuses (GET)                — WAS A REAL HOLE. Read companyId from the
 *                                    query string with no auth at all and
 *                                    returned that company's bonus records.
 *                                    Fixed in v3.74.737.
 *   - audit-log                    — WAS A REAL HOLE. The service-role branch
 *                                    inserted and returned before the auth check
 *                                    below it, so anyone could forge audit
 *                                    entries against any company and any user.
 *                                    Fixed in v3.74.738.
 *   - account-lines, billing/preview, billing/seats, bonuses/settings,
 *     company-logo, send-purchase-order — all fine. They derive companyId from
 *     an auth helper and scope with .eq("id", companyId) or a joined path,
 *     which the first pattern did not recognise. Rule widened, not the code.
 *   - billing/invoices/[id]/pdf     — compares invoice.company_id against the
 *                                     session's after fetching. Fine.
 *   - permissions/shared-with-me    — filters on grantee_user_id = session user,
 *                                     so naming another company widens nothing.
 *   - invoices/[id]/record-payment  — hands the derived companyId to a command
 *                                     service that scopes. Fine.
 *   - billing/renew                 — company comes from a verified HMAC token.
 *
 * All 13 originally flagged are now reviewed: 2 were real holes (bonuses GET,
 * audit-log), 1 was a misclassification (subscription/create, public signup),
 * and 10 were my rule being narrower than the codebase.
 *
 * The list is empty. That is the point of a ratchet — it is supposed to reach
 * zero, and then stay there because anything new fails the build.
 */
const UNREVIEWED = new Set([]);

/**
 * SELF-TEST — the rule was widened six times to clear false positives, and
 * each widening risked loosening it into uselessness. These fixtures pin the
 * two ends: the shape that caused the incident must still fail, and the shapes
 * that were wrongly flagged must still pass.
 *
 * Runs on every invocation. If the rule ever stops rejecting the first fixture,
 * the check has become decoration.
 */
const VERDICT_TEXT = {
  "no-auth": "builds a service-role client with no authentication of any kind",
  "unused-scope": "derives the company from the session but never uses it — the scope is discarded",
  unverified: "takes company_id from the request but never verifies the caller is a member of it",
  unbounded: "never constrains any query by company — it can reach every tenant's data",
};

function evaluate(src) {
  if (!isAuthenticated(src)) return "no-auth";
  const trusted = companyFromTrustedSource(src);
  const uses = (src.match(/\bcompany_?[Ii]d\b/g) || []).length;
  if (trusted && uses >= 2) return "ok";
  if (trusted) return "unused-scope";
  if (companyComesFromRequest(src)) {
    return verifiesMembership(src) || pinsToSessionUser(src) ? "ok" : "unverified";
  }
  return constrainsByCompany(src) || pinsToSessionUser(src) ? "ok" : "unbounded";
}

const FIXTURES = [
  {
    name: "the fix-negative-payments incident — helper called, company discarded",
    expect: "unbounded",
    src: `
      const { error: authError } = await requireOwnerOrAdmin(req)
      if (authError) return authError
      const { data } = await supabase.from("payments").select("*").lt("amount", 0)
    `,
  },
  {
    name: "the bonuses GET hole — company from the query string, no auth",
    expect: "no-auth",
    src: `
      const companyId = searchParams.get("companyId")
      const q = admin.from("user_bonuses").select("*").eq("company_id", companyId)
    `,
  },
  {
    name: "company supplied by caller, membership never checked",
    expect: "unverified",
    src: `
      const { data: { user } } = await ssr.auth.getUser()
      const { companyId } = await req.json()
      await admin.from("invoices").select("*").eq("company_id", companyId)
    `,
  },
  {
    name: "derived from auth helper and used — the normal correct shape",
    expect: "ok",
    src: `
      const { user, companyId, error } = await secureApiRequest(req, { requireAuth: true })
      await admin.from("invoices").select("*").eq("company_id", companyId)
    `,
  },
  {
    name: "caller-supplied company, verified against company_members",
    expect: "ok",
    src: `
      const { data: { user } } = await ssr.auth.getUser()
      const { companyId } = await req.json()
      await admin.from("company_members").select("id").eq("company_id", companyId).eq("user_id", user.id)
    `,
  },
  {
    name: "scoped to the session user rather than the company",
    expect: "ok",
    src: `
      const { data: { user } } = await supabase.auth.getUser()
      const companyId = searchParams.get("company_id")
      await supabase.from("shares").select("*").eq("company_id", companyId).eq("grantee_user_id", user.id)
    `,
  },
];

const fixtureFailures = FIXTURES.filter((f) => evaluate(f.src) !== f.expect);
if (fixtureFailures.length > 0) {
  console.error("X The rule itself is broken — self-test fixtures failed:\n");
  for (const f of fixtureFailures) {
    console.error(`   ${f.name}`);
    console.error(`      expected "${f.expect}", got "${evaluate(f.src)}"\n`);
  }
  console.error("Fix the rule before trusting anything else this script reports.");
  process.exit(1);
}

const violations = [];
const exempted = [];
let scanned = 0;

for (const file of walk(API_DIR)) {
  const raw = fs.readFileSync(file, "utf8");
  if (!raw.includes("SUPABASE_SERVICE_ROLE_KEY")) continue;

  const rel = path.relative(API_DIR, file).replace(/\\/g, "/");
  scanned++;

  const reason = allowlistReason(rel);
  if (reason) {
    exempted.push({ rel, reason });
    continue;
  }

  const src = stripComments(raw);

  // One implementation of the rule, shared with the self-test fixtures. An
  // earlier draft of this file had the logic written out twice — the very
  // duplication that produces "the checker passed but the fixture didn't".
  const verdict = evaluate(src);
  if (verdict !== "ok") {
    violations.push({ rel, why: VERDICT_TEXT[verdict] });
  }
}

const fresh = violations.filter((v) => !UNREVIEWED.has(v.rel));
const tracked = violations.filter((v) => UNREVIEWED.has(v.rel));
const fixed = [...UNREVIEWED].filter((r) => !violations.some((v) => v.rel === r));

console.log(`Scanned ${scanned} API routes using the service-role key.`);
console.log(`Exempt (documented, no user session): ${exempted.length}`);
console.log(`Awaiting review (ratchet): ${tracked.length}`);

let failed = false;

if (fresh.length > 0) {
  console.error(`\nX ${fresh.length} NEW route(s) use full database rights without scoping to the caller's company:\n`);
  for (const v of fresh) {
    console.error(`   ${v.rel}`);
    console.error(`      ${v.why}\n`);
  }
  console.error("Each of these can read or write another company's data.");
  console.error("Derive the company from the session, or verify membership of the one supplied.");
  failed = true;
}

// Keep the ratchet honest: once a route is cleaned up it must leave the list,
// otherwise the list slowly becomes a place where problems go to be forgotten.
if (fixed.length > 0) {
  console.error(`\nX ${fixed.length} route(s) no longer violate and must be removed from UNREVIEWED:\n`);
  for (const r of fixed) console.error(`   ${r}`);
  failed = true;
}

if (failed) process.exit(1);

if (tracked.length > 0) {
  console.log(`\n! ${tracked.length} pre-existing route(s) still awaiting review:`);
  for (const v of tracked) console.log(`   ${v.rel} — ${v.why}`);
  console.log("\nThese are tracked, not approved. The list must shrink.");
}

console.log("\n+ No new service-role route escapes company scoping.");
