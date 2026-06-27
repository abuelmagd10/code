/**
 * /suspended — landing page for non-owner members of a suspended company.
 *
 * Server Component. Verifies status server-side: if the user is actually
 * the owner OR the company is no longer suspended, redirect them to the
 * dashboard. Otherwise show a clear "ask your account owner to renew"
 * message with a sign-out button.
 *
 * This is gated by middleware (lib/supabase/middleware.ts Phase F) — but
 * we re-verify here defensively in case the user navigates directly.
 */

import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { Lock, ShieldAlert, LogOut, Mail } from "lucide-react"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

interface CompanyStatus {
  has_company?: boolean
  company_id?: string
  is_owner?: boolean
  subscription_status?: string
  seat_number?: number
  paid_seats?: number
  // v3.74.379 — per-seat expiry. NULL when the user has no license
  // attached (e.g., legacy over-quota members or invitations that
  // haven't been placed on a seat yet).
  seat_expires_at?: string | null
  is_company_suspended?: boolean
  is_seat_suspended?: boolean
  is_suspended?: boolean
}

interface OwnerInfo {
  name?: string | null
  email?: string | null
}

async function getStatus(): Promise<{
  status: CompanyStatus | null
  ownerInfo: OwnerInfo | null
  companyName: string | null
}> {
  const cookieStore = await cookies()
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll() {
        // no-op in server component
      },
    },
  })

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { status: null, ownerInfo: null, companyName: null }
  }

  const { data: statusData } = await supabase.rpc("get_user_company_status", {
    p_user_id: user.id,
  })
  const status = statusData as CompanyStatus | null

  if (!status?.has_company || !status?.is_suspended) {
    return { status, ownerInfo: null, companyName: null }
  }

  // Fetch owner contact + company name via service role (only essentials)
  const adminUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const adminKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  if (!adminKey) {
    return { status, ownerInfo: null, companyName: null }
  }

  // We need a separate admin client for this lookup
  const { createClient } = await import("@supabase/supabase-js")
  const admin = createClient(adminUrl, adminKey, { auth: { persistSession: false } })

  const { data: company } = await admin
    .from("companies")
    .select("name, user_id")
    .eq("id", status.company_id!)
    .maybeSingle()

  let ownerInfo: OwnerInfo = {}
  if (company?.user_id) {
    try {
      const { data: ownerData } = await admin.auth.admin.getUserById(company.user_id)
      ownerInfo = {
        name: ownerData?.user?.user_metadata?.full_name || null,
        email: ownerData?.user?.email || null,
      }
    } catch { /* non-fatal */ }
  }

  return {
    status,
    ownerInfo,
    companyName: company?.name || null,
  }
}

export default async function SuspendedPage() {
  const { status, ownerInfo, companyName } = await getStatus()

  // Defensive re-checks: if not actually suspended OR is owner, leave the page
  if (!status?.has_company) {
    redirect("/onboarding")
  }
  if (!status.is_suspended) {
    redirect("/dashboard")
  }
  if (status.is_owner) {
    // Owner shouldn't be here — send them to billing to renew
    redirect("/settings/billing")
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800 p-4" dir="rtl">
      <div className="max-w-lg w-full bg-white dark:bg-slate-900 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-red-600 to-red-700 p-6 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-white/20 rounded-full mb-3">
            <ShieldAlert className="w-9 h-9 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-1">
            {status?.is_seat_suspended
              ? "انتهت صلاحية مقعدك"
              : "تم إيقاف حساب شركتك مؤقتاً"}
          </h1>
          <p className="text-red-100 text-sm">
            {companyName ? `شركة ${companyName}` : "اشتراك الشركة"}
            {status?.seat_number !== undefined && status.seat_number > 0 && (
              <span className="block mt-1">مقعدك رقم #{status.seat_number}</span>
            )}
          </p>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5">
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4 text-sm text-amber-900 dark:text-amber-200 flex items-start gap-3">
            <Lock className="w-5 h-5 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-semibold mb-1">لا يمكنك الوصول للنظام حالياً</p>
              {/* v3.74.379 — three distinct cases now:
                  1. Seat expired (license carries an expires_at in the past)
                  2. No seat assigned (assigned_user_id was NULL on every license)
                  3. Company-wide flag (subscription_status payment_failed) */}
              {status?.is_seat_suspended && status?.seat_expires_at ? (
                <p>
                  مقعدك رقم <strong>#{status.seat_number}</strong> انتهت صلاحيته فى
                  {" "}
                  <strong>
                    {new Date(status.seat_expires_at).toLocaleDateString("ar-EG", {
                      year: "numeric", month: "long", day: "numeric",
                    })}
                  </strong>.
                  {" "}
                  يرجى التواصل مع صاحب الحساب لتجديد المقعد أو نقلك إلى مقعد نشط من صفحة إدارة المقاعد.
                </p>
              ) : status?.is_seat_suspended ? (
                <p>
                  لم يتم إسناد مقعد لك بعد. يرجى التواصل مع صاحب الحساب لإسناد مقعد نشط لك من صفحة إدارة المقاعد.
                </p>
              ) : (
                <p>
                  انتهى اشتراك شركتك ولم يتم تجديده. يرجى التواصل مع صاحب الحساب للتجديد.
                </p>
              )}
            </div>
          </div>

          {/* Owner contact info */}
          {(ownerInfo?.email || ownerInfo?.name) && (
            <div className="bg-gray-50 dark:bg-slate-800 rounded-xl p-4">
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                تواصل مع صاحب الحساب
              </p>
              {ownerInfo.name && (
                <p className="text-gray-900 dark:text-white font-semibold mb-1">
                  {ownerInfo.name}
                </p>
              )}
              {ownerInfo.email && (
                <a
                  href={`mailto:${ownerInfo.email}?subject=${encodeURIComponent("طلب تجديد اشتراك 7esab.com")}`}
                  className="inline-flex items-center gap-2 text-violet-600 hover:text-violet-700 dark:text-violet-400 text-sm font-medium"
                >
                  <Mail className="w-4 h-4" />
                  {ownerInfo.email}
                </a>
              )}
            </div>
          )}

          <div className="text-sm text-gray-600 dark:text-gray-400 space-y-2">
            <p>
              <span className="font-semibold text-gray-900 dark:text-white">📦 بياناتك آمنة 100%</span>
              <br />
              لم يتم حذف أى شىء. عند تجديد الاشتراك يُعاد فتح الحساب لك فوراً وستجد كل البيانات كما تركتها.
            </p>
          </div>

          {/* Sign out form (POST so middleware doesn't intercept GET) */}
          <form action="/auth/sign-out" method="POST" className="pt-2 border-t border-gray-100 dark:border-slate-800">
            <button
              type="submit"
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-medium transition-colors"
            >
              <LogOut className="w-4 h-4" />
              تسجيل الخروج
            </button>
          </form>
        </div>

        {/* Footer */}
        <div className="bg-gray-50 dark:bg-slate-800/50 px-6 py-3 text-center border-t border-gray-100 dark:border-slate-800">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            7esab.com Enterprise ERP
          </p>
        </div>
      </div>
    </div>
  )
}
