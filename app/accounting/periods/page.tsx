"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { LoadingState } from "@/components/ui/loading-state"
import { EmptyState } from "@/components/ui/empty-state"
import { useSupabase } from "@/lib/supabase/hooks"
import { getActiveCompanyId } from "@/lib/company"
import { Calendar, Lock, Unlock, CheckCircle2, AlertCircle, XCircle } from "lucide-react"
import { CompanyHeader } from "@/components/company-header"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { toast } from "sonner"
import { useAutoRefresh } from "@/hooks/use-auto-refresh"
import { DataTable, type DataTableColumn } from "@/components/DataTable"
import { DataPagination } from "@/components/data-pagination"
import { usePagination } from "@/lib/pagination"

export const dynamic = 'force-dynamic'

interface AccountingPeriod {
    id: string
    period_name: string
    period_start: string
    period_end: string
    status: string
    is_locked: boolean
    closed_at: string | null
    closed_by: string | null
    journal_entry_id: string | null
}

interface ClosingPreview {
    // v3.75.83 — **صفرٌ لم يُقَسْ ليس صفراً.** كانت هذه المعاينةُ تُنادى دالّةً
    // اسمُها `execute_sql` **لا وجودَ لها فى القاعدةِ أصلاً** (مقيسٌ: لا فى أىِّ
    // مخطَّطٍ ولا بأىِّ نوع)، ولا تقرأُ خطأَ النداءِ إطلاقاً — فكان النداءُ يفشلُ
    // فى كلِّ مرّة، وتُقرأُ النتيجةُ فراغاً، فتُعرَضُ على صاحبِ الشأنِ **إيراداتٌ
    // صفرٌ ومصروفاتٌ صفرٌ وصافى ربحٍ صفر** فى الشاشةِ التى يقرِّرُ فيها إقفالَ
    // فترةٍ محاسبيّة. وهذا أسوأُ من بابٍ يُصدِرُ خطأً: بابٌ يُصدِرُ خطأً يُسمَع،
    // أمّا رقمٌ كاذبٌ فيُصدَّقُ ويُبنى عليه قرار.
    //
    // ولم يُوضَعْ مكانَه حسابٌ جديد **عمداً**: صافى الربحِ للفترةِ له بيتٌ يحسبُه
    // اليومَ فعلاً وهو `close_accounting_period(period, closed_by, retained)` —
    // يقرأُ نوعَ الحسابِ وعَلَمَ قيدِ الإقفالِ ويُرجِعُ صافى الربحَ ويكتبُ القيد.
    // فلو حسبتِ المعاينةُ الرقمَ بيدِها لصار **بيتانِ لرقمٍ واحد**، وقد يفترقان
    // على الشاشةِ نفسِها التى يُقرَّرُ فيها الإقفال. وتوحيدُهما يمسُّ كتابةَ قيدٍ
    // فى الدفاتر، فهو دفعةٌ تُقاسُ بذاتِها ولا تُخلَطُ بنزعِ كذبة.
    //
    // فالحكمُ هنا هو الحكمُ الثالث: **لم أَقِسْ** — يُقالُ صراحةً ولا يُتَجمَّل.
    measured: boolean
    totalRevenue: number
    totalExpense: number
    netIncome: number
    revenueAccounts: Array<{ account_name: string; balance: number }>
    expenseAccounts: Array<{ account_name: string; balance: number }>
}

