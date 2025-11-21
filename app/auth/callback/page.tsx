"use client"

import { Suspense, useEffect, useState } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { Sidebar } from "@/components/sidebar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useSupabase } from "@/lib/supabase/hooks"

function CallbackInner() {
  const params = useSearchParams()
  const router = useRouter()
  const supabase = useSupabase()
  const [status, setStatus] = useState<string>("جاري التحقق...")
  const [error, setError] = useState<string>("")

  useEffect(() => {
    const run = async () => {
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
        try {
          const nowISO = new Date().toISOString()
          const { data: pendingInvites } = await supabase
            .from('company_invitations')
            .select('id, company_id, role, expires_at, accepted')
            .eq('accepted', false)
          for (const inv of (pendingInvites || [])) {
            const exp = String((inv as any)?.expires_at || '')
            if (exp && exp <= nowISO) continue
            if (user?.id) {
              const { error: memErr } = await supabase
                .from('company_members')
                .insert({ company_id: (inv as any).company_id, user_id: user.id, role: (inv as any).role })
              if (!memErr) {
                await supabase.from('company_invitations').update({ accepted: true }).eq('id', (inv as any).id)
                if (typeof window !== 'undefined') {
                  try { localStorage.setItem('active_company_id', String((inv as any).company_id || '')) } catch {}
                }
              }
            }
          }
        } catch {}
        setStatus("تم التحقق بنجاح، سيتم توجيهك لتعيين كلمة المرور")
        router.replace("/auth/force-change-password")
      } catch (e: any) {
        setError(e?.message || String(e))
      }
    }
    run()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="flex min-h-screen bg-gray-50 dark:bg-slate-950">
      <Sidebar />
      <main className="flex-1 md:mr-64 p-4 md:p-8">
        <Card>
          <CardHeader>
            <CardTitle>معالجة الدعوة</CardTitle>
          </CardHeader>
          <CardContent>
            {error ? (
              <div className="space-y-2">
                <p className="text-sm text-red-600">{error}</p>
                <Button variant="outline" onClick={() => router.replace("/auth/login")}>العودة لصفحة الدخول</Button>
              </div>
            ) : (
              <p className="text-sm text-gray-700">{status}</p>
            )}
          </CardContent>
        </Card>
      </main>
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