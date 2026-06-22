import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

/**
 * v3.74.290 — Verify a 6-digit sign-up code (the {{ .Token }} sent to a
 * newly registered user) and return the resulting session tokens. The
 * client then calls setSession() and navigates to /auth/callback, which
 * detects an active session and runs the existing company-creation
 * pipeline.
 *
 * Mirrors v3.74.289 (reset-password-with-code): everything runs on the
 * server with a fresh non-persisting client, so we avoid the
 * verifyOtp → next-call abort race we saw on the browser in v3.74.287.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const email = String(body?.email || "").trim().toLowerCase()
    const code = String(body?.code || "").trim()

    if (!email || !email.includes("@")) {
      return NextResponse.json({ error: "البريد الإلكتروني غير صحيح" }, { status: 400 })
    }
    if (!/^\d{6}$/.test(code)) {
      return NextResponse.json({ error: "الكود لازم ٦ أرقام" }, { status: 400 })
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || ""
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
    if (!url || !anon) {
      return NextResponse.json({ error: "إعدادات Supabase ناقصة على السيرفر" }, { status: 500 })
    }

    const sb = createClient(url, anon, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // type:"signup" — confirms the email and gives back a session
    const { data, error } = await sb.auth.verifyOtp({
      email,
      token: code,
      type: "signup",
    })
    if (error) {
      return NextResponse.json({ error: error.message || "verify_failed" }, { status: 400 })
    }

    const session = data?.session
    return NextResponse.json({
      success: true,
      access_token: session?.access_token || null,
      refresh_token: session?.refresh_token || null,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "unknown" }, { status: 500 })
  }
}
