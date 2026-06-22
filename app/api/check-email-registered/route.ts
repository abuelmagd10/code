import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

/**
 * v3.74.288 — Check whether an email address has a registered auth account.
 *
 * Background:
 *   Supabase's `resetPasswordForEmail` returns 200 OK regardless of whether
 *   the email exists — by design, to prevent email-enumeration attacks. In
 *   our product the user base is identified accountants / business owners,
 *   not anonymous public, so we trade a little enumeration risk for a much
 *   better UX: the user gets told "this email isn't registered" instead of
 *   waiting in vain for a code that will never arrive.
 *
 * This endpoint only returns a boolean. It does NOT leak any other info
 * about the user (no name, no role, no company). Rate-limiting at the
 * Supabase / hosting layer still applies — anyone brute-forcing this would
 * be obvious in our auth logs.
 *
 * Fail-open: any internal error returns { exists: true } so the original
 * Supabase flow still runs. Better to ask Supabase to handle it than to
 * block a legitimate password reset.
 */
export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json()

    if (!email || typeof email !== "string" || !email.includes("@")) {
      return NextResponse.json({ exists: false, reason: "invalid_email" })
    }

    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ""
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ""

    if (!url || !serviceKey) {
      // Env not configured — let Supabase's own flow proceed.
      return NextResponse.json({ exists: true, reason: "no_service_key" })
    }

    const admin = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const normalized = email.trim().toLowerCase()

    // Service role can SELECT from auth.users via PostgREST when the schema
    // is exposed. Cleanest way is an RPC, but we don't want to require one
    // — use the admin auth listing with a per-email scan instead. For small
    // user bases (our case) this is fine. For larger ones we'd add an RPC.
    const { data, error } = await admin.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    })
    if (error) {
      return NextResponse.json({ exists: true, reason: "lookup_failed" })
    }

    const exists = !!data?.users?.some(
      (u: any) => (u.email || "").toLowerCase() === normalized
    )
    return NextResponse.json({ exists })
  } catch (e: any) {
    return NextResponse.json({ exists: true, reason: "exception" })
  }
}
