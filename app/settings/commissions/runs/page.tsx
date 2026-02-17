"use client"

/**
 * Commission Runs Dashboard
 * 
 * Main page for viewing and managing commission runs
 * 
 * Features:
 * - DataTable with runs
 * - Filters: Status, Period, Created By
 * - RBAC-controlled actions
 * - Workflow state management
 * 
 * CRITICAL: No business logic, API-only operations
 */

import { useState, useEffect, useMemo } from "react"
import { Sidebar } from "@/components/sidebar"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { FilterContainer } from "@/components/ui/filter-container"
import { LoadingState } from "@/components/ui/loading-state"
import { EmptyState } from "@/components/ui/empty-state"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useSupabase } from "@/lib/supabase/hooks"
import { Plus, Search, X, BarChart3, Eye, CheckCircle2, BookOpen, Wallet } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { getActiveCompanyId } from "@/lib/company"
import { canAction } from "@/lib/authz"
import { DataTable, type DataTableColumn } from "@/components/DataTable"
import { RunStatusBadge } from "@/components/commissions/run-status-badge"
import { RunCalculationDialog } from "@/components/commissions/run-calculation-dialog"
import { useRouter } from "next/navigation"

type RunStatus = 'draft' | 'reviewed' | 'approved' | 'posted' | 'paid' | 'cancelled'

interface CommissionRun {
    id: string
    period_start: string
    period_end: string
    status: RunStatus
    total_commission: number
    total_clawbacks: number
    net_commission: number
    created_at: string
    created_by: string | null
    reviewed_at: string | null
    approved_at: string | null
    posted_at: string | null
    paid_at: string | null
    payroll_run_id: string | null // NEW: Link to payroll run
    // Joined data
    created_by_user?: {
        display_name?: string
        username?: string
    } | null
    payroll_runs?: { // NEW: Joined payroll run data
        id: string
        period_year: number
        period_month: number
    } | null
}

