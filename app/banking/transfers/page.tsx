"use client"

/**
 * Bank Transfers Page (v3.12.0)
 *
 * Manage transfers between bank/cash accounts with multi-currency support.
 *
 * Backed by:
 *   - POST /api/banking/transfers (creates a journal_entry with reference_type='bank_transfer')
 *   - Reads from journal_entries WHERE reference_type='bank_transfer'
 *
 * FX support:
 *   - User selects from/to accounts (potentially with different currencies)
 *   - Enters amount + currency_code + exchange_rate
 *   - System records the journal with both sides at correct base equivalent
 */

import { useState, useEffect, useMemo } from "react"
import { useSupabase } from "@/lib/supabase/hooks"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { useToast } from "@/hooks/use-toast"
import { ArrowRightLeft, Plus, Loader2, AlertTriangle, RefreshCw } from "lucide-react"
import { getActiveCompanyId } from "@/lib/company"

interface BankAccount {
  id: string
  account_code: string
  account_name: string
  account_type: string
  sub_type: string | null
  currency_code?: string | null
  balance?: number
}

interface TransferRecord {
  id: string
  entry_number: string | null
  entry_date: string
  description: string | null
  currency_code: string
  exchange_rate: number
  status: string
  total_debit: number
  total_credit: number
  from_account?: string
  to_account?: string
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  EGP: '£', USD: '$', EUR: '€', GBP: '£', SAR: '﷼', AED: 'د.إ',
  KWD: 'د.ك', QAR: '﷼', BHD: 'د.ب', OMR: '﷼', JOD: 'د.أ', LBP: 'ل.ل',
}

