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
// v3.74.838 — نصوص هذه الشاشة باللغة المختارة. كانت عربية ثابتة، فمَن اختار
// الإنجليزية عند التسجيل يُواجَه بعربية لا يقرأها فى أحرج شاشة فى المنتج.
type Lang = "ar" | "en"

function readLang(): Lang {
  try {
    const v =
      localStorage.getItem("app_language") ||
      localStorage.getItem("pending_language") ||
      ""
    return v.toLowerCase().startsWith("en") ? "en" : "ar"
  } catch {
    return "ar"
  }
}

const T = {
  ar: {
    expired:
      "انتهت صلاحية الكود. اطلب كود جديد — ولو حسابك مؤكَّد بالفعل فلن يُرسل كود، استخدم «تسجيل الدخول» تحت.",
    invalidCode: "الكود اللى كتبته مش صحيح. تأكد منه أو اطلب كود جديد.",
    tooMany: "محاولات كتير فى وقت قصير. استنى دقيقة وحاول تانى.",
    resendFailed: "فشل إعادة الإرسال",
    verifyFailed: "فشل التحقق",
    typeEmailFirst: "اكتب بريدك الإلكترونى الأول.",
    // الحالة القاطعة: حسابه مؤكَّد فعلاً
    alreadyConfirmed:
      "حسابك مؤكَّد بالفعل ✅ ومش محتاج أى كود. سجّل الدخول ببريدك وكلمة المرور، وهتلاقى شاشة إنشاء الشركة.",
    // الحالة غير القاطعة: لم نعرف الحالة (بلا مفتاح خدمة أو حدّ معدّل)
    sentAmbiguous:
      "لو بريدك غير مؤكَّد، وصلك كود جديد الآن — شوف الإيميل ومجلد الـ Spam. ولو حسابك مؤكَّد بالفعل فلن يُرسل كود؛ استخدم «تسجيل الدخول» تحت.",
    sentPending: "✓ بعتنا كود جديد على بريدك. شوف الإيميل ومجلد الـ Spam.",
    signInExit: "عندى حساب مؤكَّد بالفعل — تسجيل الدخول",
    goSignIn: "اذهب لتسجيل الدخول",
    title: "تأكيد البريد الإلكترونى",
    subtitle:
      "بعتنا كود تحقق من ٦ أرقام على بريدك. افتح الإيميل واكتب الكود تحت لإكمال إنشاء الحساب.",
    emailLabel: "البريد الإلكترونى",
    codeLabel: "كود التحقق (٦ أرقام)",
    spamHint: 'لو ما وصلش الإيميل، شوف فى مجلد الـ Spam، أو اضغط "إعادة إرسال الكود" تحت.',
    verifying: "جارٍ التحقق...",
    submit: "تأكيد وإكمال التسجيل",
    resendIn: (s: number) => `إعادة الإرسال (${s}ث)`,
    sending: "جارٍ الإرسال...",
    resend: "إعادة إرسال الكود",
    backToLogin: "رجوع لصفحة الدخول",
  },
  en: {
    expired:
      "That code has expired. Request a new one — and if your account is already confirmed no code will be sent, so use “Sign in” below.",
    invalidCode: "That code is not correct. Check it or request a new one.",
    tooMany: "Too many attempts in a short time. Wait a minute and try again.",
    resendFailed: "Could not resend",
    verifyFailed: "Verification failed",
    typeEmailFirst: "Enter your email address first.",
    alreadyConfirmed:
      "Your account is already confirmed ✅ and needs no code. Sign in with your email and password, and you will land on the create-company screen.",
    sentAmbiguous:
      "If your address is not yet confirmed, a new code has just been sent — check your inbox and Spam folder. If your account is already confirmed no code will be sent; use “Sign in” below.",
    sentPending: "✓ A new code has been sent to your inbox. Check Spam too.",
    signInExit: "I already have a confirmed account — sign in",
    goSignIn: "Go to sign in",
    title: "Confirm your email",
    subtitle:
      "We sent a 6-digit verification code to your inbox. Open the email and enter the code below to finish creating your account.",
    emailLabel: "Email address",
    codeLabel: "Verification code (6 digits)",
    spamHint: 'If the email has not arrived, check your Spam folder or press “Resend code” below.',
    verifying: "Verifying...",
    submit: "Confirm and finish signing up",
    resendIn: (s: number) => `Resend in ${s}s`,
    sending: "Sending...",
    resend: "Resend code",
    backToLogin: "Back to sign in",
  },
} as const

