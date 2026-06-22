import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

/**
 * v3.74.289 — Verify a 6-digit reset code and set a new password in a
 * single server-side call, returning the new access/refresh tokens to the
 * client so the page can establish its session.
 *
 * Why server-side instead of doing it from the login page directly:
 *   The original client-side flow did:
 *     await supabase.auth.verifyOtp({ email, token, type: 'recovery' })
 *     await supabase.auth.updateUser({ password })
 *   In testing the verifyOtp call succeeded (Supabase auth logs showed
 *   POST /verify 200), but updateUser never reached Supabase — the
 *   underlying fetch was aborted in flight ("signal is aborted without
 *   reason"). The browser-side supabase-js client appears to race the
 *   freshly-saved session against the next API call, and some auth state
 *   listener or storage event aborts the pending /user PUT before it
 *   leaves the device.
 *
 *   Moving the two calls into a single server request side-steps the
 *   problem entirely: no React re-renders, no localStorage handlers, no
 *   AbortControllers tied to component lifecycles. We use a fresh
 *   non-persisting client on every call so there's no shared mutable
 *   state to race against.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const email = String(body?.email || "").trim().toLowerCase()
    const code = String(body?.code || "").trim()
    const password = String(body?.password || "")

    if (!email || !email.includes("@")) {
      return NextResponse.json({ error: "البريد الإلكترونى غير صحيح" }, { status: 400 })
    }
    if (!/^\d{6}$/.test(code)) {
      return NextResponse.json({ error: "الكود لازم يكون ٦ أرقام" }, { status: 400 })
    }
    if (!password || password.length < 8) {
      return NextResponse.json({ error: "كلمة المرور قصيرة. الحد الأدنى ٨ أحرف." }, { status: 400 })
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || ""
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
    if (!url || !anon) {
      return NextResponse.json({ error: "إعدادات Supabase ناقصة على السيرفر" }, { status: 500 })
    }

    // Fresh, non-persisting client per request. No singletons, no shared
    // session storage — eliminates the race we hit on the browser.
    const sb = createClient(url, anon, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // 1. Verify the recovery code. On success this client has a session.
    const { data: vData, error: vErr } = await sb.auth.verifyOtp({
      email,
      token: code,
      type: "recovery",
    })
    if (vErr) {
      return NextResponse.json({ error: vErr.message || "verify_failed" }, { status: 400 })
    }

    // 2. Update the password using the just-established session.
    const { error: uErr } = await sb.auth.updateUser({
      password,
      data: { must_change_password: false } as any,
    })
    if (uErr) {
      return NextResponse.json({ error: uErr.message || "update_failed" }, { status: 400 })
    }

    // 3. Return the tokens so the browser can establish its own session
    //    via setSession() and continue into the dashboard without a fresh
    //    sign-in step.
    const session = vData?.session
    return NextResponse.json({
      success: true,
      access_token: session?.access_token || null,
      refresh_token: session?.refresh_token || null,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "unknown" }, { status: 500 })
  }
}
