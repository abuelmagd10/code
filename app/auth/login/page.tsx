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
  const [login, setLogin] = useState("") // البريد أو username
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

      let emailToUse = login.trim()

      // إذا لم يكن بريداً إلكترونياً، ابحث عن username
      if (!emailToUse.includes("@")) {
        // نستخدم RPC آمنة للبحث عن البريد الإلكتروني
        const { data: userData, error: rpcError } = await supabase
          .rpc("find_user_by_login", { p_login: emailToUse.toLowerCase() })

        if (rpcError) {
          console.error("RPC Error:", rpcError)
          throw new Error("حدث خطأ في البحث عن المستخدم")
        }

        if (!userData || userData.length === 0 || !userData[0]?.email) {
          throw new Error("اسم المستخدم غير موجود. جرب البريد الإلكتروني")
        }

        emailToUse = userData[0].email
      }

      const { error } = await supabase.auth.signInWithPassword({
        email: emailToUse,
        password,
        options: {
          emailRedirectTo: process.env.NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL || `${window.location.origin}/dashboard`,
        },
      })
      if (error) throw error
      const { data: { user } } = await supabase.auth.getUser()

      // تسجيل حدث الدخول في سجل المراجعة
      if (user) {
        try {
          // جلب معرف الشركة
          const { data: membership } = await supabase
            .from("company_members")
            .select("company_id")
            .eq("user_id", user.id)
            .limit(1)
            .maybeSingle()

          if (membership?.company_id) {
            await fetch("/api/audit-log", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                action: "LOGIN",
                companyId: membership.company_id,
                userId: user.id,
                details: {
                  user_email: user.email,
                  user_name: user.user_metadata?.full_name || user.email?.split("@")[0],
                  login_method: "password",
                  ip_address: null, // سيتم إضافته من الخادم
                  user_agent: navigator.userAgent,
                },
              }),
            })
          }
        } catch (logError) {
          console.error("Failed to log login event:", logError)
        }
      }

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
          let cidForRedirect = ''
          if (user?.email && user?.id) {
            const res = await fetch('/api/accept-membership', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: user.email, userId: user.id }) })
            const js = await res.json()
            const cid = String(js?.companyId || '')
            if (res.ok && cid && typeof window !== 'undefined') {
              cidForRedirect = cid
              try { localStorage.setItem('active_company_id', cid) } catch {}
              try { document.cookie = `active_company_id=${cid}; path=/; max-age=31536000` } catch {}
            }
          }
          if (cidForRedirect) {
            router.replace(`/auth/force-change-password?cid=${cidForRedirect}`)
          } else {
            router.replace('/auth/force-change-password')
          }
        } catch { router.replace('/auth/force-change-password') }
      } catch {}
    }
    applyHashSession()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="flex min-h-screen w-full items-center justify-center p-6 md:p-10 bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-slate-900 dark:to-slate-800">
      <div className="w-full max-w-sm">
        <Card className="shadow-lg">
          <CardHeader className="space-y-1 pb-2">
            {/* Logo */}
            <div className="flex justify-center mb-4">
              <img
                src="/icons/icon-192x192.svg"
                alt="7ESAB Logo"
                className="w-24 h-24"
              />
            </div>
            <CardTitle className="text-2xl font-bold text-center">7ESAB</CardTitle>
            <CardDescription className="text-center">أدخل بيانات حسابك للدخول</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="login">البريد الإلكتروني أو اسم المستخدم</Label>
                <Input
                  id="login"
                  type="text"
                  placeholder="example@company.com أو username"
                  required
                  value={login}
                  onChange={(e) => setLogin(e.target.value)}
                  autoComplete="username"
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
