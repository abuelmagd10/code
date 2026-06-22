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
  // v3.74.287 — reset-password inline flow using a 6-digit code.
  // Stages: 'idle' (regular login form), 'codeSent' (code+new-password form)
  const [resetStage, setResetStage] = useState<'idle' | 'codeSent'>('idle')
  const [resetSending, setResetSending] = useState(false)
  const [resetCode, setResetCode] = useState("")
  const [resetNewPassword, setResetNewPassword] = useState("")
  const [resetConfirmPassword, setResetConfirmPassword] = useState("")

  // v3.74.277 — ترجمة رسائل Supabase الشائعة لعربى يفهمه المستخدم العادى
  // v3.74.287 — تغطية رسائل verifyOtp للكود الرقمى
  const translateAuthError = (msg: string): string => {
    const lower = (msg || "").toLowerCase()
    if (lower.includes("invalid login credentials") || lower.includes("invalid_credentials")) {
      return 'البريد الإلكترونى أو كلمة المرور غير صحيحة. لو نسيت كلمة المرور، اضغط "نسيت كلمة المرور؟" تحت.'
    }
    if (lower.includes("email not confirmed")) {
      return "البريد الإلكترونى لسه ما اتفعّلش. افتح رسالة التفعيل اللى اتبعتت لك."
    }
    if (lower.includes("too many requests") || lower.includes("rate")) {
      return "محاولات كتير فى وقت قصير. استنى دقيقة ثم حاول تانى."
    }
    if (lower.includes("user not found")) {
      return "ما فيش حساب بهذا البريد. تأكد من الإيميل أو أنشئ حساب جديد."
    }
    if (lower.includes("token has expired") || lower.includes("expired")) {
      return "انتهت صلاحية الكود. اطلب كود جديد."
    }
    if (lower.includes("invalid") && (lower.includes("token") || lower.includes("otp") || lower.includes("code"))) {
      return "الكود اللى كتبته مش صحيح. تأكد منه أو اطلب كود جديد."
    }
    if (lower.includes("password should be") || lower.includes("weak password")) {
      return "كلمة المرور ضعيفة. ٨ أحرف على الأقل وامزج حروف وأرقام."
    }
    if (lower.includes("same as the old") || lower.includes("same_password")) {
      return "كلمة المرور الجديدة لازم تكون مختلفة عن القديمة."
    }
    return msg
  }

  // v3.74.287 — Step 1 of password reset: ask Supabase to email a 6-digit
  // code (template uses {{ .Token }} instead of {{ .TokenHash }}). We pass
  // no redirectTo because there is no link to click — the code is what the
  // user copies.
  //
  // v3.74.288 — First confirm the email is registered, otherwise Supabase
  // silently swallows the request (anti-enumeration) and the user waits
  // forever for an email that will never arrive. We trade a tiny bit of
  // enumeration exposure for a much better UX.
  const handleSendResetCode = async () => {
    if (!login.trim()) {
      setError("اكتب البريد الإلكترونى الأول، ثم اضغط نسيت كلمة المرور.")
      return
    }
    if (!login.includes("@")) {
      setError("لإعادة تعيين كلمة المرور، اكتب البريد الإلكترونى الكامل (مش اسم المستخدم).")
      return
    }
    try {
      setResetSending(true)
      setError(null)
      const email = login.trim().toLowerCase()

      // Check registration first
      try {
        const res = await fetch("/api/check-email-registered", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email }),
        })
        const data = await res.json()
        if (res.ok && data?.exists === false) {
          setError("ما فيش حساب مسجّل بالبريد الإلكترونى ده. تأكد من الكتابة، أو اعمل حساب جديد من رابط 'إنشاء حساب جديد'.")
          return
        }
        // exists === true OR fail-open path: continue to request the code.
      } catch {
        // Network / endpoint failure — fall back to original flow (Supabase
        // will silently accept and just not send if the email isn't real).
      }

      const supabase = createClient()
      const { error: resetErr } = await supabase.auth.resetPasswordForEmail(email)
      if (resetErr) throw resetErr
      setResetStage('codeSent')
      setResetCode("")
      setResetNewPassword("")
      setResetConfirmPassword("")
    } catch (e: any) {
      setError(translateAuthError(e?.message || "تعذّر إرسال كود إعادة التعيين"))
    } finally {
      setResetSending(false)
    }
  }

  // v3.74.287 — Step 2 of password reset: user typed the 6-digit code from
  // the email + a new password. We verify the code against Supabase (this
  // creates a recovery session for the user), then update the password,
  // then redirect into the workspace. Because the code lives only in the
  // email body and never in a URL, no email scanner / link-prefetcher can
  // consume it before the user does — that was the failure mode of the
  // old link-based flow.
  const handleVerifyResetCode = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!/^\d{6}$/.test(resetCode.trim())) {
      setError("اكتب كود التحقق (٦ أرقام) اللى وصل على الإيميل.")
      return
    }
    if (resetNewPassword.length < 8) {
      setError("كلمة المرور الجديدة الحد الأدنى ٨ أحرف.")
      return
    }
    if (resetNewPassword !== resetConfirmPassword) {
      setError("كلمتا المرور غير متطابقتين.")
      return
    }
    try {
      setIsLoading(true)
      const supabase = createClient()
      const email = login.trim().toLowerCase()

      // 1. Verify the OTP code — succeeds only if the code matches what
      //    Supabase emailed AND hasn't expired AND hasn't been used.
      const { error: vErr } = await supabase.auth.verifyOtp({
        email,
        token: resetCode.trim(),
        type: 'recovery',
      })
      if (vErr) { setError(translateAuthError(vErr.message)); return }

      // 2. Now that we have a recovery session, set the new password.
      const { error: updErr } = await supabase.auth.updateUser({
        password: resetNewPassword,
        data: { must_change_password: false } as any,
      })
      if (updErr) { setError(translateAuthError(updErr.message)); return }

      // 3. Make sure their membership / active company is set, then go
      //    to whatever first page they're allowed to see.
      let cidForRedirect = ""
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (user?.email && user?.id) {
          const res = await fetch("/api/accept-membership", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ email: user.email, userId: user.id }),
          })
          const js = await res.json()
          const cid = String(js?.companyId || "")
          if (res.ok && cid) {
            cidForRedirect = cid
            try { localStorage.setItem("active_company_id", cid) } catch {}
            try { document.cookie = `active_company_id=${cid}; path=/; max-age=31536000` } catch {}
          }
        }
      } catch {}

      try {
        const res = await fetch("/api/first-allowed-page")
        const data = await res.json()
        window.location.href = data.path || (cidForRedirect ? `/dashboard?cid=${cidForRedirect}` : "/dashboard")
      } catch {
        window.location.href = cidForRedirect ? `/dashboard?cid=${cidForRedirect}` : "/dashboard"
      }
    } catch (e: any) {
      setError(translateAuthError(e?.message || "تعذّر تغيير كلمة المرور"))
    } finally {
      setIsLoading(false)
    }
  }
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
        // نقل المستخدم بتهيئة كاملة (Hard Navigation) لضمان تحميل سياقات الأمان بشكل نظيف
        try {
          const res = await fetch("/api/first-allowed-page")
          const data = await res.json()
          window.location.href = data.path || "/dashboard"
        } catch {
          window.location.href = "/dashboard"
        }
      }
    } catch (error: unknown) {
      setError(translateAuthError(error instanceof Error ? error.message : "حدث خطأ فى تسجيل الدخول"))
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
                  try { localStorage.setItem('active_company_id', String((inv as any).company_id || '')) } catch { }
                }
              }
            }
          }
        } catch { }
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
              try { localStorage.setItem('active_company_id', String(cidFromMember)) } catch { }
            } else {
              const { data: owned } = await supabase
                .from('companies')
                .select('id')
                .eq('user_id', user.id)
                .limit(1)
              const ownedId = owned && owned[0]?.id
              if (ownedId && typeof window !== 'undefined') {
                try { localStorage.setItem('active_company_id', String(ownedId)) } catch { }
              }
            }
          }
        } catch { }
        try {
          const { data: { user } } = await supabase.auth.getUser()
          let cidForRedirect = ''
          if (user?.email && user?.id) {
            const res = await fetch('/api/accept-membership', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: user.email, userId: user.id }) })
            const js = await res.json()
            const cid = String(js?.companyId || '')
            if (res.ok && cid && typeof window !== 'undefined') {
              cidForRedirect = cid
              try { localStorage.setItem('active_company_id', cid) } catch { }
              try { document.cookie = `active_company_id=${cid}; path=/; max-age=31536000` } catch { }
            }
          }
          if (cidForRedirect) {
            router.replace(`/auth/force-change-password?cid=${cidForRedirect}`)
          } else {
            router.replace('/auth/force-change-password')
          }
        } catch { router.replace('/auth/force-change-password') }
      } catch { }
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
            {resetStage === 'codeSent' ? (
              // v3.74.287 — Reset code + new-password form. Replaces the
              // login form once the user has requested a code. No magic
              // link involved; the code from the email is typed here.
              <form onSubmit={handleVerifyResetCode} className="space-y-4">
                <div className="rounded-md border border-blue-200 bg-blue-50 dark:border-blue-900/40 dark:bg-blue-950/30 p-3 text-sm leading-relaxed text-blue-900 dark:text-blue-200">
                  بعتنا كود تحقق من ٦ أرقام على <strong>{login.trim().toLowerCase()}</strong>. افتح الإيميل وانسخ الكود تحت.
                </div>
                <div className="space-y-2">
                  <Label htmlFor="resetCode">كود التحقق</Label>
                  <Input
                    id="resetCode"
                    type="text"
                    inputMode="numeric"
                    pattern="\d{6}"
                    maxLength={6}
                    placeholder="000000"
                    autoComplete="one-time-code"
                    required
                    value={resetCode}
                    onChange={(e) => setResetCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    className="text-center tracking-[0.5em] text-lg font-mono"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="resetNewPassword">كلمة المرور الجديدة</Label>
                  <Input
                    id="resetNewPassword"
                    type="password"
                    autoComplete="new-password"
                    required
                    value={resetNewPassword}
                    onChange={(e) => setResetNewPassword(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="resetConfirmPassword">تأكيد كلمة المرور</Label>
                  <Input
                    id="resetConfirmPassword"
                    type="password"
                    autoComplete="new-password"
                    required
                    value={resetConfirmPassword}
                    onChange={(e) => setResetConfirmPassword(e.target.value)}
                  />
                </div>
                {error && <p className="text-sm text-red-500 leading-relaxed">{error}</p>}
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? "جارٍ الحفظ..." : "تعيين كلمة المرور"}
                </Button>
                <div className="flex items-center justify-between text-sm">
                  <button
                    type="button"
                    onClick={handleSendResetCode}
                    disabled={resetSending}
                    className="text-blue-600 hover:underline dark:text-blue-400"
                  >
                    {resetSending ? "جارٍ الإرسال..." : "إعادة إرسال الكود"}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setResetStage('idle'); setError(null) }}
                    className="text-gray-600 hover:underline dark:text-gray-400"
                  >
                    إلغاء
                  </button>
                </div>
              </form>
            ) : (
              <>
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
                  {error && <p className="text-sm text-red-500 leading-relaxed">{error}</p>}
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={handleSendResetCode}
                      disabled={resetSending}
                      className="text-sm text-blue-600 hover:underline dark:text-blue-400"
                    >
                      {resetSending ? "جارٍ الإرسال..." : "نسيت كلمة المرور؟"}
                    </button>
                  </div>
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
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
