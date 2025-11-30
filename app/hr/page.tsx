"use client"
import { Sidebar } from "@/components/sidebar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import Link from "next/link"
import { useState, useEffect } from "react"

export default function HRHome() {
  const [appLang, setAppLang] = useState<'ar'|'en'>('ar')
  useEffect(() => {
    const handler = () => {
      try {
        const v = localStorage.getItem('app_language') || 'ar'
        setAppLang(v === 'en' ? 'en' : 'ar')
      } catch {}
    }
    handler()
    window.addEventListener('app_language_changed', handler)
    return () => window.removeEventListener('app_language_changed', handler)
  }, [])
  const t = (en: string, ar: string) => appLang === 'en' ? en : ar

  return (
    <div className="flex min-h-screen bg-gray-50 dark:bg-slate-950">
      <Sidebar />
      <main className="flex-1 md:mr-64 p-4 md:p-8">
        <div className="space-y-6">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{t('HR & Payroll System', 'نظام الموظفين والمرتبات')}</h1>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader><CardTitle>{t('Employees', 'الموظفون')}</CardTitle></CardHeader>
              <CardContent><Link className="text-blue-600" href="/hr/employees">{t('Manage Employees', 'إدارة الموظفين')}</Link></CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>{t('Attendance', 'الحضور والانصراف')}</CardTitle></CardHeader>
              <CardContent><Link className="text-blue-600" href="/hr/attendance">{t('Record Attendance', 'تسجيل الحضور')}</Link></CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>{t('Payroll', 'المرتبات')}</CardTitle></CardHeader>
              <CardContent><Link className="text-blue-600" href="/hr/payroll">{t('Manage Payroll', 'إدارة المرتبات')}</Link></CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  )
}