export default function BankTransfersPage() {
  const supabase = useSupabase()
  const { toast } = useToast()
  const [appLang, setAppLang] = useState<'ar' | 'en'>('ar')
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [baseCurrency, setBaseCurrency] = useState<string>('EGP')

  const [accounts, setAccounts] = useState<BankAccount[]>([])
  const [transfers, setTransfers] = useState<TransferRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Form state
  const [form, setForm] = useState({
    fromAccountId: '',
    toAccountId: '',
    amount: 0,
    transferDate: new Date().toISOString().slice(0, 10),
    currencyCode: 'EGP',
    exchangeRate: 1,
    description: '',
  })

  const t = (en: string, ar: string) => appLang === 'en' ? en : ar

  useEffect(() => {
    try { setAppLang((localStorage.getItem('app_language') || 'ar') === 'en' ? 'en' : 'ar') } catch {}
  }, [])

  // Load accounts + transfers
  const loadData = async () => {
    setLoading(true)
    try {
      const cid = await getActiveCompanyId(supabase)
      if (!cid) {
        toast({ variant: 'destructive', title: t('No active company', 'لا توجد شركة محددة') })
        return
      }
      setCompanyId(cid)

      // Get company base currency
      const { data: company } = await supabase
        .from('companies')
        .select('base_currency')
        .eq('id', cid)
        .maybeSingle()
      const base = (company?.base_currency || 'EGP').toUpperCase()
      setBaseCurrency(base)
      setForm(f => ({ ...f, currencyCode: base }))

      // Load cash/bank accounts only
      const { data: accs } = await supabase
        .from('chart_of_accounts')
        .select('id, account_code, account_name, account_type, sub_type')
        .eq('company_id', cid)
        .eq('is_active', true)
        .in('sub_type', ['cash', 'bank'])
        .order('account_code')
      setAccounts((accs || []) as BankAccount[])

      // Load recent transfers (last 50)
      const { data: jeData } = await supabase
        .from('journal_entries')
        .select('id, entry_number, entry_date, description, currency_code, exchange_rate, status')
        .eq('company_id', cid)
        .eq('reference_type', 'bank_transfer')
        .order('entry_date', { ascending: false })
        .limit(50)

      // For each entry, fetch the from/to accounts from lines
      const entries = (jeData || []) as any[]
      const records: TransferRecord[] = []
      for (const je of entries) {
        const { data: lines } = await supabase
          .from('journal_entry_lines')
          .select('debit_amount, credit_amount, account_id, chart_of_accounts(account_name, account_code)')
          .eq('journal_entry_id', je.id)
        let totalDebit = 0
        let totalCredit = 0
        let fromAccount = ''
        let toAccount = ''
        for (const l of (lines || [])) {
          const dr = Number(l.debit_amount || 0)
          const cr = Number(l.credit_amount || 0)
          totalDebit += dr
          totalCredit += cr
          const acc = Array.isArray(l.chart_of_accounts) ? l.chart_of_accounts[0] : l.chart_of_accounts
          const name = acc?.account_name || ''
          if (dr > 0 && !toAccount) toAccount = name
          if (cr > 0 && !fromAccount) fromAccount = name
        }
        records.push({
          ...je,
          total_debit: totalDebit,
          total_credit: totalCredit,
          from_account: fromAccount,
          to_account: toAccount,
        })
      }
      setTransfers(records)
    } catch (err: any) {
      console.error(err)
      toast({ variant: 'destructive', title: t('Error loading data', 'خطأ فى تحميل البيانات'), description: err.message })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadData() }, [])

  // Validation
  const isFCTransfer = useMemo(() => form.currencyCode.toUpperCase() !== baseCurrency.toUpperCase(), [form.currencyCode, baseCurrency])
  const baseAmount = useMemo(() => {
    if (isFCTransfer && form.exchangeRate > 0) {
      return Math.round(form.amount * form.exchangeRate * 100) / 100
    }
    return form.amount
  }, [form.amount, form.exchangeRate, isFCTransfer])

  const fromAccount = useMemo(() => accounts.find(a => a.id === form.fromAccountId), [accounts, form.fromAccountId])
  const toAccount = useMemo(() => accounts.find(a => a.id === form.toAccountId), [accounts, form.toAccountId])

  // Submit
  const handleSubmit = async () => {
    if (!form.fromAccountId || !form.toAccountId) {
      toast({ variant: 'destructive', title: t('Both accounts required', 'يجب اختيار الحسابين') })
      return
    }
    if (form.fromAccountId === form.toAccountId) {
      toast({ variant: 'destructive', title: t('Accounts must differ', 'لا يمكن اختيار نفس الحساب') })
      return
    }
    if (form.amount <= 0) {
      toast({ variant: 'destructive', title: t('Amount must be > 0', 'المبلغ يجب أن يكون أكبر من صفر') })
      return
    }
    if (isFCTransfer && form.exchangeRate <= 0) {
      toast({ variant: 'destructive', title: t('Exchange rate required', 'سعر الصرف مطلوب') })
      return
    }

    setSaving(true)
    try {
      const res = await fetch('/api/banking/transfers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromAccountId: form.fromAccountId,
          toAccountId: form.toAccountId,
          amount: form.amount,
          transferDate: form.transferDate,
          description: form.description || null,
          currencyCode: form.currencyCode,
          exchangeRate: form.exchangeRate,
          baseAmount,
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.error || t('Transfer failed', 'فشل التحويل'))
      }
      toast({ title: t('Transfer recorded successfully', 'تم تسجيل التحويل بنجاح'), description: t('Amount: ', 'المبلغ: ') + `${form.amount} ${form.currencyCode}` })
      // Reset + reload
      setForm(f => ({ ...f, fromAccountId: '', toAccountId: '', amount: 0, description: '', exchangeRate: 1, currencyCode: baseCurrency }))
      await loadData()
    } catch (err: any) {
      toast({ variant: 'destructive', title: t('Transfer failed', 'فشل التحويل'), description: err.message })
    } finally {
      setSaving(false)
    }
  }

  const baseSymbol = CURRENCY_SYMBOLS[baseCurrency] || baseCurrency
  const fcSymbol = CURRENCY_SYMBOLS[form.currencyCode.toUpperCase()] || form.currencyCode

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900" dir={appLang === 'ar' ? 'rtl' : 'ltr'}>
      <main className="flex-1 md:mr-64 p-4 md:p-8 pt-20 md:pt-8">
        <div className="space-y-6 max-w-6xl mx-auto">

          {/* Header */}
          <Card className="bg-white dark:bg-slate-900 border-0 shadow-sm">
            <CardContent className="py-6">
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl shadow-lg">
                    <ArrowRightLeft className="w-7 h-7 text-white" />
                  </div>
                  <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                      {t('Bank Transfers', 'التحويلات البنكية')}
                    </h1>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                      {t('Transfer funds between cash/bank accounts with multi-currency support', 'تحويل الأموال بين حسابات النقد/البنك مع دعم العملات المختلفة')}
                    </p>
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={loadData} disabled={loading}>
                  <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                  {t('Refresh', 'تحديث')}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* New transfer form */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Plus className="w-5 h-5" />
                {t('New Transfer', 'تحويل جديد')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* From */}
                <div className="space-y-2">
                  <Label>{t('From Account', 'من حساب')} *</Label>
                  <select
                    className="w-full border rounded-md p-2 dark:bg-slate-800 dark:border-slate-700"
                    value={form.fromAccountId}
                    onChange={(e) => setForm(f => ({ ...f, fromAccountId: e.target.value }))}
                  >
                    <option value="">{t('Select account', 'اختر الحساب')}</option>
                    {accounts.map(a => (
                      <option key={a.id} value={a.id}>
                        {a.account_code} - {a.account_name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* To */}
                <div className="space-y-2">
                  <Label>{t('To Account', 'إلى حساب')} *</Label>
                  <select
                    className="w-full border rounded-md p-2 dark:bg-slate-800 dark:border-slate-700"
                    value={form.toAccountId}
                    onChange={(e) => setForm(f => ({ ...f, toAccountId: e.target.value }))}
                  >
                    <option value="">{t('Select account', 'اختر الحساب')}</option>
                    {accounts.filter(a => a.id !== form.fromAccountId).map(a => (
                      <option key={a.id} value={a.id}>
                        {a.account_code} - {a.account_name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Amount */}
                <div className="space-y-2">
                  <Label>{t('Amount', 'المبلغ')} *</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.amount}
                    onChange={(e) => setForm(f => ({ ...f, amount: Number(e.target.value || 0) }))}
                  />
                </div>

                {/* Date */}
                <div className="space-y-2">
                  <Label>{t('Transfer Date', 'تاريخ التحويل')} *</Label>
                  <Input
                    type="date"
                    value={form.transferDate}
                    onChange={(e) => setForm(f => ({ ...f, transferDate: e.target.value }))}
                  />
                </div>

                {/* Currency */}
                <div className="space-y-2">
                  <Label>{t('Currency', 'العملة')}</Label>
                  <select
                    className="w-full border rounded-md p-2 dark:bg-slate-800 dark:border-slate-700"
                    value={form.currencyCode}
                    onChange={(e) => setForm(f => ({ ...f, currencyCode: e.target.value }))}
                  >
                    {['EGP','USD','EUR','GBP','SAR','AED','KWD','QAR','BHD','OMR','JOD','LBP'].map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                {/* Exchange rate (only for FC) */}
                {isFCTransfer && (
                  <div className="space-y-2">
                    <Label>
                      {t(`Exchange Rate (${form.currencyCode} → ${baseCurrency})`, `سعر الصرف (${form.currencyCode} → ${baseCurrency})`)} *
                    </Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.0001"
                      value={form.exchangeRate}
                      onChange={(e) => setForm(f => ({ ...f, exchangeRate: Number(e.target.value || 0) }))}
                    />
                  </div>
                )}
              </div>

              {/* FX preview */}
              {isFCTransfer && form.amount > 0 && form.exchangeRate > 0 && (
                <Alert className="bg-amber-50 dark:bg-amber-900/20 border-amber-200">
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                  <AlertDescription className="text-amber-700 dark:text-amber-300 mr-2">
                    💱 {t(
                      `FX Transfer: ${form.amount.toFixed(2)} ${fcSymbol} × ${form.exchangeRate.toFixed(4)} = ${baseAmount.toFixed(2)} ${baseSymbol}`,
                      `تحويل بعملة أجنبية: ${form.amount.toFixed(2)} ${fcSymbol} × ${form.exchangeRate.toFixed(4)} = ${baseAmount.toFixed(2)} ${baseSymbol}`
                    )}
                  </AlertDescription>
                </Alert>
              )}

              <div className="space-y-2">
                <Label>{t('Description (optional)', 'الوصف (اختيارى)')}</Label>
                <Textarea
                  value={form.description}
                  onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))}
                  rows={2}
                  placeholder={t('e.g. Monthly cash deposit to main bank', 'مثال: إيداع نقدى شهرى للبنك الرئيسى')}
                />
              </div>

              <div className="flex justify-end gap-2">
                <Button onClick={handleSubmit} disabled={saving} className="gap-2">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRightLeft className="w-4 h-4" />}
                  {t('Record Transfer', 'تسجيل التحويل')}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Transfers list */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">
                {t('Recent Transfers', 'التحويلات الأخيرة')} ({transfers.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-8 text-gray-500">
                  <Loader2 className="w-6 h-6 mx-auto animate-spin mb-2" />
                  {t('Loading...', 'جارى التحميل...')}
                </div>
              ) : transfers.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <ArrowRightLeft className="w-12 h-12 mx-auto text-gray-300 mb-4" />
                  <p>{t('No bank transfers yet', 'لا توجد تحويلات بنكية بعد')}</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b dark:border-gray-700">
                        <th className="text-right py-2 px-2">{t('Date', 'التاريخ')}</th>
                        <th className="text-right py-2 px-2">{t('From', 'من')}</th>
                        <th className="text-right py-2 px-2">{t('To', 'إلى')}</th>
                        <th className="text-right py-2 px-2">{t('Amount', 'المبلغ')}</th>
                        <th className="text-right py-2 px-2">{t('Currency', 'العملة')}</th>
                        <th className="text-right py-2 px-2">{t('Rate', 'السعر')}</th>
                        <th className="text-right py-2 px-2">{t('Description', 'الوصف')}</th>
                        <th className="text-right py-2 px-2">{t('Status', 'الحالة')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {transfers.map(tr => {
                        const isFC = tr.currency_code && tr.currency_code.toUpperCase() !== baseCurrency.toUpperCase()
                        const sym = CURRENCY_SYMBOLS[(tr.currency_code || baseCurrency).toUpperCase()] || tr.currency_code
                        return (
                          <tr key={tr.id} className="border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-slate-800">
                            <td className="py-2 px-2">{tr.entry_date}</td>
                            <td className="py-2 px-2">{tr.from_account || '-'}</td>
                            <td className="py-2 px-2">{tr.to_account || '-'}</td>
                            <td className="py-2 px-2 font-medium">
                              {tr.total_debit.toLocaleString('en-US', { minimumFractionDigits: 2 })} {baseSymbol}
                              {isFC && (
                                <span className="block text-[10px] text-gray-500">≈ {sym} (rate {Number(tr.exchange_rate).toFixed(4)})</span>
                              )}
                            </td>
                            <td className="py-2 px-2">
                              <Badge variant={isFC ? "default" : "outline"}>{tr.currency_code}</Badge>
                            </td>
                            <td className="py-2 px-2 text-xs">{Number(tr.exchange_rate).toFixed(4)}</td>
                            <td className="py-2 px-2 text-xs text-gray-500 max-w-xs truncate">{tr.description || '-'}</td>
                            <td className="py-2 px-2">
                              <Badge variant={tr.status === 'posted' ? 'default' : 'secondary'}>{tr.status}</Badge>
                            </td>
                          </tr>
                        )
                      })}
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
