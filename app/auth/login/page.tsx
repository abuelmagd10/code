"use client"

import type React from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"

export default function LoginPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()
  const envOk = !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    try {
      if (!envOk) throw new Error("المفاتيح غير مضبوطة")
      const supabase = createClient()
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
        options: {
          emailRedirectTo: process.env.NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL || `${window.location.origin}/dashboard`,
        },
      })
      if (error) throw error
      const { data: { user } } = await supabase.auth.getUser()
      const must = (user?.user_metadata as any)?.must_change_password
      if (must) {
        router.push("/auth/force-change-password")
      } else {
        router.push("/dashboard")
      }
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "خطأ في تسجيل الدخول")
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    const applyHashSession = async () => {
      try {
        const hash = typeof window !== 'undefined' ? window.location.hash : ''
        if (!hash || hash.indexOf('access_token') === -1) return
        const params = new URLSearchParams(hash.replace(/^#/, ''))
        const access_token = params.get('access_token') || ''
        const refresh_token = params.get('refresh_token') || ''
        if (!access_token || !refresh_token) return
        const supabase = createClient()
        const { error: setErr } = await supabase.auth.setSession({ access_token, refresh_token })
        if (setErr) return
        if (typeof window !== 'undefined') {
          const url = new URL(window.location.href)
          url.hash = ''
          window.history.replaceState({}, document.title, url.toString())
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
        // تعيين الشركة الفعّالة افتراضياً إذا لم تُعيّن بعد
        try {
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
            } else {
              const { data: owned } = await supabase
                .from('companies')
                .select('id')
                .eq('user_id', user.id)
                .limit(1)
              const ownedId = owned && owned[0]?.id
              if (ownedId && typeof window !== 'undefined') {
                try { localStorage.setItem('active_company_id', String(ownedId)) } catch {}
              }
            }
          }
        } catch {}
        try {
          const { data: { user } } = await supabase.auth.getUser()
          if (user?.email && user?.id) {
            const res = await fetch('/api/accept-membership', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: user.email, userId: user.id }) })
            const js = await res.json()
            if (res.ok && js?.companyId && typeof window !== 'undefined') {
              try { localStorage.setItem('active_company_id', String(js.companyId)) } catch {}
              try { document.cookie = `active_company_id=${String(js.companyId)}; path=/; max-age=31536000` } catch {}
            }
          }
        } catch {}
        router.replace('/auth/force-change-password')
      } catch {}
    }
    applyHashSession()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="flex min-h-screen w-full items-center justify-center p-6 md:p-10 bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-slate-900 dark:to-slate-800">
      <div className="w-full max-w-sm">
        <Card className="shadow-lg">
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl font-bold text-center">تطبيق المحاسبة</CardTitle>
            <CardDescription className="text-center">أدخل بيانات حسابك للدخول</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">البريد الإلكتروني</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="example@company.com"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">كلمة المرور</Label>
                <Input
                  id="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              {error && <p className="text-sm text-red-500">{error}</p>}
              <Button type="submit" className="w-full" disabled={isLoading || !envOk}>
                {isLoading ? "جاري الدخول..." : "دخول"}
              </Button>
              {!envOk && (
                <p className="mt-2 text-xs text-amber-600 text-center">الرجاء ضبط مفاتيح Supabase في البيئة قبل تسجيل الدخول</p>
              )}
            </form>
            <div className="mt-4 text-center text-sm">
              ليس لديك حساب؟{" "}
              <Link href="/auth/sign-up" className="text-blue-600 hover:underline dark:text-blue-400">
                إنشاء حساب جديد
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
