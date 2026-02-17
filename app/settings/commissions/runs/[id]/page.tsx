"use client"

/**
 * Commission Run Details Page
 * 
 * Detailed view of a commission run with:
 * - Run header (period, status, workflow tracking)
 * - Summary cards (totals, counts)
 * - Employee breakdown table
 * - State-based action buttons
 * 
 * CRITICAL: No calculations, display only
 */

import { useState, useEffect, useMemo } from "react"
import { useParams, useRouter } from "next/navigation"
import { Sidebar } from "@/components/sidebar"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { LoadingState } from "@/components/ui/loading-state"
import { useSupabase } from "@/lib/supabase/hooks"
import {
    ArrowLeft,
    Eye,
    CheckCircle2,
    BookOpen,
    Wallet,
    XCircle,
    Users,
    FileText,
    TrendingUp,
    TrendingDown,
    DollarSign
} from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { getActiveCompanyId } from "@/lib/company"
import { canAction } from "@/lib/authz"
import { DataTable, type DataTableColumn } from "@/components/DataTable"
import { RunStatusBadge } from "@/components/commissions/run-status-badge"
import { RunPaymentDialog } from "@/components/commissions/run-payment-dialog"

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
    reviewed_by: string | null
    approved_by: string | null
    posted_by: string | null
    paid_by: string | null
    reviewed_at: string | null
    approved_at: string | null
    posted_at: string | null
    paid_at: string | null
    notes: string | null
}

interface EmployeeCommission {
    employee_id: string
    employee_name: string
    invoice_count: number
    clawback_count: number
    gross_commission: number
    clawbacks: number
    net_commission: number
}

