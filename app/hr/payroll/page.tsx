"use client"
import { Sidebar } from "@/components/sidebar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { useSupabase } from "@/lib/supabase/hooks"
import { useEffect, useState, useRef } from "react"
import { useToast } from "@/hooks/use-toast"
import { getActiveCompanyId } from "@/lib/company"
import { Printer } from "lucide-react"

export default function PayrollPage() {
  const supabase = useSupabase()
  const { toast } = useToast()
  const [appLang, setAppLang] = useState<'ar' | 'en'>('ar')
  const printContentRef = useRef<HTMLDivElement>(null)

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
  const [companyDetails, setCompanyDetails] = useState<any>(null)
  const [year, setYear] = useState<number>(new Date().getFullYear())
  const [month, setMonth] = useState<number>(new Date().getMonth() + 1)
  const [result, setResult] = useState<any>(null)
  const [employees, setEmployees] = useState<any[]>([])
  const [adjustments, setAdjustments] = useState<Record<string, { allowances: number; deductions: number; bonuses: number; advances: number; insurance: number }>>({})
  const [loading, setLoading] = useState(false)
  const [paymentAccounts, setPaymentAccounts] = useState<any[]>([])
  const [paymentAccountId, setPaymentAccountId] = useState<string>("")
  const [paymentDate, setPaymentDate] = useState<string>(() => new Date().toISOString().slice(0, 10))
  const [payslips, setPayslips] = useState<any[]>([])
  const [payments, setPayments] = useState<any[]>([])
  const [accountMap, setAccountMap] = useState<Record<string, { code: string; name: string }>>({})
  const [editingSlipEmp, setEditingSlipEmp] = useState<string>("")
  const [editSlip, setEditSlip] = useState<{ base_salary: number; allowances: number; bonuses: number; advances: number; insurance: number; deductions: number }>({ base_salary: 0, allowances: 0, bonuses: 0, advances: 0, insurance: 0, deductions: 0 })
  const [editingPaymentId, setEditingPaymentId] = useState<string>("")
  const [editPayment, setEditPayment] = useState<{ amount: number; paymentAccountId: string; description: string }>({ amount: 0, paymentAccountId: "", description: "" })
  const [pendingBonuses, setPendingBonuses] = useState<any[]>([])
  const [bonusSettings, setBonusSettings] = useState<any>(null)
  const [attachingBonuses, setAttachingBonuses] = useState(false)

  // Commission Runs Integration
  const [pendingCommissionRuns, setPendingCommissionRuns] = useState<any[]>([])
  const [attachingCommissionRun, setAttachingCommissionRun] = useState<string | null>(null)

  const totals = {
    base_salary: payslips.reduce((s, p) => s + Number(p.base_salary || 0), 0),
    allowances: payslips.reduce((s, p) => s + Number(p.allowances || 0), 0),
    bonuses: payslips.reduce((s, p) => s + Number(p.bonuses || 0), 0),
    sales_bonus: payslips.reduce((s, p) => s + Number(p.sales_bonus || 0), 0),
    commission: payslips.reduce((s, p) => s + Number(p.commission || 0), 0),
    commission_advance_deducted: payslips.reduce((s, p) => s + Number(p.commission_advance_deducted || 0), 0),
    advances: payslips.reduce((s, p) => s + Number(p.advances || 0), 0),
    insurance: payslips.reduce((s, p) => s + Number(p.insurance || 0), 0),
    deductions: payslips.reduce((s, p) => s + Number(p.deductions || 0), 0),
    net_salary: payslips.reduce((s, p) => s + Number(p.net_salary || 0), 0),
  }

  useEffect(() => {
    (async () => {
      const cid = await getActiveCompanyId(supabase); if (cid) {
        setCompanyId(cid); const res = await fetch(`/api/hr/employees?companyId=${encodeURIComponent(cid)}`); const data = res.ok ? await res.json() : []; setEmployees(Array.isArray(data) ? data : []); const { data: accs } = await supabase.from('chart_of_accounts').select('id, account_code, account_name, account_type, sub_type').eq('company_id', cid).order('account_code'); const pays = (accs || []).filter((a: any) => String(a.account_type || '') === 'asset' && ['cash', 'bank'].includes(String((a as any).sub_type || ''))); setPaymentAccounts(pays); const map: Record<string, { code: string; name: string }> = {}; (accs || []).forEach((a: any) => { map[String(a.id)] = { code: String(a.account_code || ''), name: String(a.account_name || '') } }); setAccountMap(map); const settingsRes = await fetch(`/api/bonuses/settings?companyId=${encodeURIComponent(cid)}`); if (settingsRes.ok) { const settings = await settingsRes.json(); setBonusSettings(settings) }
        // Fetch company details for print
        const { data: comp } = await supabase.from('companies').select('*').eq('id', cid).single();
        if (comp) setCompanyDetails(comp);
      }
    })()
  }, [supabase])

  useEffect(() => {
    (async () => {
      if (!companyId) return;
      await loadRunAndPayslips(companyId, year, month);
      await loadPendingBonuses(companyId, year, month);
      await loadPendingCommissionRuns(companyId);
    })()
  }, [companyId, year, month])

  const loadPendingBonuses = async (cid: string, yr: number, mo: number) => {
    try {
      const res = await fetch(`/api/bonuses?companyId=${encodeURIComponent(cid)}&status=pending&year=${yr}&month=${mo}`)
      if (res.ok) {
        const data = await res.json()
        setPendingBonuses(Array.isArray(data) ? data : [])
      }
    } catch { setPendingBonuses([]) }
  }

  const loadPendingCommissionRuns = async (cid: string) => {
    try {
      // Load commission runs that are posted/paid
      // Note: Commission advances are now handled through commission_advance_payments
      const { data } = await supabase
        .from('commission_runs')
        .select('*')
        .eq('company_id', cid)
        .in('status', ['posted', 'paid'])
        .order('created_at', { ascending: false })
        .limit(10)

      setPendingCommissionRuns(data || [])
    } catch (err) {
      console.error('Error loading commission runs:', err)
      setPendingCommissionRuns([])
    }
  }

  const attachCommissionRun = async (runId: string) => {
    if (!companyId || !result?.run_id) { toast({ title: t('Run payroll first', 'قم بتشغيل المرتبات أولاً') }); return }
    setAttachingCommissionRun(runId)
    try {
      const res = await fetch('/api/commissions/attach-to-payroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId,
          commissionRunId: runId,
          payrollRunId: result.run_id
        })
      })
      const data = await res.json()
      if (res.ok) {
        toast({
          title: t('Commissions attached', 'تم ربط العمولات'),
          description: t('Successfully updated payslips', 'تم تحديث قسائم المرتبات بنجاح')
        })
        await loadPayslips(companyId, String(result.run_id))
        await loadPendingCommissionRuns(companyId)
      } else {
        toast({ title: t('Error', 'خطأ'), description: data?.error || t('Failed to attach commissions', 'فشل ربط العمولات') })
      }
    } catch { toast({ title: t('Network error', 'خطأ الشبكة') }) }
    finally { setAttachingCommissionRun(null) }
  }

  const attachBonusesToPayroll = async () => {
    if (!companyId || !result?.run_id) { toast({ title: t('Run payroll first', 'قم بتشغيل المرتبات أولاً') }); return }
    setAttachingBonuses(true)
    try {
      const res = await fetch('/api/bonuses/attach-to-payroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, payrollRunId: result.run_id, year, month })
      })
      const data = await res.json()
      if (res.ok) {
        toast({ title: t('Bonuses attached', 'تم ربط البونصات'), description: `${data.count || 0} ${t('bonuses attached', 'بونص تم ربطه')}` })
        await loadPayslips(companyId, String(result.run_id))
        await loadPendingBonuses(companyId, year, month)
      } else {
        toast({ title: t('Error', 'خطأ'), description: data?.error || t('Failed to attach bonuses', 'فشل ربط البونصات') })
      }
    } catch { toast({ title: t('Network error', 'خطأ الشبكة') }) }
    finally { setAttachingBonuses(false) }
  }

  const runPayroll = async () => {
    if (!companyId) return
    // ⚡ INP Fix: إظهار loading state فوراً قبل أي await
    setLoading(true)

    // ⚡ INP Fix: تأجيل العمليات الثقيلة باستخدام setTimeout
    setTimeout(async () => {
      try {
        const rows = Object.entries(adjustments).map(([employee_id, v]) => ({ employee_id, ...v }))
        const res = await fetch('/api/hr/payroll', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ companyId, year, month, adjustments: rows }) })
        const data = await res.json()
        if (res.ok) { setResult(data); await loadPayslips(companyId, String(data?.run_id || '')); await loadPayments(companyId, String(data?.run_id || '')); toast({ title: t('Payroll calculated', 'تم حساب المرتبات') }) } else { toast({ title: t('Error', 'خطأ'), description: data?.error || t('Calculation failed', 'فشل الحساب') }) }
      } catch { toast({ title: t('Network error', 'خطأ الشبكة') }) } finally { setLoading(false) }
    }, 0)
  }

  const payPayroll = async () => {
    if (!companyId || !paymentAccountId) { toast({ title: t('Select payment account (cash/bank)', 'حدد حساب الدفع (نقد/بنك)') }); return }
    // ⚡ INP Fix: إظهار loading state فوراً قبل أي await
    setLoading(true)

    // ⚡ INP Fix: تأجيل العمليات الثقيلة باستخدام setTimeout
    setTimeout(async () => {
      try {
        const res = await fetch('/api/hr/payroll/pay', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ companyId, year, month, paymentAccountId, paymentDate }) })
        const data = await res.json()
        if (res.ok) { toast({ title: t('Payroll paid', 'تم صرف المرتبات'), description: `${t('Total', 'الإجمالي')}: ${Number(data?.total || 0).toFixed(2)}` }); if (result?.run_id) { await loadPayslips(companyId, String(result.run_id)); await loadPayments(companyId, String(result.run_id)); } } else { toast({ title: t('Error', 'خطأ'), description: data?.error || t('Payment failed', 'فشل الصرف') }) }
      } catch { toast({ title: t('Network error', 'خطأ الشبكة') }) } finally { setLoading(false) }
    }, 0)
  }

  const loadPayslips = async (cid: string, runId: string) => {
    if (!cid || !runId) { setPayslips([]); return }
    const { data } = await supabase
      .from('payslips')
      .select('employee_id, base_salary, allowances, deductions, bonuses, sales_bonus, commission, commission_advance_deducted, advances, insurance, net_salary, breakdown')
      .eq('company_id', cid)
      .eq('payroll_run_id', runId)
    const arr = Array.isArray(data) ? data : []
    setPayslips(arr)
    return arr
  }

  const loadRunAndPayslips = async (cid: string, yr: number, mo: number) => {
    const { data: run } = await supabase
      .from('payroll_runs')
      .select('id')
      .eq('company_id', cid)
      .eq('period_year', yr)
      .eq('period_month', mo)
      .maybeSingle()
    if (run?.id) {
      const arr = await loadPayslips(cid, String(run.id))
      setResult({ run_id: run.id, count: (arr || []).length })
      await loadPayments(cid, String(run.id))
    } else {
      setPayslips([])
      setPayments([])
    }
  }

  const loadPayments = async (cid: string, runId: string) => {
    const url = `/api/hr/payroll/payments?companyId=${encodeURIComponent(cid)}&year=${year}&month=${month}`
    const res = await fetch(url)
    const data = res.ok ? await res.json() : []
    setPayments(Array.isArray(data) ? data : [])
    return data
  }

  const handlePrint = async () => {
    try {
      const el = printContentRef.current
      if (!el) return

      const clone = el.cloneNode(true) as HTMLElement
      // Remove no-print elements and inputs/buttons that shouldn't appear in print
      const toRemove = clone.querySelectorAll('.no-print, button, input:not([readonly]), select')
      // Note: We might want to keep inputs if they show data, but usually we want to print read-only views.
      // For editing inputs, we might want to replace them with their values.
      // However, current UI uses inputs for editing in adjustments card.
      // Let's target specific no-print areas or just accept inputs for now if they are populated.
      // Better approach: Replace inputs with their values for print.

      const inputs = clone.querySelectorAll('input')
      inputs.forEach(input => {
        if (input.type === 'number' || input.type === 'text') {
          const val = input.value
          const span = document.createElement('span')
          span.textContent = val
          input.parentNode?.replaceChild(span, input)
        }
      })

      toRemove.forEach(e => {
        if (e.tagName !== 'INPUT') e.remove() // We handled inputs above
      })

      const content = clone.innerHTML
      const { openPrintWindow } = await import('@/lib/print-utils')

      const companyName = companyDetails?.name || 'Company Name'
      const address = companyDetails?.address || ''
      const phone = companyDetails?.phone || ''

      openPrintWindow(content, {
        lang: appLang as 'ar' | 'en',
        direction: appLang === 'ar' ? 'rtl' : 'ltr',
        title: appLang === 'en' ? `Payroll ${month}-${year}` : `مرتبات ${month}-${year}`,
        pageSize: 'A4',
        margin: '15mm',
        companyName: companyName,
        companyAddress: address,
        companyPhone: phone,
        printedBy: 'System User',
        showHeader: true,
        showFooter: true,
        extraHeader: `
          <div style="text-align: center; margin-bottom: 10px;">
             <h2 style="font-size: 24px; font-weight: bold; margin: 0;">${appLang === 'en' ? 'PAYROLL REPORT' : 'تقرير المرتبات'}</h2>
             <p style="color: #6b7280; font-size: 14px;">${appLang === 'en' ? `Period: ${month}/${year}` : `الفترة: ${month}/${year}`}</p>
          </div>
        `
      })
    } catch (err) {
      console.error("Error generating print:", err)
      toast({
        title: appLang === 'en' ? 'Print Error' : 'خطأ طباعة',
        description: String((err as any)?.message || ''),
        variant: 'destructive'
      })
    }
  }

  const monthNames = appLang === 'en'
    ? ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
    : ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر']

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
      <Sidebar />
      {/* Main Content - تحسين للهاتف */}
      <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 overflow-x-hidden">
        <div className="space-y-4 sm:space-y-6 max-w-full">
          {/* رأس الصفحة - تحسين للهاتف */}
          <div className="bg-white dark:bg-slate-900 rounded-xl sm:rounded-2xl shadow-sm border border-gray-200 dark:border-slate-800 p-4 sm:p-6 flex justify-between items-start">
            <div>
              <h1 className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white">{t('Payroll', 'المرتبات')}</h1>
              <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-0.5 sm:mt-1">{t('Process salaries and manage payroll', 'معالجة الرواتب وإدارة المرتبات')}</p>
              {/* 🔐 Governance Notice - Payroll is admin-only */}
              <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                {t('👑 Admin access - All payroll data visible', '👑 صلاحية إدارية - جميع بيانات المرتبات مرئية')}
              </p>
            </div>
            <Button variant="outline" onClick={handlePrint} className="no-print">
              <Printer className="h-4 w-4 mr-2" />
              {t('Print', 'طباعة')}
            </Button>
          </div>

          <div ref={printContentRef} className="space-y-6">
            <Card className="no-print">
              <CardHeader><CardTitle>{t('Run Payroll', 'تشغيل المرتبات')}</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div><Label>{t('Year', 'السنة')}</Label><Input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} /></div>
                <div>
                  <Label>{t('Month', 'الشهر')}</Label>
                  <select className="w-full px-3 py-2 border rounded" value={month} onChange={(e) => setMonth(Number(e.target.value))}>
                    {monthNames.map((name, i) => (<option key={i + 1} value={i + 1}>{name}</option>))}
                  </select>
                </div>
                <div><Label>{t('Payment Account (Cash/Bank)', 'حساب الدفع (نقد/بنك)')}</Label>
                  <select className="w-full px-3 py-2 border rounded" value={paymentAccountId} onChange={(e) => setPaymentAccountId(e.target.value)}>
                    <option value="">{t('Select Account', 'اختر حساب')}</option>
                    {paymentAccounts.map((a) => (<option key={a.id} value={a.id}>{a.account_code} - {a.account_name}</option>))}
                  </select>
                </div>
                <div className="md:col-span-1"><Button disabled={loading} onClick={runPayroll}>{t('Run', 'تشغيل')}</Button></div>
                <div>
                  <Label>{t('Payment Date', 'تاريخ الصرف')}</Label>
                  <Input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
                </div>
                <div className="md:col-span-1"><Button disabled={loading || !paymentAccountId} variant="secondary" onClick={payPayroll}>{t('Pay Salaries', 'صرف المرتبات')}</Button></div>
                {result ? (
                  <div className="md:col-span-4 text-sm text-gray-700 dark:text-gray-300">{t('Total Records', 'إجمالي السجلات')}: {result?.count || 0}</div>
                ) : null}
              </CardContent>
            </Card>

            <Card className="no-print">
              <CardHeader><CardTitle>{t('Adjustments (Allowances/Deductions) per Employee', 'التعديلات (بدلات/خصومات) لكل موظف')}</CardTitle></CardHeader>
              <CardContent>
                {employees.length === 0 ? (<p className="text-gray-600 dark:text-gray-400">{t('No employees.', 'لا يوجد موظفون.')}</p>) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="border-b">
                        <tr>
                          <th className="p-2 text-right">{t('Employee', 'الموظف')}</th>
                          <th className="p-2 text-right">{t('Allowances', 'بدلات')}</th>
                          <th className="p-2 text-right">{t('Deductions', 'خصومات')}</th>
                          <th className="p-2 text-right">{t('Bonuses', 'مكافآت')}</th>
                          <th className="p-2 text-right">{t('Advances', 'سلف')}</th>
                          <th className="p-2 text-right">{t('Insurance', 'تأمينات')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {employees.map((e) => {
                          const v = adjustments[e.id] || { allowances: 0, deductions: 0, bonuses: 0, advances: 0, insurance: 0 }
                          return (
                            <tr key={e.id} className="border-b">
                              <td className="p-2">{e.full_name}</td>
                              <td className="p-2"><Input type="number" value={v.allowances} onChange={(ev) => setAdjustments({ ...adjustments, [e.id]: { ...v, allowances: Number(ev.target.value) } })} /></td>
                              <td className="p-2"><Input type="number" value={v.deductions} onChange={(ev) => setAdjustments({ ...adjustments, [e.id]: { ...v, deductions: Number(ev.target.value) } })} /></td>
                              <td className="p-2"><Input type="number" value={v.bonuses} onChange={(ev) => setAdjustments({ ...adjustments, [e.id]: { ...v, bonuses: Number(ev.target.value) } })} /></td>
                              <td className="p-2"><Input type="number" value={v.advances} onChange={(ev) => setAdjustments({ ...adjustments, [e.id]: { ...v, advances: Number(ev.target.value) } })} /></td>
                              <td className="p-2"><Input type="number" value={v.insurance} onChange={(ev) => setAdjustments({ ...adjustments, [e.id]: { ...v, insurance: Number(ev.target.value) } })} /></td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* بطاقة بونصات المبيعات المعلقة */}
            {bonusSettings?.bonus_enabled && pendingBonuses.length > 0 && (
              <Card className="border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 no-print">
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="text-green-700 dark:text-green-300">{t('Pending Sales Bonuses', 'بونصات المبيعات المعلقة')}</CardTitle>
                  <Button onClick={attachBonusesToPayroll} disabled={attachingBonuses || !result?.run_id} className="bg-green-600 hover:bg-green-700">
                    {attachingBonuses ? t('Attaching...', 'جاري الربط...') : t('Attach to Payroll', 'ربط بالمرتبات')}
                  </Button>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="border-b">
                        <tr>
                          <th className="p-2 text-right">{t('Employee', 'الموظف')}</th>
                          <th className="p-2 text-right">{t('Invoice', 'الفاتورة')}</th>
                          <th className="p-2 text-right">{t('Invoice Amount', 'قيمة الفاتورة')}</th>
                          <th className="p-2 text-right">{t('Bonus Amount', 'قيمة البونص')}</th>
                          <th className="p-2 text-right">{t('Date', 'التاريخ')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pendingBonuses.map((b) => (
                          <tr key={b.id} className="border-b">
                            <td className="p-2">{b.employees?.full_name || '-'}</td>
                            <td className="p-2">{b.invoices?.invoice_number || '-'}</td>
                            <td className="p-2">{Number(b.calculation_base || 0).toFixed(2)}</td>
                            <td className="p-2 font-semibold text-green-600">{Number(b.bonus_amount || 0).toFixed(2)}</td>
                            <td className="p-2">{b.calculated_at ? new Date(b.calculated_at).toLocaleDateString('ar-EG') : '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="border-t bg-green-100 dark:bg-green-900/40">
                        <tr>
                          <td className="p-2 font-semibold" colSpan={3}>{t('Total Pending Bonuses', 'إجمالي البونصات المعلقة')}</td>
                          <td className="p-2 font-bold text-green-700">{pendingBonuses.reduce((s, b) => s + Number(b.bonus_amount || 0), 0).toFixed(2)}</td>
                          <td></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Commission Runs Card */}
            {pendingCommissionRuns.length > 0 && (
              <Card className="border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 no-print">
                <CardHeader>
                  <CardTitle className="text-blue-700 dark:text-blue-300">
                    {t('Pending Commission Runs', 'مسيرات العمولات المعلقة')}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="border-b">
                        <tr>
                          <th className="p-2 text-right">{t('Run Period', 'الفترة')}</th>
                          <th className="p-2 text-right">{t('Plan', 'الخطة')}</th>
                          <th className="p-2 text-right">{t('Status', 'الحالة')}</th>
                          <th className="p-2 text-right">{t('Action', 'إجراء')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pendingCommissionRuns.map((run) => (
                          <tr key={run.id} className="border-b">
                            <td className="p-2">
                              {new Date(run.period_start).toLocaleDateString(appLang === 'en' ? 'en-US' : 'ar-EG')} - {new Date(run.period_end).toLocaleDateString(appLang === 'en' ? 'en-US' : 'ar-EG')}
                            </td>
                            <td className="p-2">{run.commission_plans?.name || '-'}</td>
                            <td className="p-2">
                              <span className="px-2 py-1 rounded bg-green-100 text-green-800 text-xs font-bold">
                                {run.status === 'paid' ? t('Paid', 'مدفوع') : t('Posted', 'مرحل')}
                              </span>
                            </td>
                            <td className="p-2">
                              <Button
                                size="sm"
                                className="bg-blue-600 hover:bg-blue-700 text-white"
                                onClick={() => attachCommissionRun(run.id)}
                                disabled={attachingCommissionRun === run.id || !result?.run_id}
                              >
                                {attachingCommissionRun === run.id ? t('Attaching...', 'جاري الربط...') : t('Attach to Payroll', 'ربط بالمرتبات')}
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader><CardTitle>{t('Run Results', 'نتائج التشغيل')}</CardTitle></CardHeader>
              <CardContent>
                {payslips.length === 0 ? (
                  <p className="text-gray-600 dark:text-gray-400">{t('No payslips for this period.', 'لا توجد قسائم مرتبات لهذه الفترة.')}</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="border-b">
                        <tr>
                          <th className="p-2 text-right">{t('Employee', 'الموظف')}</th>
                          <th className="p-2 text-right">{t('Base', 'أساسي')}</th>
                          <th className="p-2 text-right">{t('Allowances', 'بدلات')}</th>
                          <th className="p-2 text-right">{t('Bonuses', 'مكافآت')}</th>
                          <th className="p-2 text-right text-green-600">{t('Sales Bonus', 'بونص مبيعات')}</th>
                          <th className="p-2 text-right text-blue-600">{t('Commission', 'عمولات')}</th>
                          <th className="p-2 text-right text-orange-600">{t('Comm. Advance', 'سلف عمولات')}</th>
                          <th className="p-2 text-right">{t('Advances', 'سلف')}</th>
                          <th className="p-2 text-right">{t('Insurance', 'تأمينات')}</th>
                          <th className="p-2 text-right">{t('Deductions', 'خصومات')}</th>
                          <th className="p-2 text-right">{t('Net', 'الصافي')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {payslips.map((p) => {
                          const emp = employees.find((e) => String(e.id) === String(p.employee_id))
                          return (
                            <tr key={`${p.employee_id}`} className="border-b">
                              <td className="p-2">{emp?.full_name || p.employee_id}</td>
                              <td className="p-2">{editingSlipEmp === String(p.employee_id) ? (<Input type="number" value={editSlip.base_salary} onChange={(ev) => setEditSlip({ ...editSlip, base_salary: Number(ev.target.value) })} />) : Number(p.base_salary || 0).toFixed(2)}</td>
                              <td className="p-2">{editingSlipEmp === String(p.employee_id) ? (<Input type="number" value={editSlip.allowances} onChange={(ev) => setEditSlip({ ...editSlip, allowances: Number(ev.target.value) })} />) : Number(p.allowances || 0).toFixed(2)}</td>
                              <td className="p-2">{editingSlipEmp === String(p.employee_id) ? (<Input type="number" value={editSlip.bonuses} onChange={(ev) => setEditSlip({ ...editSlip, bonuses: Number(ev.target.value) })} />) : Number(p.bonuses || 0).toFixed(2)}</td>
                              <td className="p-2 text-green-600">{Number(p.sales_bonus || 0).toFixed(2)}</td>
                              <td className="p-2 text-blue-600 font-semibold">{Number(p.commission || 0).toFixed(2)}</td>
                              <td className="p-2 text-orange-600">{Number(p.commission_advance_deducted || 0).toFixed(2)}</td>
                              <td className="p-2">{editingSlipEmp === String(p.employee_id) ? (<Input type="number" value={editSlip.advances} onChange={(ev) => setEditSlip({ ...editSlip, advances: Number(ev.target.value) })} />) : Number(p.advances || 0).toFixed(2)}</td>
                              <td className="p-2">{editingSlipEmp === String(p.employee_id) ? (<Input type="number" value={editSlip.insurance} onChange={(ev) => setEditSlip({ ...editSlip, insurance: Number(ev.target.value) })} />) : Number(p.insurance || 0).toFixed(2)}</td>
                              <td className="p-2">{editingSlipEmp === String(p.employee_id) ? (<Input type="number" value={editSlip.deductions} onChange={(ev) => setEditSlip({ ...editSlip, deductions: Number(ev.target.value) })} />) : Number(p.deductions || 0).toFixed(2)}</td>
                              <td className="p-2 font-semibold">{Number(p.net_salary || 0).toFixed(2)}</td>
                              <td className="p-2 no-print">
                                {editingSlipEmp === String(p.employee_id) ? (
                                  <div className="flex gap-2">
                                    <Button size="sm" onClick={async () => { const res = await fetch('/api/hr/payroll/payslips', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ companyId, runId: String(result?.run_id || ''), employeeId: p.employee_id, update: editSlip }) }); const j = await res.json(); if (res.ok) { await loadPayslips(companyId, String(result?.run_id || '')); setEditingSlipEmp(''); toast({ title: t('Updated', 'تم التعديل') }) } else { toast({ title: t('Error', 'خطأ'), description: j?.error || t('Update failed', 'فشل التعديل') }) } }} disabled={loading}>{t('Save', 'حفظ')}</Button>
                                    <Button size="sm" variant="outline" onClick={() => setEditingSlipEmp('')} disabled={loading}>{t('Cancel', 'إلغاء')}</Button>
                                  </div>
                                ) : (
                                  <div className="flex gap-2">
                                    <Button size="sm" variant="outline" onClick={() => { setEditingSlipEmp(String(p.employee_id)); setEditSlip({ base_salary: Number(p.base_salary || 0), allowances: Number(p.allowances || 0), bonuses: Number(p.bonuses || 0), advances: Number(p.advances || 0), insurance: Number(p.insurance || 0), deductions: Number(p.deductions || 0) }) }} disabled={loading}>{t('Edit', 'تعديل')}</Button>
                                    <Button size="sm" variant="destructive" onClick={async () => { if (!confirm(t('Confirm delete employee payslip?', 'تأكيد حذف قسيمة الموظف؟'))) return; const res = await fetch('/api/hr/payroll/payslips', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ companyId, runId: String(result?.run_id || ''), employeeId: p.employee_id }) }); const j = await res.json(); if (res.ok) { await loadPayslips(companyId, String(result?.run_id || '')); toast({ title: t('Deleted', 'تم الحذف') }) } else { toast({ title: t('Error', 'خطأ'), description: j?.error || t('Delete failed', 'فشل الحذف') }) } }} disabled={loading}>{t('Delete', 'حذف')}</Button>
                                  </div>
                                )}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                      <tfoot className="border-t">
                        <tr>
                          <td className="p-2 font-semibold">{t('Total', 'الإجمالي')}</td>
                          <td className="p-2 font-semibold">{totals.base_salary.toFixed(2)}</td>
                          <td className="p-2 font-semibold">{totals.allowances.toFixed(2)}</td>
                          <td className="p-2 font-semibold">{totals.bonuses.toFixed(2)}</td>
                          <td className="p-2 font-semibold text-green-600">{totals.sales_bonus.toFixed(2)}</td>
                          <td className="p-2 font-semibold text-blue-600">{totals.commission.toFixed(2)}</td>
                          <td className="p-2 font-semibold text-orange-600">{totals.commission_advance_deducted.toFixed(2)}</td>
                          <td className="p-2 font-semibold">{totals.advances.toFixed(2)}</td>
                          <td className="p-2 font-semibold">{totals.insurance.toFixed(2)}</td>
                          <td className="p-2 font-semibold">{totals.deductions.toFixed(2)}</td>
                          <td className="p-2 font-bold">{totals.net_salary.toFixed(2)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="no-print">
              <CardHeader><CardTitle>{t('Paid Salaries', 'صرف المرتبات المصروفة')}</CardTitle></CardHeader>
              <CardContent>
                {payments.length === 0 ? (
                  <p className="text-gray-600 dark:text-gray-400">{t('No payments for this period.', 'لا توجد عمليات صرف لهذه الفترة.')}</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="border-b">
                        <tr>
                          <th className="p-2 text-right">{t('Date', 'التاريخ')}</th>
                          <th className="p-2 text-right">{t('Payment Account', 'الحساب المدفوع منه')}</th>
                          <th className="p-2 text-right">{t('Amount', 'المبلغ')}</th>
                          <th className="p-2 text-right">{t('Description', 'الوصف')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {payments.map((p: any, i: number) => (
                          <tr key={i} className="border-b">
                            <td className="p-2">{p.entry_date}</td>
                            <td className="p-2">{editingPaymentId === String(p.id) ? (
                              <select className="w-full px-3 py-2 border rounded" value={editPayment.paymentAccountId} onChange={(e) => setEditPayment({ ...editPayment, paymentAccountId: e.target.value })}>
                                <option value="">{t('Select Account', 'اختر حساب')}</option>
                                {paymentAccounts.map((a: any) => (<option key={a.id} value={a.id}>{a.account_code} - {a.account_name}</option>))}
                              </select>
                            ) : ((accountMap[p.account_id]?.code || '') + ' - ' + (accountMap[p.account_id]?.name || p.account_id))}</td>
                            <td className="p-2 font-semibold">{editingPaymentId === String(p.id) ? (<Input type="number" value={editPayment.amount} onChange={(ev) => setEditPayment({ ...editPayment, amount: Number(ev.target.value) })} />) : Number(p.amount || 0).toFixed(2)}</td>
                            <td className="p-2">{editingPaymentId === String(p.id) ? (<Input value={editPayment.description} onChange={(ev) => setEditPayment({ ...editPayment, description: ev.target.value })} />) : (p.description || '')}</td>
                            <td className="p-2">
                              {editingPaymentId === String(p.id) ? (
                                <div className="flex gap-2">
                                  <Button size="sm" onClick={async () => { const payload: any = { companyId, runId: String(result?.run_id || ''), entryId: p.id }; if (editPayment.amount) payload.amount = editPayment.amount; if (editPayment.paymentAccountId) payload.paymentAccountId = editPayment.paymentAccountId; payload.description = editPayment.description; const res = await fetch('/api/hr/payroll/payments', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }); const j = await res.json(); if (res.ok) { await loadPayments(companyId, String(result?.run_id || '')); setEditingPaymentId(''); toast({ title: t('Updated', 'تم التعديل') }) } else { toast({ title: t('Error', 'خطأ'), description: j?.error || t('Update failed', 'فشل التعديل') }) } }} disabled={loading}>{t('Save', 'حفظ')}</Button>
                                  <Button size="sm" variant="outline" onClick={() => setEditingPaymentId('')} disabled={loading}>{t('Cancel', 'إلغاء')}</Button>
                                </div>
                              ) : (
                                <div className="flex gap-2">
                                  <Button size="sm" variant="outline" onClick={() => { setEditingPaymentId(String(p.id)); setEditPayment({ amount: Number(p.amount || 0), paymentAccountId: String(p.account_id || ''), description: String(p.description || '') }) }} disabled={loading}>{t('Edit', 'تعديل')}</Button>
                                  <Button size="sm" variant="destructive" onClick={async () => { if (!confirm(t('Confirm delete payment entry?', 'تأكيد حذف قيد الصرف؟'))) return; const res = await fetch('/api/hr/payroll/payments', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ companyId, entryId: p.id }) }); const j = await res.json(); if (res.ok) { await loadPayments(companyId, String(result?.run_id || '')); toast({ title: t('Deleted', 'تم الحذف') }) } else { toast({ title: t('Error', 'خطأ'), description: j?.error || t('Delete failed', 'فشل الحذف') }) } }} disabled={loading}>{t('Delete', 'حذف')}</Button>
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="border-t">
                        <tr>
                          <td className="p-2 font-semibold" colSpan={2}>{t('Total', 'الإجمالي')}</td>
                          <td className="p-2 font-bold">{payments.reduce((s, x) => s + Number(x.amount || 0), 0).toFixed(2)}</td>
                          <td></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  )
}