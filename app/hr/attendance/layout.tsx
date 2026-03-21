'use client'

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useEffect, useState } from "react"
import { Clock } from "lucide-react"

export default function AttendanceLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const pathname = usePathname()
    const router = useRouter()
    const searchParams = useSearchParams()

    const [appLang, setAppLang] = useState<'ar' | 'en'>('ar')

    useEffect(() => {
        const handler = () => {
            try {
                const v = localStorage.getItem('app_language') || 'ar'
                setAppLang(v === 'en' ? 'en' : 'ar')
            } catch { }
        }
        handler()
        window.addEventListener('app_language_changed', handler)
        return () => window.removeEventListener('app_language_changed', handler)
    }, [])
    const t = (en: string, ar: string) => appLang === 'en' ? en : ar

    const currentTab = pathname.split('/').pop() || 'daily'

    const handleTabChange = (val: string) => {
        let query = "";
        if (typeof window !== "undefined" && window.location.search) {
            query = window.location.search;
        }
        router.push(`/hr/attendance/${val}${query}`)
    }

    return (
        <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
            <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 overflow-x-hidden">

                <div className="mb-6 space-y-4 max-w-full">
                    <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400 mb-2">
                        <Clock className="w-8 h-8" />
                        <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-700 to-indigo-600 dark:from-blue-400 dark:to-indigo-300">
                            {t('Biometric Attendance', 'الحضور والانصراف (بصمة)')}
                        </h1>
                    </div>

                    <Tabs value={currentTab} onValueChange={handleTabChange} className="w-full">
                        <TabsList className="bg-white dark:bg-slate-800 p-1 border shadow-sm">
                            <TabsTrigger value="daily" className="px-6 data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700 dark:data-[state=active]:bg-blue-900/30 dark:data-[state=active]:text-blue-400 font-medium transition-all">{t('Daily Attendance', 'الحضور اليومي')}</TabsTrigger>
                            <TabsTrigger value="anomalies" className="px-6 data-[state=active]:bg-rose-50 data-[state=active]:text-rose-700 dark:data-[state=active]:bg-rose-900/30 dark:data-[state=active]:text-rose-400 font-medium transition-all">{t('Anomalies', 'الحالات الشاذة')}</TabsTrigger>
                            <TabsTrigger value="devices" className="px-6 data-[state=active]:bg-emerald-50 data-[state=active]:text-emerald-700 dark:data-[state=active]:bg-emerald-900/30 dark:data-[state=active]:text-emerald-400 font-medium transition-all">{t('Devices', 'أجهزة البصمة')}</TabsTrigger>
                            <TabsTrigger value="shifts" className="px-6 data-[state=active]:bg-purple-50 data-[state=active]:text-purple-700 dark:data-[state=active]:bg-purple-900/30 dark:data-[state=active]:text-purple-400 font-medium transition-all">{t('Shifts', 'الورديات')}</TabsTrigger>
                            <TabsTrigger value="reports" className="px-6 data-[state=active]:bg-amber-50 data-[state=active]:text-amber-700 dark:data-[state=active]:bg-amber-900/30 dark:data-[state=active]:text-amber-400 font-medium transition-all">{t('Reports', 'التقارير')}</TabsTrigger>
                            <TabsTrigger value="settings" className="px-6 data-[state=active]:bg-slate-100 data-[state=active]:text-slate-800 dark:data-[state=active]:bg-slate-800 dark:data-[state=active]:text-slate-300 font-medium transition-all">{t('Settings', 'الإعدادات')}</TabsTrigger>
                        </TabsList>
                    </Tabs>
                </div>

                {children}

            </main>
        </div>
    )
}
