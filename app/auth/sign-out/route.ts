/**
 * POST /auth/sign-out
 *
 * Signs the user out by clearing the Supabase session cookies, then
 * redirects to /auth/login.
 *
 * Used from the /suspended page (and any other server-rendered context
 * that needs a sign-out form). The action is POST to prevent prefetch /
 * accidental sign-out via GET.
 */

import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { NextResponse, type NextRequest } from "next/server"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function POST(request: NextRequest) {
  const cookieStore = await cookies()
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          cookieStore.set(name, value, options)
        })
      },
    },
  })

  try {
    await supabase.auth.signOut()
  } catch (e) {
    // best-effort: even if signOut fails, redirect to login
    console.warn("[/auth/sign-out] signOut error:", e)
  }

  const redirectUrl = new URL("/auth/login", request.url)
  return NextResponse.redirect(redirectUrl, { status: 303 })
}

// GET handler that just redirects to login (no actual sign-out — POST only).
// This prevents prefetchers / link previews from logging users out.
export async function GET(request: NextRequest) {
  return NextResponse.redirect(new URL("/auth/login", request.url), { status: 303 })
}
