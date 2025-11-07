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

export default function SettingsPage() {
  const supabase = useSupabase()
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [currency, setCurrency] = useState<string>("USD")
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadCompany = async () => {
      try {
        setLoading(true)
        const {
          data: { user },
        } = await supabase.auth.getUser()
        if (!user) return
        const { data: company } = await supabase
          .from("companies")
          .select("id, currency")
          .eq("user_id", user.id)
          .single()
        if (company) {
          setCompanyId(company.id)
          setCurrency(company.currency || "USD")
        }
      } finally {
        setLoading(false)
      }
    }
    loadCompany()
  }, [supabase])

  const handleSave = async () => {
    if (!companyId) return
    try {
      setSaving(true)
      await supabase.from("companies").update({ currency }).eq("id", companyId)
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
          <span className="text-sm text-gray-500 dark:text-gray-400">هذه الصفحة تحت الإنشاء</span>
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
                <Switch />
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
                <Input placeholder="example@email.com" disabled />
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
                <Input placeholder="اسم الشركة" />
              </div>
              <div className="space-y-2">
                <Label>العملة</Label>
                <Select value={currency} onValueChange={(v) => setCurrency(v)} disabled={loading}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="اختر العملة" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="EGP">الجنيه المصري (EGP)</SelectItem>
                    <SelectItem value="USD">الدولار الأمريكي (USD)</SelectItem>
                    <SelectItem value="EUR">اليورو (EUR)</SelectItem>
                    <SelectItem value="SAR">الريال السعودي (SAR)</SelectItem>
                    <SelectItem value="AED">الدرهم الإماراتي (AED)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>العنوان</Label>
                <Input placeholder="العنوان" />
              </div>
              <div className="md:col-span-2">
                <Button className="mt-2" onClick={handleSave} disabled={saving || loading}>
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
