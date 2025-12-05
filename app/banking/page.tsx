"use client"

import { useEffect, useState } from "react"
import { Sidebar } from "@/components/sidebar"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useSupabase } from "@/lib/supabase/hooks"
import { filterCashBankAccounts } from "@/lib/accounts"
import { useToast } from "@/hooks/use-toast"
import { toastActionSuccess, toastActionError } from "@/lib/notifications"
import { getActiveCompanyId } from "@/lib/company"
import { canAction } from "@/lib/authz"
import { Landmark } from "lucide-react"
import { getExchangeRate, getActiveCurrencies, type Currency } from "@/lib/currency-service"

type Account = { id: string; account_code: string | null; account_name: string; account_type: string; balance?: number }

export default function BankingPage() {
  const supabase = useSupabase()
  const [accounts, setAccounts] = useState<Account[]>([])
  const [balances, setBalances] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [transfer, setTransfer] = useState({ from_id: "", to_id: "", amount: 0, date: new Date().toISOString().slice(0, 10), description: "تحويل بنكي", currency: "EGP" })
  const [saving, setSaving] = useState(false)
  const { toast } = useToast()
  const [appLang, setAppLang] = useState<'ar'|'en'>(() => {
    if (typeof window === 'undefined') return 'ar'
    try {
      const docLang = document.documentElement?.lang
      if (docLang === 'en') return 'en'
      const fromCookie = document.cookie.split('; ').find((x) => x.startsWith('app_language='))?.split('=')[1]
      const v = fromCookie || localStorage.getItem('app_language') || 'ar'
      return v === 'en' ? 'en' : 'ar'
    } catch { return 'ar' }
  })
  const [hydrated, setHydrated] = useState(false)
  const [permView, setPermView] = useState(true)
  const [permWrite, setPermWrite] = useState(false)

  // Currency support
  const [appCurrency, setAppCurrency] = useState<string>(() => {
    if (typeof window === 'undefined') return 'EGP'
    try { return localStorage.getItem('app_currency') || 'EGP' } catch { return 'EGP' }
  })
  const currencySymbols: Record<string, string> = {
    EGP: '£', USD: '$', EUR: '€', GBP: '£', SAR: '﷼', AED: 'د.إ',
    KWD: 'د.ك', QAR: '﷼', BHD: 'د.ب', OMR: '﷼', JOD: 'د.أ', LBP: 'ل.ل'
  }
  const currencySymbol = currencySymbols[appCurrency] || appCurrency

  // Multi-currency support
  const [currencies, setCurrencies] = useState<Currency[]>([])
  const [exchangeRate, setExchangeRate] = useState<number>(1)
  const [exchangeRateId, setExchangeRateId] = useState<string | null>(null)
  const [rateSource, setRateSource] = useState<string>('same_currency')
  const [baseAmount, setBaseAmount] = useState<number>(0)
  const [companyId, setCompanyId] = useState<string | null>(null)

  // Listen for currency changes and reload data
  useEffect(() => {
    const handleCurrencyChange = () => {
      const newCurrency = localStorage.getItem('app_currency') || 'EGP'
      setAppCurrency(newCurrency)
      // Reload balances with new currency
      loadData()
    }
    window.addEventListener('app_currency_changed', handleCurrencyChange)
    return () => window.removeEventListener('app_currency_changed', handleCurrencyChange)
  }, [])

  useEffect(() => { (async () => {
    setPermView(await canAction(supabase, 'banking', 'read'))
    setPermWrite(await canAction(supabase, 'banking', 'write'))
    // Load currencies
    const cid = await getActiveCompanyId(supabase)
    if (cid) {
      setCompanyId(cid)
      const curr = await getActiveCurrencies(supabase, cid)
      if (curr.length > 0) setCurrencies(curr)
      // Set default currency
      const baseCur = localStorage.getItem('app_currency') || 'EGP'
      setTransfer(t => ({ ...t, currency: baseCur }))
    }
  })(); loadData() }, [])
  useEffect(() => {
    const reloadPerms = async () => {
      setPermView(await canAction(supabase, 'banking', 'read'))
      setPermWrite(await canAction(supabase, 'banking', 'write'))
    }
    const handler = () => { reloadPerms() }
    if (typeof window !== 'undefined') window.addEventListener('permissions_updated', handler)
    return () => { if (typeof window !== 'undefined') window.removeEventListener('permissions_updated', handler) }
  }, [])
  useEffect(() => {
    setHydrated(true)
    const handler = () => {
      try {
        const docLang = document.documentElement?.lang
        if (docLang === 'en') { setAppLang('en'); return }
        const fromCookie = document.cookie.split('; ').find((x) => x.startsWith('app_language='))?.split('=')[1]
        const v = fromCookie || localStorage.getItem('app_language') || 'ar'
        setAppLang(v === 'en' ? 'en' : 'ar')
      } catch {}
    }
    window.addEventListener('app_language_changed', handler)
    window.addEventListener('storage', (e: any) => { if (e?.key === 'app_language') handler() })
    return () => { window.removeEventListener('app_language_changed', handler) }
  }, [])

  // Update exchange rate when currency changes
  useEffect(() => {
    const updateRate = async () => {
      const baseCurrency = localStorage.getItem('app_currency') || 'EGP'
      if (transfer.currency === baseCurrency) {
        setExchangeRate(1)
        setExchangeRateId(null)
        setRateSource('same_currency')
        setBaseAmount(transfer.amount)
      } else if (companyId) {
        const result = await getExchangeRate(supabase, companyId, transfer.currency, baseCurrency)
        setExchangeRate(result.rate)
        setExchangeRateId(result.rateId || null)
        setRateSource(result.source)
        setBaseAmount(Math.round(transfer.amount * result.rate * 10000) / 10000)
      }
    }
    updateRate()
  }, [transfer.currency, transfer.amount, companyId])

  const loadData = async () => {
    try {
      setLoading(true)
      let cid: string | null = null
      let loadedAccounts: Account[] = []

      try {
        const res = await fetch('/api/my-company')
        if (res.ok) {
          const j = await res.json()
          cid = String(j?.company?.id || '') || null
          if (cid) { try { localStorage.setItem('active_company_id', cid) } catch {} }
          if (Array.isArray(j?.accounts)) {
            const leaf = filterCashBankAccounts(j.accounts || [], true)
            loadedAccounts = leaf as Account[]
            setAccounts(loadedAccounts)
          }
        }
      } catch {}

      if (!cid) cid = await getActiveCompanyId(supabase)
      if (!cid) return

      // Fetch accounts if not already loaded
      if (loadedAccounts.length === 0) {
        const { data: accs } = await supabase
          .from("chart_of_accounts")
          .select("id, account_code, account_name, account_type, sub_type, parent_id")
          .eq("company_id", cid)
        const list = accs || []
        const leafCashBankAccounts = filterCashBankAccounts(list, true)
        loadedAccounts = leafCashBankAccounts as Account[]
        setAccounts(loadedAccounts)
      }

      // Calculate balances from journal entry lines (real-time) - with multi-currency support
      const { data: journalLines } = await supabase
        .from("journal_entry_lines")
        .select("account_id, debit_amount, credit_amount, display_debit, display_credit, display_currency")

      const currentCurrency = localStorage.getItem('app_currency') || 'EGP'
      const balanceMap: Record<string, number> = {}
      if (journalLines) {
        const lineTotals: Record<string, { debit: number; credit: number }> = {}
        for (const line of journalLines) {
          if (!lineTotals[line.account_id]) {
            lineTotals[line.account_id] = { debit: 0, credit: 0 }
          }
          // Use display amounts if available and currency matches, otherwise use original
          const debit = (line.display_debit != null && line.display_currency === currentCurrency)
            ? Number(line.display_debit)
            : Number(line.debit_amount || 0)
          const credit = (line.display_credit != null && line.display_currency === currentCurrency)
            ? Number(line.display_credit)
            : Number(line.credit_amount || 0)
          lineTotals[line.account_id].debit += debit
          lineTotals[line.account_id].credit += credit
        }
        for (const [accId, totals] of Object.entries(lineTotals)) {
          // For asset accounts (cash/bank), balance = debit - credit
          balanceMap[accId] = totals.debit - totals.credit
        }
      }

      setBalances(balanceMap)
    } finally { setLoading(false) }
  }

  const submitTransfer = async () => {
    try {
      setSaving(true)
      if (!transfer.from_id || !transfer.to_id || transfer.amount <= 0 || transfer.from_id === transfer.to_id) {
        toast({ title: appLang==='en' ? "Incomplete data" : "بيانات غير مكتملة", description: appLang==='en' ? "Please select both accounts and a valid amount" : "يرجى تحديد الحسابين والمبلغ بشكل صحيح" })
        return
      }
      let cid: string | null = null
      try {
        const res = await fetch('/api/my-company')
        if (res.ok) { const j = await res.json(); cid = String(j?.company?.id || '') || null }
      } catch {}
      if (!cid) cid = await getActiveCompanyId(supabase)
      if (!cid) return

      const { data: entry, error: entryErr } = await supabase
        .from("journal_entries")
        .insert({
          company_id: cid,
          reference_type: "bank_transfer",
          entry_date: transfer.date,
          description: transfer.description || (appLang==='en' ? "Transfer between cash/bank accounts" : "تحويل بين حسابات نقد/بنك"),
        }).select().single()
      if (entryErr) throw entryErr

      // Get base currency
      const baseCurrency = typeof window !== 'undefined'
        ? localStorage.getItem('app_currency') || 'EGP'
        : 'EGP'

      // Calculate base amount if different currency
      const finalBaseAmount = transfer.currency === baseCurrency ? transfer.amount : baseAmount

      const { error: linesErr } = await supabase.from("journal_entry_lines").insert([
        {
          journal_entry_id: entry.id,
          account_id: transfer.to_id,
          debit_amount: finalBaseAmount,
          credit_amount: 0,
          description: appLang==='en' ? "Incoming transfer" : "تحويل وارد",
          // Multi-currency support - store original and base values
          original_debit: transfer.amount,
          original_credit: 0,
          original_currency: transfer.currency,
          exchange_rate_used: exchangeRate,
          exchange_rate_id: exchangeRateId,
          rate_source: rateSource,
        },
        {
          journal_entry_id: entry.id,
          account_id: transfer.from_id,
          debit_amount: 0,
          credit_amount: finalBaseAmount,
          description: appLang==='en' ? "Outgoing transfer" : "تحويل صادر",
          // Multi-currency support - store original and base values
          original_credit: transfer.amount,
          original_currency: transfer.currency,
          exchange_rate_used: exchangeRate,
          exchange_rate_id: exchangeRateId,
          rate_source: rateSource,
        },
      ])
      if (linesErr) throw linesErr

      setTransfer({ ...transfer, amount: 0, description: appLang==='en' ? "Bank transfer" : "تحويل بنكي" })
      toastActionSuccess(toast, appLang==='en' ? "Record" : "التسجيل", appLang==='en' ? "Transfer" : "التحويل")
    } catch (err) {
      console.error("Error recording transfer:", err)
      toastActionError(toast, appLang==='en' ? "Transfer" : "التحويل")
    } finally { setSaving(false) }
  }

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
      <Sidebar />
      {/* Main Content - تحسين للهاتف */}
      <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 space-y-4 sm:space-y-6 overflow-x-hidden">
        {/* رأس الصفحة - تحسين للهاتف */}
        <div className="bg-white dark:bg-slate-900 rounded-xl sm:rounded-2xl shadow-sm border border-gray-200 dark:border-slate-800 p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 sm:gap-4">
            <div className="flex items-center gap-3 sm:gap-4">
              <div className="p-2 sm:p-3 bg-blue-100 dark:bg-blue-900/30 rounded-lg sm:rounded-xl flex-shrink-0">
                <Landmark className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600 dark:text-blue-400" />
              </div>
              <div className="min-w-0">
                <h1 className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white truncate" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Banking' : 'البنوك'}</h1>
                <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-0.5 sm:mt-1 truncate">
                  {appLang==='en' ? 'Bank & cash accounts' : 'الحسابات البنكية والخزينة'}
                </p>
              </div>
            </div>
            {permWrite ? (
              <Button variant="outline" asChild>
                <a href="/chart-of-accounts">{appLang==='en' ? 'Add bank/cash account' : 'إضافة حساب بنكي/خزينة'}</a>
              </Button>
            ) : null}
          </div>
        </div>

        <Card>
          <CardContent className="pt-6 space-y-6">
            <h2 className="text-xl font-semibold" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Transfer Between Accounts' : 'تحويل بين الحسابات'}</h2>
            <div className="grid grid-cols-1 md:grid-cols-6 gap-4 items-end">
              <div>
                <Label suppressHydrationWarning>{(hydrated && appLang==='en') ? 'From Account' : 'من الحساب'}</Label>
                <select className="w-full border rounded px-2 py-1" value={transfer.from_id} onChange={(e) => setTransfer({ ...transfer, from_id: e.target.value })}>
                  <option value="">{appLang==='en' ? 'Select account' : 'اختر حسابًا'}</option>
                  {accounts.map(a => (
                    <option key={a.id} value={a.id}>{a.account_code || ""} {a.account_name}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label suppressHydrationWarning>{(hydrated && appLang==='en') ? 'To Account' : 'إلى الحساب'}</Label>
                <select className="w-full border rounded px-2 py-1" value={transfer.to_id} onChange={(e) => setTransfer({ ...transfer, to_id: e.target.value })}>
                  <option value="">{appLang==='en' ? 'Select account' : 'اختر حسابًا'}</option>
                  {accounts.map(a => (
                    <option key={a.id} value={a.id}>{a.account_code || ""} {a.account_name}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Amount' : 'المبلغ'}</Label>
                <Input type="number" min={0} step={0.01} value={transfer.amount} onChange={(e) => setTransfer({ ...transfer, amount: Number(e.target.value) })} />
              </div>
              <div>
                <Label suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Currency' : 'العملة'}</Label>
                <select
                  className="w-full border rounded px-2 py-1"
                  value={transfer.currency}
                  onChange={(e) => setTransfer({ ...transfer, currency: e.target.value })}
                >
                  {currencies.length > 0 ? (
                    currencies.map(c => (
                      <option key={c.code} value={c.code}>{c.code} - {c.name}</option>
                    ))
                  ) : (
                    <>
                      <option value="EGP">EGP - جنيه مصري</option>
                      <option value="USD">USD - دولار أمريكي</option>
                      <option value="EUR">EUR - يورو</option>
                      <option value="SAR">SAR - ريال سعودي</option>
                    </>
                  )}
                </select>
              </div>
              <div>
                <Label suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Date' : 'التاريخ'}</Label>
                <Input type="date" value={transfer.date} onChange={(e) => setTransfer({ ...transfer, date: e.target.value })} />
              </div>
              <div className="flex gap-2">
                {permWrite ? (<Button onClick={submitTransfer} disabled={saving || !transfer.from_id || !transfer.to_id || transfer.from_id === transfer.to_id || transfer.amount <= 0}>{(hydrated && appLang==='en') ? 'Record Transfer' : 'تسجيل التحويل'}</Button>) : null}
              </div>
            </div>

            {/* Exchange Rate Info */}
            {transfer.currency !== appCurrency && transfer.amount > 0 && (
              <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg text-sm">
                <div className="flex justify-between items-center">
                  <span>{appLang === 'en' ? 'Exchange Rate:' : 'سعر الصرف:'} <strong>1 {transfer.currency} = {exchangeRate.toFixed(4)} {appCurrency}</strong></span>
                  <span className="text-xs text-gray-500 dark:text-gray-400">({rateSource === 'api' ? (appLang === 'en' ? 'API' : 'API') : rateSource === 'manual' ? (appLang === 'en' ? 'Manual' : 'يدوي') : rateSource === 'cache' ? (appLang === 'en' ? 'Cache' : 'كاش') : rateSource})</span>
                </div>
                <div className="mt-1">
                  {appLang === 'en' ? 'Base Amount:' : 'المبلغ الأساسي:'} <strong>{baseAmount.toFixed(2)} {appCurrency}</strong>
                </div>
              </div>
            )}

            <div className="text-sm text-gray-600 dark:text-gray-400" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'The transfer is recorded as a journal entry (debit receiver, credit sender).' : 'يتم تسجيل التحويل كقيد يومي (مدين للحساب المستلم، دائن للحساب المرسل).'}</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6 space-y-4">
            <h2 className="text-xl font-semibold" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Cash & Bank Accounts' : 'حسابات النقد والبنك'}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {accounts.map(a => {
                const balance = balances[a.id] || 0
                const formattedBalance = new Intl.NumberFormat(appLang === 'en' ? 'en-EG' : 'ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(balance))
                return (
                  <a key={a.id} href={`/banking/${a.id}`} className="border rounded p-4 hover:bg-gray-50 dark:hover:bg-slate-900 block">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="font-medium">{a.account_name}</div>
                        <div className="text-sm text-gray-600 dark:text-gray-400">{a.account_code || ""}</div>
                      </div>
                      <div className={`text-lg font-bold ${balance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {balance < 0 ? '-' : ''}{formattedBalance} {currencySymbol}
                      </div>
                    </div>
                    <div className="text-xs mt-2 text-blue-600" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'View details →' : 'عرض التفاصيل ←'}</div>
                  </a>
                )
              })}
              {accounts.length === 0 && (
                <div className="text-sm text-gray-600 dark:text-gray-400" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'No accounts yet. Add them from Chart of Accounts.' : 'لا توجد حسابات بعد. قم بإضافتها من الشجرة المحاسبية.'}</div>
              )}
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
