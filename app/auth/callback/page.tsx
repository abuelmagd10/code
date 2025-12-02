"use client"

import { Suspense, useEffect, useRef, useState } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { Sidebar } from "@/components/sidebar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useSupabase } from "@/lib/supabase/hooks"
import { Loader2, CheckCircle2 } from "lucide-react"

function CallbackInner() {
  const params = useSearchParams()
  const router = useRouter()
  const supabase = useSupabase()
  const [status, setStatus] = useState<string>("جاري التحقق...")
  const [error, setError] = useState<string>("")
  const ran = useRef(false)

  useEffect(() => {
    const run = async () => {
      if (ran.current) return
      ran.current = true
      setError("")
      try {
        const token_hash = params?.get("token_hash") || params?.get("token") || ""
        const type = (params?.get("type") || "").toLowerCase()
        const email = params?.get("email") || ""

        if (!token_hash || !type) {
          setError("رابط الدعوة غير صالح أو مفقود")
          return
        }

        // Map Supabase types
        const validTypes = ["invite","signup","magiclink","recovery","email_change"] as const
        const mapped = validTypes.includes(type as any) ? (type as any) : "signup"
        const { data, error: verErr } = await supabase.auth.verifyOtp({ type: mapped as any, token_hash })

        if (verErr) {
          setError(verErr.message || "فشل التحقق من الرابط")
          return
        }

        const { data: { user } } = await supabase.auth.getUser()

        // Check if this is a new signup (needs onboarding) or an invite
        if (type === "signup") {
          // Check if user has any company
          if (user?.id) {
            const { data: existingCompanies } = await supabase
              .from("companies")
              .select("id")
              .or(`owner_id.eq.${user.id},user_id.eq.${user.id}`)
              .limit(1)

            if (!existingCompanies || existingCompanies.length === 0) {
              // Check membership
              const { data: membership } = await supabase
                .from("company_members")
                .select("company_id")
                .eq("user_id", user.id)
                .limit(1)

              if (!membership || membership.length === 0) {
                // New user without company - redirect to onboarding
                setStatus("تم التحقق بنجاح، سيتم توجيهك لإعداد شركتك...")
                router.replace("/onboarding")
                return
              }
            }
          }
        }

        // Handle invites
        try {
          if (user?.email && user?.id) {
            const res = await fetch('/api/accept-membership', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: user.email, userId: user.id }) })
            const js = await res.json()
            if (res.ok && js?.companyId && typeof window !== 'undefined') {
              try { localStorage.setItem('active_company_id', String(js.companyId)) } catch {}
              try { document.cookie = `active_company_id=${String(js.companyId)}; path=/; max-age=31536000` } catch {}
            }
          }
        } catch {}

        setStatus("تم التحقق بنجاح، سيتم توجيهك...")

        // Check if user needs to set password (invited user)
        try {
          const { data: { user: currentUser } } = await supabase.auth.getUser()
          if (currentUser?.email && currentUser?.id) {
            const res = await fetch('/api/accept-membership', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: currentUser.email, userId: currentUser.id }) })
            const js = await res.json()
            const cid = String(js?.companyId || '')
            if (cid && type === "invite") {
              router.replace(`/auth/force-change-password?cid=${cid}`)
              return
            }
          }
        } catch {}

        // Default redirect to dashboard
        router.replace("/dashboard")
      } catch (e: any) {
        setError(e?.message || String(e))
      }
    }
    run()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-violet-50 via-blue-50 to-indigo-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-800">
      <Card className="w-full max-w-md shadow-xl border-0 bg-white/90 dark:bg-slate-900/90 backdrop-blur-sm">
        <CardHeader className="text-center">
          <CardTitle className="flex items-center justify-center gap-2">
            {error ? (
              <span className="text-red-600">خطأ في التحقق</span>
            ) : (
              <>
                <Loader2 className="w-5 h-5 animate-spin text-violet-600" />
                <span>معالجة الطلب</span>
              </>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {error ? (
            <div className="space-y-4 text-center">
              <p className="text-sm text-red-600 bg-red-50 dark:bg-red-900/20 p-3 rounded-lg">{error}</p>
              <Button variant="outline" onClick={() => router.replace("/auth/login")} className="w-full">
                العودة لصفحة الدخول
              </Button>
            </div>
          ) : (
            <div className="text-center space-y-4">
              <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto" />
              <p className="text-sm text-gray-700 dark:text-gray-300">{status}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default function CallbackPage() {
  return (
    <Suspense fallback={<div className="p-4">جاري التحميل...</div>}>
      <CallbackInner />
    </Suspense>
  )
}