"use client"

import { Suspense, useEffect, useState } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { Sidebar } from "@/components/sidebar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useSupabase } from "@/lib/supabase/hooks"
import { useToast } from "@/hooks/use-toast"
import { Building2, UserPlus, Lock, Mail, CheckCircle2, Eye, EyeOff, Loader2, AlertTriangle } from "lucide-react"

function AcceptInvitationsContent() {
  const supabase = useSupabase()
  const { toast } = useToast()
  const [invites, setInvites] = useState<Array<{ id: string; company_id: string; email: string; role: string; expires_at: string }>>([])
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(false)
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [invitationDetails, setInvitationDetails] = useState<{company_name: string, role: string, email: string} | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [errorType, setErrorType] = useState<string | null>(null)
  const [expiredEmail, setExpiredEmail] = useState<string | null>(null)
  const [expiredCompany, setExpiredCompany] = useState<string | null>(null)
  const params = useSearchParams()
  const router = useRouter()
  const token = params?.get("token") || ""

  // Fetch invitation details when token is provided
  useEffect(() => {
    ;(async () => {
      try {
        setLoading(true)
        setError(null)
        setErrorType(null)

        // Check if user is logged in
        const { data: { user } } = await supabase.auth.getUser()
        setIsLoggedIn(!!user)

        if (token) {
          // Get invitation details from API (bypasses RLS)
          try {
            const res = await fetch("/api/get-invitation", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ token })
            })

            let data
            try {
              const text = await res.text()
              data = text ? JSON.parse(text) : {}
            } catch (parseErr) {
              console.error("Failed to parse response:", parseErr)
              setErrorType('parse_error')
              setError("حدث خطأ في معالجة الاستجابة")
              return
            }

            if (!res.ok) {
              setErrorType(data.error || 'invalid')
              setError(data.message || "رابط الدعوة غير صالح")
              if (data.email) setExpiredEmail(data.email)
              if (data.company_name) setExpiredCompany(data.company_name)
              return
            }

            if (data.invitation) {
              setInvitationDetails({
                company_name: data.invitation.company_name,
                role: data.invitation.role,
                email: data.invitation.email
              })
            } else {
              setErrorType('invalid')
              setError("رابط الدعوة غير صالح")
            }
          } catch (fetchErr) {
            console.error("Fetch error:", fetchErr)
            setErrorType('network_error')
            setError("حدث خطأ في الاتصال بالخادم")
          }
        } else if (user) {
          // No token, user is logged in - show their pending invitations
          const { data } = await supabase
            .from("company_invitations")
            .select("id, company_id, email, role, expires_at, branch_id, cost_center_id, warehouse_id, companies(name)")
            .eq("email", user.email?.toLowerCase())
            .eq("accepted", false)
            .gt("expires_at", new Date().toISOString())
          setInvites((data || []) as any)
        }
      } catch (e: any) {
        setError(e.message || "حدث خطأ")
      } finally {
        setLoading(false)
      }
    })()
  }, [supabase, token])

  // Accept invitation for logged-in user
  const accept = async (inv: any) => {
    try {
      setProcessing(true)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { toast({ title: "يرجى تسجيل الدخول" }); return }

      // Include branch, cost center, and warehouse from invitation
      const memberData: any = {
        company_id: inv.company_id,
        user_id: user.id,
        role: inv.role,
        email: user.email,
        branch_id: inv.branch_id || null,
        cost_center_id: inv.cost_center_id || null,
        warehouse_id: inv.warehouse_id || null
      }

      const { error } = await supabase
        .from("company_members")
        .insert(memberData)
      if (error) { toast({ title: "تعذر القبول", description: error.message, variant: "destructive" }); return }
      await supabase.from("company_invitations").update({ accepted: true }).eq("id", inv.id)

      // Set active company
      try {
        localStorage.setItem('active_company_id', inv.company_id)
        document.cookie = `active_company_id=${inv.company_id}; path=/; max-age=31536000`
      } catch {}

      toast({ title: "تم الانضمام إلى الشركة بنجاح!" })
      router.push("/dashboard")
    } finally { setProcessing(false) }
  }

  // Accept invitation for new user (with token)
  const handleAutoAccept = async () => {
    try {
      setError(null)

      // Validate passwords
      if (!password || password.length < 6) {
        setError("كلمة المرور يجب أن تكون 6 أحرف على الأقل")
        return
      }
      if (password !== confirmPassword) {
        setError("كلمتا المرور غير متطابقتين")
        return
      }

      setProcessing(true)
      const res = await fetch("/api/accept-invite", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, password })
      })
      const js = await res.json()

      if (!res.ok) {
        setError(js?.error || "فشل في قبول الدعوة")
        return
      }

      const email = js.email
      const companyId = js.company_id

      // Sign in the user
      const { error: signErr } = await supabase.auth.signInWithPassword({ email, password })
      if (signErr) {
        setError("تم إنشاء الحساب ولكن تعذر تسجيل الدخول: " + signErr.message)
        return
      }

      // Set active company
      try {
        localStorage.setItem('active_company_id', companyId)
        document.cookie = `active_company_id=${companyId}; path=/; max-age=31536000`
      } catch {}

      toast({ title: "تم قبول الدعوة وتسجيل الدخول بنجاح!" })
      router.push("/dashboard")
    } finally { setProcessing(false) }
  }

  // If token provided, show standalone invitation acceptance page
  if (token) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center p-4 md:p-10 bg-gradient-to-br from-violet-50 via-blue-50 to-indigo-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-800">
        <div className="w-full max-w-md">
          {/* Logo/Brand */}
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-violet-600 to-purple-700 rounded-2xl shadow-lg shadow-violet-500/30 mb-4">
              <UserPlus className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">قبول دعوة الانضمام</h1>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">انضم إلى فريق عملك</p>
          </div>

          <Card className="shadow-xl border-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm">
            <CardContent className="pt-6">
              {loading ? (
                <div className="text-center py-8">
                  <Loader2 className="w-8 h-8 animate-spin text-violet-600 mx-auto mb-4" />
                  <p className="text-gray-600 dark:text-gray-400">جاري تحميل تفاصيل الدعوة...</p>
                </div>
              ) : error ? (
                <div className="text-center py-8">
                  <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
                  <p className="text-red-600 dark:text-red-400 mb-2">{error}</p>

                  {errorType === 'expired' && expiredEmail && (
                    <div className="mt-4 p-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
                      <p className="text-sm text-amber-700 dark:text-amber-300 mb-3">
                        يرجى التواصل مع مسؤول {expiredCompany || 'الشركة'} لإعادة إرسال دعوة جديدة إلى:
                      </p>
                      <p className="text-sm font-medium text-gray-900 dark:text-white bg-white dark:bg-slate-800 p-2 rounded border">
                        {expiredEmail}
                      </p>
                    </div>
                  )}

                  {errorType === 'accepted' && (
                    <div className="mt-4 p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                      <p className="text-sm text-green-700 dark:text-green-300">
                        يمكنك تسجيل الدخول بحسابك الحالي للوصول إلى الشركة
                      </p>
                    </div>
                  )}

                  <Button
                    variant="outline"
                    className="mt-4"
                    onClick={() => router.push("/auth/login")}
                  >
                    {errorType === 'accepted' ? 'تسجيل الدخول' : 'العودة لتسجيل الدخول'}
                  </Button>
                </div>
              ) : invitationDetails ? (
                <div className="space-y-6">
                  {/* Invitation details */}
                  <div className="p-4 bg-violet-50 dark:bg-violet-900/20 rounded-lg border border-violet-200 dark:border-violet-800">
                    <div className="flex items-center gap-3 mb-3">
                      <Building2 className="w-8 h-8 text-violet-600" />
                      <div>
                        <p className="text-sm text-gray-600 dark:text-gray-400">تمت دعوتك للانضمام إلى:</p>
                        <p className="font-bold text-lg text-gray-900 dark:text-white">{invitationDetails.company_name}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-gray-600 dark:text-gray-400">الصلاحية:</span>
                      <span className="px-2 py-1 bg-violet-100 dark:bg-violet-800 text-violet-700 dark:text-violet-200 rounded font-medium">
                        {invitationDetails.role === 'owner' ? 'مالك' :
                         invitationDetails.role === 'admin' ? 'مدير' :
                         invitationDetails.role === 'accountant' ? 'محاسب' :
                         invitationDetails.role === 'viewer' ? 'مشاهد' : invitationDetails.role}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-sm mt-2">
                      <Mail className="w-4 h-4 text-gray-500" />
                      <span className="text-gray-600 dark:text-gray-400">{invitationDetails.email}</span>
                    </div>
                  </div>

                  {/* Password form */}
                  <div className="space-y-4">
                    <p className="text-sm text-gray-600 dark:text-gray-400 text-center">
                      أدخل كلمة مرور لإنشاء حسابك والانضمام للشركة
                    </p>

                    <div className="space-y-2">
                      <Label htmlFor="password" className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                        <Lock className="w-4 h-4" />
                        كلمة المرور
                      </Label>
                      <div className="relative">
                        <Input
                          id="password"
                          type={showPassword ? "text" : "password"}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          className="h-11 bg-gray-50 dark:bg-slate-800 border-gray-200 dark:border-slate-700 pr-10"
                          placeholder="أدخل كلمة مرور قوية"
                        />
                        <button
                          type="button"
                          className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"
                          onClick={() => setShowPassword(!showPassword)}
                        >
                          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="confirmPassword" className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                        <CheckCircle2 className="w-4 h-4" />
                        تأكيد كلمة المرور
                      </Label>
                      <Input
                        id="confirmPassword"
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="h-11 bg-gray-50 dark:bg-slate-800 border-gray-200 dark:border-slate-700"
                        placeholder="أعد إدخال كلمة المرور"
                      />
                    </div>

                    {error && (
                      <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
                      </div>
                    )}

                    <Button
                      onClick={handleAutoAccept}
                      disabled={processing || !password || !confirmPassword}
                      className="w-full h-11 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700"
                    >
                      {processing ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin mr-2" />
                          جاري الانضمام...
                        </>
                      ) : (
                        <>
                          <UserPlus className="w-4 h-4 mr-2" />
                          قبول الدعوة والانضمام
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  // For logged-in users without token - show list of pending invitations
  return (
    <div className="flex min-h-screen bg-gray-50 dark:bg-slate-950">
      <Sidebar />
      <main className="flex-1 md:mr-64 p-4 md:p-8 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">الدعوات المعلقة</h1>
          <span className="text-sm text-gray-500 dark:text-gray-400">الانضمام إلى الشركات عبر الدعوات</span>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>دعواتك</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-violet-600 mx-auto mb-2" />
                <p className="text-gray-500 dark:text-gray-400">جاري التحميل...</p>
              </div>
            ) : invites.length === 0 ? (
              <div className="text-center py-8">
                <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-4" />
                <p className="text-gray-500 dark:text-gray-400">لا توجد دعوات معلقة حالياً</p>
              </div>
            ) : (
              <div className="space-y-3">
                {invites.map((inv: any) => (
                  <div key={inv.id} className="flex items-center justify-between p-4 border rounded-lg bg-gray-50 dark:bg-slate-800">
                    <div className="flex items-center gap-3">
                      <Building2 className="w-8 h-8 text-violet-600" />
                      <div>
                        <div className="font-medium text-gray-900 dark:text-white">
                          {inv.companies?.name || inv.company_id}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          الدور: <span className="font-medium">{inv.role}</span> • ينتهي: {new Date(inv.expires_at).toLocaleDateString('ar')}
                        </div>
                      </div>
                    </div>
                    <Button onClick={() => accept(inv)} disabled={processing}>
                      {processing ? <Loader2 className="w-4 h-4 animate-spin" /> : 'قبول'}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
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