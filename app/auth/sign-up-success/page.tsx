"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import Link from "next/link"
import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Mail, Loader2, RefreshCw, AlertCircle, CheckCircle2 } from "lucide-react"
import { createClient } from "@/lib/supabase/client"

// v3.74.290 — code-entry page that completes the sign-up flow.
//
// User journey:
//   /auth/sign-up  → fills form, calls supabase.auth.signUp()
//   → router pushes to /auth/sign-up-success (this page)
//   → user pastes the 6-digit code that arrived in their inbox
//   → POST /api/verify-signup-with-code (server verifies + returns tokens)
//   → setSession on the browser client
//   → router push /auth/callback?type=signup&auto=true
//   → callback detects active session and runs createCompanyFromMetadata
//
// Why a code, not a link: email scanners (Outlook Safe Links, anti-phishing
// gateways) follow URLs in inbound mail and consume the one-time token
// before the human ever clicks. A 6-digit code in the email body bypasses
// the issue entirely — see v3.74.287 commit for the full story.
function translateAuthError(msg: string): string {
  const lower = (msg || "").toLowerCase()
  if (lower.includes("token has expired") || lower.includes("expired")) {
    return "انتهت صلاحية الكود. اطلب كود جديد."
  }
  if (lower.includes("invalid") && (lower.includes("token") || lower.includes("otp") || lower.includes("code"))) {
    return "الكود اللى كتبته مش صحيح. تأكد منه أو اطلب كود جديد."
  }
  if (lower.includes("rate") || lower.includes("too many")) {
    return "محاولات كتير فى وقت قصير. استنى دقيقة وحاول تانى."
  }
  return msg
}

export default function SignUpSuccessPage() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [code, setCode] = useState("")
  const [loading, setLoading] = useState(false)
  const [resending, setResending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resendMessage, setResendMessage] = useState<string | null>(null)
  const [cooldown, setCooldown] = useState(0)

  // Pre-fill email from the sign-up step
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem("signup_email")
      if (saved) setEmail(saved)
    } catch {}
  }, [])

  // Cooldown timer for resend button
  useEffect(() => {
    if (cooldown > 0) {
      const t = setTimeout(() => setCooldown(cooldown - 1), 1000)
      return () => clearTimeout(t)
    }
  }, [cooldown])

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setResendMessage(null)
    const cleanEmail = email.trim().toLowerCase()
    if (!cleanEmail.includes("@")) {
      setError("اكتب البريد الإلكتروني الصحيح")
      return
    }
    if (!/^\d{6}$/.test(code.trim())) {
      setError("اكتب كود التحقق (٦ أرقام) اللى وصل على الإيميل.")
      return
    }
    try {
      setLoading(true)

      // Server-side verify + return tokens (avoids the v3.74.287 race
      // between verifyOtp and the next call on the browser).
      const res = await fetch("/api/verify-signup-with-code", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: cleanEmail, code: code.trim() }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data?.success) {
        setError(translateAuthError(data?.error || "فشل التحقق"))
        return
      }

      // Establish the session locally so /auth/callback sees the user.
      try {
        const supabase = createClient()
        if (data.access_token && data.refresh_token) {
          await supabase.auth.setSession({
            access_token: data.access_token,
            refresh_token: data.refresh_token,
          })
        }
      } catch {}

      // /auth/callback?auto=true sees the live session and runs
      // createCompanyFromMetadata (the company name + currency + language
      // stored at sign-up time).
      router.push("/auth/callback?type=signup&auto=true")
    } catch (e: any) {
      setError(translateAuthError(e?.message || "فشل التحقق"))
    } finally {
      setLoading(false)
    }
  }

  const handleResend = async () => {
    if (cooldown > 0) return
    const cleanEmail = email.trim().toLowerCase()
    if (!cleanEmail.includes("@")) {
      setError("اكتب بريدك الإلكترونى الأول.")
      return
    }
    setError(null)
    setResendMessage(null)
    try {
      setResending(true)
      const supabase = createClient()
      // supabase.auth.resend triggers Supabase's own email pipeline, which
      // uses our customized template (6-digit Token).
      const { error: rErr } = await supabase.auth.resend({
        type: "signup",
        email: cleanEmail,
      })
      if (rErr) {
        setError(translateAuthError(rErr.message))
        return
      }
      setResendMessage("✓ بعتنا كود جديد على بريدك. شوف الإيميل.")
      setCooldown(60)
    } catch (e: any) {
      setError(translateAuthError(e?.message || "فشل إعادة الإرسال"))
    } finally {
      setResending(false)
    }
  }

  return (
    <div className="flex min-h-screen w-full items-center justify-center p-6 md:p-10 bg-gradient-to-br from-green-50 via-blue-50 to-indigo-100 dark:from-slate-900 dark:to-slate-800">
      <div className="w-full max-w-md">
        <Card className="shadow-xl border-0">
          <CardHeader className="space-y-3 text-center pb-2">
            <div className="mx-auto w-16 h-16 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center">
              <Mail className="w-9 h-9 text-blue-600 dark:text-blue-400" />
            </div>
            <CardTitle className="text-2xl font-bold">
              تأكيد البريد الإلكترونى
            </CardTitle>
            <CardDescription className="text-base leading-relaxed">
              بعتنا كود تحقق من ٦ أرقام على بريدك. افتح الإيميل واكتب الكود تحت لإكمال إنشاء الحساب.
            </CardDescription>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleVerify} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">البريد الإلكترونى</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="example@company.com"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="text-left"
                  dir="ltr"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="code">كود التحقق (٦ أرقام)</Label>
                <Input
                  id="code"
                  type="text"
                  inputMode="numeric"
                  pattern="\d{6}"
                  maxLength={6}
                  placeholder="000000"
                  autoComplete="one-time-code"
                  required
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  className="text-center tracking-[0.5em] text-lg font-mono"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  لو ما وصلش الإيميل، شوف فى مجلد الـ Spam، أو اضغط "إعادة إرسال الكود" تحت.
                </p>
              </div>
              {error && (
                <div className="rounded-md border border-red-200 bg-red-50 dark:border-red-900/40 dark:bg-red-950/30 p-3 text-sm leading-relaxed text-red-700 dark:text-red-300 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}
              {resendMessage && (
                <div className="rounded-md border border-green-200 bg-green-50 dark:border-green-900/40 dark:bg-green-950/30 p-3 text-sm leading-relaxed text-green-700 dark:text-green-300 flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>{resendMessage}</span>
                </div>
              )}
              <Button type="submit" className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white" disabled={loading}>
                {loading ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    جارٍ التحقق...
                  </span>
                ) : (
                  "تأكيد وإكمال التسجيل"
                )}
              </Button>
              <div className="flex items-center justify-between text-sm pt-2">
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={resending || cooldown > 0}
                  className="text-blue-600 hover:underline disabled:text-gray-400 dark:text-blue-400 flex items-center gap-1"
                >
                  {resending ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <RefreshCw className="w-3 h-3" />
                  )}
                  {cooldown > 0
                    ? `إعادة الإرسال (${cooldown}ث)`
                    : resending
                      ? "جارٍ الإرسال..."
                      : "إعادة إرسال الكود"}
                </button>
                <Link href="/auth/login" className="text-gray-600 hover:underline dark:text-gray-400">
                  رجوع لصفحة الدخول
                </Link>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
