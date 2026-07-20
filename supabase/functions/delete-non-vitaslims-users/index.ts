// NEUTRALISED 2026-07-20 (v3.74.761).
//
// This endpoint was deployed with verify_jwt = false and contained no
// authentication check of any kind. It ignored the request object entirely
// (`async (_req: Request)`), built a service-role client, listed every user in
// the project, and deleted all of them except five hardcoded ids.
//
// In other words: one unauthenticated HTTP request to a predictable URL
// destroyed every customer account on the platform, irreversibly. It was almost
// certainly a one-off development cleanup script that was never removed after
// it was used.
//
// Why it was never caught
// -----------------------
// It was never in this repository. The other two edge functions,
// notification-escalation and update-exchange-rates, are both mirrored here and
// both are written defensively. This one was deployed straight to production
// and so was never reviewed by anyone, ever. Same lesson as the schema snapshot
// in v3.74.760: what is not in the repository does not get looked at.
//
// It was also invisible to every sweep run this week, because all of them
// examined Postgres functions. An edge function is not a Postgres function.
//
// Current state
// -------------
// Redeployed with verify_jwt = true AND this body, so the hole is closed twice
// over. The original source is preserved in the v3.74.761 CHANGELOG entry if it
// is ever needed for reference — it should not be. A destructive maintenance
// action belongs in a reviewed migration, run deliberately, not in a public
// endpoint that answers to anyone who guesses its name.
//
// Proper end state: DELETE this function in the Supabase dashboard
// (Edge Functions -> delete-non-vitaslims-users -> Delete). This stub only
// closes the hole; removing the function is the real fix.

Deno.serve(() =>
  new Response(
    JSON.stringify({
      error: "This endpoint has been permanently disabled.",
      reason:
        "It deleted all user accounts and required no authentication. Neutralised 2026-07-20.",
      action: "Delete this edge function in the Supabase dashboard.",
    }),
    { status: 410, headers: { "Content-Type": "application/json" } }
  )
);
