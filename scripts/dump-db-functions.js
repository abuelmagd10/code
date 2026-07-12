/**
 * dump-db-functions.js
 * ---------------------------------------------------------------------------
 * Mirrors ALL live public functions/procedures from the Supabase database
 * into `supabase/schema/functions.sql` so the repository stays the Single
 * Source of Truth. This prevents the class of surprise where an RPC body
 * lives only in production (applied via MCP) and drifts silently from the
 * repo (e.g. the v3.74.612 wrong-column bug in get_invoice_effective_outstanding).
 *
 * How it works:
 *   Calls the read-only, service-role-only SQL function
 *   public.export_public_routines() (see migration v3.74.613) which returns
 *   every function's full CREATE OR REPLACE definition as one text blob.
 *
 * Run:   node scripts/dump-db-functions.js
 * Env:   .env.local must contain NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL)
 *        and SUPABASE_SERVICE_ROLE_KEY.
 * ---------------------------------------------------------------------------
 */
const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const path = require("path");
// Load from whichever local env file exists (first wins; system env still wins over all).
require("dotenv").config({
  path: [
    path.join(__dirname, "..", ".env.local"),
    path.join(__dirname, "..", ".env"),
    path.join(__dirname, "..", ".env.development.local"),
  ],
});

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error(
    "X Missing env. Need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local"
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

(async () => {
  console.log("Fetching live public functions/procedures...");
  const { data, error } = await supabase.rpc("export_public_routines");

  if (error) {
    console.error("X RPC export_public_routines failed:", error.message);
    console.error(
      "  Ensure migration v3.74.613 (export_public_routines) is applied."
    );
    process.exit(1);
  }

  const body = typeof data === "string" ? data : String(data ?? "");
  if (!body.trim()) {
    console.error("X Export returned empty. Aborting so we don't wipe the file.");
    process.exit(1);
  }

  const outDir = path.join(__dirname, "..", "supabase", "schema");
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, "functions.sql");

  const fnCount = (body.match(/^-- [^\n(]+\(/gm) || []).length;
  const header =
    "-- =====================================================================\n" +
    "-- AUTO-GENERATED SNAPSHOT — all live public functions & procedures.\n" +
    "-- Single Source of Truth mirror of the Supabase database.\n" +
    "-- DO NOT edit by hand. Regenerate with:  node scripts/dump-db-functions.js\n" +
    "-- Generated: " + new Date().toISOString() + "\n" +
    "-- Routines: " + fnCount + "\n" +
    "-- =====================================================================\n\n";

  fs.writeFileSync(outFile, header + body, "utf8");
  console.log(
    "+ Wrote " +
      path.relative(path.join(__dirname, ".."), outFile) +
      " (" + fnCount + " routines, " + body.length + " chars)"
  );
})().catch((e) => {
  console.error("X Unexpected error:", e && e.message ? e.message : e);
  process.exit(1);
});
