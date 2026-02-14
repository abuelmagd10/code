"use client"

import { useState, useEffect } from "react"
import { Sidebar } from "@/components/sidebar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useSupabase } from "@/lib/supabase/hooks"
import { getActiveCompanyId } from "@/lib/company"
import { Download, ArrowRight, Loader2, Calendar } from "lucide-react"
import { useRouter } from "next/navigation"
import { CompanyHeader } from "@/components/company-header"
import { getEquityStatement } from "@/app/actions/equity-reporting"
import { toast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"

interface EquityRow {
    row: string
    shareCapital: number
    retainedEarnings: number
    otherEquity: number
    total: number
    isBold?: boolean
}

export default function EquityChangesPage() {
    const supabase = useSupabase()
    const router = useRouter()
    const [appLang, setAppLang] = useState<'ar' | 'en'>('ar')
    const [hydrated, setHydrated] = useState(false)
    const [isLoading, setIsLoading] = useState(true)
    const [data, setData] = useState<EquityRow[]>([])

    const [startDate, setStartDate] = useState(() => {
        const d = new Date()
        return `${d.getFullYear()}-01-01`
    })
    const [endDate, setEndDate] = useState(() => {
        return new Date().toISOString().split('T')[0]
    })

    // Format currency
    const numberFmt = new Intl.NumberFormat(appLang === 'en' ? 'en-EG' : 'ar-EG', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    })

    useEffect(() => {
        setHydrated(true)
        const handler = () => {
            try {
                const docLang = document.documentElement?.lang
                if (docLang === 'en') { setAppLang('en'); return }
                const fromCookie = document.cookie.split('; ').find((x) => x.startsWith('app_language='))?.split('=')[1]
                const v = fromCookie || localStorage.getItem('app_language') || 'ar'
                setAppLang(v === 'en' ? 'en' : 'ar')
            } catch { }
        }
        handler()
        window.addEventListener('app_language_changed', handler)
        return () => window.removeEventListener('app_language_changed', handler)
    }, [])

    useEffect(() => {
        loadReport()
    }, [startDate, endDate])

    const loadReport = async () => {
        setIsLoading(true)
        try {
            const companyId = await getActiveCompanyId(supabase)
            if (!companyId) return

            const result = await getEquityStatement(companyId, startDate, endDate)
            if (result.success && result.data) {
                setData(result.data.items)
            } else {
                toast({
                    title: "Error",
                    description: result.error || "Failed to load report",
                    variant: "destructive"
                })
            }
        } catch (error) {
            console.error(error)
            toast({
                title: "Error",
                description: "Unexpected error",
                variant: "destructive"
            })
        } finally {
            setIsLoading(false)
        }
    }

    const handlePrint = () => {
        window.print()
    }

    const labels = {
        title: appLang === 'en' ? 'Statement of Changes in Equity' : 'قائمة التغيرات في حقوق الملكية',
        shareCapital: appLang === 'en' ? 'Share Capital' : 'رأس المال',
        retainedEarnings: appLang === 'en' ? 'Retained Earnings' : 'الأرباح المحتجزة',
        otherEquity: appLang === 'en' ? 'Other Equity' : 'بنود أخرى',
        total: appLang === 'en' ? 'Total Equity' : 'إجمالي الحقوق',
        print: appLang === 'en' ? 'Print' : 'طباعة',
        back: appLang === 'en' ? 'Back' : 'عودة',
        from: appLang === 'en' ? 'From' : 'من',
        to: appLang === 'en' ? 'To' : 'إلى',
        loading: appLang === 'en' ? 'Loading...' : 'جاري التحميل...',
        noData: appLang === 'en' ? 'No data' : 'لا توجد بيانات'
    }

    const translateRow = (rowName: string) => {
        if (appLang === 'en') return rowName
        const map: Record<string, string> = {
            "Opening Balance": "الرصيد الافتتاحي",
            "Net Profit / (Loss)": "صافي الربح / (الخسارة)",
            "Capital Issued": "إصدار رأس مال",
            "Dividends": "توزيعات الأرباح",
            "Drawings": "المسحوبات",
            "Other Movements": "حركات أخرى",
            "Closing Balance": "الرصيد الختامي"
        }
        return map[rowName] || rowName
    }

    return (
        <div className="flex min-h-screen bg-gray-50 dark:bg-slate-950">
            <Sidebar />
            <main className="flex-1 md:mr-64 p-4 md:p-8 pt-20 md:pt-8 overflow-x-hidden">
                <div className="max-w-6xl mx-auto space-y-6">
                    <CompanyHeader />

                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 print:hidden">
                        <div>
                            <h1 className="text-2xl font-bold">{labels.title}</h1>
                            <p className="text-gray-500 text-sm mt-1">{startDate} - {endDate}</p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                            <div className="flex items-center gap-2 bg-white dark:bg-slate-900 p-1 rounded border">
                                <input
                                    type="date"
                                    value={startDate}
                                    onChange={(e) => setStartDate(e.target.value)}
                                    className="bg-transparent text-sm focus:outline-none w-32 p-1"
                                />
                                <span className="text-gray-400">-</span>
                                <input
                                    type="date"
                                    value={endDate}
                                    onChange={(e) => setEndDate(e.target.value)}
                                    className="bg-transparent text-sm focus:outline-none w-32 p-1"
                                />
                            </div>

                            <Button variant="outline" onClick={handlePrint}>
                                <Download className="w-4 h-4 mr-2" />
                                {labels.print}
                            </Button>
                            <Button variant="outline" onClick={() => router.push("/reports")}>
                                <ArrowRight className="w-4 h-4 mr-2" />
                                {labels.back}
                            </Button>
                        </div>
                    </div>

                    <Card className="print:shadow-none print:border-none">
                        <CardHeader className="text-center border-b pb-4 hidden print:block">
                            <CardTitle>{labels.title}</CardTitle>
                            <p className="text-sm text-gray-500">{startDate} / {endDate}</p>
                        </CardHeader>
                        <CardContent className="p-0">
                            {isLoading ? (
                                <div className="flex justify-center items-center py-20">
                                    <Loader2 className="w-8 h-8 animate-spin text-primary" />
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm text-left rtl:text-right">
                                        <thead className="text-xs text-gray-700 uppercase bg-gray-50 dark:bg-slate-900/50 dark:text-gray-400">
                                            <tr>
                                                <th className="px-6 py-4 font-bold">{appLang === 'en' ? 'Item' : 'البيان'}</th>
                                                <th className="px-6 py-4 text-center">{labels.shareCapital}</th>
                                                <th className="px-6 py-4 text-center">{labels.retainedEarnings}</th>
                                                <th className="px-6 py-4 text-center">{labels.otherEquity}</th>
                                                <th className="px-6 py-4 text-center bg-gray-100 dark:bg-slate-800 font-bold">{labels.total}</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {data.map((row, idx) => (
                                                <tr
                                                    key={idx}
                                                    className={cn(
                                                        "border-b dark:border-slate-800 hover:bg-gray-50 dark:hover:bg-slate-900/50 transition-colors",
                                                        row.isBold && "font-bold bg-gray-50/50 dark:bg-slate-900/30",
                                                        row.row === "Closing Balance" && "font-bold bg-gray-100/50 dark:bg-slate-800/50 border-t-2 border-black"
                                                    )}
                                                >
                                                    <td className="px-6 py-4 whitespace-nowrap">{translateRow(row.row)}</td>
                                                    <td className="px-6 py-4 text-center whitespace-nowrap">
                                                        {row.shareCapital !== 0 ? numberFmt.format(row.shareCapital) : "-"}
                                                    </td>
                                                    <td className="px-6 py-4 text-center whitespace-nowrap">
                                                        {row.retainedEarnings !== 0 ? numberFmt.format(row.retainedEarnings) : "-"}
                                                    </td>
                                                    <td className="px-6 py-4 text-center whitespace-nowrap">
                                                        {row.otherEquity !== 0 ? numberFmt.format(row.otherEquity) : "-"}
                                                    </td>
                                                    <td className="px-6 py-4 text-center font-bold bg-gray-50 dark:bg-slate-800/50 whitespace-nowrap">
                                                        {numberFmt.format(row.total)}
                                                    </td>
                                                </tr>
                                            ))}
                                            {data.length === 0 && (
                                                <tr>
                                                    <td colSpan={5} className="text-center py-8 text-gray-500">
                                                        {labels.noData}
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </main>
        </div>
    )
}
