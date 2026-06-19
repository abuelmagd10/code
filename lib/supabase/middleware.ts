import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

const SUPPRESS_GOTRUE_WARNING = true

// التحقق من صحة إعدادات Supabase
function isSupabaseConfigured(): boolean {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  return !!(supabaseUrl && supabaseAnonKey &&
    !supabaseUrl.includes('dummy') && !supabaseAnonKey.includes('dummy'))
}

export async function updateSession(request: NextRequest) {
  // إن لم تتوفر مفاتيح Supabase أو كانت وهمية، نتجاوز الوسيط كي لا تتعطل المعاينة
  if (!isSupabaseConfigured()) {
    console.warn('Supabase configuration is missing or contains dummy values. Skipping authentication middleware.')
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

  try {
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
    // الصفحات القانونية عامة بالكامل — يجب أن تُفتح بدون تسجيل دخول
    const isLegalPage = request.nextUrl.pathname.startsWith("/legal")
    // صفحة التواصل + API نموذج الاتصال — يَفتحها العملاء قبل التسجيل
    const isContactPage = request.nextUrl.pathname.startsWith("/contact") ||
                          request.nextUrl.pathname === "/api/contact"
    // المدوَّنة عامة بالكامل — جزء من قمع SEO
    const isBlogPage = request.nextUrl.pathname.startsWith("/blog")
    // v3.74.235 — صفحة العرض التوضيحى عامة بالكامل. كانت تَفتح
    // للمُستخدِم المُسجَّل (AppShell + SidebarLayoutProvider يُعفوها منذ
    // v3.74.228) لكن middleware الـsession كان يُعيد توجيه الزوار غير
    // المُسجَّلين إلى /auth/login قبل أن يَصِل الطَّلَب أصلًا لصفحة Demo.
    // إضافتها هنا تجعل الرابط /demo?lang=en يَفتَح فورًا لأى زائر.
    const isDemoPage = request.nextUrl.pathname.startsWith("/demo")
    // السماح لصفحة قبول الدعوة بدون تسجيل الدخول (للمستخدمين الجدد)
    const isInvitationAcceptPage = request.nextUrl.pathname.startsWith("/invitations/accept")
    // السماح لمسارات API للدعوات وإعادة إرسال التأكيد بدون تسجيل الدخول
    // + cron jobs (تحمى نفسها بـ CRON_SECRET)
    // + webhooks (تحمى نفسها بـ HMAC verification)
    // + renewal link (تحمى نفسها بـ HMAC-signed token)
    const isPublicApi = request.nextUrl.pathname.startsWith("/api/get-invitation") ||
      request.nextUrl.pathname.startsWith("/api/accept-invite") ||
      request.nextUrl.pathname.startsWith("/api/resend-confirmation") ||
      request.nextUrl.pathname.startsWith("/api/cron/") ||
      request.nextUrl.pathname.startsWith("/api/webhooks/") ||
      request.nextUrl.pathname === "/api/billing/renew"

    if (!isAuthPage && !isLegalPage && !isContactPage && !isBlogPage && !isDemoPage && !isInvitationAcceptPage && !isPublicApi && !session) {
      // لا توجد جلسة وليست على صفحة auth أو قبول الدعوة - أعد التوجيه إلى login
      if (!isRootPath) {
        const url = request.nextUrl.clone()
        url.pathname = "/auth/login"
        return NextResponse.redirect(url)
      }
      // السماح للصفحة الرئيسية / أن تعيد التوجيه بنفسها
    }

    // ─────────────────────────────────────────
    // Phase F: Suspension enforcement
    // Non-owner members of a suspended company can ONLY see /suspended.
    // Owner is unaffected (always free seat) and uses the app normally —
    // they see the suspension banner in /settings/billing.
    // ─────────────────────────────────────────
    if (session?.user) {
      const isSuspendedPage = request.nextUrl.pathname.startsWith("/suspended")
      const isBillingPage = request.nextUrl.pathname.startsWith("/settings/billing")
      const isOnboarding = request.nextUrl.pathname.startsWith("/onboarding") ||
                            request.nextUrl.pathname.startsWith("/auth")
      const isStatic = request.nextUrl.pathname.startsWith("/_next") ||
                       request.nextUrl.pathname === "/manifest.json" ||
                       request.nextUrl.pathname.endsWith(".png") ||
                       request.nextUrl.pathname.endsWith(".svg") ||
                       request.nextUrl.pathname.endsWith(".ico")

      // Skip the check on pages where blocking would be wrong/wasteful
      if (
        !isAuthPage && !isLegalPage && !isContactPage && !isBlogPage && !isDemoPage && !isInvitationAcceptPage && !isPublicApi &&
        !isSuspendedPage && !isOnboarding && !isStatic
      ) {
        // Fast RPC: one query returns { has_company, is_owner, is_suspended }
        const { data: statusData } = await supabase.rpc('get_user_company_status', {
          p_user_id: session.user.id,
        })

        const status = statusData as {
          has_company?: boolean
          is_owner?: boolean
          is_suspended?: boolean
        } | null

        const isNonOwnerOnSuspendedCompany =
          status?.has_company === true &&
          status?.is_suspended === true &&
          status?.is_owner === false
        if (isNonOwnerOnSuspendedCompany) {
          // Non-owner member of a suspended company → redirect to /suspended
          // Allow them to log out though (handled by /auth/* exclusion above)
          const url = request.nextUrl.clone()
          url.pathname = "/suspended"
          url.search = ""
          return NextResponse.redirect(url)
        }
      }
    }

    return supabaseResponse
  } catch (error) {
    console.error('Middleware error:', error)
    // في حالة حدوث خطأ، نسمح بالمرور للصفحة لتتعامل مع الخطأ
    return NextResponse.next({ request })
  }
}
