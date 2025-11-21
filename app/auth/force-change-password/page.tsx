"use client"

import { useState } from "react"
import { Sidebar } from "@/components/sidebar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { createClient } from "@/lib/supabase/client"

export default function ForceChangePasswordPage() {
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (password.length < 8) { setError("الحد الأدنى 8 أحرف") ; return }
    if (password !== confirm) { setError("كلمتا المرور غير متطابقتين") ; return }
    setLoading(true)
    try {
      const supabase = createClient()
      const { error: updErr } = await supabase.auth.updateUser({ password, data: { must_change_password: false } as any })
      if (updErr) { setError(updErr.message) ; return }
      try {
        const { data: { user } } = await supabase.auth.getUser()
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
        const hasActive = typeof window !== 'undefined' ? !!localStorage.getItem('active_company_id') : false
        if (!hasActive && user?.id) {
          const { data: myMember } = await supabase
            .from('company_members')
            .select('company_id')
            .eq('user_id', user.id)
            .limit(1)
          const cidFromMember = myMember && myMember[0]?.company_id
          if (cidFromMember && typeof window !== 'undefined') {
            try { localStorage.setItem('active_company_id', String(cidFromMember)) } catch {}
          }
        }
      } catch {}
      window.location.href = "/dashboard"
    } finally { setLoading(false) }
  }

  return (
    <div className="flex min-h-screen bg-gray-50 dark:bg-slate-950">
      <Sidebar />
      <main className="flex-1 md:mr-64 p-4 md:p-8">
        <Card>
          <CardHeader>
            <CardTitle>تغيير كلمة المرور</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4 max-w-md">
              <div>
                <Label>كلمة المرور الجديدة</Label>
                <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
              <div>
                <Label>تأكيد كلمة المرور</Label>
                <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <Button type="submit" disabled={loading}>{loading ? "جاري الحفظ..." : "حفظ"}</Button>
            </form>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}