"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { createClient } from "@/lib/supabase/client"

// v3.74.279 - translate the most common Supabase auth errors so the
// user sees a clear Arabic explanation instead of "Auth session missing!"
function translateAuthError(msg: string): string {
  const lower = (msg || "").toLowerCase()
  if (lower.includes("session missing") || lower.includes("session_not_found")) {
    return "انتهت صلاحية رابط إعادة تعيين كلمة المرور. اطلب رابط جديد من صفحة الدخول."
  }
  if (lower.includes("password should be") || lower.includes("weak password")) {
    return "كلمة المرور ضعيفة. استخدم 8 أحرف على الأقل وامزج بين الحروف والأرقام."
  }
  if (lower.includes("same as the old") || lower.includes("same_password")) {
    return "كلمة المرور الجديدة لازم تكون مختلفة عن القديمة."
  }
  return msg
}

export default function ForceChangePasswordPage() {
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [sessionReady, setSessionReady] = useState(false)
  const [sessionError, setSessionError] = useState<string | null>(null)
  const [bootstrapping, setBootstrapping] = useState(true)

  useEffect(() => {
    let cancelled = false
    const bootstrap = async () => {
      try {
        const supabase = createClient()
        const params = new URLSearchParams(window.location.search)
        const code = params.get("code")
        if (code) {
          const { error: exchErr } = await supabase.auth.exchangeCodeForSession(code)
          if (exchErr) {
            if (cancelled) return
            setSessionError(translateAuthError(exchErr.message))
            setBootstrapping(false)
            return
          }
          try {
            const url = new URL(window.location.href)
            url.searchParams.delete("code")
            window.history.replaceState({}, "", url.toString())
          } catch { /* ignore */ }
        }
        const { data: { session } } = await supabase.auth.getSession()
        if (cancelled) return
        if (session) {
          setSessionReady(true)
        } else {
          await new Promise(r => setTimeout(r, 500))
          const { data: { session: s2 } } = await supabase.auth.getSession()
          if (cancelled) return
          if (s2) setSessionReady(true)
          else setSessionError(translateAuthError("Auth session missing"))
        }
      } catch (e: any) {
        if (cancelled) return
        setSessionError(translateAuthError(e?.message || "تعذّر إنشاء الجلسة"))
      } finally {
        if (!cancelled) setBootstrapping(false)
      }
    }
    bootstrap()
    return () => { cancelled = true }
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (password.length < 8) { setError("الحد الأدنى 8 أحرف"); return }
    if (password !== confirm) { setError("كلمتا المرور غير متطابقتين"); return }
    setLoading(true)
    try {
      let cidForRedirect = ""
      const supabase = createClient()
      const { error: updErr } = await supabase.auth.updateUser({ password, data: { must_change_password: false } as any })
      if (updErr) { setError(translateAuthError(updErr.message)); return }
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (user?.email && user?.id) {
          const res = await fetch("/api/accept-membership", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: user.email, userId: user.id }) })
          const js = await res.json()
          const cid = String(js?.companyId || "")
          if (res.ok && cid && typeof window !== "undefined") {
            cidForRedirect = cid
            try { localStorage.setItem("active_company_id", cid) } catch {}
            try { document.cookie = `active_company_id=${cid}; path=/; max-age=31536000` } catch {}
          }
        }
      } catch {}

      const waitForBootstrap = (): Promise<void> => {
        return new Promise((resolve) => {
          if (typeof window !== "undefined") {
            const handler = () => { window.removeEventListener("bootstrap_complete", handler); resolve() }
            window.addEventListener("bootstrap_complete", handler)
            setTimeout(() => { window.removeEventListener("bootstrap_complete", handler); resolve() }, 5000)
          } else { resolve() }
        })
      }
      await waitForBootstrap()

      try {
        const res = await fetch("/api/first-allowed-page")
        const data = await res.json()
        const url = data.path || (cidForRedirect ? `/dashboard?cid=${cidForRedirect}` : "/dashboard")
        window.location.href = url
      } catch {
        window.location.href = cidForRedirect ? `/dashboard?cid=${cidForRedirect}` : "/dashboard"
      }
    } finally { setLoading(false) }
  }

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
      <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 overflow-x-hidden">
        <Card>
          <CardHeader>
            <CardTitle>تغيير كلمة المرور</CardTitle>
          </CardHeader>
          <CardContent>
            {bootstrapping ? (
              <p className="text-sm text-gray-600 dark:text-gray-400">جارٍ التحقق من الرابط...</p>
            ) : sessionError ? (
              <div className="space-y-3 max-w-md">
                <div className="rounded-md border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-950/30 p-3 text-sm text-red-700 dark:text-red-300 leading-relaxed">
                  {sessionError}
                </div>
                <Button onClick={() => { window.location.href = "/auth/login" }} variant="outline">
                  الرجوع لصفحة الدخول
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4 max-w-md">
                <div>
                  <Label>كلمة المرور الجديدة</Label>
                  <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
                </div>
                <div>
                  <Label>تأكيد كلمة المرور</Label>
                  <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
                </div>
                {error && <p className="text-sm text-red-600 leading-relaxed">{error}</p>}
                <Button type="submit" disabled={loading || !sessionReady}>{loading ? "جاري الحفظ..." : "حفظ"}</Button>
              </form>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