export default function RunDetailsPage() {
    const params = useParams()
    const router = useRouter()
    const supabase = useSupabase()
    const { toast } = useToast()

    const runId = params.id as string

    // State
    const [run, setRun] = useState<CommissionRun | null>(null)
    const [employeeBreakdown, setEmployeeBreakdown] = useState<EmployeeCommission[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [appLang, setAppLang] = useState<'ar' | 'en'>('ar')

    // Permissions
    const [canUpdate, setCanUpdate] = useState(false)
    const [canApprove, setCanApprove] = useState(false)
    const [isOwner, setIsOwner] = useState(false)

    // Payment Dialog
    const [isPaymentDialogOpen, setIsPaymentDialogOpen] = useState(false)

    // Currency
    const [appCurrency, setAppCurrency] = useState<string>('EGP')
    const currencySymbols: Record<string, string> = {
        EGP: '£', USD: '$', EUR: '€', GBP: '£', SAR: '﷼', AED: 'د.إ'
    }
    const currencySymbol = currencySymbols[appCurrency] || appCurrency

    /**
     * Initialize
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
            const update = await canAction(supabase, 'commission_runs', 'update')
            setCanUpdate(update)

            // Check if user is owner
            const { data: { user } } = await supabase.auth.getUser()
            if (user) {
                const activeCompanyId = await getActiveCompanyId(supabase)
                if (activeCompanyId) {
                    const { data: member } = await supabase
                        .from('company_members')
                        .select('role')
                        .eq('company_id', activeCompanyId)
                        .eq('user_id', user.id)
                        .single()

                    const owner = member?.role === 'owner'
                    setIsOwner(owner)
                    setCanApprove(owner)
                }
            }
        }
        loadPermissions()
    }, [supabase])

    /**
     * Load run details
     */
    useEffect(() => {
        loadRunDetails()
    }, [runId])

    const loadRunDetails = async () => {
        try {
            setIsLoading(true)

            const activeCompanyId = await getActiveCompanyId(supabase)
            if (!activeCompanyId) return

            // Load run
            const { data: runData, error: runError } = await supabase
                .from('commission_runs')
                .select('*')
                .eq('id', runId)
                .eq('company_id', activeCompanyId)
                .single()

            if (runError) throw runError

            setRun(runData)

            // Load employee breakdown from commission_ledger
            const { data: ledgerData, error: ledgerError } = await supabase
                .from('commission_ledger')
                .select(`
          employee_id,
          amount,
          source_type,
          employees!inner(
            user_id,
            user_profiles!inner(display_name)
          )
        `)
                .eq('commission_run_id', runId)
                .eq('company_id', activeCompanyId)

            if (ledgerError) throw ledgerError

            // Group by employee
            const employeeMap = new Map<string, EmployeeCommission>()

            ledgerData?.forEach((entry: any) => {
                const empId = entry.employee_id
                const empName = entry.employees?.user_profiles?.display_name || 'Unknown'
                const amount = Number(entry.amount || 0)
                const isClawback = entry.source_type === 'credit_note'

                if (!employeeMap.has(empId)) {
                    employeeMap.set(empId, {
                        employee_id: empId,
                        employee_name: empName,
                        invoice_count: 0,
                        clawback_count: 0,
                        gross_commission: 0,
                        clawbacks: 0,
                        net_commission: 0
                    })
                }

                const emp = employeeMap.get(empId)!

                if (isClawback) {
                    emp.clawback_count++
                    emp.clawbacks += Math.abs(amount)
                } else {
                    emp.invoice_count++
                    emp.gross_commission += amount
                }

                emp.net_commission = emp.gross_commission - emp.clawbacks
            })

            setEmployeeBreakdown(Array.from(employeeMap.values()))
        } catch (error) {
            console.error('Error loading run details:', error)
            toast({
                title: appLang === 'en' ? 'Error' : 'خطأ',
                description: appLang === 'en' ? 'Failed to load run details' : 'فشل تحميل تفاصيل التشغيل',
                variant: 'destructive'
            })
        } finally {
            setIsLoading(false)
        }
    }

    /**
     * Handle review
     */
    const handleReview = async () => {
        if (!run || !canUpdate) return

        try {
            const { error } = await supabase
                .from('commission_runs')
                .update({
                    status: 'reviewed',
                    reviewed_by: (await supabase.auth.getUser()).data.user?.id,
                    reviewed_at: new Date().toISOString()
                })
                .eq('id', runId)

            if (error) throw error

            toast({
                title: appLang === 'en' ? 'Run Reviewed' : 'تمت المراجعة',
                description: appLang === 'en' ? 'Run marked as reviewed' : 'تم وضع علامة مراجعة على التشغيل'
            })

            loadRunDetails()
        } catch (error: any) {
            toast({
                title: appLang === 'en' ? 'Error' : 'خطأ',
                description: error.message,
                variant: 'destructive'
            })
        }
    }

    /**
     * Handle approve
     */
    const handleApprove = async () => {
        if (!run || !canApprove) return

        try {
            const response = await fetch(`/api/commissions/runs/${runId}/approve`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ notes: '' })
            })

            if (!response.ok) {
                const error = await response.json()
                throw new Error(error.error || 'Failed to approve')
            }

            toast({
                title: appLang === 'en' ? 'Run Approved' : 'تم الاعتماد',
                description: appLang === 'en' ? 'Run approved successfully' : 'تم اعتماد التشغيل بنجاح'
            })

            loadRunDetails()
        } catch (error: any) {
            toast({
                title: appLang === 'en' ? 'Error' : 'خطأ',
                description: error.message,
                variant: 'destructive'
            })
        }
    }

    /**
     * Handle post
     */
    const handlePost = async () => {
        if (!run || !isOwner) return

        try {
            const response = await fetch(`/api/commissions/runs/${runId}/post`, {
                method: 'POST'
            })

            if (!response.ok) {
                const error = await response.json()
                throw new Error(error.error || 'Failed to post')
            }

            toast({
                title: appLang === 'en' ? 'Run Posted' : 'تم الترحيل',
                description: appLang === 'en' ? 'Run posted to accounting' : 'تم ترحيل التشغيل للمحاسبة'
            })

            loadRunDetails()
        } catch (error: any) {
            toast({
                title: appLang === 'en' ? 'Error' : 'خطأ',
                description: error.message,
                variant: 'destructive'
            })
        }
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
    const formatDate = (dateStr: string | null) => {
        if (!dateStr) return '-'
        const date = new Date(dateStr)
        return date.toLocaleDateString(appLang === 'en' ? 'en-US' : 'ar-EG', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        })
    }

    /**
     * Table columns
     */
    const tableColumns: DataTableColumn<EmployeeCommission>[] = useMemo(() => [
        {
            key: 'employee_name',
            header: appLang === 'en' ? 'Employee' : 'الموظف',
            type: 'text',
            align: 'left',
            width: 'min-w-[180px]',
            format: (value) => (
                <span className="font-medium text-gray-900 dark:text-white">{value}</span>
            )
        },
        {
            key: 'invoice_count',
            header: appLang === 'en' ? 'Invoices' : 'الفواتير',
            type: 'number',
            align: 'center',
            width: 'min-w-[100px]'
        },
        {
            key: 'clawback_count',
            header: appLang === 'en' ? 'Returns' : 'المرتجعات',
            type: 'number',
            align: 'center',
            width: 'min-w-[100px]'
        },
        {
            key: 'gross_commission',
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
            key: 'clawbacks',
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
        }
    ], [appLang, currencySymbol])

    if (isLoading) {
        return (
            <div className="flex h-screen overflow-hidden bg-gray-50 dark:bg-gray-900">
                <Sidebar />
                <div className="flex-1 flex items-center justify-center">
                    <LoadingState message={appLang === 'en' ? 'Loading run details...' : 'جاري تحميل تفاصيل التشغيل...'} />
                </div>
            </div>
        )
    }

    if (!run) {
        return (
            <div className="flex h-screen overflow-hidden bg-gray-50 dark:bg-gray-900">
                <Sidebar />
                <div className="flex-1 flex items-center justify-center">
                    <div className="text-center">
                        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                            {appLang === 'en' ? 'Run Not Found' : 'التشغيل غير موجود'}
                        </h2>
                        <Button onClick={() => router.back()} variant="outline" className="mt-4">
                            <ArrowLeft className="h-4 w-4 mr-2" />
                            {appLang === 'en' ? 'Go Back' : 'رجوع'}
                        </Button>
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className="flex h-screen overflow-hidden bg-gray-50 dark:bg-gray-900">
            <Sidebar />
            <div className="flex-1 flex flex-col overflow-hidden">
                <main className="flex-1 overflow-y-auto p-6 space-y-6">
                    {/* Header */}
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => router.back()}
                            >
                                <ArrowLeft className="h-4 w-4" />
                            </Button>
                            <div>
                                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                                    {appLang === 'en' ? 'Commission Run Details' : 'تفاصيل تشغيل العمولة'}
                                </h1>
                                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                                    {formatDate(run.period_start)} - {formatDate(run.period_end)}
                                </p>
                            </div>
                        </div>
                        <RunStatusBadge status={run.status} lang={appLang} />
                    </div>

                    {/* Summary Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400 flex items-center gap-2">
                                    <Users className="h-4 w-4" />
                                    {appLang === 'en' ? 'Employees' : 'الموظفون'}
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold text-gray-900 dark:text-white">
                                    {employeeBreakdown.length}
                                </div>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400 flex items-center gap-2">
                                    <TrendingUp className="h-4 w-4" />
                                    {appLang === 'en' ? 'Gross Commission' : 'العمولة الإجمالية'}
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold text-gray-900 dark:text-white">
                                    {formatCurrency(run.total_commission)}
                                </div>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400 flex items-center gap-2">
                                    <TrendingDown className="h-4 w-4" />
                                    {appLang === 'en' ? 'Clawbacks' : 'الاستردادات'}
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold text-red-600 dark:text-red-400">
                                    {formatCurrency(run.total_clawbacks)}
                                </div>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400 flex items-center gap-2">
                                    <DollarSign className="h-4 w-4" />
                                    {appLang === 'en' ? 'Net Commission' : 'العمولة الصافية'}
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                                    {formatCurrency(run.net_commission)}
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Employee Breakdown */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <FileText className="h-5 w-5" />
                                {appLang === 'en' ? 'Employee Breakdown' : 'تفصيل الموظفين'}
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <DataTable
                                data={employeeBreakdown}
                                columns={tableColumns}
                                lang={appLang}
                            />
                        </CardContent>
                    </Card>

                    {/* Workflow Actions */}
                    <Card>
                        <CardHeader>
                            <CardTitle>{appLang === 'en' ? 'Actions' : 'الإجراءات'}</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="flex flex-wrap gap-3">
                                {run.status === 'draft' && canUpdate && (
                                    <Button onClick={handleReview} className="gap-2">
                                        <Eye className="h-4 w-4" />
                                        {appLang === 'en' ? 'Mark as Reviewed' : 'وضع علامة مراجعة'}
                                    </Button>
                                )}

                                {run.status === 'reviewed' && canApprove && (
                                    <Button onClick={handleApprove} className="gap-2">
                                        <CheckCircle2 className="h-4 w-4" />
                                        {appLang === 'en' ? 'Approve' : 'اعتماد'}
                                    </Button>
                                )}

                                {run.status === 'approved' && isOwner && (
                                    <Button onClick={handlePost} className="gap-2">
                                        <BookOpen className="h-4 w-4" />
                                        {appLang === 'en' ? 'Post to Accounting' : 'ترحيل للمحاسبة'}
                                    </Button>
                                )}

                                {run.status === 'posted' && isOwner && (
                                    <Button onClick={() => setIsPaymentDialogOpen(true)} className="gap-2">
                                        <Wallet className="h-4 w-4" />
                                        {appLang === 'en' ? 'Mark as Paid' : 'وضع علامة مدفوع'}
                                    </Button>
                                )}
                            </div>

                            {/* Workflow Tracking */}
                            <div className="mt-6 pt-6 border-t space-y-2 text-sm text-gray-600 dark:text-gray-400">
                                <div className="flex justify-between">
                                    <span>{appLang === 'en' ? 'Created:' : 'تم الإنشاء:'}</span>
                                    <span>{formatDate(run.created_at)}</span>
                                </div>
                                {run.reviewed_at && (
                                    <div className="flex justify-between">
                                        <span>{appLang === 'en' ? 'Reviewed:' : 'تمت المراجعة:'}</span>
                                        <span>{formatDate(run.reviewed_at)}</span>
                                    </div>
                                )}
                                {run.approved_at && (
                                    <div className="flex justify-between">
                                        <span>{appLang === 'en' ? 'Approved:' : 'تم الاعتماد:'}</span>
                                        <span>{formatDate(run.approved_at)}</span>
                                    </div>
                                )}
                                {run.posted_at && (
                                    <div className="flex justify-between">
                                        <span>{appLang === 'en' ? 'Posted:' : 'تم الترحيل:'}</span>
                                        <span>{formatDate(run.posted_at)}</span>
                                    </div>
                                )}
                                {run.paid_at && (
                                    <div className="flex justify-between">
                                        <span>{appLang === 'en' ? 'Paid:' : 'تم الدفع:'}</span>
                                        <span>{formatDate(run.paid_at)}</span>
                                    </div>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                </main>
            </div>

            {/* Payment Dialog */}
            <RunPaymentDialog
                open={isPaymentDialogOpen}
                onOpenChange={setIsPaymentDialogOpen}
                runId={runId}
                netCommission={run.net_commission}
                onPaymentComplete={loadRunDetails}
                lang={appLang}
            />
        </div>
    )
}
