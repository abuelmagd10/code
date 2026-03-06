"use client"
import { Card, CardContent } from "@/components/ui/card"
import { useSupabase } from "@/lib/supabase/hooks"
import { useEffect, useState } from "react"
import { useToast } from "@/hooks/use-toast"
import { getActiveCompanyId } from "@/lib/company"
import { PageHeaderList } from "@/components/PageHeader"
import { DataTable, type DataTableColumn } from "@/components/DataTable"
import { FilterContainer } from "@/components/ui/filter-container"
import { FileBarChart, Download } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

export default function AttendanceReportsPage() {
    const supabase = useSupabase()
    const { toast } = useToast()
    const [appLang, setAppLang] = useState<'ar' | 'en'>('ar')
    const [companyId, setCompanyId] = useState<string>("")
    const [employees, setEmployees] = useState<any[]>([])

    const [reportsData, setReportsData] = useState<any[]>([])
    const [loading, setLoading] = useState(false)

    // Filter States
    const [reportType, setReportType] = useState<string>("summary")
    const [filterStartDate, setFilterStartDate] = useState<string>(new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10))
    const [filterEndDate, setFilterEndDate] = useState<string>(new Date().toISOString().slice(0, 10))
    const [filterEmployeeId, setFilterEmployeeId] = useState<string>("all")

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

    useEffect(() => {
        (async () => {
            const cid = await getActiveCompanyId(supabase);
            if (cid) {
                setCompanyId(cid);
                await Promise.all([
                    loadFiltersData(cid),
                    loadReports(cid, reportType) // Ensure it runs after cid is available
                ])
            }
        })()
    }, [supabase])

    useEffect(() => {
        if (companyId) {
            loadReports(companyId, reportType)
        }
    }, [filterStartDate, filterEndDate, filterEmployeeId, reportType])

    const loadFiltersData = async (cid: string) => {
        try {
            const res = await fetch(`/api/hr/employees?companyId=${encodeURIComponent(cid)}`)
            if (res.ok) setEmployees(await res.json())
        } catch { }
    }

    const loadReports = async (cid: string, type: string) => {
        setLoading(true)
        try {
            const queryParams = new URLSearchParams({
                companyId: cid,
                type: type,
                from: filterStartDate,
                to: filterEndDate
            })
            if (filterEmployeeId && filterEmployeeId !== 'all') queryParams.append('employeeId', filterEmployeeId)

            const res = await fetch(`/api/hr/attendance/reports?${queryParams.toString()}`)
            const data = await res.json()
            if (res.ok) {
                setReportsData(Array.isArray(data) ? data : [])
            } else {
                setReportsData([])
                toast({ title: t('Error', 'خطأ'), description: data.error, variant: 'destructive' })
            }
        } catch (e) {
            console.error(e)
            setReportsData([])
        } finally {
            setLoading(false)
        }
    }

    const exportToCSV = () => {
        if (reportsData.length === 0) {
            toast({ title: t('No data to export', 'لا توجد بيانات للتصدير') })
            return
        }

        let headers: string[] = []
        let csvData: string[] = []

        if (reportType === 'summary') {
            headers = ['Employee', 'Days Present', 'Total Hours', 'Total Late (min)', 'Total Overtime (min)', 'Total Early Leave (min)']
            csvData = reportsData.map(row => [
                row.employee?.full_name,
                row.daysPresent,
                row.totalWorkingHours,
                row.totalLateMins,
                row.totalOvertimeMins,
                row.totalEarlyLeaveMins
            ].join(','))
        } else if (reportType === 'late') {
            headers = ['Employee', 'Days Present', 'Total Late (min)']
            csvData = reportsData.map(row => [
                row.employee?.full_name,
                row.daysPresent,
                row.totalLateMins
            ].join(','))
        } else if (reportType === 'overtime') {
            headers = ['Employee', 'Days Present', 'Total Overtime (min)']
            csvData = reportsData.map(row => [
                row.employee?.full_name,
                row.daysPresent,
                row.totalOvertimeMins
            ].join(','))
        } else if (reportType === 'absence') {
            headers = ['Employee', 'Total Absence Days', 'Dates']
            csvData = reportsData.map(row => [
                row.employee?.full_name,
                row.totalAbsenceDays,
                `"${row.absenceDays.join(' | ')}"` // Quote to handle commas in csv safely
            ].join(','))
        }

        const csvContent = "data:text/csv;charset=utf-8,\uFEFF" + [headers.join(','), ...csvData].join('\n')
        const encodedUri = encodeURI(csvContent)
        const link = document.createElement("a")
        link.setAttribute("href", encodedUri)
        link.setAttribute("download", `attendance_${reportType}_report_${filterStartDate}_to_${filterEndDate}.csv`)
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
    }

    const getColumns = (): DataTableColumn[] => {
        const baseColumns: DataTableColumn[] = [
            {
                header: t('Employee', 'الموظف'),
                key: 'employeeName',
                format: (_, row: any) => row.employee?.full_name || 'N/A'
            }
        ]

        if (reportType === 'absence') {
            return [
                ...baseColumns,
                {
                    header: t('Total Absence', 'إجمالي الغياب'),
                    key: 'totalAbsenceDays',
                    format: (_, row: any) => <span className="text-rose-600 font-bold">{row.totalAbsenceDays} {t('Days', 'أيام')}</span>
                },
                {
                    header: t('Absence Dates', 'تواريخ الغياب'),
                    key: 'absenceDays',
                    format: (_, row: any) => <span className="text-xs text-gray-500 whitespace-pre-wrap max-w-xs block">{row.absenceDays.join(', ')}</span>
                }
            ]
        }

        const aggCols: DataTableColumn[] = []
        if (reportType === 'summary') {
            aggCols.push({ header: t('Days Present', 'أيام الحضور'), key: 'daysPresent' })
            aggCols.push({ header: t('Total Hours', 'إجمالي الساعات'), key: 'totalWorkingHours', format: (_, row: any) => <span className="font-semibold">{row.totalWorkingHours} h</span> })
            aggCols.push({ header: t('Late', 'التأخير (د)'), key: 'totalLateMins', format: (_, row: any) => <span className={row.totalLateMins > 0 ? "text-amber-600" : ""}>{row.totalLateMins}m</span> })
            aggCols.push({ header: t('Overtime', 'الإضافي (د)'), key: 'totalOvertimeMins', format: (_, row: any) => <span className={row.totalOvertimeMins > 0 ? "text-emerald-600" : ""}>{row.totalOvertimeMins}m</span> })
            aggCols.push({ header: t('Early Leave', 'خروج مبكر (د)'), key: 'totalEarlyLeaveMins', format: (_, row: any) => <span className={row.totalEarlyLeaveMins > 0 ? "text-rose-600" : ""}>{row.totalEarlyLeaveMins}m</span> })
        } else if (reportType === 'late') {
            aggCols.push({ header: t('Total Late', 'إجمالي التأخير'), key: 'totalLateMins', format: (_, row: any) => <span className="text-amber-600 font-bold text-lg">{row.totalLateMins} {t('mins', 'دقيقة')}</span> })
        } else if (reportType === 'overtime') {
            aggCols.push({ header: t('Total Overtime', 'إجمالي الإضافي'), key: 'totalOvertimeMins', format: (_, row: any) => <span className="text-emerald-600 font-bold text-lg">{row.totalOvertimeMins} {t('mins', 'دقيقة')}</span> })
        }

        return [...baseColumns, ...aggCols]
    }

    const activeFiltersCount = [
        filterEmployeeId !== 'all'
    ].filter(Boolean).length

    return (
        <div className="space-y-6">
            <PageHeaderList
                title={t('Advanced Reports', 'التقارير المتقدمة')}
                description={t('Generate and export aggregated attendance records', 'استخراج وتصدير تقارير الحضور المجمعة')}
                icon={FileBarChart}
                additionalActions={[
                    {
                        label: t('Export CSV', 'تصدير CSV'),
                        icon: Download,
                        onClick: exportToCSV,
                        variant: "outline",
                        className: "bg-white dark:bg-slate-800"
                    }
                ]}
            />

            <FilterContainer
                title={t('Filters', 'الفلاتر')}
                activeCount={activeFiltersCount}
                onClear={() => {
                    setFilterEmployeeId('all');
                }}
            >
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
                    {/* Report Type Selector (Important) */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium">{t('Report Type', 'نوع التقرير')}</label>
                        <Select value={reportType} onValueChange={setReportType}>
                            <SelectTrigger className="bg-white dark:bg-slate-900 border-blue-200 dark:border-blue-800 focus:ring-blue-500">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="summary">{t('Working Hours Summary', 'ملخص ساعات العمل')}</SelectItem>
                                <SelectItem value="late">{t('Late Report', 'تقرير التأخير')}</SelectItem>
                                <SelectItem value="overtime">{t('Overtime Report', 'تقرير العمل الإضافي')}</SelectItem>
                                <SelectItem value="absence">{t('Absence Report', 'تقرير الغياب')}</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Date Filters */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium">{t('Date From', 'من تاريخ')}</label>
                        <input
                            type="date"
                            value={filterStartDate}
                            onChange={(e) => setFilterStartDate(e.target.value)}
                            className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-medium">{t('Date To', 'إلى تاريخ')}</label>
                        <input
                            type="date"
                            value={filterEndDate}
                            onChange={(e) => setFilterEndDate(e.target.value)}
                            className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium">{t('Employee', 'الموظف')}</label>
                        <Select value={filterEmployeeId} onValueChange={setFilterEmployeeId}>
                            <SelectTrigger className="bg-white dark:bg-slate-800">
                                <SelectValue placeholder={t('All Employees', 'جميع الموظفين')} />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">{t('All Employees', 'جميع الموظفين')}</SelectItem>
                                {employees.map((e: any) => (
                                    <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>
            </FilterContainer>

            <Card className="border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm">
                <CardContent className="p-0">
                    {loading ? (
                        <div className="flex justify-center items-center py-8">
                            <span className="text-sm text-gray-500">{t('Loading...', 'جاري التحميل...')}</span>
                        </div>
                    ) : (
                        <DataTable
                            columns={getColumns()}
                            data={reportsData.map((d: any, index: number) => ({ ...d, id: d.employee?.id || index.toString() }))}
                            keyField="id"
                        />
                    )}
                </CardContent>
            </Card>
        </div>
    )
}
