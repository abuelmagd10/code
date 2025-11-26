"use client"

import { useEffect, useState, useRef } from "react"
import Link from "next/link"
import { Sidebar } from "@/components/sidebar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { useSupabase } from "@/lib/supabase/hooks"
import { useToast } from "@/hooks/use-toast"
import { toastActionSuccess, toastActionError } from "@/lib/notifications"
import { useTheme } from "next-themes"
import { useRouter } from "next/navigation"
import { getActiveCompanyId } from "@/lib/company"
import { Settings, Moon, Sun, Users, Mail, Lock, Building2, Globe, Palette, ChevronRight, Camera, Upload, Shield, Percent, Wrench, Save } from "lucide-react"

export default function SettingsPage() {
  const supabase = useSupabase()
  const { toast } = useToast()
  const { resolvedTheme, setTheme } = useTheme()
  const router = useRouter()
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [myCompanies, setMyCompanies] = useState<Array<{ id: string; name: string }>>([])
  const [currency, setCurrency] = useState<string>("EGP")
  const [language, setLanguage] = useState<string>("ar")
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState<string>("")
  const [address, setAddress] = useState<string>("")
  const [city, setCity] = useState<string>("")
  const [country, setCountry] = useState<string>("")
  const [phone, setPhone] = useState<string>("")
  const [taxId, setTaxId] = useState<string>("")
  const [logoUrl, setLogoUrl] = useState<string>("")
  const [uploadingLogo, setUploadingLogo] = useState<boolean>(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const darkEnabled = resolvedTheme === "dark"
  const texts = {
    ar: {
      settings: "الإعدادات",
      customize: "تخصيص مظهر التطبيق وبيانات شركتك",
      appearance: "المظهر",
      darkMode: "الوضع الداكن",
      darkToggle: "تفعيل/تعطيل الوضع الداكن",
      usersPerms: "المستخدمون والصلاحيات",
      manageMembers: "إدارة أعضاء الشركة وأدوارهم",
      gotoUsersBtn: "الانتقال إلى إدارة المستخدمين",
      accountSettings: "إعدادات الحساب",
      email: "البريد الإلكتروني",
      changePassword: "تغيير كلمة المرور",
      updateEmail: "تحديث البريد الإلكتروني",
      companyData: "بيانات الشركة",
      companyName: "اسم الشركة",
      currencyLabel: "العملة",
      city: "المدينة",
      country: "الدولة",
      phone: "رقم الهاتف",
      taxIdLabel: "الرقم الضريبي",
      address: "العنوان",
      saveChanges: "حفظ التغييرات",
      appLanguage: "لغة التطبيق",
      arabic: "العربية",
      english: "English",
    },
    en: {
      settings: "Settings",
      customize: "Customize app appearance and your company data",
      appearance: "Appearance",
      darkMode: "Dark Mode",
      darkToggle: "Enable/disable dark mode",
      usersPerms: "Users & Permissions",
      manageMembers: "Manage company members and roles",
      gotoUsersBtn: "Go to Users Management",
      accountSettings: "Account Settings",
      email: "Email",
      changePassword: "Change Password",
      updateEmail: "Update Email",
      companyData: "Company Information",
      companyName: "Company Name",
      currencyLabel: "Currency",
      city: "City",
      country: "Country",
      phone: "Phone",
      taxIdLabel: "Tax ID",
      address: "Address",
      saveChanges: "Save Changes",
      appLanguage: "App Language",
      arabic: "Arabic",
      english: "English",
    }
  }
  const L = language === "en" ? texts.en : texts.ar

  const [isChangePassOpen, setIsChangePassOpen] = useState(false)
  const [isUpdateEmailOpen, setIsUpdateEmailOpen] = useState(false)
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [newEmailField, setNewEmailField] = useState("")
  const [accountSaving, setAccountSaving] = useState(false)

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.dir = language === "en" ? "ltr" : "rtl"
      document.documentElement.lang = language === "en" ? "en" : "ar"
    }
  }, [language])

  useEffect(() => {
    const loadCompany = async () => {
      try {
        setLoading(true)
        const {
          data: { user },
        } = await supabase.auth.getUser()
        if (user) {
          setUserId(user.id)
          setUserEmail(user.email)
        }

        // استخدم دالة موحدة للحصول على company_id حتى بدون جلسة
        const cid = await getActiveCompanyId(supabase)
        if (cid) {
          setCompanyId(cid)
          const { data: company } = await supabase
            .from("companies")
            .select("*")
            .eq("id", cid)
            .maybeSingle()
          if (company) {
            setCurrency(company.currency || "EGP")
            setName(company.name || "")
            setAddress(company.address || "")
            setCity(company.city || "")
            setCountry(company.country || "")
            setPhone(company.phone || "")
            setTaxId(company.tax_id || "")
            setLanguage((company as any).language || (typeof window !== 'undefined' ? (localStorage.getItem('app_language') || 'ar') : 'ar'))
            const lu = (company as any).logo_url || (typeof window !== 'undefined' ? localStorage.getItem('company_logo_url') : '') || ''
            setLogoUrl(lu || '')
            try {
              if (user?.id) {
                const { data: exists } = await supabase
                  .from("company_members")
                  .select("id")
                  .eq("company_id", cid)
                  .eq("user_id", user.id)
                  .limit(1)
                const hasMembership = Array.isArray(exists) && exists.length > 0
                if (!hasMembership) {
                  await supabase
                    .from("company_members")
                    .insert({ company_id: cid, user_id: user.id, role: "owner" })
                }
              }
            } catch {}
            try {
              if (user?.id) {
                const { data: myMemberships } = await supabase
                  .from("company_members")
                  .select("company_id")
                  .eq("user_id", user.id)
                const ids = (myMemberships || []).map((m: any) => String(m.company_id)).filter(Boolean)
                if (ids.length > 0) {
                  const { data: companies } = await supabase
                    .from("companies")
                    .select("id,name")
                    .in("id", ids)
                  setMyCompanies(((companies || []) as any).map((c: any) => ({ id: String(c.id), name: String(c.name || "شركة") })))
                }
              }
            } catch {}
          } else {
            try {
              const res = await fetch('/api/my-company', { method: 'GET' })
              const js = await res.json()
              if (res.ok && js?.company?.id) {
                const c = js.company
                setCompanyId(String(c.id))
                setCurrency(c.currency || "EGP")
                setName(c.name || "")
                setAddress(c.address || "")
                setCity(c.city || "")
                setCountry(c.country || "")
                setPhone(c.phone || "")
                setTaxId(c.tax_id || "")
                setLanguage(String(c.language || (typeof window !== 'undefined' ? (localStorage.getItem('app_language') || 'ar') : 'ar')))
                const lu2 = String(c.logo_url || (typeof window !== 'undefined' ? localStorage.getItem('company_logo_url') : '') || '')
                setLogoUrl(lu2 || '')
                try {
                  if (user?.id) {
                    const { data: myMemberships } = await supabase
                      .from("company_members")
                      .select("company_id")
                      .eq("user_id", user.id)
                    const ids = (myMemberships || []).map((m: any) => String(m.company_id)).filter(Boolean)
                    if (ids.length > 0) {
                      const { data: companies } = await supabase
                        .from("companies")
                        .select("id,name")
                        .in("id", ids)
                      setMyCompanies(((companies || []) as any).map((c: any) => ({ id: String(c.id), name: String(c.name || "شركة") })))
                    }
                  }
                } catch {}
              }
            } catch {}
            try {
              if (user?.id) {
                const { data: myMemberships } = await supabase
                  .from("company_members")
                  .select("company_id")
                  .eq("user_id", user.id)
                const ids = (myMemberships || []).map((m: any) => String(m.company_id)).filter(Boolean)
                if (ids.length > 0) {
                  const { data: companies } = await supabase
                    .from("companies")
                    .select("*")
                    .in("id", ids)
                    .limit(1)
                  const c = (Array.isArray(companies) ? companies[0] : null) as any
                  if (c) {
                    setCompanyId(String(c.id))
                    setCurrency(c.currency || "EGP")
                    setName(c.name || "")
                    setAddress(c.address || "")
                    setCity(c.city || "")
                    setCountry(c.country || "")
                    setPhone(c.phone || "")
                    setTaxId(c.tax_id || "")
                    setLanguage(String(c.language || (typeof window !== 'undefined' ? (localStorage.getItem('app_language') || 'ar') : 'ar')))
                    const lu2 = String(c.logo_url || (typeof window !== 'undefined' ? localStorage.getItem('company_logo_url') : '') || '')
                    setLogoUrl(lu2 || '')
                    try { setMyCompanies([{ id: String(c.id), name: String(c.name || 'شركة') }]) } catch {}
                  }
                }
              }
            } catch {}
          }
        }
      } finally {
        setLoading(false)
      }
    }
    loadCompany()
  }, [supabase])

  const handleSave = async () => {
    try {
      setSaving(true)
      // If company exists, update it; otherwise create a new one for this user
      if (companyId) {
        const { error } = await supabase
          .from("companies")
          .update({ name, address, city, country, phone, tax_id: taxId, currency, language, logo_url: logoUrl || null })
          .eq("id", companyId)
        if (error) {
          const msg = String(error.message || "")
          const looksMissingLanguage = msg.toLowerCase().includes("language") && (msg.toLowerCase().includes("column") || msg.toLowerCase().includes("does not exist"))
          const looksMissingLogo = msg.toLowerCase().includes("logo_url") && (msg.toLowerCase().includes("column") || msg.toLowerCase().includes("does not exist"))
          if ((looksMissingLanguage || looksMissingLogo) && typeof window !== 'undefined') {
            try { localStorage.setItem('app_language', language) } catch {}
            try { localStorage.setItem('company_name', name || '') } catch {}
            try { if (logoUrl) localStorage.setItem('company_logo_url', logoUrl) } catch {}
            toastActionSuccess(toast, "الحفظ", "الإعدادات")
            try { if (typeof window !== 'undefined') window.dispatchEvent(new Event('company_updated')) } catch {}
          } else {
            throw error
          }
        } else {
          if (typeof window !== 'undefined') { try { localStorage.setItem('app_language', language) } catch {} }
          if (typeof window !== 'undefined') { try { localStorage.setItem('company_name', name || '') } catch {} }
          if (typeof window !== 'undefined') { try { if (logoUrl) localStorage.setItem('company_logo_url', logoUrl) } catch {} }
          toastActionSuccess(toast, "الحفظ", "الإعدادات")
          try { if (typeof window !== 'undefined') window.dispatchEvent(new Event('company_updated')) } catch {}
        }
      } else {
        if (!userId || !userEmail) {
          toast({ title: "غير مسجل", description: "يجب تسجيل الدخول لحفظ الإعدادات" })
          return
        }
        const { data, error } = await supabase
          .from("companies")
          .insert({ user_id: userId, name: name || "الشركة", email: userEmail, address, city, country, phone, tax_id: taxId, currency, language, logo_url: logoUrl || null })
          .select("id")
          .single()
        if (error) throw error
        setCompanyId(data.id)
        try {
          await supabase
            .from("company_members")
            .insert({ company_id: data.id, user_id: userId, role: "owner" })
        } catch {}
        if (typeof window !== 'undefined') { try { localStorage.setItem('app_language', language) } catch {} }
        if (typeof window !== 'undefined') { try { localStorage.setItem('company_name', name || '') } catch {} }
        if (typeof window !== 'undefined') { try { if (logoUrl) localStorage.setItem('company_logo_url', logoUrl) } catch {} }
        toastActionSuccess(toast, "الإنشاء", "الشركة")
        try { if (typeof window !== 'undefined') window.dispatchEvent(new Event('company_updated')) } catch {}
      }
    } catch (err: any) {
      console.error(err)
      toastActionError(toast, "الحفظ", "الإعدادات", err?.message || undefined)
    } finally {
      setSaving(false)
    }
  }

  const handleLogoUpload = async (file: File) => {
    if (!file || !companyId) return
    try {
      setUploadingLogo(true)
      const fd = new FormData()
      fd.append('file', file)
      fd.append('company_id', companyId)
      const res = await fetch('/api/company-logo', { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok) throw new Error(String(json?.error || 'upload_failed'))
      const url = String(json?.url || '')
      setLogoUrl(url)
      toastActionSuccess(toast, "رفع", "الشعار")
      try { if (typeof window !== 'undefined') window.dispatchEvent(new Event('company_updated')) } catch {}
    } catch (e: any) {
      toastActionError(toast, "رفع", "الشعار", e?.message || undefined)
    } finally { setUploadingLogo(false) }
  }

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
      <Sidebar />

      <main className="flex-1 md:mr-64 p-4 md:p-8 space-y-6">
        {/* رأس الصفحة */}
        <Card className="bg-white dark:bg-slate-900 border-0 shadow-sm">
          <CardContent className="py-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-gradient-to-br from-violet-500 to-purple-600 rounded-xl shadow-lg shadow-violet-500/20">
                  <Settings className="w-7 h-7 text-white" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{L.settings}</h1>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{L.customize}</p>
                </div>
              </div>
              <Badge variant="outline" className="hidden sm:flex items-center gap-1 px-3 py-1.5 border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-900/30 dark:text-violet-300">
                <Globe className="w-3.5 h-3.5" />
                {language === 'en' ? 'English' : 'العربية'}
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* روابط سريعة */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Link href="/settings/users" className="group">
            <Card className="bg-white dark:bg-slate-900 border-0 shadow-sm hover:shadow-md transition-all cursor-pointer group-hover:border-blue-200 dark:group-hover:border-blue-800">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg group-hover:scale-110 transition-transform">
                  <Users className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{L.usersPerms}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-blue-500 transition-colors" />
              </CardContent>
            </Card>
          </Link>
          <Link href="/settings/taxes" className="group">
            <Card className="bg-white dark:bg-slate-900 border-0 shadow-sm hover:shadow-md transition-all cursor-pointer group-hover:border-green-200 dark:group-hover:border-green-800">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg group-hover:scale-110 transition-transform">
                  <Percent className="w-5 h-5 text-green-600 dark:text-green-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{language === 'en' ? 'Taxes' : 'الضرائب'}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-green-500 transition-colors" />
              </CardContent>
            </Card>
          </Link>
          <Link href="/settings/maintenance" className="group">
            <Card className="bg-white dark:bg-slate-900 border-0 shadow-sm hover:shadow-md transition-all cursor-pointer group-hover:border-amber-200 dark:group-hover:border-amber-800">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-lg group-hover:scale-110 transition-transform">
                  <Wrench className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{language === 'en' ? 'Maintenance' : 'الصيانة'}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-amber-500 transition-colors" />
              </CardContent>
            </Card>
          </Link>
          <div className="group">
            <Card className="bg-white dark:bg-slate-900 border-0 shadow-sm">
              <CardContent className="p-4 flex items-center gap-3">
                <div className={`p-2 rounded-lg transition-all ${darkEnabled ? 'bg-slate-800' : 'bg-amber-100'}`}>
                  {darkEnabled ? <Moon className="w-5 h-5 text-violet-400" /> : <Sun className="w-5 h-5 text-amber-600" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{L.darkMode}</p>
                </div>
                <Switch
                  checked={!!darkEnabled}
                  onCheckedChange={(v) => setTheme(v ? "dark" : "light")}
                />
              </CardContent>
            </Card>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* إعدادات الحساب */}
          <Card className="bg-white dark:bg-slate-900 border-0 shadow-sm">
            <CardHeader className="border-b border-gray-100 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-rose-100 dark:bg-rose-900/30 rounded-lg">
                  <Shield className="w-5 h-5 text-rose-600 dark:text-rose-400" />
                </div>
                <CardTitle className="text-base">{L.accountSettings}</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="pt-5 space-y-4">
              <div className="space-y-2">
                <Label className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                  <Mail className="w-4 h-4" />
                  {L.email}
                </Label>
                <Input value={userEmail || (language === 'en' ? 'Not logged in' : 'غير مسجل')} disabled className="bg-gray-50 dark:bg-slate-800" />
              </div>
              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setIsChangePassOpen(true)} className="flex-1 gap-2">
                  <Lock className="w-4 h-4" />
                  {L.changePassword}
                </Button>
                <Button variant="outline" onClick={() => setIsUpdateEmailOpen(true)} className="flex-1 gap-2">
                  <Mail className="w-4 h-4" />
                  {L.updateEmail}
                </Button>
              </div>
            </CardContent>
          </Card>

        <Dialog open={isChangePassOpen} onOpenChange={setIsChangePassOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{language==='en' ? 'Change Password' : 'تغيير كلمة المرور'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>{language==='en' ? 'New Password' : 'كلمة المرور الجديدة'}</Label>
                <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>{language==='en' ? 'Confirm Password' : 'تأكيد كلمة المرور'}</Label>
                <Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsChangePassOpen(false)}>{language==='en' ? 'Cancel' : 'إلغاء'}</Button>
              <Button
                onClick={async () => {
                  if (!newPassword || newPassword.length < 6) { toastActionError(toast, language==='en' ? 'Update' : 'التحديث', language==='en' ? 'Password' : 'كلمة المرور', language==='en' ? 'Password must be at least 6 characters' : 'يجب أن تكون كلمة المرور 6 أحرف على الأقل'); return }
                  if (newPassword !== confirmPassword) { toastActionError(toast, language==='en' ? 'Update' : 'التحديث', language==='en' ? 'Password' : 'كلمة المرور', language==='en' ? 'Passwords do not match' : 'كلمتا المرور غير متطابقتين'); return }
                  try {
                    setAccountSaving(true)
                    const { error } = await supabase.auth.updateUser({ password: newPassword })
                    if (error) { toastActionError(toast, language==='en' ? 'Update' : 'التحديث', language==='en' ? 'Password' : 'كلمة المرور', error.message || undefined); return }
                    setNewPassword("")
                    setConfirmPassword("")
                    setIsChangePassOpen(false)
                    toastActionSuccess(toast, language==='en' ? 'Update' : 'التحديث', language==='en' ? 'Password' : 'كلمة المرور')
                  } finally { setAccountSaving(false) }
                }}
                disabled={accountSaving}
              >{accountSaving ? (language==='en' ? 'Saving...' : 'جاري الحفظ...') : (language==='en' ? 'Save' : 'حفظ')}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={isUpdateEmailOpen} onOpenChange={setIsUpdateEmailOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{language==='en' ? 'Update Email' : 'تحديث البريد الإلكتروني'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>{language==='en' ? 'New Email' : 'البريد الإلكتروني الجديد'}</Label>
                <Input type="email" value={newEmailField} onChange={(e) => setNewEmailField(e.target.value)} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsUpdateEmailOpen(false)}>{language==='en' ? 'Cancel' : 'إلغاء'}</Button>
              <Button
                onClick={async () => {
                  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
                  const newEmail = (newEmailField || '').trim()
                  if (!emailRegex.test(newEmail)) { toastActionError(toast, language==='en' ? 'Update' : 'التحديث', language==='en' ? 'Email' : 'البريد الإلكتروني', language==='en' ? 'Invalid email address' : 'البريد الإلكتروني غير صالح'); return }
                  try {
                    setAccountSaving(true)
                    if (companyId) {
                      const { data: exists } = await supabase
                        .from('company_members')
                        .select('user_id')
                        .eq('company_id', companyId)
                        .eq('email', newEmail)
                      const conflict = Array.isArray(exists) && exists.some((r: any) => String(r.user_id || '') !== String(userId || ''))
                      if (conflict) { toastActionError(toast, language==='en' ? 'Update' : 'التحديث', language==='en' ? 'Email' : 'البريد الإلكتروني', language==='en' ? 'Email already exists in this company' : 'البريد مستخدم بالفعل في هذه الشركة'); return }
                    }
                    const { error } = await supabase.auth.updateUser({ email: newEmail })
                    if (error) { toastActionError(toast, language==='en' ? 'Update' : 'التحديث', language==='en' ? 'Email' : 'البريد الإلكتروني', error.message || undefined); return }
                    if (companyId && userId) {
                      await supabase
                        .from('company_members')
                        .update({ email: newEmail })
                        .eq('company_id', companyId)
                        .eq('user_id', userId)
                    }
                    setIsUpdateEmailOpen(false)
                    setNewEmailField("")
                    setUserEmail(newEmail)
                    toastActionSuccess(toast, language==='en' ? 'Update' : 'التحديث', language==='en' ? 'Email' : 'البريد الإلكتروني')
                  } finally { setAccountSaving(false) }
                }}
                disabled={accountSaving}
              >{accountSaving ? (language==='en' ? 'Saving...' : 'جاري الحفظ...') : (language==='en' ? 'Save' : 'حفظ')}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

          {/* بيانات الشركة */}
          <Card className="lg:col-span-2 bg-white dark:bg-slate-900 border-0 shadow-sm">
            <CardHeader className="border-b border-gray-100 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-violet-100 dark:bg-violet-900/30 rounded-lg">
                  <Building2 className="w-5 h-5 text-violet-600 dark:text-violet-400" />
                </div>
                <CardTitle className="text-base">{L.companyData}</CardTitle>
              </div>
            </CardHeader>
          <CardContent className="pt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
            {myCompanies.length > 0 && (
              <div className="space-y-2 md:col-span-2">
                <Label className="text-gray-600 dark:text-gray-400">{language==='en' ? 'Active company' : 'الشركة الحالية'}</Label>
                <Select value={companyId || ''} onValueChange={(val) => {
                  setCompanyId(val)
                  try { if (typeof window !== 'undefined') localStorage.setItem('active_company_id', val) } catch {}
                  try { document.cookie = `active_company_id=${val}; path=/; max-age=31536000` } catch {}
                  try { if (typeof window !== 'undefined') window.dispatchEvent(new Event('company_updated')) } catch {}
                }}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {myCompanies.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {/* شعار الشركة */}
            <div className="space-y-3 md:col-span-2">
              <Label className="text-gray-600 dark:text-gray-400">{language === 'en' ? 'Company Logo' : 'شعار الشركة'}</Label>
              <div className="flex items-center gap-4 p-4 bg-gray-50 dark:bg-slate-800 rounded-xl border-2 border-dashed border-gray-200 dark:border-slate-700">
                {logoUrl ? (
                  <div className="relative group">
                    <img src={logoUrl} alt="Company Logo" className="h-16 w-16 rounded-xl object-cover border-2 border-white shadow-lg" />
                    <div className="absolute inset-0 bg-black/50 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer"
                      onClick={() => fileInputRef.current?.click()}>
                      <Camera className="w-5 h-5 text-white" />
                    </div>
                  </div>
                ) : (
                  <div
                    className="h-16 w-16 rounded-xl bg-gradient-to-br from-violet-100 to-purple-100 dark:from-violet-900/30 dark:to-purple-900/30 flex items-center justify-center cursor-pointer hover:scale-105 transition-transform"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="w-6 h-6 text-violet-500" />
                  </div>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleLogoUpload(f) }}
                />
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{logoUrl ? (language==='en' ? 'Logo uploaded' : 'تم رفع الشعار') : (language==='en' ? 'Upload logo' : 'رفع الشعار')}</p>
                  <p className="text-xs text-gray-500 mt-1">{language==='en' ? 'PNG, JPG up to 2MB' : 'PNG, JPG حتى 2 ميجا'}</p>
                </div>
                <Button
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingLogo || !companyId}
                  className="gap-2"
                >
                  <Upload className="w-4 h-4" />
                  {uploadingLogo ? (language==='en' ? 'Uploading...' : 'جاري الرفع...') : (language==='en' ? 'Browse' : 'استعراض')}
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-gray-600 dark:text-gray-400">{L.companyName}</Label>
              <Input placeholder={language==='en' ? 'Company name' : 'اسم الشركة'} value={name} onChange={(e) => setName(e.target.value)} className="bg-gray-50 dark:bg-slate-800 focus:bg-white dark:focus:bg-slate-700" />
            </div>
            <div className="space-y-2">
              <Label className="text-gray-600 dark:text-gray-400">{L.currencyLabel}</Label>
              <Select value={currency} onValueChange={(v) => setCurrency(v)} disabled={loading}>
                <SelectTrigger className="w-full bg-gray-50 dark:bg-slate-800">
                  <SelectValue placeholder={language==='en' ? 'Select currency' : 'اختر العملة'} />
                </SelectTrigger>
                <SelectContent position="item-aligned">
                  <SelectItem value="EGP">{language === 'en' ? 'Egyptian Pound (EGP)' : 'الجنيه المصري (EGP)'}</SelectItem>
                  <SelectItem value="USD">{language === 'en' ? 'US Dollar (USD)' : 'الدولار الأمريكي (USD)'}</SelectItem>
                  <SelectItem value="EUR">{language === 'en' ? 'Euro (EUR)' : 'اليورو (EUR)'}</SelectItem>
                  <SelectItem value="SAR">{language === 'en' ? 'Saudi Riyal (SAR)' : 'الريال السعودي (SAR)'}</SelectItem>
                  <SelectItem value="AED">{language === 'en' ? 'UAE Dirham (AED)' : 'الدرهم الإماراتي (AED)'}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-gray-600 dark:text-gray-400 flex items-center gap-2">
                <Globe className="w-4 h-4" />
                {L.appLanguage}
              </Label>
              <Select value={language} onValueChange={(v) => { setLanguage(v); try { localStorage.setItem('app_language', v); document.cookie = `app_language=${v}; path=/; max-age=31536000`; window.dispatchEvent(new Event('app_language_changed')) } catch {} }} disabled={loading}>
                <SelectTrigger className="w-full bg-gray-50 dark:bg-slate-800">
                  <SelectValue placeholder={language==='en' ? 'Select language' : 'اختر اللغة'} />
                </SelectTrigger>
                <SelectContent position="item-aligned">
                  <SelectItem value="ar">{L.arabic}</SelectItem>
                  <SelectItem value="en">{L.english}</SelectItem>
                </SelectContent>
              </Select>
            </div>
              <div className="space-y-2">
                <Label className="text-gray-600 dark:text-gray-400">{L.city}</Label>
                <Input placeholder={language==='en' ? 'City' : 'المدينة'} value={city} onChange={(e) => setCity(e.target.value)} className="bg-gray-50 dark:bg-slate-800 focus:bg-white dark:focus:bg-slate-700" />
              </div>
              <div className="space-y-2">
                <Label className="text-gray-600 dark:text-gray-400">{L.country}</Label>
                <Input placeholder={language==='en' ? 'Country' : 'الدولة'} value={country} onChange={(e) => setCountry(e.target.value)} className="bg-gray-50 dark:bg-slate-800 focus:bg-white dark:focus:bg-slate-700" />
              </div>
              <div className="space-y-2">
                <Label className="text-gray-600 dark:text-gray-400">{L.phone}</Label>
                <Input placeholder={language==='en' ? 'Phone number' : 'رقم الهاتف'} value={phone} onChange={(e) => setPhone(e.target.value)} className="bg-gray-50 dark:bg-slate-800 focus:bg-white dark:focus:bg-slate-700" />
              </div>
              <div className="space-y-2">
                <Label className="text-gray-600 dark:text-gray-400">{L.taxIdLabel}</Label>
                <Input placeholder={language==='en' ? 'Tax ID' : 'الرقم الضريبي'} value={taxId} onChange={(e) => setTaxId(e.target.value)} className="bg-gray-50 dark:bg-slate-800 focus:bg-white dark:focus:bg-slate-700" />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label className="text-gray-600 dark:text-gray-400">{L.address}</Label>
                <Input placeholder={language==='en' ? 'Address' : 'العنوان'} value={address} onChange={(e) => setAddress(e.target.value)} className="bg-gray-50 dark:bg-slate-800 focus:bg-white dark:focus:bg-slate-700" />
              </div>
              <div className="md:col-span-2 pt-4 border-t border-gray-100 dark:border-slate-800">
                <Button
                  className="gap-2 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 shadow-lg shadow-violet-500/20"
                  onClick={handleSave}
                  disabled={saving || loading || !name.trim()}
                >
                  <Save className="w-4 h-4" />
                  {saving ? (language === 'en' ? 'Saving...' : 'جاري الحفظ...') : L.saveChanges}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}
