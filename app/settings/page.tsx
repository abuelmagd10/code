"use client"

import { Sidebar } from "@/components/sidebar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"

export default function SettingsPage() {
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
                <Input placeholder="العملة الرئيسية" />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>العنوان</Label>
                <Input placeholder="العنوان" />
              </div>
              <div className="md:col-span-2">
                <Button className="mt-2">حفظ التغييرات</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}

