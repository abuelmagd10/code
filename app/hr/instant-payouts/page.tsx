"use client"
import { Sidebar } from "@/components/sidebar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { useSupabase } from "@/lib/supabase/hooks"
import { useEffect, useState } from "react"
import { useToast } from "@/hooks/use-toast"
import { getActiveCompanyId } from "@/lib/company"
import { DollarSign, Users, TrendingUp } from "lucide-react"

export default function InstantPayoutsPage() {
    const supabase = useSupabase()
    const { toast } = useToast()
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

    const [companyId, setCompanyId] = useState<string>("")
    const [startDate, setStartDate] = useState<string>(() => {
        const date = new Date()
        date.setDate(1) // First day of current month
        return date.toISOString().slice(0, 10)
    })
    const [endDate, setEndDate] = useState<string>(() => new Date().toISOString().slice(0, 10))
    const [employees, setEmployees] = useState<any[]>([])
    const [selectedEmployees, setSelectedEmployees] = useState<Set<string>>(new Set())
    const [loading, setLoading] = useState(false)
    const [paymentAccounts, setPaymentAccounts] = useState<any[]>([])
    const [paymentAccountId, setPaymentAccountId] = useState<string>("")
    const [paymentDate, setPaymentDate] = useState<string>(() => new Date().toISOString().slice(0, 10))
    const [paymentHistory, setPaymentHistory] = useState<any[]>([])

    useEffect(() => {
        (async () => {
            const cid = await getActiveCompanyId(supabase)
            if (cid) {
                setCompanyId(cid)
                // Load payment accounts (cash/bank only)
                const { data: accs } = await supabase
                    .from('chart_of_accounts')
                    .select('id, account_code, account_name, account_type, sub_type')
                    .eq('company_id', cid)
                    .eq('account_type', 'asset')
                    .in('sub_type', ['cash', 'bank'])
                    .order('account_code')
                setPaymentAccounts(accs || [])
            }
        })()
    }, [supabase])

    const loadPendingCommissions = async () => {
        if (!companyId) return
        setLoading(true)
        try {
            const res = await fetch(
                `/api/commissions/instant-payouts?companyId=${encodeURIComponent(companyId)}&startDate=${startDate}&endDate=${endDate}`
            )
            const data = await res.json()
            if (res.ok) {
                setEmployees(data.employees || [])
                toast({
                    title: t('Loaded', 'تم التحميل'),
                    description: `${data.employees?.length || 0} ${t('employees with pending commissions', 'موظف لديهم عمولات معلقة')}`
                })
            } else {
                toast({
                    title: t('Error', 'خطأ'),
                    description: data.error || t('Failed to load', 'فشل التحميل'),
                    variant: 'destructive'
                })
            }
        } catch {
            toast({ title: t('Network error', 'خطأ الشبكة'), variant: 'destructive' })
        } finally {
            setLoading(false)
        }
    }

    const paySelected = async () => {
        if (!companyId || !paymentAccountId) {
            toast({ title: t('Select payment account', 'حدد حساب الدفع') })
            return
        }
        if (selectedEmployees.size === 0) {
            toast({ title: t('Select at least one employee', 'حدد موظف واحد على الأقل') })
            return
        }

        setLoading(true)
        try {
            const res = await fetch('/api/commissions/instant-payouts/pay', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    companyId,
                    employeeIds: Array.from(selectedEmployees),
                    paymentAccountId,
                    paymentDate,
                    startDate,
                    endDate
                })
            })
            const data = await res.json()
            if (res.ok) {
                toast({
                    title: t('Commissions Paid', 'تم صرف العمولات'),
                    description: `${data.employeesPaid} ${t('employees paid', 'موظف تم الصرف لهم')} - ${t('Total', 'الإجمالي')}: ${Number(data.totalAmount || 0).toFixed(2)}`
                })
                setSelectedEmployees(new Set())
                await loadPendingCommissions()
            } else {
                toast({
                    title: t('Error', 'خطأ'),
                    description: data.error || t('Payment failed', 'فشل الصرف'),
                    variant: 'destructive'
                })
            }
        } catch {
            toast({ title: t('Network error', 'خطأ الشبكة'), variant: 'destructive' })
        } finally {
            setLoading(false)
        }
    }

    const payEmployee = async (employeeId: string) => {
        if (!companyId || !paymentAccountId) {
            toast({ title: t('Select payment account', 'حدد حساب الدفع') })
            return
        }

        setLoading(true)
        try {
            const res = await fetch('/api/commissions/instant-payouts/pay', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    companyId,
                    employeeIds: [employeeId],
                    paymentAccountId,
                    paymentDate,
                    startDate,
                    endDate
                })
            })
            const data = await res.json()
            if (res.ok) {
                toast({
                    title: t('Commission Paid', 'تم صرف العمولة'),
                    description: `${t('Amount', 'المبلغ')}: ${Number(data.totalAmount || 0).toFixed(2)}`
                })
                await loadPendingCommissions()
            } else {
                toast({
                    title: t('Error', 'خطأ'),
                    description: data.error || t('Payment failed', 'فشل الصرف'),
                    variant: 'destructive'
                })
            }
        } catch {
            toast({ title: t('Network error', 'خطأ الشبكة'), variant: 'destructive' })
        } finally {
            setLoading(false)
        }
    }

    const toggleEmployee = (employeeId: string) => {
        const newSet = new Set(selectedEmployees)
        if (newSet.has(employeeId)) {
            newSet.delete(employeeId)
        } else {
            newSet.add(employeeId)
        }
        setSelectedEmployees(newSet)
    }

    const toggleAll = () => {
        if (selectedEmployees.size === employees.length) {
            setSelectedEmployees(new Set())
        } else {
            setSelectedEmployees(new Set(employees.map(e => e.employee_id)))
        }
    }

    const totals = {
        gross: employees.reduce((s, e) => s + Number(e.gross_commission || 0), 0),
        clawbacks: employees.reduce((s, e) => s + Number(e.clawbacks || 0), 0),
        net: employees.reduce((s, e) => s + Number(e.net_commission || 0), 0)
    }

    return (
        <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
            <Sidebar />
            <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 overflow-x-hidden">
                <div className="space-y-4 sm:space-y-6 max-w-full">
                    {/* Header */}
                    <div className="bg-white dark:bg-slate-900 rounded-xl sm:rounded-2xl shadow-sm border border-gray-200 dark:border-slate-800 p-4 sm:p-6">
                        <div>
                            <h1 className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white">
                                {t('Instant Commission Payouts', 'صرف العمولات الفوري')}
                            </h1>
                            <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-0.5 sm:mt-1">
                                {t('Pay commissions instantly for individual employees', 'صرف العمولات فوراً للموظفين')}
                            </p>
                            <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                                {t('👑 Admin access - Instant commission payments', '👑 صلاحية إدارية - صرف عمولات فوري')}
                            </p>
                        </div>
                    </div>

                    {/* Period Selection */}
                    <Card>
                        <CardHeader>
                            <CardTitle>{t('Select Period', 'اختر الفترة')}</CardTitle>
                        </CardHeader>
                        <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-3">
                            <div>
                                <Label>{t('From Date', 'من تاريخ')}</Label>
                                <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                            </div>
                            <div>
                                <Label>{t('To Date', 'إلى تاريخ')}</Label>
                                <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                            </div>
                            <div className="md:col-span-2">
                                <Label>&nbsp;</Label>
                                <Button disabled={loading} onClick={loadPendingCommissions} className="w-full">
                                    {t('Load Pending Commissions', 'تحميل العمولات المعلقة')}
                                </Button>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Summary Cards */}
                    {employees.length > 0 && (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <Card>
                                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                    <CardTitle className="text-sm font-medium">{t('Total Employees', 'إجمالي الموظفين')}</CardTitle>
                                    <Users className="h-4 w-4 text-muted-foreground" />
                                </CardHeader>
                                <CardContent>
                                    <div className="text-2xl font-bold">{employees.length}</div>
                                </CardContent>
                            </Card>
                            <Card>
                                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                    <CardTitle className="text-sm font-medium">{t('Gross Commission', 'إجمالي العمولات')}</CardTitle>
                                    <TrendingUp className="h-4 w-4 text-muted-foreground" />
                                </CardHeader>
                                <CardContent>
                                    <div className="text-2xl font-bold">{totals.gross.toFixed(2)}</div>
                                    <p className="text-xs text-muted-foreground">{t('Clawbacks', 'الخصومات')}: {totals.clawbacks.toFixed(2)}</p>
                                </CardContent>
                            </Card>
                            <Card>
                                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                    <CardTitle className="text-sm font-medium">{t('Net Commission', 'صافي العمولات')}</CardTitle>
                                    <DollarSign className="h-4 w-4 text-muted-foreground" />
                                </CardHeader>
                                <CardContent>
                                    <div className="text-2xl font-bold text-green-600">{totals.net.toFixed(2)}</div>
                                </CardContent>
                            </Card>
                        </div>
                    )}

                    {/* Pending Commissions Table */}
                    <Card>
                        <CardHeader>
                            <CardTitle>{t('Pending Instant Commissions', 'العمولات الفورية المعلقة')}</CardTitle>
                        </CardHeader>
                        <CardContent>
                            {employees.length === 0 ? (
                                <p className="text-gray-600 dark:text-gray-400">
                                    {t('No pending commissions for this period.', 'لا توجد عمولات معلقة لهذه الفترة.')}
                                </p>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead className="border-b">
                                            <tr>
                                                <th className="p-2 text-right">
                                                    <Checkbox
                                                        checked={selectedEmployees.size === employees.length && employees.length > 0}
                                                        onCheckedChange={toggleAll}
                                                    />
                                                </th>
                                                <th className="p-2 text-right">{t('Employee', 'الموظف')}</th>
                                                <th className="p-2 text-right">{t('Invoices', 'الفواتير')}</th>
                                                <th className="p-2 text-right">{t('Gross', 'الإجمالي')}</th>
                                                <th className="p-2 text-right">{t('Clawbacks', 'الخصومات')}</th>
                                                <th className="p-2 text-right">{t('Net', 'الصافي')}</th>
                                                <th className="p-2 text-right">{t('Actions', 'الإجراءات')}</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {employees.map((emp) => (
                                                <tr key={emp.employee_id} className="border-b">
                                                    <td className="p-2">
                                                        <Checkbox
                                                            checked={selectedEmployees.has(emp.employee_id)}
                                                            onCheckedChange={() => toggleEmployee(emp.employee_id)}
                                                        />
                                                    </td>
                                                    <td className="p-2">{emp.employee_name}</td>
                                                    <td className="p-2">{emp.invoices_count}</td>
                                                    <td className="p-2">{Number(emp.gross_commission || 0).toFixed(2)}</td>
                                                    <td className="p-2 text-red-600">{Number(emp.clawbacks || 0).toFixed(2)}</td>
                                                    <td className="p-2 font-semibold text-green-600">{Number(emp.net_commission || 0).toFixed(2)}</td>
                                                    <td className="p-2">
                                                        <Button
                                                            size="sm"
                                                            onClick={() => payEmployee(emp.employee_id)}
                                                            disabled={loading || !paymentAccountId}
                                                        >
                                                            {t('Pay Now', 'صرف الآن')}
                                                        </Button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                        <tfoot className="border-t bg-gray-50 dark:bg-slate-800">
                                            <tr>
                                                <td className="p-2 font-semibold" colSpan={3}>{t('Total', 'الإجمالي')}</td>
                                                <td className="p-2 font-semibold">{totals.gross.toFixed(2)}</td>
                                                <td className="p-2 font-semibold text-red-600">{totals.clawbacks.toFixed(2)}</td>
                                                <td className="p-2 font-bold text-green-600">{totals.net.toFixed(2)}</td>
                                                <td></td>
                                            </tr>
                                        </tfoot>
                                    </table>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Payment Details */}
                    {employees.length > 0 && (
                        <Card>
                            <CardHeader>
                                <CardTitle>{t('Payment Details', 'تفاصيل الدفع')}</CardTitle>
                            </CardHeader>
                            <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                <div>
                                    <Label>{t('Payment Account (Cash/Bank)', 'حساب الدفع (نقد/بنك)')}</Label>
                                    <select
                                        className="w-full px-3 py-2 border rounded"
                                        value={paymentAccountId}
                                        onChange={(e) => setPaymentAccountId(e.target.value)}
                                    >
                                        <option value="">{t('Select Account', 'اختر حساب')}</option>
                                        {paymentAccounts.map((a) => (
                                            <option key={a.id} value={a.id}>
                                                {a.account_code} - {a.account_name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <Label>{t('Payment Date', 'تاريخ الصرف')}</Label>
                                    <Input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
                                </div>
                                <div>
                                    <Label>&nbsp;</Label>
                                    <Button
                                        disabled={loading || !paymentAccountId || selectedEmployees.size === 0}
                                        onClick={paySelected}
                                        className="w-full"
                                    >
                                        {t('Pay Selected Employees', 'صرف للموظفين المحددين')} ({selectedEmployees.size})
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    )}
                </div>
            </main>
        </div>
    )
}
