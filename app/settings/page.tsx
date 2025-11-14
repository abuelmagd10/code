"use client"

import { useEffect, useState } from "react"
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
            .select("id, currency, name, address, city, country, phone, tax_id")
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
          .update({ name, address, city, country, phone, tax_id: taxId, currency })
          .eq("id", companyId)
        if (error) throw error
        toastActionSuccess(toast, "الحفظ", "الإعدادات")
      } else {
        if (!userId || !userEmail) {
          toast({ title: "غير مسجل", description: "يجب تسجيل الدخول لحفظ الإعدادات" })
          return
        }
        const { data, error } = await supabase
          .from("companies")
          .insert({ user_id: userId, name: name || "الشركة", email: userEmail, address, city, country, phone, tax_id: taxId, currency })
          .select("id")
          .single()
        if (error) throw error
        setCompanyId(data.id)
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
          <h1 className="text-2xl font-bold">الإعدادات</h1>
          <span className="text-sm text-gray-500 dark:text-gray-400">تخصيص مظهر التطبيق وبيانات شركتك</span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* مظهر الواجهة */}
          <Card>
            <CardHeader>
              <CardTitle>المظهر</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">الوضع الداكن</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">تفعيل/تعطيل الوضع الداكن</p>
                </div>
                <Switch
                  checked={!!darkEnabled}
                  onCheckedChange={(v) => setTheme(v ? "dark" : "light")}
                />
              </div>
            </CardContent>
          </Card>

          {/* إعدادات الحساب */}
          <Card>
            <CardHeader>
              <CardTitle>إعدادات الحساب</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>البريد الإلكتروني</Label>
                <Input value={userEmail || "غير مسجل"} disabled />
              </div>
              <div className="flex gap-3">
                <Button variant="outline">تغيير كلمة المرور</Button>
                <Button variant="outline">تحديث البريد الإلكتروني</Button>
              </div>
            </CardContent>
          </Card>

          {/* بيانات الشركة */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>بيانات الشركة</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>اسم الشركة</Label>
                <Input placeholder="اسم الشركة" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>العملة</Label>
                <Select value={currency} onValueChange={(v) => setCurrency(v)} disabled={loading}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="اختر العملة" />
                  </SelectTrigger>
                  <SelectContent position="item-aligned">
                    <SelectItem value="EGP">الجنيه المصري (EGP)</SelectItem>
                    <SelectItem value="USD">الدولار الأمريكي (USD)</SelectItem>
                    <SelectItem value="EUR">اليورو (EUR)</SelectItem>
                    <SelectItem value="SAR">الريال السعودي (SAR)</SelectItem>
                    <SelectItem value="AED">الدرهم الإماراتي (AED)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>المدينة</Label>
                <Input placeholder="المدينة" value={city} onChange={(e) => setCity(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>الدولة</Label>
                <Input placeholder="الدولة" value={country} onChange={(e) => setCountry(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>الهاتف</Label>
                <Input placeholder="رقم الهاتف" value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>الرقم الضريبي</Label>
                <Input placeholder="الرقم الضريبي" value={taxId} onChange={(e) => setTaxId(e.target.value)} />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>العنوان</Label>
                <Input placeholder="العنوان" value={address} onChange={(e) => setAddress(e.target.value)} />
              </div>
              <div className="md:col-span-2">
                <Button className="mt-2" onClick={handleSave} disabled={saving || loading || !name.trim()}>
                  {saving ? "جاري الحفظ..." : "حفظ التغييرات"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}
