"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Sidebar } from "@/components/sidebar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useSupabase } from "@/lib/supabase/hooks"
import { useToast } from "@/hooks/use-toast"
import { toastActionSuccess, toastActionError } from "@/lib/notifications"
import { useTheme } from "next-themes"
import { getActiveCompanyId } from "@/lib/company"

export default function SettingsPage() {
  const supabase = useSupabase()
  const { toast } = useToast()
  const { resolvedTheme, setTheme } = useTheme()
  const [companyId, setCompanyId] = useState<string | null>(null)
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
            .single()
          if (company) {
            setCurrency(company.currency || "EGP")
            setName(company.name || "")
            setAddress(company.address || "")
            setCity(company.city || "")
            setCountry(company.country || "")
            setPhone(company.phone || "")
            setTaxId(company.tax_id || "")
            setLanguage((company as any).language || (typeof window !== 'undefined' ? (localStorage.getItem('app_language') || 'ar') : 'ar'))
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
          .update({ name, address, city, country, phone, tax_id: taxId, currency, language })
          .eq("id", companyId)
        if (error) {
          const msg = String(error.message || "")
          const looksMissingColumn = msg.toLowerCase().includes("language") && (msg.toLowerCase().includes("column") || msg.toLowerCase().includes("does not exist"))
          if (looksMissingColumn && typeof window !== 'undefined') {
            try { localStorage.setItem('app_language', language) } catch {}
            toastActionSuccess(toast, "الحفظ", "الإعدادات")
          } else {
            throw error
          }
        } else {
          if (typeof window !== 'undefined') { try { localStorage.setItem('app_language', language) } catch {} }
          toastActionSuccess(toast, "الحفظ", "الإعدادات")
        }
      } else {
        if (!userId || !userEmail) {
          toast({ title: "غير مسجل", description: "يجب تسجيل الدخول لحفظ الإعدادات" })
          return
        }
        const { data, error } = await supabase
          .from("companies")
          .insert({ user_id: userId, name: name || "الشركة", email: userEmail, address, city, country, phone, tax_id: taxId, currency, language })
          .select("id")
          .single()
        if (error) throw error
        setCompanyId(data.id)
        if (typeof window !== 'undefined') { try { localStorage.setItem('app_language', language) } catch {} }
        toastActionSuccess(toast, "الإنشاء", "الشركة")
      }
    } catch (err: any) {
      console.error(err)
      toastActionError(toast, "الحفظ", "الإعدادات", err?.message || undefined)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex min-h-screen bg-gray-50 dark:bg-slate-950">
      <Sidebar />

      <main className="flex-1 md:mr-64 p-4 md:p-8 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">{L.settings}</h1>
          <span className="text-sm text-gray-500 dark:text-gray-400">{L.customize}</span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* مظهر الواجهة */}
          <Card>
            <CardHeader>
              <CardTitle>{L.appearance}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">{L.darkMode}</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">{L.darkToggle}</p>
                </div>
                <Switch
                  checked={!!darkEnabled}
                  onCheckedChange={(v) => setTheme(v ? "dark" : "light")}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{L.usersPerms}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-gray-600 dark:text-gray-400">{L.manageMembers}</p>
              <Link href="/settings/users">
                <Button>{L.gotoUsersBtn}</Button>
              </Link>
            </CardContent>
          </Card>

          {/* إعدادات الحساب */}
          <Card>
            <CardHeader>
              <CardTitle>{L.accountSettings}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>{L.email}</Label>
                <Input value={userEmail || "غير مسجل"} disabled />
              </div>
              <div className="flex gap-3">
                <Button variant="outline">{L.changePassword}</Button>
                <Button variant="outline">{L.updateEmail}</Button>
              </div>
            </CardContent>
          </Card>

          {/* بيانات الشركة */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>{L.companyData}</CardTitle>
            </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{L.companyName}</Label>
              <Input placeholder="اسم الشركة" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>{L.currencyLabel}</Label>
              <Select value={currency} onValueChange={(v) => setCurrency(v)} disabled={loading}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="اختر العملة" />
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
              <Label>{L.appLanguage}</Label>
              <Select value={language} onValueChange={(v) => { setLanguage(v); try { localStorage.setItem('app_language', v); window.dispatchEvent(new Event('app_language_changed')); } catch {} }} disabled={loading}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="اختر اللغة" />
                </SelectTrigger>
                <SelectContent position="item-aligned">
                  <SelectItem value="ar">{L.arabic}</SelectItem>
                  <SelectItem value="en">{L.english}</SelectItem>
                </SelectContent>
              </Select>
            </div>
              <div className="space-y-2">
                <Label>{L.city}</Label>
                <Input placeholder="المدينة" value={city} onChange={(e) => setCity(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>{L.country}</Label>
                <Input placeholder="الدولة" value={country} onChange={(e) => setCountry(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>{L.phone}</Label>
                <Input placeholder="رقم الهاتف" value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>{L.taxIdLabel}</Label>
                <Input placeholder="الرقم الضريبي" value={taxId} onChange={(e) => setTaxId(e.target.value)} />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>{L.address}</Label>
                <Input placeholder="العنوان" value={address} onChange={(e) => setAddress(e.target.value)} />
              </div>
              <div className="md:col-span-2">
                <Button className="mt-2" onClick={handleSave} disabled={saving || loading || !name.trim()}>
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
