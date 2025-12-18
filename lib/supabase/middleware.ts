import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

const SUPPRESS_GOTRUE_WARNING = true

export async function updateSession(request: NextRequest) {
  // إن لم تتوفر مفاتيح Supabase، نتجاوز الوسيط كي لا تتعطل المعاينة
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return NextResponse.next({ request })
  }
  let supabaseResponse = NextResponse.next({
    request,
  })

  // Suppress the multiple GoTrueClient instances warning
  if (SUPPRESS_GOTRUE_WARNING && typeof process !== "undefined") {
    const originalWarn = console.warn
    console.warn = (...args: unknown[]) => {
      if (args[0] && typeof args[0] === "string" && args[0].includes("Multiple GoTrueClient instances")) {
        return
      }
      originalWarn(...args)
    }
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) => supabaseResponse.cookies.set(name, value, options))
        },
      },
    },
  )

  const {
    data: { session },
  } = await supabase.auth.getSession()

  // السماح لصفحات /auth بدون جلسة
  // redirect إلى /auth/login فقط للصفحات المحمية
  const isAuthPage = request.nextUrl.pathname.startsWith("/auth")
  const isRootPath = request.nextUrl.pathname === "/"
  // السماح لصفحة قبول الدعوة بدون تسجيل الدخول (للمستخدمين الجدد)
  const isInvitationAcceptPage = request.nextUrl.pathname.startsWith("/invitations/accept")
  // السماح لمسارات API للدعوات وإعادة إرسال التأكيد بدون تسجيل الدخول
  const isPublicApi = request.nextUrl.pathname.startsWith("/api/get-invitation") ||
                      request.nextUrl.pathname.startsWith("/api/accept-invite") ||
                      request.nextUrl.pathname.startsWith("/api/resend-confirmation")

  if (!isAuthPage && !isInvitationAcceptPage && !isPublicApi && !session) {
    // لا توجد جلسة وليست على صفحة auth أو قبول الدعوة - أعد التوجيه إلى login
    if (!isRootPath) {
      const url = request.nextUrl.clone()
      url.pathname = "/auth/login"
      return NextResponse.redirect(url)
    }
    // السماح للصفحة الرئيسية / أن تعيد التوجيه بنفسها
  }

  // Restore original console.warn
  if (SUPPRESS_GOTRUE_WARNING) {
    console.warn = console.warn
  }

  await supabase.auth.getSession()

  return supabaseResponse
}
