"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import Link from "next/link"
import { useState, useEffect } from "react"
import { CheckCircle2, Mail, Loader2, RefreshCw, AlertCircle } from "lucide-react"

export default function SignUpSuccessPage() {
  const [email, setEmail] = useState("")
  const [isResending, setIsResending] = useState(false)
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)
  const [cooldown, setCooldown] = useState(0)

  // Get email from sessionStorage if available
  useEffect(() => {
    const savedEmail = sessionStorage.getItem("signup_email")
    if (savedEmail) setEmail(savedEmail)
  }, [])

  // Cooldown timer
  useEffect(() => {
    if (cooldown > 0) {
      const timer = setTimeout(() => setCooldown(cooldown - 1), 1000)
      return () => clearTimeout(timer)
    }
  }, [cooldown])

  const handleResend = async () => {
    if (!email || cooldown > 0) return

    setIsResending(true)
    setMessage(null)

    try {
      const res = await fetch("/api/resend-confirmation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      })

      // Handle non-JSON responses
      const contentType = res.headers.get("content-type")
      if (!contentType || !contentType.includes("application/json")) {
        const textResponse = await res.text()
        console.error("Non-JSON response:", textResponse)
        setMessage({ type: "error", text: "خطأ في الخادم. يرجى المحاولة لاحقاً." })
        return
      }

      const data = await res.json()

      if (res.ok && data.ok) {
        setMessage({ type: "success", text: "✅ تم إرسال رابط التأكيد بنجاح! تحقق من بريدك الإلكتروني." })
        setCooldown(60) // 60 seconds cooldown
      } else if (data.confirmed) {
        setMessage({ type: "success", text: "✅ بريدك الإلكتروني مؤكد مسبقاً! يمكنك تسجيل الدخول الآن." })
      } else {
        // Show the actual error message from API
        const errorMsg = data.error || "فشل إرسال رابط التأكيد"
        setMessage({ type: "error", text: errorMsg })
      }
    } catch (err: any) {
      console.error("Resend confirmation fetch error:", err)
      // More descriptive error message
      const errorMessage = err?.message || "حدث خطأ في الاتصال"
      setMessage({ type: "error", text: `${errorMessage}. تأكد من اتصالك بالإنترنت.` })
    } finally {
      setIsResending(false)
    }
  }

  return (
    <div className="flex min-h-screen w-full items-center justify-center p-6 md:p-10 bg-gradient-to-br from-green-50 via-blue-50 to-indigo-100 dark:from-slate-900 dark:to-slate-800">
      <div className="w-full max-w-md">
        <Card className="shadow-xl border-0">
          <CardHeader className="space-y-4 text-center pb-2">
            <div className="mx-auto w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
              <CheckCircle2 className="w-10 h-10 text-green-600 dark:text-green-400" />
            </div>
            <CardTitle className="text-2xl font-bold text-green-600 dark:text-green-400">
              تم إنشاء الحساب بنجاح! 🎉
            </CardTitle>
            <CardDescription className="text-base">
              تم إرسال رابط التأكيد إلى بريدك الإلكتروني
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6 pt-4">
            {/* Instructions */}
            <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-xl border border-blue-100 dark:border-blue-800">
              <div className="flex gap-3">
                <Mail className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-blue-800 dark:text-blue-300 space-y-1">
                  <p className="font-medium">يرجى التحقق من بريدك الإلكتروني</p>
                  <p className="text-blue-600 dark:text-blue-400">
                    قد يستغرق وصول البريد بعض الدقائق. تحقق أيضاً من مجلد الرسائل غير المرغوب فيها (Spam).
                  </p>
                </div>
              </div>
            </div>

            {/* Resend Section */}
            <div className="space-y-3">
              <p className="text-sm text-gray-600 dark:text-gray-400 text-center">
                لم تستلم البريد؟ أدخل بريدك الإلكتروني لإعادة الإرسال:
              </p>
              <div className="flex gap-2">
                <Input
                  type="email"
                  placeholder="أدخل بريدك الإلكتروني"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="flex-1"
                  dir="ltr"
                />
                <Button
                  onClick={handleResend}
                  disabled={!email || isResending || cooldown > 0}
                  variant="outline"
                  className="gap-2"
                >
                  {isResending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <RefreshCw className="w-4 h-4" />
                  )}
                  {cooldown > 0 ? `${cooldown}s` : "إعادة إرسال"}
                </Button>
              </div>
            </div>

            {/* Status Message */}
            {message && (
              <div className={`p-3 rounded-lg text-sm flex items-start gap-2 ${
                message.type === "success"
                  ? "bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400"
                  : "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400"
              }`}>
                {message.type === "success" ? (
                  <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                )}
                {message.text}
              </div>
            )}

            {/* Login Link */}
            <Link href="/auth/login" className="block">
              <Button className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white">
                العودة لتسجيل الدخول
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