function translateAuthError(msg: string, lang: Lang = "ar"): string {
  const t = T[lang]
  const lower = (msg || "").toLowerCase()
  // v3.74.837 — «اطلب كود جديد» وحدها تُغرِق مَن حسابه مؤكَّد بالفعل: لن يصله
  // كود أبداً لأنه لا يوجد ما يُؤكَّد، فيُعيد المحاولة بلا نهاية. تُذكر له
  // مخرَجه فى نفس الرسالة.
  if (lower.includes("token has expired") || lower.includes("expired") || lower.includes("otp_expired")) {
    return t.expired
  }
  if (lower.includes("invalid") && (lower.includes("token") || lower.includes("otp") || lower.includes("code"))) {
    return t.invalidCode
  }
  if (lower.includes("rate") || lower.includes("too many")) {
    return t.tooMany
  }
  return msg
}

/**
 * v3.74.838 — هل هذا البريد مؤكَّد بالفعل؟
 * تُرجع "confirmed" | "pending" | "unknown". و"unknown" تعنى أننا لم نعرف
 * (حدّ معدّل أو بلا مفتاح خدمة) — فتُستخدم الرسالة الغامضة الصادقة بدل
 * تخمين حالة قد تكون خاطئة.
 */
async function fetchEmailState(email: string): Promise<"confirmed" | "pending" | "unknown"> {
  try {
    const res = await fetch("/api/auth/email-state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    })
    const json = await res.json().catch(() => null)
    const state = json?.state
    return state === "confirmed" ? "confirmed" : state === "pending" ? "pending" : "unknown"
  } catch {
    return "unknown"
  }
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
  const [lang, setLang] = useState<Lang>("ar")
  // v3.74.838 — الحالة القاطعة: حسابه مؤكَّد فعلاً فلا كود سيُرسل له أبداً.
  const [alreadyConfirmed, setAlreadyConfirmed] = useState(false)
  const t = T[lang]

  // Pre-fill email from the sign-up step
  useEffect(() => {
    setLang(readLang())
    try {
      const saved = sessionStorage.getItem("signup_email")
      if (saved) setEmail(saved)
    } catch {}
  }, [])

  // v3.74.838 — يُفحص البريد مرة عند فتح الشاشة: مَن حسابه مؤكَّد يعرف ذلك
  // **قبل** أن يطلب كوداً ويجلس ينتظره. (عميل حقيقى انتظر ٢٥ دقيقة.)
  useEffect(() => {
    const e = email.trim().toLowerCase()
    if (!e.includes("@")) return
    let cancelled = false
    void (async () => {
      const state = await fetchEmailState(e)
      if (!cancelled && state === "confirmed") setAlreadyConfirmed(true)
    })()
    return () => { cancelled = true }
  }, [email])

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
      setError(translateAuthError(e?.message || t.verifyFailed, lang))
    } finally {
      setLoading(false)
    }
  }

  const handleResend = async () => {
    if (cooldown > 0) return
    const cleanEmail = email.trim().toLowerCase()
    if (!cleanEmail.includes("@")) {
      setError(t.typeEmailFirst)
      return
    }
    setError(null)
    setResendMessage(null)
    try {
      setResending(true)
      const supabase = createClient()
      // supabase.auth.resend triggers Supabase's own email pipeline, which
      // uses our customized template (6-digit Token).
      // v3.74.838 — تُفحص الحالة **قبل** الإرسال. فلو كان مؤكَّداً فلا معنى
      // لطلب إرسال لن يحدث، ولا لرسالة تُوهمه أنه حدث.
      const state = await fetchEmailState(cleanEmail)
      if (state === "confirmed") {
        setAlreadyConfirmed(true)
        setResendMessage(t.alreadyConfirmed)
        return
      }

      const { error: rErr } = await supabase.auth.resend({
        type: "signup",
        email: cleanEmail,
      })
      if (rErr) {
        setError(translateAuthError(rErr.message, lang))
        return
      }
      // v3.74.837 — لا تُعلن نجاحاً لم يحدث.
      // `supabase.auth.resend({type:'signup'})` **لا تُرجع خطأً** لحساب مؤكَّد
      // بالفعل — ولا تُرسل شيئاً كذلك (لا يوجد ما يُؤكَّد، وSupabase تتعمّد ألا
      // تكشف وجود البريد). وكانت الشاشة تقول «✓ بعتنا كود جديد» فى الحالتين،
      // فترك عميلاً حقيقياً ينتظر بريداً لن يأتى ويُعيد المحاولة، بعد أن كان
      // حسابه مؤكَّداً منذ دقائق وكل ما يحتاجه هو تسجيل الدخول.
      // الرسالة تُغطّى الحالتين بصدق، بلا كشف وجود البريد لمن يُجرّب بريد غيره.
      // `state === "pending"` تعنى: غير مؤكَّد (أو غير موجود) ⇒ الإرسال حقيقى.
      // و`"unknown"` تعنى أننا لم نعرف ⇒ الرسالة الغامضة الصادقة، لا تخمين.
      setResendMessage(state === "pending" ? t.sentPending : t.sentAmbiguous)
      setCooldown(60)
    } catch (e: any) {
      setError(translateAuthError(e?.message || t.resendFailed, lang))
    } finally {
      setResending(false)
    }
  }

  return (
    <div
      dir={lang === "en" ? "ltr" : "rtl"}
      className="flex min-h-screen w-full items-center justify-center p-6 md:p-10 bg-gradient-to-br from-green-50 via-blue-50 to-indigo-100 dark:from-slate-900 dark:to-slate-800"
    >
      <div className="w-full max-w-md">
        <Card className="shadow-xl border-0">
          <CardHeader className="space-y-3 text-center pb-2">
            <div className="mx-auto w-16 h-16 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center">
              <Mail className="w-9 h-9 text-blue-600 dark:text-blue-400" />
            </div>
            <CardTitle className="text-2xl font-bold">{t.title}</CardTitle>
            <CardDescription className="text-base leading-relaxed">
              {t.subtitle}
            </CardDescription>
          </CardHeader>

          <CardContent>
            {/* v3.74.838 — الحالة القاطعة تُعلَن **أعلى الشاشة وقبل النموذج**،
                لا كسطر بعد الضغط على «إعادة الإرسال». عميل حقيقى ظلّ ٢٥ دقيقة
                يطلب كوداً وحسابه مؤكَّد، ولم يفتح صفحة الدخول ولا مرة. */}
            {alreadyConfirmed && (
              <div className="mb-4 rounded-md border border-green-300 bg-green-50 dark:border-green-800 dark:bg-green-950/40 p-4 text-sm leading-relaxed text-green-800 dark:text-green-200 flex items-start gap-2">
                <CheckCircle2 className="w-5 h-5 flex-shrink-0 mt-0.5" />
                <span className="font-medium">{t.alreadyConfirmed}</span>
              </div>
            )}
            <form onSubmit={handleVerify} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">{t.emailLabel}</Label>
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
                <Label htmlFor="code">{t.codeLabel}</Label>
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
                <p className="text-xs text-gray-500 dark:text-gray-400">{t.spamHint}</p>
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
                    {t.verifying}
                  </span>
                ) : (
                  t.submit
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
                    ? t.resendIn(cooldown)
                    : resending
                      ? t.sending
                      : t.resend}
                </button>
                <Link href="/auth/login" className="text-gray-600 hover:underline dark:text-gray-400">
                  {t.backToLogin}
                </Link>
              </div>

              {/* v3.74.837/838 — المخرج الظاهر لمن حسابه مؤكَّد بالفعل.
                  كان الرابط الرمادى الصغير هو المخرج الوحيد، فبقى عميل حقيقى
                  يطلب كوداً لن يُرسَل — وحسابه مؤكَّد وكل ما يحتاجه الدخول.
                  ولو عرفنا الحالة قاطعةً يصير المخرج زراً أساسياً لا ثانوياً. */}
              <Link
                href="/auth/login"
                className={
                  alreadyConfirmed
                    ? "mt-2 flex w-full items-center justify-center rounded-md bg-green-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-green-700"
                    : "mt-2 flex w-full items-center justify-center rounded-md border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
                }
              >
                {alreadyConfirmed ? t.goSignIn : t.signInExit}
              </Link>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
