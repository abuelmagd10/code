"use client"

import { Suspense, useEffect, useState } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { Sidebar } from "@/components/sidebar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useSupabase } from "@/lib/supabase/hooks"
import { useToast } from "@/hooks/use-toast"

function AcceptInvitationsContent() {
  const supabase = useSupabase()
  const { toast } = useToast()
  const [invites, setInvites] = useState<Array<{ id: string; company_id: string; email: string; role: string; expires_at: string }>>([])
  const [loading, setLoading] = useState(false)
  const [password, setPassword] = useState("")
  const params = useSearchParams()
  const router = useRouter()

  useEffect(() => {
    ;(async () => {
      try {
        setLoading(true)
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return
        const { data } = await supabase
          .from("company_invitations")
          .select("id, company_id, email, role, expires_at")
          .eq("accepted", false)
          .gt("expires_at", new Date().toISOString())
        setInvites((data || []) as any)
      } finally { setLoading(false) }
    })()
  }, [])

  const accept = async (inv: any) => {
    try {
      setLoading(true)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { toast({ title: "يرجى تسجيل الدخول" }); return }
      const { error } = await supabase
        .from("company_members")
        .insert({ company_id: inv.company_id, user_id: user.id, role: inv.role })
      if (error) { toast({ title: "تعذر القبول", description: error.message, variant: "destructive" }); return }
      await supabase.from("company_invitations").update({ accepted: true }).eq("id", inv.id)
      const { data } = await supabase
        .from("company_invitations")
        .select("id, company_id, email, role, expires_at")
        .eq("accepted", false)
        .gt("expires_at", new Date().toISOString())
      setInvites((data || []) as any)
      toast({ title: "تم الانضمام إلى الشركة" })
    } finally { setLoading(false) }
  }

  const token = params?.get("token") || ""

  const handleAutoAccept = async () => {
    try {
      setLoading(true)
      if (!password || password.length < 8) { toast({ title: "كلمة المرور قصيرة", description: "الحد الأدنى 8 أحرف", variant: "destructive" }); return }
      const res = await fetch("/api/accept-invite", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token, password }) })
      const js = await res.json()
      if (!res.ok) { toast({ title: "فشل القبول", description: js?.error || "" , variant: "destructive" }); return }
      const email = js.email
      const { error: signErr } = await supabase.auth.signInWithPassword({ email, password })
      if (signErr) { toast({ title: "تعذر تسجيل الدخول", description: signErr.message, variant: "destructive" }); return }
      toast({ title: "تم القبول وتسجيل الدخول" })
      router.push("/dashboard")
    } finally { setLoading(false) }
  }

  return (
    <div className="flex min-h-screen bg-gray-50 dark:bg-slate-950">
      <Sidebar />
      <main className="flex-1 md:mr-64 p-4 md:p-8 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">قبول الدعوات</h1>
          <span className="text-sm text-gray-500 dark:text-gray-400">الانضمام إلى الشركات عبر الدعوات</span>
        </div>
        {token ? (
          <Card>
            <CardHeader>
              <CardTitle>قبول تلقائي</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <p className="text-sm text-gray-600">أدخل كلمة مرور لحسابك وسيتم قبول الدعوة وتسجيل الدخول تلقائياً.</p>
                <input type="password" className="border rounded p-2 w-full" placeholder="كلمة المرور" value={password} onChange={(e) => setPassword(e.target.value)} />
                <Button onClick={handleAutoAccept} disabled={loading || !password}>قبول الآن</Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
          <CardHeader>
            <CardTitle>دعواتك</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-center py-8 text-gray-500">جاري التحميل...</p>
            ) : invites.length === 0 ? (
              <p className="text-center py-8 text-gray-500">لا توجد دعوات حالياً</p>
            ) : (
              <div className="space-y-2">
                {invites.map((inv) => (
                  <div key={inv.id} className="flex items-center justify-between p-2 border rounded">
                    <div>
                      <div className="text-sm">شركة: {inv.company_id}</div>
                      <div className="text-xs text-gray-500">الدور: {inv.role} • ينتهي: {new Date(inv.expires_at).toLocaleDateString('ar')}</div>
                    </div>
                    <div>
                      <Button onClick={() => accept(inv)}>قبول</Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
          </Card>
        )}
      </main>
    </div>
  )
}

export default function AcceptInvitationsPage() {
  return (
    <Suspense fallback={<div className="p-4">جاري التحميل...</div>}>
      <AcceptInvitationsContent />
    </Suspense>
  )
}