"use client"
import { Sidebar } from "@/components/sidebar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { useSupabase } from "@/lib/supabase/hooks"
import { useEffect, useState } from "react"
import { useToast } from "@/hooks/use-toast"
import { getActiveCompanyId } from "@/lib/company"
import { DollarSign, Users, TrendingUp, Wallet, History, AlertCircle } from "lucide-react"
import { NumericInput } from "@/components/ui/numeric-input"

interface EmployeeCommissionSummary {
    employee_id: string
    employee_name: string
    total_earned: number
    total_advance_paid: number
    available_amount: number
}

interface AdvancePayment {
    id: string
    employee_id: string
    employee_name: string
    amount: number
    payment_date: string
    reference_number: string
    status: string
    deducted_in_payroll: boolean
    created_at: string
}

export default function EarlyCommissionPayoutPage() {
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
        date.setDate(1)
        return date.toISOString().slice(0, 10)
    })
    const [endDate, setEndDate] = useState<string>(() => {
        const date = new Date()
        date.setMonth(date.getMonth() + 1, 0)
        return date.toISOString().slice(0, 10)
    })
    const [employees, setEmployees] = useState<EmployeeCommissionSummary[]>([])
    const [allEmployees, setAllEmployees] = useState<any[]>([])
    const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>("")
    const [advanceAmount, setAdvanceAmount] = useState<number>(0)
    const [advanceNotes, setAdvanceNotes] = useState<string>("")
    const [loading, setLoading] = useState(false)
    const [paymentAccounts, setPaymentAccounts] = useState<any[]>([])
    const [paymentAccountId, setPaymentAccountId] = useState<string>("")
    const [paymentDate, setPaymentDate] = useState<string>(() => new Date().toISOString().slice(0, 10))
    const [advanceHistory, setAdvanceHistory] = useState<AdvancePayment[]>([])

    useEffect(() => {
        (async () => {
            const cid = await getActiveCompanyId(supabase)
            if (cid) {
                setCompanyId(cid)
                const { data: accs } = await supabase
                    .from('chart_of_accounts')
                    .select('id, account_code, account_name, account_type, sub_type')
                    .eq('company_id', cid)
                    .eq('account_type', 'asset')
                    .in('sub_type', ['cash', 'bank'])
                    .order('account_code')
                setPaymentAccounts(accs || [])

                const { data: emps } = await supabase
                    .from('employees')
                    .select('id, full_name, user_id')
                    .eq('company_id', cid)
                    .order('full_name')
                setAllEmployees((emps || []).map(e => ({ ...e, name: e.full_name })))

                await loadAdvanceHistory(cid)
            }
        })()
    }, [supabase])

    const loadAdvanceHistory = async (cid: string) => {
        try {
            const { data } = await supabase
                .from('commission_advance_payments')
                .select(`
                    id, employee_id, amount, payment_date, reference_number,
                    status, deducted_in_payroll, created_at,
                    employees(full_name)
                `)
                .eq('company_id', cid)
                .order('created_at', { ascending: false })
                .limit(50)

            const history = (data || []).map((h: any) => ({
                ...h,
                employee_name: h.employees?.full_name || 'Unknown'
            }))
            setAdvanceHistory(history)
        } catch (err) {
            console.error('Error loading advance history:', err)
        }
    }

    const loadAvailableCommissions = async () => {
        if (!companyId) return
        setLoading(true)
        try {
            const res = await fetch(
                `/api/commissions/advance-payments/available?companyId=${encodeURIComponent(companyId)}&startDate=${startDate}&endDate=${endDate}`
            )
            const data = await res.json()
            if (res.ok) {
                setEmployees(data.employees || [])
                toast({
                    title: t('Loaded', 'تم التحميل'),
                    description: `${data.employees?.length || 0} ${t('employees with available commissions', 'موظف لديهم عمولات متاحة')}`
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

    const payAdvance = async () => {
        if (!companyId || !paymentAccountId) {
            toast({ title: t('Select payment account', 'حدد حساب الدفع') })
            return
        }
        if (!selectedEmployeeId) {
            toast({ title: t('Select an employee', 'حدد موظف') })
            return
        }
        if (advanceAmount <= 0) {
            toast({ title: t('Enter a valid amount', 'أدخل مبلغ صحيح') })
            return
        }

        const selectedEmp = employees.find(e => e.employee_id === selectedEmployeeId)
        if (selectedEmp && advanceAmount > selectedEmp.available_amount) {
            toast({
                title: t('Amount exceeds available', 'المبلغ أكبر من المتاح'),
                description: t(`Available: ${selectedEmp.available_amount.toFixed(2)}`, `المتاح: ${selectedEmp.available_amount.toFixed(2)}`),
                variant: 'destructive'
            })
            return
        }

        setLoading(true)
        try {
            const res = await fetch('/api/commissions/advance-payments/pay', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    companyId,
                    employeeId: selectedEmployeeId,
                    amount: advanceAmount,
                    paymentAccountId,
                    paymentDate,
                    periodStart: startDate,
                    periodEnd: endDate,
                    notes: advanceNotes
                })
            })
            const data = await res.json()
            if (res.ok) {
                toast({
                    title: t('Advance Paid', 'تم صرف السلفة'),
                    description: `${t('Reference', 'المرجع')}: ${data.reference_number} - ${t('Amount', 'المبلغ')}: ${Number(data.amount || 0).toFixed(2)}`
                })
                setAdvanceAmount(0)
                setAdvanceNotes("")
                setSelectedEmployeeId("")
                await loadAvailableCommissions()
                await loadAdvanceHistory(companyId)
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

    const selectedEmployee = employees.find(e => e.employee_id === selectedEmployeeId)

    const totals = {
        earned: employees.reduce((s, e) => s + Number(e.total_earned || 0), 0),
        advanced: employees.reduce((s, e) => s + Number(e.total_advance_paid || 0), 0),
        available: employees.reduce((s, e) => s + Number(e.available_amount || 0), 0)
    }

    return (
        <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
            <Sidebar />
            <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 overflow-x-hidden">
                <div className="space-y-4 sm:space-y-6 max-w-full">
                    {/* Header */}
                    <div className="bg-white dark:bg-slate-900 rounded-xl sm:rounded-2xl shadow-sm border border-gray-200 dark:border-slate-800 p-4 sm:p-6">
                        <div className="flex items-center gap-3">
                            <div className="p-3 bg-gradient-to-br from-amber-500 to-orange-600 rounded-xl shadow-lg">
                                <Wallet className="w-6 h-6 text-white" />
                            </div>
                            <div>
                                <h1 className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white">
                                    {t('Early Commission Payout', 'الصرف المبكر للعمولات')}
                                </h1>
                                <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                                    {t('Pay commission advances before salary date', 'صرف سلف العمولات قبل موعد المرتب')}
                                </p>
                            </div>
                        </div>
                        <div className="mt-3 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
                            <p className="text-xs text-amber-700 dark:text-amber-300 flex items-center gap-2">
                                <AlertCircle className="w-4 h-4" />
                                {t('Advances will be deducted from the monthly salary automatically.',
                                   'سيتم خصم السلف من المرتب الشهري تلقائياً.')}
                            </p>
                        </div>
                    </div>

                    {/* Period Selection */}
                    <Card>
                        <CardHeader>
                            <CardTitle>{t('Commission Period', 'فترة العمولات')}</CardTitle>
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
                                <Button disabled={loading} onClick={loadAvailableCommissions} className="w-full">
                                    {t('Load Available Commissions', 'تحميل العمولات المتاحة')}
                                </Button>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Summary Cards */}
                    {employees.length > 0 && (
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                            <Card>
                                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                    <CardTitle className="text-sm font-medium">{t('Employees', 'الموظفين')}</CardTitle>
                                    <Users className="h-4 w-4 text-muted-foreground" />
                                </CardHeader>
                                <CardContent>
                                    <div className="text-2xl font-bold">{employees.length}</div>
                                </CardContent>
                            </Card>
                            <Card>
                                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                    <CardTitle className="text-sm font-medium">{t('Total Earned', 'إجمالي المكتسب')}</CardTitle>
                                    <TrendingUp className="h-4 w-4 text-muted-foreground" />
                                </CardHeader>
                                <CardContent>
                                    <div className="text-2xl font-bold">{totals.earned.toFixed(2)}</div>
                                </CardContent>
                            </Card>
                            <Card>
                                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                    <CardTitle className="text-sm font-medium">{t('Already Advanced', 'سلف مصروفة')}</CardTitle>
                                    <Wallet className="h-4 w-4 text-orange-500" />
                                </CardHeader>
                                <CardContent>
                                    <div className="text-2xl font-bold text-orange-600">{totals.advanced.toFixed(2)}</div>
                                </CardContent>
                            </Card>
                            <Card>
                                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                    <CardTitle className="text-sm font-medium">{t('Available', 'المتاح')}</CardTitle>
                                    <DollarSign className="h-4 w-4 text-green-500" />
                                </CardHeader>
                                <CardContent>
                                    <div className="text-2xl font-bold text-green-600">{totals.available.toFixed(2)}</div>
                                </CardContent>
                            </Card>
                        </div>
                    )}

                    {/* Employee Commission Balances */}
                    <Card>
                        <CardHeader>
                            <CardTitle>{t('Employee Commission Balances', 'أرصدة عمولات الموظفين')}</CardTitle>
                        </CardHeader>
                        <CardContent>
                            {employees.length === 0 ? (
                                <p className="text-gray-600 dark:text-gray-400">
                                    {t('Click "Load Available Commissions" to see employee balances.',
                                       'اضغط "تحميل العمولات المتاحة" لعرض أرصدة الموظفين.')}
                                </p>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead className="border-b">
                                            <tr>
                                                <th className="p-2 text-right">{t('Employee', 'الموظف')}</th>
                                                <th className="p-2 text-right">{t('Total Earned', 'إجمالي المكتسب')}</th>
                                                <th className="p-2 text-right">{t('Already Advanced', 'سلف مصروفة')}</th>
                                                <th className="p-2 text-right">{t('Available', 'المتاح للصرف')}</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {employees.map((emp) => (
                                                <tr
                                                    key={emp.employee_id}
                                                    className={`border-b cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-800 ${
                                                        selectedEmployeeId === emp.employee_id ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                                                    }`}
                                                    onClick={() => {
                                                        setSelectedEmployeeId(emp.employee_id)
                                                        setAdvanceAmount(0)
                                                    }}
                                                >
                                                    <td className="p-2 font-medium">{emp.employee_name}</td>
                                                    <td className="p-2">{Number(emp.total_earned || 0).toFixed(2)}</td>
                                                    <td className="p-2 text-orange-600">{Number(emp.total_advance_paid || 0).toFixed(2)}</td>
                                                    <td className="p-2 font-semibold text-green-600">{Number(emp.available_amount || 0).toFixed(2)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                        <tfoot className="border-t bg-gray-50 dark:bg-slate-800">
                                            <tr>
                                                <td className="p-2 font-semibold">{t('Total', 'الإجمالي')}</td>
                                                <td className="p-2 font-semibold">{totals.earned.toFixed(2)}</td>
                                                <td className="p-2 font-semibold text-orange-600">{totals.advanced.toFixed(2)}</td>
                                                <td className="p-2 font-bold text-green-600">{totals.available.toFixed(2)}</td>
                                            </tr>
                                        </tfoot>
                                    </table>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Pay Advance Form */}
                    {selectedEmployee && (
                        <Card className="border-2 border-blue-200 dark:border-blue-800">
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <Wallet className="w-5 h-5 text-blue-500" />
                                    {t('Pay Advance to', 'صرف سلفة لـ')}: {selectedEmployee.employee_name}
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                                    <div>
                                        <p className="text-sm text-gray-600 dark:text-gray-400">{t('Total Earned', 'إجمالي المكتسب')}</p>
                                        <p className="text-xl font-bold">{selectedEmployee.total_earned.toFixed(2)}</p>
                                    </div>
                                    <div>
                                        <p className="text-sm text-gray-600 dark:text-gray-400">{t('Already Advanced', 'سلف مصروفة')}</p>
                                        <p className="text-xl font-bold text-orange-600">{selectedEmployee.total_advance_paid.toFixed(2)}</p>
                                    </div>
                                    <div className="md:col-span-2">
                                        <p className="text-sm text-gray-600 dark:text-gray-400">{t('Available for Advance', 'المتاح للسلفة')}</p>
                                        <p className="text-2xl font-bold text-green-600">{selectedEmployee.available_amount.toFixed(2)}</p>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                    <div>
                                        <Label>{t('Advance Amount', 'مبلغ السلفة')}</Label>
                                        <NumericInput
                                            value={advanceAmount}
                                            onChange={setAdvanceAmount}
                                            min={0}
                                            max={selectedEmployee.available_amount}
                                            decimalPlaces={2}
                                            className="w-full"
                                        />
                                    </div>
                                    <div>
                                        <Label>{t('Payment Account', 'حساب الدفع')}</Label>
                                        <select
                                            className="w-full px-3 py-2 border rounded bg-white dark:bg-slate-800"
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
                                            disabled={loading || !paymentAccountId || advanceAmount <= 0}
                                            onClick={payAdvance}
                                            className="w-full bg-gradient-to-r from-green-600 to-emerald-600"
                                        >
                                            {t('Pay Advance', 'صرف السلفة')}
                                        </Button>
                                    </div>
                                </div>
                                <div>
                                    <Label>{t('Notes (Optional)', 'ملاحظات (اختياري)')}</Label>
                                    <Input
                                        value={advanceNotes}
                                        onChange={(e) => setAdvanceNotes(e.target.value)}
                                        placeholder={t('Enter any notes...', 'أدخل أي ملاحظات...')}
                                    />
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    {/* Advance Payment History */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <History className="w-5 h-5" />
                                {t('Advance Payment History', 'سجل السلف المصروفة')}
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            {advanceHistory.length === 0 ? (
                                <p className="text-gray-600 dark:text-gray-400">
                                    {t('No advance payments recorded yet.', 'لا توجد سلف مسجلة بعد.')}
                                </p>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead className="border-b">
                                            <tr>
                                                <th className="p-2 text-right">{t('Date', 'التاريخ')}</th>
                                                <th className="p-2 text-right">{t('Reference', 'المرجع')}</th>
                                                <th className="p-2 text-right">{t('Employee', 'الموظف')}</th>
                                                <th className="p-2 text-right">{t('Amount', 'المبلغ')}</th>
                                                <th className="p-2 text-right">{t('Status', 'الحالة')}</th>
                                                <th className="p-2 text-right">{t('Deducted', 'تم الخصم')}</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {advanceHistory.map((adv) => (
                                                <tr key={adv.id} className="border-b">
                                                    <td className="p-2">{new Date(adv.payment_date).toLocaleDateString('ar-EG')}</td>
                                                    <td className="p-2 font-mono text-xs">{adv.reference_number}</td>
                                                    <td className="p-2">{adv.employee_name}</td>
                                                    <td className="p-2 font-semibold">{Number(adv.amount).toFixed(2)}</td>
                                                    <td className="p-2">
                                                        <span className={`px-2 py-1 rounded-full text-xs ${
                                                            adv.status === 'paid' ? 'bg-green-100 text-green-700' :
                                                            adv.status === 'reversed' ? 'bg-red-100 text-red-700' :
                                                            'bg-gray-100 text-gray-700'
                                                        }`}>
                                                            {adv.status === 'paid' ? t('Paid', 'مدفوع') :
                                                             adv.status === 'reversed' ? t('Reversed', 'ملغي') :
                                                             adv.status}
                                                        </span>
                                                    </td>
                                                    <td className="p-2">
                                                        {adv.deducted_in_payroll ? (
                                                            <span className="text-green-600">✓ {t('Yes', 'نعم')}</span>
                                                        ) : (
                                                            <span className="text-orange-600">{t('Pending', 'معلق')}</span>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
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
