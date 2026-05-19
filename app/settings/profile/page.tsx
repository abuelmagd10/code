"use client"

import { useState, useEffect } from "react"
import { CompanyHeader } from "@/components/company-header"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { useToast } from "@/hooks/use-toast"
import { Loader2, User, AtSign, Check, X, Settings, Link2 } from "lucide-react"
import { useSupabase } from "@/lib/supabase/hooks"
import { getActiveCompanyId } from "@/lib/company"

export default function ProfilePage() {
  const { toast } = useToast()
  const supabase = useSupabase()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [checkingUsername, setCheckingUsername] = useState(false)
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null)
  const [usernameError, setUsernameError] = useState<string | null>(null)
  const [linkedEmployeeName, setLinkedEmployeeName] = useState<string | null>(null)

  const [profile, setProfile] = useState({
    username: "",
    display_name: "",
    phone: "",
    bio: "",
    email: ""
  })
  const [originalUsername, setOriginalUsername] = useState("")

  useEffect(() => {
    loadProfile()
  }, [])

  const loadProfile = async () => {
    try {
      const res = await fetch("/api/user-profile")
      if (res.ok) {
        const data = await res.json()
        setProfile({
          username: data.profile?.username || "",
          display_name: data.profile?.display_name || "",
          phone: data.profile?.phone || "",
          bio: data.profile?.bio || "",
          email: data.email || ""
        })
        setOriginalUsername(data.profile?.username || "")
      }

      // Check if user is linked to an employee
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const cid = await getActiveCompanyId(supabase)
        if (cid) {
          const { data: member } = await supabase
            .from("company_members")
            .select("employee_id")
            .eq("company_id", cid)
            .eq("user_id", user.id)
            .not("employee_id", "is", null)
            .maybeSingle()

          if (member?.employee_id) {
            const { data: emp } = await supabase
              .from("employees")
              .select("full_name")
              .eq("id", member.employee_id)
              .maybeSingle()
            setLinkedEmployeeName(emp?.full_name || "موظف مرتبط")
          }
        }
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  // التحقق من توفر username عند الكتابة
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (profile.username && profile.username !== originalUsername) {
        setCheckingUsername(true)
        setUsernameError(null)
        try {
          const res = await fetch("/api/user-profile", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username: profile.username })
          })
          const data = await res.json()
          setUsernameAvailable(data.available)
          setUsernameError(data.available ? null : data.error)
        } catch {
          setUsernameAvailable(null)
        } finally {
          setCheckingUsername(false)
        }
      } else {
        setUsernameAvailable(null)
        setUsernameError(null)
      }
    }, 500)
    return () => clearTimeout(timer)
  }, [profile.username, originalUsername])

  const handleSave = async () => {
    if (usernameError) {
      toast({ title: "خطأ", description: usernameError, variant: "destructive" })
      return
    }
    
    setSaving(true)
    try {
      // 🔐 If linked to employee, don't send display_name (managed by employee record)
      const payload: Record<string, string> = {
        username: profile.username,
        phone: profile.phone,
        bio: profile.bio,
      }
      if (!linkedEmployeeName) {
        payload.display_name = profile.display_name
      }

      const res = await fetch("/api/user-profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      })
      const data = await res.json()
      
      if (!res.ok) {
        throw new Error(data.error || "حدث خطأ")
      }
      
      toast({ title: "تم الحفظ", description: "تم تحديث الملف الشخصي بنجاح" })
      setOriginalUsername(profile.username)
      // إرسال حدث لتحديث الـ sidebar
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('profile_updated'))
      }
    } catch (err: unknown) {
      toast({ 
        title: "خطأ", 
        description: err instanceof Error ? err.message : "حدث خطأ", 
        variant: "destructive" 
      })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
        <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 overflow-x-hidden">
          <div className="flex items-center justify-center min-h-[60vh]">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
      {/* Main Content - تحسين للهاتف */}
      <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 overflow-x-hidden">
        <div className="space-y-4 sm:space-y-6 max-w-full">
          <CompanyHeader />
          {/* رأس الصفحة - تحسين للهاتف */}
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="p-2 sm:p-3 rounded-lg sm:rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 shadow-lg">
              <Settings className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-gray-800 dark:text-gray-100">الملف الشخصي</h1>
              <p className="text-muted-foreground text-sm">إدارة معلومات حسابك</p>
            </div>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                المعلومات الأساسية
              </CardTitle>
              <CardDescription>هذه المعلومات تظهر للمستخدمين الآخرين</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* البريد الإلكتروني (للقراءة فقط) */}
              <div className="space-y-2">
                <Label>البريد الإلكتروني</Label>
                <Input value={profile.email} disabled className="bg-muted" />
                <p className="text-xs text-muted-foreground">لا يمكن تغيير البريد الإلكتروني</p>
              </div>

              {/* اسم المستخدم */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <AtSign className="h-4 w-4" />
                  اسم المستخدم (Username)
                </Label>
                <div className="relative">
                  <Input
                    value={profile.username}
                    onChange={(e) => setProfile(p => ({ ...p, username: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') }))}
                    placeholder="username"
                    dir="ltr"
                    className="pl-8"
                  />
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">@</span>
                  {checkingUsername && (
                    <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin" />
                  )}
                  {!checkingUsername && usernameAvailable === true && (
                    <Check className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-green-500" />
                  )}
                  {!checkingUsername && usernameAvailable === false && (
                    <X className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-red-500" />
                  )}
                </div>
                {usernameError && <p className="text-xs text-red-500">{usernameError}</p>}
                <p className="text-xs text-muted-foreground">
                  يمكنك استخدام الأحرف الإنجليزية الصغيرة والأرقام والشرطة السفلية فقط (3-30 حرف)
                </p>
              </div>

              {/* الاسم الظاهر */}
              <div className="space-y-2">
                <Label>الاسم الظاهر</Label>
                <Input
                  value={profile.display_name}
                  onChange={(e) => setProfile(p => ({ ...p, display_name: e.target.value }))}
                  placeholder="أحمد محمد"
                  disabled={!!linkedEmployeeName}
                  className={linkedEmployeeName ? "bg-muted" : ""}
                />
                {linkedEmployeeName && (
                  <div className="flex items-center gap-2 p-2 bg-purple-50 dark:bg-purple-900/20 rounded-lg text-xs text-purple-700 dark:text-purple-300">
                    <Link2 className="w-3.5 h-3.5 flex-shrink-0" />
                    <span>الاسم مرتبط بسجل الموظف: <strong>{linkedEmployeeName}</strong>. لتغيير الاسم، تواصل مع المدير لتحديثه من الإعدادات.</span>
                  </div>
                )}
              </div>

              {/* رقم الهاتف */}
              <div className="space-y-2">
                <Label>رقم الهاتف</Label>
                <Input
                  value={profile.phone}
                  onChange={(e) => setProfile(p => ({ ...p, phone: e.target.value }))}
                  placeholder="+20 123 456 7890"
                  dir="ltr"
                />
              </div>

              {/* النبذة */}
              <div className="space-y-2">
                <Label>نبذة مختصرة</Label>
                <Input
                  value={profile.bio}
                  onChange={(e) => setProfile(p => ({ ...p, bio: e.target.value }))}
                  placeholder="محاسب في قسم المالية..."
                />
              </div>

              {/* زر الحفظ */}
              <Button onClick={handleSave} disabled={saving || (usernameAvailable === false)}>
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 ml-2 animate-spin" />
                    جاري الحفظ...
                  </>
                ) : (
                  "حفظ التغييرات"
                )}
              </Button>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}

