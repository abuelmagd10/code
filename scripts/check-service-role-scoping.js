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

/** companyId supplied by the caller, then checked against company_members. */
function verifiesMembership(src) {
  return (
    /company_members/.test(src) &&
    /\buser\.id\b|\buser\?\.id\b|\bauthUser\.id\b|\buserId\b/.test(src) &&
    /\.eq\(\s*["']company_id["']\s*,/.test(src)
  );
}

/** Does the company identifier arrive in the request the caller controls? */
function companyComesFromRequest(src) {
  return (
    /\{[^}]*\bcompany_?[Ii]d\b[^}]*\}\s*=\s*await\s+(?:req|request)\.json\s*\(/.test(src) ||
    /\bbody\.company_?[Ii]d\b/.test(src) ||
    /searchParams\.get\(\s*["']company_?[Ii]d["']/i.test(src)
  );
}

/** Does the route constrain anything by company at all? */
function constrainsByCompany(src) {
  return (
    /\.eq\(\s*["']company_id["']\s*,/.test(src) ||
    /\bp_company_id\s*:/.test(src) ||
    /\.in\(\s*["']company_id["']\s*,/.test(src)
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
 * Of the three I did read while calibrating the rule:
 *   - bills/[id]/journal-entry-id  — fine, uses enforceGovernance(). Rule fixed.
 *   - customers/delete             — fine, verifies membership. Rule fixed.
 *   - billing/renew                — HMAC renewal token; still listed because
 *                                    it constrains by token, not company_id.
 *
 * The rest are unreviewed. Being on this list means "not yet examined", NOT
 * "known safe".
 */
const UNREVIEWED = new Set([
  "account-lines/route.ts",
  "audit-log/route.ts",
  "billing/invoices/[id]/pdf/route.ts",
  "billing/preview/route.ts",
  "billing/renew/route.ts",
  "billing/seats/route.ts",
  "bonuses/route.ts",
  "bonuses/settings/route.ts",
  "company-logo/route.ts",
  "invoices/[id]/record-payment/route.ts",
  "permissions/shared-with-me/route.ts",
  "send-purchase-order/route.ts",
  "subscription/create/route.ts",
]);

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

  if (!isAuthenticated(src)) {
    violations.push({
      rel,
      why: "builds a service-role client with no authentication of any kind",
    });
    continue;
  }

  // The fix-negative-payments defect: nothing bounds the query by company, so
  // it reaches every tenant.
  if (!constrainsByCompany(src)) {
    violations.push({
      rel,
      why: "never constrains any query by company — it can reach every tenant's data",
    });
    continue;
  }

  // The caller chose the company and nobody checked they belong to it.
  if (companyComesFromRequest(src) && !verifiesMembership(src)) {
    violations.push({
      rel,
      why: "takes company_id from the request but never verifies the caller is a member of it",
    });
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