export default function AccountingPeriodsPage() {
    const supabase = useSupabase()
    const [periods, setPeriods] = useState<AccountingPeriod[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [appLang, setAppLang] = useState<'ar' | 'en'>('ar')
    const [selectedPeriod, setSelectedPeriod] = useState<AccountingPeriod | null>(null)
    const [closingPreview, setClosingPreview] = useState<ClosingPreview | null>(null)
    const [isClosing, setIsClosing] = useState(false)
    const [isLoadingPreview, setIsLoadingPreview] = useState(false)

    const numberFmt = new Intl.NumberFormat(appLang === 'en' ? 'en-EG' : 'ar-EG', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    })

    useEffect(() => {
        try { setAppLang((localStorage.getItem('app_language') || 'ar') === 'en' ? 'en' : 'ar') } catch { }
    }, [])

    useEffect(() => {
        loadPeriods()
    }, [])

    // v3.74.58 — تَحديث تِلقائى عِندَ العَودَة للنّافِذَة/التَّبويب
    useAutoRefresh({ onRefresh: () => loadPeriods() })

    const loadPeriods = async () => {
        try {
            setIsLoading(true)
            const companyId = await getActiveCompanyId(supabase)
            if (!companyId) return

            const { data, error } = await supabase
                .from("accounting_periods")
                .select("*")
                .eq("company_id", companyId)
                .order("period_start", { ascending: false })

            if (error) throw error
            setPeriods(data || [])
        } catch (error) {
            console.error("Error loading periods:", error)
            toast.error(appLang === 'en' ? 'Failed to load periods' : 'فشل تحميل الفترات')
        } finally {
            setIsLoading(false)
        }
    }

    const loadClosingPreview = async (period: AccountingPeriod) => {
        // v3.75.83 — نُزعَ من هنا نداءانِ لدالّةٍ لا وجودَ لها (`execute_sql`)، وكان
        // خطؤُهما لا يُقرَأُ أصلاً، فتُعرَضُ أصفارٌ كأنّها قياس. والسببُ مشروحٌ عندَ
        // تعريفِ ClosingPreview أعلاه. ولا يُعطَّلُ الإقفالُ بذلك: القيدُ يُحسَبُ
        // ويُكتَبُ فى القاعدةِ نفسِها عندَ التأكيد، والمعاينةُ وحدَها هى التى صمتت.
        try {
            setIsLoadingPreview(true)
            const companyId = await getActiveCompanyId(supabase)
            if (!companyId) return

            setClosingPreview({
                measured: false,
                totalRevenue: 0,
                totalExpense: 0,
                netIncome: 0,
                revenueAccounts: [],
                expenseAccounts: []
            })
        } catch (error) {
            console.error("Error loading preview:", error)
            toast.error(appLang === 'en' ? 'Failed to load preview' : 'فشل تحميل المعاينة')
        } finally {
            setIsLoadingPreview(false)
        }
    }

    const handleClosePeriod = async () => {
        if (!selectedPeriod) return

        try {
            setIsClosing(true)
            const companyId = await getActiveCompanyId(supabase)
            if (!companyId) return

            // Get Retained Earnings account
            const { data: retainedEarningsAcc } = await supabase
                .from("chart_of_accounts")
                .select("id")
                .eq("company_id", companyId)
                .eq("account_type", "equity")
                .ilike("account_name", "%retained%")
                .limit(1)
                .single()

            if (!retainedEarningsAcc) {
                toast.error(appLang === 'en' ? 'Retained Earnings account not found' : 'حساب الأرباح المحتجزة غير موجود')
                return
            }

            // Call close_accounting_period RPC
            const { data, error } = await supabase.rpc('close_accounting_period', {
                p_period_id: selectedPeriod.id,
                p_closed_by: null, // Will be set by RPC if needed
                p_retained_earnings_account_id: retainedEarningsAcc.id
            })

            if (error) throw error

            toast.success(
                appLang === 'en'
                    ? `Period closed successfully! Net Income: ${numberFmt.format(data.net_income)}`
                    : `تم إغلاق الفترة بنجاح! صافي الربح: ${numberFmt.format(data.net_income)}`
            )

            setSelectedPeriod(null)
            setClosingPreview(null)
            loadPeriods()
        } catch (error: any) {
            console.error("Error closing period:", error)
            toast.error(error.message || (appLang === 'en' ? 'Failed to close period' : 'فشل إغلاق الفترة'))
        } finally {
            setIsClosing(false)
        }
    }

    const getStatusBadge = (period: AccountingPeriod) => {
        if (period.is_locked || period.status === 'closed') {
            return (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 text-xs font-medium">
                    <Lock className="w-3 h-3" />
                    {appLang === 'en' ? 'Closed' : 'مغلقة'}
                </span>
            )
        }
        return (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-xs font-medium">
                <Unlock className="w-3 h-3" />
                {appLang === 'en' ? 'Open' : 'مفتوحة'}
            </span>
        )
    }

    // Pagination state
    const [pageSize, setPageSize] = useState(10)

    const {
        currentPage,
        totalPages,
        totalItems,
        paginatedItems: paginatedPeriods,
        goToPage,
        setPageSize: updatePageSize
    } = usePagination(periods, { pageSize })

    const handlePageSizeChange = (newSize: number) => {
        setPageSize(newSize)
        updatePageSize(newSize)
    }

    // تعريف أعمدة الجدول الموحّد (نفس الأعمدة والترتيب الأصلي)
    const tableColumns: DataTableColumn<AccountingPeriod>[] = [
        {
            key: 'period_name',
            header: appLang === 'en' ? 'Period Name' : 'اسم الفترة',
            type: 'text',
            align: 'right',
            format: (_, row) => (
                <span className="font-medium text-gray-900 dark:text-white">{row.period_name}</span>
            )
        },
        {
            key: 'period_start',
            header: appLang === 'en' ? 'Start Date' : 'تاريخ البداية',
            type: 'date',
            align: 'right',
            format: (_, row) => (
                <span className="text-gray-700 dark:text-gray-300">
                    {new Date(row.period_start).toLocaleDateString(appLang === 'en' ? 'en' : 'ar')}
                </span>
            )
        },
        {
            key: 'period_end',
            header: appLang === 'en' ? 'End Date' : 'تاريخ النهاية',
            type: 'date',
            align: 'right',
            format: (_, row) => (
                <span className="text-gray-700 dark:text-gray-300">
                    {new Date(row.period_end).toLocaleDateString(appLang === 'en' ? 'en' : 'ar')}
                </span>
            )
        },
        {
            key: 'status',
            header: appLang === 'en' ? 'Status' : 'الحالة',
            type: 'status',
            align: 'center',
            format: (_, row) => getStatusBadge(row)
        },
        {
            key: 'id',
            header: appLang === 'en' ? 'Actions' : 'الإجراءات',
            type: 'actions',
            align: 'center',
            format: (_, row) => (
                !row.is_locked && row.status !== 'closed' ? (
                    <Button
                        size="sm"
                        onClick={() => {
                            setSelectedPeriod(row)
                            loadClosingPreview(row)
                        }}
                        className="bg-purple-600 hover:bg-purple-700"
                    >
                        <Lock className="w-4 h-4 mr-2" />
                        {appLang === 'en' ? 'Close Period' : 'إغلاق الفترة'}
                    </Button>
                ) : (
                    <span className="text-xs text-gray-400 dark:text-gray-500">
                        {appLang === 'en' ? 'Closed' : 'مغلقة'}
                    </span>
                )
            )
        }
    ]

    return (
        <>
            <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
                <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 overflow-x-hidden">
                    <CompanyHeader />
                    <div className="space-y-4 sm:space-y-6 max-w-full">
                        {/* Header */}
                        <div className="bg-white dark:bg-slate-900 rounded-xl sm:rounded-2xl shadow-sm border border-gray-200 dark:border-slate-800 p-4 sm:p-6">
                            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 sm:gap-4">
                                <div className="flex items-center gap-3 sm:gap-4">
                                    <div className="p-2 sm:p-3 bg-purple-100 dark:bg-purple-900/30 rounded-lg sm:rounded-xl flex-shrink-0">
                                        <Calendar className="w-5 h-5 sm:w-6 sm:h-6 text-purple-600 dark:text-purple-400" />
                                    </div>
                                    <div className="min-w-0">
                                        <h1 className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white truncate">
                                            {appLang === 'en' ? 'Accounting Periods' : 'الفترات المحاسبية'}
                                        </h1>
                                        <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-0.5 sm:mt-1 truncate">
                                            {appLang === 'en' ? 'Manage and close accounting periods' : 'إدارة وإغلاق الفترات المحاسبية'}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Stats Cards */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <Card>
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">
                                        {appLang === 'en' ? 'Total Periods' : 'إجمالي الفترات'}
                                    </CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="text-2xl font-bold">{periods.length}</div>
                                </CardContent>
                            </Card>

                            <Card>
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">
                                        {appLang === 'en' ? 'Open Periods' : 'الفترات المفتوحة'}
                                    </CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                                        {periods.filter(p => !p.is_locked && p.status !== 'closed').length}
                                    </div>
                                </CardContent>
                            </Card>

                            <Card>
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">
                                        {appLang === 'en' ? 'Closed Periods' : 'الفترات المغلقة'}
                                    </CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="text-2xl font-bold text-red-600 dark:text-red-400">
                                        {periods.filter(p => p.is_locked || p.status === 'closed').length}
                                    </div>
                                </CardContent>
                            </Card>
                        </div>

                        {/* Periods List */}
                        <Card className="dark:bg-slate-900 dark:border-slate-800">
                            <CardHeader>
                                <CardTitle>{appLang === 'en' ? 'Periods List' : 'قائمة الفترات'}</CardTitle>
                            </CardHeader>
                            <CardContent>
                                {isLoading ? (
                                    <LoadingState type="table" rows={5} />
                                ) : periods.length === 0 ? (
                                    <EmptyState
                                        icon={Calendar}
                                        title={appLang === 'en' ? 'No periods yet' : 'لا توجد فترات حتى الآن'}
                                        description={appLang === 'en' ? 'Create your first accounting period' : 'أنشئ أول فترة محاسبية'}
                                    />
                                ) : (
                                    <>
                                        <DataTable
                                            columns={tableColumns}
                                            data={paginatedPeriods}
                                            keyField="id"
                                            lang={appLang}
                                            emptyMessage={appLang === 'en' ? 'No periods found' : 'لا توجد فترات'}
                                        />
                                        {periods.length > 0 && (
                                            <DataPagination
                                                currentPage={currentPage}
                                                totalPages={totalPages}
                                                totalItems={totalItems}
                                                pageSize={pageSize}
                                                onPageChange={goToPage}
                                                onPageSizeChange={handlePageSizeChange}
                                                lang={appLang}
                                            />
                                        )}
                                    </>
                                )}
                            </CardContent>
                        </Card>
                    </div>
                </main>
            </div>

            {/* Closing Dialog */}
            <Dialog open={!!selectedPeriod} onOpenChange={() => {
                setSelectedPeriod(null)
                setClosingPreview(null)
            }}>
                <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Lock className="w-5 h-5 text-purple-600" />
                            {appLang === 'en' ? 'Close Accounting Period' : 'إغلاق الفترة المحاسبية'}
                        </DialogTitle>
                        <DialogDescription>
                            {selectedPeriod && (
                                <span className="font-medium text-gray-900 dark:text-white">
                                    {selectedPeriod.period_name} ({new Date(selectedPeriod.period_start).toLocaleDateString(appLang === 'en' ? 'en' : 'ar')} - {new Date(selectedPeriod.period_end).toLocaleDateString(appLang === 'en' ? 'en' : 'ar')})
                                </span>
                            )}
                        </DialogDescription>
                    </DialogHeader>

                    {isLoadingPreview ? (
                        <LoadingState type="spinner" />
                    ) : closingPreview ? (
                        <div className="space-y-4">
                            {/* v3.75.83 — الحكمُ الثالث: لم يُقَسْ شىء، فلا يُعرَضُ رقمٌ كأنّه قياس. */}
                            {!closingPreview.measured && (
                                <div className="flex items-start gap-3 p-4 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-lg">
                                    <AlertCircle className="w-5 h-5 text-slate-600 dark:text-slate-300 flex-shrink-0 mt-0.5" />
                                    <div className="text-sm text-slate-700 dark:text-slate-200">
                                        <p className="font-semibold mb-1">
                                            {appLang === 'en' ? 'The preview was not measured' : 'المعاينة غير مقيسة'}
                                        </p>
                                        <p>
                                            {appLang === 'en'
                                                ? 'Revenue, expense and net income are not shown here because they are computed by the database at the moment of closing. Nothing is estimated on this screen.'
                                                : 'لا تُعرَض هنا الإيرادات والمصروفات وصافي الربح، لأنها تُحسَب في قاعدة البيانات نفسها لحظةَ الإقفال. ولا يُقدَّر على هذه الشاشة رقم.'}
                                        </p>
                                    </div>
                                </div>
                            )}

                            {/* Net Income Summary */}
                            {closingPreview.measured && (
                                <Card className={closingPreview.netIncome >= 0 ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800' : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'}>
                                    <CardContent className="pt-6">
                                        <div className="text-center">
                                            <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                                                {appLang === 'en' ? 'Net Income' : 'صافي الربح/الخسارة'}
                                            </p>
                                            <p className={`text-3xl font-bold ${closingPreview.netIncome >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                                                {numberFmt.format(closingPreview.netIncome)}
                                            </p>
                                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                                {appLang === 'en' ? `Revenue: ${numberFmt.format(closingPreview.totalRevenue)} - Expense: ${numberFmt.format(closingPreview.totalExpense)}` : `الإيرادات: ${numberFmt.format(closingPreview.totalRevenue)} - المصروفات: ${numberFmt.format(closingPreview.totalExpense)}`}
                                            </p>
                                        </div>
                                    </CardContent>
                                </Card>
                            )}

                            {/* Revenue Accounts */}
                            {closingPreview.revenueAccounts.length > 0 && (
                                <div>
                                    <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                                        {appLang === 'en' ? 'Revenue Accounts (will be zeroed)' : 'حسابات الإيرادات (سيتم تصفيرها)'}
                                    </h4>
                                    <div className="space-y-1">
                                        {closingPreview.revenueAccounts.map((acc, idx) => (
                                            <div key={idx} className="flex justify-between items-center p-2 bg-gray-50 dark:bg-slate-800 rounded">
                                                <span className="text-sm text-gray-700 dark:text-gray-300">{acc.account_name}</span>
                                                <span className="text-sm font-medium text-green-600 dark:text-green-400">{numberFmt.format(acc.balance)}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Expense Accounts */}
                            {closingPreview.expenseAccounts.length > 0 && (
                                <div>
                                    <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                                        {appLang === 'en' ? 'Expense Accounts (will be zeroed)' : 'حسابات المصروفات (سيتم تصفيرها)'}
                                    </h4>
                                    <div className="space-y-1">
                                        {closingPreview.expenseAccounts.map((acc, idx) => (
                                            <div key={idx} className="flex justify-between items-center p-2 bg-gray-50 dark:bg-slate-800 rounded">
                                                <span className="text-sm text-gray-700 dark:text-gray-300">{acc.account_name}</span>
                                                <span className="text-sm font-medium text-red-600 dark:text-red-400">{numberFmt.format(acc.balance)}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Warning */}
                            <div className="flex items-start gap-3 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                                <AlertCircle className="w-5 h-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
                                <div className="text-sm text-yellow-800 dark:text-yellow-200">
                                    <p className="font-semibold mb-1">
                                        {appLang === 'en' ? 'Warning: This action cannot be undone!' : 'تحذير: هذا الإجراء لا يمكن التراجع عنه!'}
                                    </p>
                                    <p>
                                        {appLang === 'en'
                                            ? 'Closing this period will lock all entries and prevent any modifications. A closing entry will be created automatically.'
                                            : 'إغلاق هذه الفترة سيقفل جميع القيود ويمنع أي تعديلات. سيتم إنشاء قيد إقفال تلقائياً.'}
                                    </p>
                                </div>
                            </div>
                        </div>
                    ) : null}

                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => {
                                setSelectedPeriod(null)
                                setClosingPreview(null)
                            }}
                            disabled={isClosing}
                        >
                            {appLang === 'en' ? 'Cancel' : 'إلغاء'}
                        </Button>
                        <Button
                            onClick={handleClosePeriod}
                            disabled={isClosing || !closingPreview}
                            className="bg-purple-600 hover:bg-purple-700"
                        >
                            {isClosing ? (
                                <>{appLang === 'en' ? 'Closing...' : 'جاري الإغلاق...'}</>
                            ) : (
                                <>
                                    <CheckCircle2 className="w-4 h-4 mr-2" />
                                    {appLang === 'en' ? 'Confirm Close' : 'تأكيد الإغلاق'}
                                </>
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    )
}