export default function CommissionRunsPage() {
    const supabase = useSupabase()
    const { toast } = useToast()
    const router = useRouter()

    // State
    const [runs, setRuns] = useState<CommissionRun[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [searchTerm, setSearchTerm] = useState("")
    const [appLang, setAppLang] = useState<'ar' | 'en'>('ar')

    // Filters
    const [filterStatus, setFilterStatus] = useState<string>("all")
    const [filterDateFrom, setFilterDateFrom] = useState<string>("")
    const [filterDateTo, setFilterDateTo] = useState<string>("")

    // Dialog state
    const [isCalculationDialogOpen, setIsCalculationDialogOpen] = useState(false)

    // Permissions
    const [permWrite, setPermWrite] = useState(false)
    const [permUpdate, setPermUpdate] = useState(false)
    const [permDelete, setPermDelete] = useState(false)
    const [permissionsLoaded, setPermissionsLoaded] = useState(false)

    // Currency
    const [appCurrency, setAppCurrency] = useState<string>('EGP')
    const currencySymbols: Record<string, string> = {
        EGP: '£', USD: '$', EUR: '€', GBP: '£', SAR: '﷼', AED: 'د.إ'
    }
    const currencySymbol = currencySymbols[appCurrency] || appCurrency

    /**
     * Initialize language and currency
     */
    useEffect(() => {
        try {
            setAppLang((localStorage.getItem('app_language') || 'ar') === 'en' ? 'en' : 'ar')
            setAppCurrency(localStorage.getItem('app_currency') || 'EGP')
        } catch { }
    }, [])

    /**
     * Load permissions
     */
    useEffect(() => {
        const loadPermissions = async () => {
            const [write, update, del] = await Promise.all([
                canAction(supabase, 'commission_runs', 'write'),
                canAction(supabase, 'commission_runs', 'update'),
                canAction(supabase, 'commission_runs', 'delete')
            ])
            setPermWrite(write)
            setPermUpdate(update)
            setPermDelete(del)
            setPermissionsLoaded(true)
        }
        loadPermissions()
    }, [supabase])

    /**
     * Load runs
     */
    useEffect(() => {
        if (permissionsLoaded) {
            loadRuns()
        }
    }, [permissionsLoaded])

    const loadRuns = async () => {
        try {
            setIsLoading(true)

            const activeCompanyId = await getActiveCompanyId(supabase)
            if (!activeCompanyId) return

            // Fetch runs with creator info
            const { data, error } = await supabase
                .from('commission_runs')
                .select(`
          *,
          created_by_user:created_by(
            display_name:user_profiles(display_name),
            username:user_profiles(username)
          ),
          payroll_runs:payroll_run_id(
            id,
            period_year,
            period_month
          )
        `)
                .eq('company_id', activeCompanyId)
                .order('created_at', { ascending: false })

            if (error) throw error

            setRuns(data || [])
        } catch (error) {
            console.error('Error loading runs:', error)
            toast({
                title: appLang === 'en' ? 'Error' : 'خطأ',
                description: appLang === 'en' ? 'Failed to load commission runs' : 'فشل تحميل تشغيلات العمولة',
                variant: 'destructive'
            })
        } finally {
            setIsLoading(false)
        }
    }

    /**
     * Handle calculation complete
     */
    const handleCalculationComplete = (runId: string) => {
        loadRuns()
        // Navigate to run details
        router.push(`/settings/commissions/runs/${runId}`)
    }

    /**
     * Handle view run
     */
    const handleViewRun = (runId: string) => {
        router.push(`/settings/commissions/runs/${runId}`)
    }

    /**
     * Format currency
     */
    const formatCurrency = (amount: number) => {
        return `${currencySymbol}${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    }

    /**
     * Format date
     */
    const formatDate = (dateStr: string) => {
        const date = new Date(dateStr)
        return date.toLocaleDateString(appLang === 'en' ? 'en-US' : 'ar-EG', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        })
    }

    /**
     * Filtered runs
     */
    const filteredRuns = useMemo(() => {
        return runs.filter((run) => {
            // Status filter
            if (filterStatus !== 'all' && run.status !== filterStatus) return false

            // Date range filter
            if (filterDateFrom && run.period_start < filterDateFrom) return false
            if (filterDateTo && run.period_end > filterDateTo) return false

            // Search filter (by period)
            const query = searchTerm.trim().toLowerCase()
            if (query) {
                const periodStr = `${run.period_start} - ${run.period_end}`.toLowerCase()
                if (!periodStr.includes(query)) return false
            }

            return true
        })
    }, [runs, filterStatus, filterDateFrom, filterDateTo, searchTerm])

    /**
     * Active filter count
     */
    const activeFilterCount = [
        filterStatus !== 'all',
        !!filterDateFrom,
        !!filterDateTo,
        !!searchTerm
    ].filter(Boolean).length

    /**
     * Clear filters
     */
    const clearFilters = () => {
        setFilterStatus('all')
        setFilterDateFrom('')
        setFilterDateTo('')
        setSearchTerm('')
    }

    /**
     * Table columns
     */
    const tableColumns: DataTableColumn<CommissionRun>[] = useMemo(() => [
        {
            key: 'period_start',
            header: appLang === 'en' ? 'Period' : 'الفترة',
            type: 'custom',
            align: 'left',
            width: 'min-w-[180px]',
            format: (_, run) => (
                <div className="text-sm">
                    <div className="font-medium text-gray-900 dark:text-white">
                        {formatDate(run.period_start)}
                    </div>
                    <div className="text-gray-500 dark:text-gray-400">
                        {appLang === 'en' ? 'to' : 'إلى'} {formatDate(run.period_end)}
                    </div>
                </div>
            )
        },
        {
            key: 'status',
            header: appLang === 'en' ? 'Status' : 'الحالة',
            type: 'custom',
            align: 'center',
            width: 'min-w-[130px]',
            format: (_, run) => (
                <RunStatusBadge status={run.status} lang={appLang} />
            )
        },
        {
            key: 'payroll_run_id',
            header: appLang === 'en' ? 'Payroll' : 'المرتبات',
            type: 'custom',
            align: 'center',
            width: 'min-w-[130px]',
            format: (_, run) => (
                run.payroll_runs ? (
                    <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 gap-1">
                        <Wallet className="h-3 w-3" />
                        {run.payroll_runs.period_month}/{run.payroll_runs.period_year}
                    </span>
                ) : (
                    <span className="text-gray-400 text-xs">-</span>
                )
            )
        },
        {
            key: 'total_commission',
            header: appLang === 'en' ? 'Gross' : 'الإجمالي',
            type: 'custom',
            align: 'right',
            width: 'min-w-[120px]',
            format: (value) => (
                <span className="font-medium text-gray-900 dark:text-white">
                    {formatCurrency(Number(value || 0))}
                </span>
            )
        },
        {
            key: 'total_clawbacks',
            header: appLang === 'en' ? 'Clawbacks' : 'الاستردادات',
            type: 'custom',
            align: 'right',
            width: 'min-w-[120px]',
            format: (value) => (
                <span className="text-red-600 dark:text-red-400">
                    {formatCurrency(Number(value || 0))}
                </span>
            )
        },
        {
            key: 'net_commission',
            header: appLang === 'en' ? 'Net' : 'الصافي',
            type: 'custom',
            align: 'right',
            width: 'min-w-[120px]',
            format: (value) => (
                <span className="font-bold text-green-600 dark:text-green-400">
                    {formatCurrency(Number(value || 0))}
                </span>
            )
        },
        {
            key: 'id',
            header: appLang === 'en' ? 'Actions' : 'الإجراءات',
            type: 'custom',
            align: 'center',
            width: 'min-w-[100px]',
            format: (_, run) => (
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleViewRun(run.id)}
                    className="h-8 gap-2"
                >
                    <Eye className="h-4 w-4" />
                    {appLang === 'en' ? 'View' : 'عرض'}
                </Button>
            )
        }
    ], [appLang, currencySymbol])

    return (
        <div className="flex h-screen overflow-hidden bg-gray-50 dark:bg-gray-900">
            <Sidebar />
            <div className="flex-1 flex flex-col overflow-hidden">
                <main className="flex-1 overflow-y-auto p-6">
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
                            <CardTitle className="text-2xl font-bold flex items-center gap-2">
                                <BarChart3 className="h-6 w-6" />
                                {appLang === 'en' ? 'Commission Runs' : 'تشغيلات العمولة'}
                            </CardTitle>
                            <Button
                                onClick={() => setIsCalculationDialogOpen(true)}
                                disabled={!permWrite}
                                className="gap-2"
                            >
                                <Plus className="h-4 w-4" />
                                {appLang === 'en' ? 'New Run' : 'تشغيل جديد'}
                            </Button>
                        </CardHeader>

                        <CardContent>
                            {/* Filters */}
                            <FilterContainer
                                title={appLang === 'en' ? 'Filter Runs' : 'تصفية التشغيلات'}
                                activeCount={activeFilterCount}
                                onClear={clearFilters}
                            >
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                    {/* Search */}
                                    <div className="space-y-2">
                                        <Label htmlFor="search">
                                            {appLang === 'en' ? 'Search' : 'بحث'}
                                        </Label>
                                        <div className="relative">
                                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                                            <Input
                                                id="search"
                                                value={searchTerm}
                                                onChange={(e) => setSearchTerm(e.target.value)}
                                                placeholder={appLang === 'en' ? 'Search by period...' : 'البحث بالفترة...'}
                                                className="pl-9"
                                            />
                                            {searchTerm && (
                                                <button
                                                    onClick={() => setSearchTerm('')}
                                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                                >
                                                    <X className="h-4 w-4" />
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    {/* Status Filter */}
                                    <div className="space-y-2">
                                        <Label htmlFor="status">
                                            {appLang === 'en' ? 'Status' : 'الحالة'}
                                        </Label>
                                        <Select value={filterStatus} onValueChange={setFilterStatus}>
                                            <SelectTrigger id="status">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="all">{appLang === 'en' ? 'All' : 'الكل'}</SelectItem>
                                                <SelectItem value="draft">{appLang === 'en' ? 'Draft' : 'مسودة'}</SelectItem>
                                                <SelectItem value="reviewed">{appLang === 'en' ? 'Reviewed' : 'تمت المراجعة'}</SelectItem>
                                                <SelectItem value="approved">{appLang === 'en' ? 'Approved' : 'معتمد'}</SelectItem>
                                                <SelectItem value="posted">{appLang === 'en' ? 'Posted' : 'مُرحّل'}</SelectItem>
                                                <SelectItem value="paid">{appLang === 'en' ? 'Paid' : 'مدفوع'}</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    {/* Date From */}
                                    <div className="space-y-2">
                                        <Label htmlFor="date_from">
                                            {appLang === 'en' ? 'Period From' : 'الفترة من'}
                                        </Label>
                                        <Input
                                            id="date_from"
                                            type="date"
                                            value={filterDateFrom}
                                            onChange={(e) => setFilterDateFrom(e.target.value)}
                                        />
                                    </div>

                                    {/* Date To */}
                                    <div className="space-y-2">
                                        <Label htmlFor="date_to">
                                            {appLang === 'en' ? 'Period To' : 'الفترة إلى'}
                                        </Label>
                                        <Input
                                            id="date_to"
                                            type="date"
                                            value={filterDateTo}
                                            onChange={(e) => setFilterDateTo(e.target.value)}
                                        />
                                    </div>
                                </div>
                            </FilterContainer>

                            {/* Table */}
                            {isLoading ? (
                                <LoadingState message={appLang === 'en' ? 'Loading runs...' : 'جاري تحميل التشغيلات...'} />
                            ) : filteredRuns.length === 0 ? (
                                <EmptyState
                                    icon={BarChart3}
                                    title={appLang === 'en' ? 'No commission runs found' : 'لا توجد تشغيلات عمولة'}
                                    description={
                                        activeFilterCount > 0
                                            ? (appLang === 'en' ? 'Try adjusting your filters' : 'حاول تعديل الفلاتر')
                                            : (appLang === 'en' ? 'Create your first commission run to get started' : 'أنشئ أول تشغيل عمولة للبدء')
                                    }
                                    action={
                                        permWrite && activeFilterCount === 0 ? {
                                            label: appLang === 'en' ? 'New Run' : 'تشغيل جديد',
                                            onClick: () => setIsCalculationDialogOpen(true),
                                            icon: Plus
                                        } : undefined
                                    }
                                />
                            ) : (
                                <DataTable
                                    data={filteredRuns}
                                    columns={tableColumns}
                                    lang={appLang}
                                    keyField="id"
                                />
                            )}
                        </CardContent>
                    </Card>
                </main>
            </div>

            {/* Calculation Dialog */}
            <RunCalculationDialog
                open={isCalculationDialogOpen}
                onOpenChange={setIsCalculationDialogOpen}
                onCalculationComplete={handleCalculationComplete}
                lang={appLang}
            />
        </div>
    )
}
