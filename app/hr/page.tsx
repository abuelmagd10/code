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
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
      <Sidebar />
      {/* Main Content - تحسين للهاتف */}
      <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 overflow-x-hidden">
        <div className="space-y-4 sm:space-y-6 max-w-full">
          {/* رأس الصفحة - تحسين للهاتف */}
          <div className="bg-white dark:bg-slate-900 rounded-xl sm:rounded-2xl shadow-sm border border-gray-200 dark:border-slate-800 p-4 sm:p-6">
            <h1 className="text-lg sm:text-2xl md:text-3xl font-bold text-gray-900 dark:text-white">{t('HR & Payroll', 'الموظفين والمرتبات')}</h1>
            <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-1">{t('Manage employees, attendance and payroll', 'إدارة الموظفين والحضور والمرتبات')}</p>
            {/* 🔐 Governance Notice - HR is admin-only */}
            <p className="text-xs text-green-600 dark:text-green-400 mt-1">
              {t('👑 Admin access - All HR data visible', '👑 صلاحية إدارية - جميع بيانات الموارد البشرية مرئية')}
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
            <Card className="rounded-xl sm:rounded-2xl">
              <CardHeader className="p-4 sm:p-6"><CardTitle className="text-base sm:text-lg">{t('Employees', 'الموظفون')}</CardTitle></CardHeader>
              <CardContent className="p-4 sm:p-6 pt-0"><Link className="text-blue-600 text-sm sm:text-base" href="/hr/employees">{t('Manage Employees', 'إدارة الموظفين')}</Link></CardContent>
            </Card>
            <Card className="rounded-xl sm:rounded-2xl">
              <CardHeader className="p-4 sm:p-6"><CardTitle className="text-base sm:text-lg">{t('Attendance', 'الحضور')}</CardTitle></CardHeader>
              <CardContent className="p-4 sm:p-6 pt-0"><Link className="text-blue-600 text-sm sm:text-base" href="/hr/attendance">{t('Record Attendance', 'تسجيل الحضور')}</Link></CardContent>
            </Card>
            <Card className="rounded-xl sm:rounded-2xl">
              <CardHeader className="p-4 sm:p-6"><CardTitle className="text-base sm:text-lg">{t('Payroll', 'المرتبات')}</CardTitle></CardHeader>
              <CardContent className="p-4 sm:p-6 pt-0"><Link className="text-blue-600 text-sm sm:text-base" href="/hr/payroll">{t('Manage Payroll', 'إدارة المرتبات')}</Link></CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  )
}