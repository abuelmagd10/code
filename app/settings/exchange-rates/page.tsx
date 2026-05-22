"use client"
import { useState, useEffect } from "react"
import { CompanyHeader } from "@/components/company-header"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { NumericInput } from "@/components/ui/numeric-input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useSupabase } from "@/lib/supabase/hooks"
import { getActiveCompanyId } from "@/lib/company"
import { useToast } from "@/hooks/use-toast"
import { RefreshCw, Plus, Trash2, ArrowLeft, Globe, Edit2, History, AlertCircle, Loader2, Coins, CheckCircle2, XCircle } from "lucide-react"
import Link from "next/link"
import { CURRENCIES, fetchExchangeRateFromAPI, getCurrencySymbol } from "@/lib/exchange-rates"
import { setManualExchangeRate, getActiveCurrencies, getBaseCurrency, getRateMode, setRateMode, type Currency } from "@/lib/currency-service"
import { computeFXRevaluation, computeFullFXRevaluation, postFXRevaluation, type FXRevaluationResult } from "@/lib/fx-revaluation"
import { Textarea } from "@/components/ui/textarea"

interface ExchangeRateRow {
  id: string
  from_currency: string
  to_currency: string
  rate: number
  rate_date: string
  rate_timestamp?: string
  source: string
  source_detail?: string
  is_manual_override?: boolean
  override_reason?: string
  created_by?: string
}

export default function ExchangeRatesPage() {
  const supabase = useSupabase()
  const { toast } = useToast()
  const [rates, setRates] = useState<ExchangeRateRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [companyId, setCompanyId] = useState<string>("")
  const [baseCurrency, setBaseCurrency] = useState<string>("EGP")
  const [newFromCurrency, setNewFromCurrency] = useState<string>("")
  const [newToCurrency, setNewToCurrency] = useState<string>("")
  const [newRate, setNewRate] = useState<string>("")
  const [fetchingApi, setFetchingApi] = useState(false)
  const [appLang, setAppLang] = useState<'ar' | 'en'>('ar')
  // v3.27.3: Rate mode preference (live vs manual)
  const [rateMode, setRateModeState] = useState<'live' | 'manual'>('manual')
  const [savingRateMode, setSavingRateMode] = useState(false)
  // v3.27.5: FX Revaluation state
  const [showRevalModal, setShowRevalModal] = useState(false)
  const [revalAsOfDate, setRevalAsOfDate] = useState<string>(() => new Date().toISOString().slice(0, 10))
  const [revalPreview, setRevalPreview] = useState<FXRevaluationResult | null>(null)
  const [revalLoading, setRevalLoading] = useState(false)
  const [revalPosting, setRevalPosting] = useState(false)

  // Manual override state
  const [showOverrideModal, setShowOverrideModal] = useState(false)
  const [overrideFromCurrency, setOverrideFromCurrency] = useState<string>("")
  const [overrideToCurrency, setOverrideToCurrency] = useState<string>("")
  const [overrideRate, setOverrideRate] = useState<string>("")
  const [overrideReason, setOverrideReason] = useState<string>("")

  // History view state
  const [showHistory, setShowHistory] = useState(false)
  const [historyRates, setHistoryRates] = useState<ExchangeRateRow[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)

  // Currencies from database
  const [currencies, setCurrencies] = useState<Currency[]>([])

  useEffect(() => {
    const loadData = async () => {
      try {
        const cid = await getActiveCompanyId(supabase)
        if (cid) {
          setCompanyId(cid)
          // v3.27.0: use DB-backed getBaseCurrency (reads companies.base_currency)
          // to avoid localStorage staleness when switching companies.
          const base = await getBaseCurrency(supabase, cid)
          setBaseCurrency(base)
          setNewToCurrency(base)
          setOverrideToCurrency(base)

          // Load currencies from database
          const dbCurrencies = await getActiveCurrencies(supabase, cid)
          if (dbCurrencies.length > 0) {
            setCurrencies(dbCurrencies)
            const baseCurr = dbCurrencies.find(c => c.is_base)
            if (baseCurr) {
              setBaseCurrency(baseCurr.code)
              setNewToCurrency(baseCurr.code)
              setOverrideToCurrency(baseCurr.code)
            }
          }

          // v3.27.3: load company's rate_mode preference
          const mode = await getRateMode(supabase, cid)
          setRateModeState(mode)

          const { data } = await supabase
            .from('exchange_rates')
            .select('*')
            .eq('company_id', cid)
            .order('rate_timestamp', { ascending: false })
            .limit(100)

          setRates(data || [])

          // Auto-fetch rates from API if no rates exist or rates are old
          const today = new Date().toISOString().slice(0, 10)
          const hasRecentRates = data && data.some((r: any) => r.rate_date === today && r.source === 'api')
          if (!hasRecentRates && cid) {
            // Fetch all rates automatically (insert to avoid upsert constraint mismatch / 400)
            const currList = Object.keys(CURRENCIES).filter(c => c !== base)
            for (const curr of currList) {
              try {
                const rate = await fetchExchangeRateFromAPI(curr, base)
                if (rate) {
                  const { error } = await supabase.from('exchange_rates').insert({
                    company_id: cid,
                    from_currency: curr,
                    to_currency: base,
                    rate,
                    rate_date: today,
                    rate_timestamp: new Date().toISOString(),
                    source: 'api',
                    source_detail: 'exchangerate-api.com',
                    is_manual_override: false
                  })
                  // Ignore duplicate key (23505) - rate for today already exists
                  if (error && (error as { code?: string }).code !== '23505') {
                    console.warn('[exchange_rates] auto-fetch insert failed:', error.message)
                  }
                }
              } catch { }
            }
            // Reload after auto-fetch
            const { data: newData } = await supabase.from('exchange_rates').select('*').eq('company_id', cid).order('rate_timestamp', { ascending: false }).limit(100)
            setRates(newData || [])
          }
        }
      } catch (e) {
        console.error(e)
      } finally {
        setLoading(false)
      }
    }
    loadData()
    try { setAppLang(localStorage.getItem('app_language') === 'en' ? 'en' : 'ar') } catch { }
    const langRead = () => { try { setAppLang(localStorage.getItem('app_language') === 'en' ? 'en' : 'ar') } catch { } }
    window.addEventListener('app_language_changed', langRead)
    window.addEventListener('storage', langRead)
    return () => { window.removeEventListener('app_language_changed', langRead); window.removeEventListener('storage', langRead) }
  }, [supabase])

  const handleAddRate = async () => {
    if (!newFromCurrency || !newToCurrency || !newRate || !companyId) return
    setSaving(true)
    try {
      const { error } = await supabase.from('exchange_rates').insert({
        company_id: companyId,
        from_currency: newFromCurrency,
        to_currency: newToCurrency,
        rate: parseFloat(newRate),
        rate_date: new Date().toISOString().slice(0, 10),
        source: 'manual'
      })
      if (error) throw error
      toast({ title: appLang === 'en' ? 'Success' : 'نجاح', description: appLang === 'en' ? 'Rate added' : 'تم إضافة السعر' })

      const { data } = await supabase.from('exchange_rates').select('*').eq('company_id', companyId).order('rate_date', { ascending: false })
      setRates(data || [])
      setNewFromCurrency('')
      setNewRate('')
    } catch (e: any) {
      toast({ title: appLang === 'en' ? 'Error' : 'خطأ', description: e.message, variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  const handleFetchFromApi = async () => {
    if (!newFromCurrency || !newToCurrency) return
    setFetchingApi(true)
    try {
      const rate = await fetchExchangeRateFromAPI(newFromCurrency, newToCurrency)
      if (rate) {
        setNewRate(rate.toFixed(6))
        toast({ title: appLang === 'en' ? 'Success' : 'نجاح', description: appLang === 'en' ? 'Rate fetched from API' : 'تم جلب السعر من الإنترنت' })
      } else {
        toast({ title: appLang === 'en' ? 'Error' : 'خطأ', description: appLang === 'en' ? 'Could not fetch rate' : 'لم يتم العثور على السعر', variant: 'destructive' })
      }
    } finally {
      setFetchingApi(false)
    }
  }

  const handleDeleteRate = async (id: string) => {
    try {
      await supabase.from('exchange_rates').delete().eq('id', id)
      setRates(rates.filter(r => r.id !== id))
      toast({ title: appLang === 'en' ? 'Deleted' : 'تم الحذف' })
    } catch (e: any) {
      toast({ title: appLang === 'en' ? 'Error' : 'خطأ', description: e.message, variant: 'destructive' })
    }
  }

  const handleRefreshAllRates = async () => {
    setFetchingApi(true)
    try {
      const today = new Date().toISOString().slice(0, 10)
      const currencies = Object.keys(CURRENCIES).filter(c => c !== baseCurrency)
      for (const curr of currencies) {
        const rate = await fetchExchangeRateFromAPI(curr, baseCurrency)
        if (rate) {
          const { error } = await supabase.from('exchange_rates').insert({
            company_id: companyId,
            from_currency: curr,
            to_currency: baseCurrency,
            rate,
            rate_date: today,
            rate_timestamp: new Date().toISOString(),
            source: 'api',
            source_detail: 'exchangerate-api.com',
            is_manual_override: false
          })
          // Ignore duplicate (23505) - same day rate already exists
          if (error && (error as { code?: string }).code !== '23505') {
            console.warn('[exchange_rates] refresh insert failed:', error.message)
          }
        }
      }
      const { data } = await supabase.from('exchange_rates').select('*').eq('company_id', companyId).order('rate_date', { ascending: false })
      setRates(data || [])
      toast({ title: appLang === 'en' ? 'Success' : 'نجاح', description: appLang === 'en' ? 'All rates updated' : 'تم تحديث جميع الأسعار' })
    } finally {
      setFetchingApi(false)
    }
  }

  const currencyOptions = currencies.length > 0
    ? currencies.map(c => ({ code: c.code, label: appLang === 'en' ? `${c.code} - ${c.name}` : `${c.code} - ${c.name_ar}`, symbol: c.symbol }))
    : Object.entries(CURRENCIES).map(([code, info]) => ({
      code, label: appLang === 'en' ? `${code} - ${info.nameEn}` : `${code} - ${info.nameAr}`, symbol: info.symbol
    }))

  // Handle manual override submission
  const handleManualOverride = async () => {
    if (!overrideFromCurrency || !overrideToCurrency || !overrideRate || !overrideReason) {
      toast({ title: appLang === 'en' ? 'Error' : 'خطأ', description: appLang === 'en' ? 'Please fill all fields' : 'يرجى ملء جميع الحقول', variant: 'destructive' })
      return
    }
    setSaving(true)
    try {
      await setManualExchangeRate(
        supabase,
        overrideFromCurrency,
        overrideToCurrency,
        parseFloat(overrideRate),
        overrideReason,
        companyId
      )
      toast({ title: appLang === 'en' ? 'Success' : 'نجاح', description: appLang === 'en' ? 'Manual rate override saved' : 'تم حفظ التجاوز اليدوي' })

      // Reload rates
      const { data } = await supabase.from('exchange_rates').select('*').eq('company_id', companyId).order('rate_timestamp', { ascending: false }).limit(100)
      setRates(data || [])

      // Reset form
      setShowOverrideModal(false)
      setOverrideFromCurrency('')
      setOverrideRate('')
      setOverrideReason('')
    } catch (e: any) {
      toast({ title: appLang === 'en' ? 'Error' : 'خطأ', description: e.message, variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  // Load rate history for a specific currency pair
  const loadRateHistory = async (fromCurrency: string, toCurrency: string) => {
    setHistoryLoading(true)
    try {
      const { data } = await supabase
        .from('exchange_rates')
        .select('*')
        .eq('company_id', companyId)
        .eq('from_currency', fromCurrency)
        .eq('to_currency', toCurrency)
        .order('rate_timestamp', { ascending: false })
        .limit(50)
      setHistoryRates(data || [])
      setShowHistory(true)
    } catch (e) {
      console.error(e)
    } finally {
      setHistoryLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
        <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 overflow-x-hidden">
          <div className="flex items-center justify-center min-h-[60vh]">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900" dir={appLang === 'ar' ? 'rtl' : 'ltr'}>
      {/* Main Content - تحسين للهاتف */}
      <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 overflow-x-hidden">
        <div className="space-y-4 sm:space-y-6 max-w-full">
          <CompanyHeader />
          {/* رأس الصفحة - تحسين للهاتف */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <Link href="/settings"><Button variant="ghost" size="icon" className="flex-shrink-0"><ArrowLeft className="h-4 w-4 sm:h-5 sm:w-5" /></Button></Link>
              <div className="p-2 sm:p-3 rounded-lg sm:rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 shadow-lg">
                <Coins className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
              </div>
              <h1 className="text-lg sm:text-2xl font-bold truncate">{appLang === 'en' ? 'Exchange Rates' : 'أسعار الصرف'}</h1>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => setShowOverrideModal(true)} variant="outline" className="border-amber-500 text-amber-600 hover:bg-amber-50">
                <Edit2 className="h-4 w-4 mr-2" />
                {appLang === 'en' ? 'Manual Override' : 'تجاوز يدوي'}
              </Button>
              <Button onClick={handleRefreshAllRates} disabled={fetchingApi} variant="outline">
                <Globe className="h-4 w-4 mr-2" />
                {appLang === 'en' ? 'Update All from API' : 'تحديث الكل من الإنترنت'}
              </Button>
            </div>
          </div>

          {/* v3.27.3: Rate Mode Toggle (Live vs Manual) */}
          <Card className="border-blue-200 bg-blue-50/50 dark:bg-blue-950/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Globe className="h-4 w-4 text-blue-600" />
                {appLang === 'en' ? 'Rate Fetch Mode' : 'وضع جلب سعر الصرف'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">
                {appLang === 'en' ? 'Choose how the system fetches rates for all financial operations.' : 'اختر كيفية جلب الأسعار للعمليات المالية فى النظام.'}
              </p>
              <div className="flex flex-col sm:flex-row gap-3">
                <button type="button" disabled={savingRateMode}
                  onClick={async () => {
                    if (!companyId || rateMode === 'live') return
                    setSavingRateMode(true)
                    const ok = await setRateMode(supabase, companyId, 'live')
                    if (ok) setRateModeState('live')
                    setSavingRateMode(false)
                  }}
                  className={`flex-1 p-3 rounded-lg border-2 text-start transition ${rateMode === 'live' ? 'border-blue-500 bg-white dark:bg-blue-900/40 shadow-sm' : 'border-gray-200 dark:border-slate-700 hover:border-blue-300'}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <Globe className="h-4 w-4 text-blue-600" />
                    <span className="font-semibold text-sm">{appLang === 'en' ? 'Live (Internet)' : 'مباشر (إنترنت)'}</span>
                    {rateMode === 'live' && (<span className="ml-auto text-xs bg-blue-100 dark:bg-blue-900 text-blue-700 px-2 py-0.5 rounded">{appLang === 'en' ? 'Active' : 'مفعّل'}</span>)}
                  </div>
                  <p className="text-xs text-gray-600 dark:text-gray-400">{appLang === 'en' ? 'Fetch latest rates from external API. Falls back to DB if API fails.' : 'جلب أحدث الأسعار من API. يستخدم قاعدة البيانات لو فشل API.'}</p>
                </button>
                <button type="button" disabled={savingRateMode}
                  onClick={async () => {
                    if (!companyId || rateMode === 'manual') return
                    setSavingRateMode(true)
                    const ok = await setRateMode(supabase, companyId, 'manual')
                    if (ok) setRateModeState('manual')
                    setSavingRateMode(false)
                  }}
                  className={`flex-1 p-3 rounded-lg border-2 text-start transition ${rateMode === 'manual' ? 'border-amber-500 bg-white dark:bg-amber-900/40 shadow-sm' : 'border-gray-200 dark:border-slate-700 hover:border-amber-300'}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <Edit2 className="h-4 w-4 text-amber-600" />
                    <span className="font-semibold text-sm">{appLang === 'en' ? 'Manual (DB Only)' : 'يدوى (قاعدة البيانات)'}</span>
                    {rateMode === 'manual' && (<span className="ml-auto text-xs bg-amber-100 dark:bg-amber-900 text-amber-700 px-2 py-0.5 rounded">{appLang === 'en' ? 'Active' : 'مفعّل'}</span>)}
                  </div>
                  <p className="text-xs text-gray-600 dark:text-gray-400">{appLang === 'en' ? 'Use only manually configured rates. Best for accounting & audit trail.' : 'استخدام الأسعار المعدّة يدوياً فقط. الأنسب للمحاسبة والمراجعة.'}</p>
                </button>
              </div>
            </CardContent>
          </Card>


          {/* v3.27.5: Period-end FX Revaluation (IAS 21) */}
          <Card className="border-purple-200 bg-purple-50/50 dark:bg-purple-950/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <RefreshCw className="h-4 w-4 text-purple-600" />
                {appLang === 'en' ? 'Period-end FX Revaluation (IAS 21)' : 'إعادة تقييم العملات نهاية الفترة (IAS 21)'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">
                {appLang === 'en'
                  ? 'Revalue all FC cash/bank accounts to current rate. Creates unrealized FX gain/loss + auto-reversal next day.'
                  : 'إعادة تقييم حسابات النقد/البنك بالعملات الأجنبية. ينشئ قيد فروق عملة غير محققة + قيد عكسى تلقائى لليوم التالى.'}
              </p>
              <div className="flex flex-col sm:flex-row gap-2 items-end">
                <div className="flex-1">
                  <Label className="text-xs">{appLang === 'en' ? 'As of date' : 'بتاريخ'}</Label>
                  <Input type="date" value={revalAsOfDate} onChange={(e) => setRevalAsOfDate(e.target.value)} />
                </div>
                <Button
                  onClick={async () => {
                    if (!companyId) return
                    setRevalLoading(true)
                    setShowRevalModal(true)
                    try {
                      const r = await computeFullFXRevaluation(supabase, companyId, revalAsOfDate)
                      setRevalPreview(r)
                    } finally { setRevalLoading(false) }
                  }}
                  disabled={revalLoading}
                  variant="outline"
                  className="border-purple-500 text-purple-600 hover:bg-purple-50"
                >
                  {revalLoading
                    ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />{appLang === 'en' ? 'Computing' : 'جارى الحساب'}</>
                    : <><RefreshCw className="h-4 w-4 mr-2" />{appLang === 'en' ? 'Preview Revaluation' : 'معاينة إعادة التقييم'}</>}
                </Button>
              </div>
            </CardContent>
          </Card>

          {showRevalModal && (
            <Card className="border-purple-300 bg-purple-50 dark:bg-purple-950/30">
              <CardHeader>
                <CardTitle className="flex items-center justify-between text-base">
                  <span className="flex items-center gap-2">
                    <RefreshCw className="h-5 w-5 text-purple-600" />
                    {appLang === 'en' ? 'FX Revaluation Preview' : 'معاينة إعادة التقييم'} {revalAsOfDate}
                  </span>
                  <Button variant="ghost" size="sm" onClick={() => { setShowRevalModal(false); setRevalPreview(null) }}>
                    <XCircle className="h-4 w-4" />
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {revalLoading && (
                  <div className="flex items-center gap-2 text-sm text-purple-700">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {appLang === 'en' ? 'Computing' : 'جارى الحساب'}
                  </div>
                )}
                {!revalLoading && revalPreview && revalPreview.lines.length === 0 && (
                  <p className="text-sm text-gray-600">
                    {appLang === 'en' ? 'No revaluation needed.' : 'لا حاجة لإعادة التقييم.'}
                  </p>
                )}
                {!revalLoading && revalPreview && revalPreview.lines.length > 0 && (
                  <>
                    <div className="overflow-x-auto mb-3">
                      <table className="w-full text-xs">
                        <thead className="bg-purple-100 dark:bg-purple-900/50">
                          <tr>
                            <th className="p-2 text-start">{appLang === 'en' ? 'Account' : 'الحساب'}</th>
                            <th className="p-2 text-end">{appLang === 'en' ? 'Native' : 'الرصيد الأصلى'}</th>
                            <th className="p-2 text-end">{appLang === 'en' ? 'Book Value' : 'القيمة الدفترية'}</th>
                            <th className="p-2 text-end">{appLang === 'en' ? 'Revalued' : 'بعد التقييم'}</th>
                            <th className="p-2 text-end">{appLang === 'en' ? 'Diff' : 'الفرق'}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {revalPreview.lines.map((line) => (
                            <tr key={line.accountId} className="border-b border-purple-200">
                              <td className="p-2">{line.accountCode} {line.accountName}</td>
                              <td className="p-2 text-end">{line.nativeBalance.toLocaleString()} {line.nativeCurrency}</td>
                              <td className="p-2 text-end">{line.bookValueBase.toLocaleString()} {revalPreview.baseCurrency}</td>
                              <td className="p-2 text-end">{line.revaluedValueBase.toLocaleString()} {revalPreview.baseCurrency}</td>
                              <td className={`p-2 text-end font-semibold ${line.diff >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                                {line.diff >= 0 ? '+' : ''}{line.diff.toLocaleString()}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="flex gap-2 justify-end">
                      <Button variant="outline" onClick={() => { setShowRevalModal(false); setRevalPreview(null) }}>
                        {appLang === 'en' ? 'Cancel' : 'إلغاء'}
                      </Button>
                      <Button
                        disabled={revalPosting}
                        className="bg-purple-600 hover:bg-purple-700 text-white"
                        onClick={async () => {
                          if (!companyId) return
                          setRevalPosting(true)
                          try {
                            const { data: userData } = await supabase.auth.getUser()
                            const uid = userData?.user?.id || ''
                            if (!uid) {
                              toast({ title: appLang === 'en' ? 'Error' : 'خطأ', description: 'No user', variant: 'destructive' })
                              return
                            }
                            const r = await postFXRevaluation(supabase, companyId, revalAsOfDate, uid)
                            if (r.success && r.journalEntryId) {
                              toast({ title: appLang === 'en' ? 'Posted' : 'تم القيد', description: appLang === 'en' ? 'FX revaluation posted with auto-reversal' : 'تم قيد إعادة التقييم مع قيد عكسى تلقائى' })
                              setShowRevalModal(false)
                              setRevalPreview(null)
                            } else {
                              toast({ title: appLang === 'en' ? 'Error' : 'خطأ', description: r.error || 'failed', variant: 'destructive' })
                            }
                          } catch (e: any) {
                            toast({ title: appLang === 'en' ? 'Error' : 'خطأ', description: e.message, variant: 'destructive' })
                          } finally {
                            setRevalPosting(false)
                          }
                        }}
                      >
                        {revalPosting
                          ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />{appLang === 'en' ? 'Posting' : 'جارى التسجيل'}</>
                          : <><CheckCircle2 className="h-4 w-4 mr-2" />{appLang === 'en' ? 'Post Revaluation' : 'تسجيل إعادة التقييم'}</>}
                      </Button>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          )}

          {/* Manual Override Modal */}
          {showOverrideModal && (
            <Card className="border-amber-300 bg-amber-50">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <AlertCircle className="h-5 w-5 text-amber-600" />
                  {appLang === 'en' ? 'Manual Rate Override' : 'تجاوز السعر يدوياً'}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-amber-700 mb-4">
                  {appLang === 'en'
                    ? 'Use this to override the API rate with a custom rate. This will be logged for audit purposes.'
                    : 'استخدم هذا لتجاوز سعر الـ API بسعر مخصص. سيتم تسجيل هذا لأغراض المراجعة.'}
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>{appLang === 'en' ? 'From Currency' : 'من عملة'}</Label>
                    <Select value={overrideFromCurrency} onValueChange={setOverrideFromCurrency}>
                      <SelectTrigger><SelectValue placeholder={appLang === 'en' ? 'Select...' : 'اختر...'} /></SelectTrigger>
                      <SelectContent>
                        {currencyOptions.map(c => (
                          <SelectItem key={c.code} value={c.code}>{c.symbol} {c.code}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>{appLang === 'en' ? 'To Currency' : 'إلى عملة'}</Label>
                    <Select value={overrideToCurrency} onValueChange={setOverrideToCurrency}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {currencyOptions.map(c => (
                          <SelectItem key={c.code} value={c.code}>{c.symbol} {c.code}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>{appLang === 'en' ? 'Override Rate' : 'السعر المخصص'}</Label>
                    <NumericInput step="0.000001" value={Number(overrideRate) || 0} onChange={val => setOverrideRate(String(val))} decimalPlaces={6} />
                  </div>
                  <div>
                    <Label>{appLang === 'en' ? 'Reason (Required)' : 'السبب (مطلوب)'}</Label>
                    <Textarea
                      value={overrideReason}
                      onChange={e => setOverrideReason(e.target.value)}
                      placeholder={appLang === 'en' ? 'Why are you overriding the rate?' : 'لماذا تقوم بتجاوز السعر؟'}
                      rows={2}
                    />
                  </div>
                </div>
                <div className="flex gap-2 mt-4">
                  <Button onClick={handleManualOverride} disabled={saving} className="bg-amber-600 hover:bg-amber-700">
                    {saving ? (appLang === 'en' ? 'Saving...' : 'جاري الحفظ...') : (appLang === 'en' ? 'Save Override' : 'حفظ التجاوز')}
                  </Button>
                  <Button variant="outline" onClick={() => setShowOverrideModal(false)}>
                    {appLang === 'en' ? 'Cancel' : 'إلغاء'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Rate History Modal */}
          {showHistory && (
            <Card className="border-blue-300">
              <CardHeader>
                <div className="flex justify-between items-center">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <History className="h-5 w-5 text-blue-600" />
                    {appLang === 'en' ? 'Rate History' : 'سجل الأسعار'}
                  </CardTitle>
                  <Button variant="ghost" size="sm" onClick={() => setShowHistory(false)}>✕</Button>
                </div>
              </CardHeader>
              <CardContent>
                {historyLoading ? (
                  <p className="text-center py-4">{appLang === 'en' ? 'Loading...' : 'جاري التحميل...'}</p>
                ) : historyRates.length === 0 ? (
                  <p className="text-center py-4 text-gray-500">{appLang === 'en' ? 'No history found' : 'لا يوجد سجل'}</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{appLang === 'en' ? 'Date/Time' : 'التاريخ/الوقت'}</TableHead>
                        <TableHead>{appLang === 'en' ? 'Rate' : 'السعر'}</TableHead>
                        <TableHead>{appLang === 'en' ? 'Source' : 'المصدر'}</TableHead>
                        <TableHead>{appLang === 'en' ? 'Override?' : 'تجاوز؟'}</TableHead>
                        <TableHead>{appLang === 'en' ? 'Reason' : 'السبب'}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {historyRates.map(r => (
                        <TableRow key={r.id} className={r.is_manual_override ? 'bg-amber-50' : ''}>
                          <TableCell className="text-sm">{r.rate_timestamp ? new Date(r.rate_timestamp).toLocaleString() : r.rate_date}</TableCell>
                          <TableCell className="font-mono">{Number(r.rate).toFixed(6)}</TableCell>
                          <TableCell>{r.source_detail || r.source}</TableCell>
                          <TableCell>{r.is_manual_override ? '✓' : '-'}</TableCell>
                          <TableCell className="text-sm max-w-[200px] truncate">{r.override_reason || '-'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          )}
          {/* Add New Rate Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">{appLang === 'en' ? 'Add Exchange Rate' : 'إضافة سعر صرف'}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
                <div>
                  <Label>{appLang === 'en' ? 'From Currency' : 'من عملة'}</Label>
                  <Select value={newFromCurrency} onValueChange={setNewFromCurrency}>
                    <SelectTrigger><SelectValue placeholder={appLang === 'en' ? 'Select...' : 'اختر...'} /></SelectTrigger>
                    <SelectContent>
                      {currencyOptions.map(c => (
                        <SelectItem key={c.code} value={c.code}>
                          <span className="font-bold text-blue-600">{c.symbol}</span> {c.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>{appLang === 'en' ? 'To Currency (Base)' : 'إلى عملة (الأساسية)'}</Label>
                  <Select value={newToCurrency} onValueChange={setNewToCurrency}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {currencyOptions.map(c => (
                        <SelectItem key={c.code} value={c.code}>
                          <span className="font-bold text-green-600">{c.symbol}</span> {c.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>{appLang === 'en' ? 'Rate' : 'السعر'}</Label>
                  <NumericInput step="0.000001" value={Number(newRate) || 0} onChange={val => setNewRate(String(val))} decimalPlaces={6} />
                </div>
                <Button onClick={handleFetchFromApi} disabled={fetchingApi || !newFromCurrency || !newToCurrency} variant="outline">
                  <RefreshCw className={`h-4 w-4 mr-1 ${fetchingApi ? 'animate-spin' : ''}`} />
                  {appLang === 'en' ? 'Fetch' : 'جلب'}
                </Button>
                <Button onClick={handleAddRate} disabled={saving || !newRate}>
                  <Plus className="h-4 w-4 mr-1" />
                  {appLang === 'en' ? 'Add' : 'إضافة'}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Rates Table */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                {appLang === 'en' ? 'Current Exchange Rates' : 'أسعار الصرف الحالية'}
                <span className="text-sm font-normal text-gray-500">
                  ({appLang === 'en' ? 'Base:' : 'الأساسية:'} {baseCurrency} {getCurrencySymbol(baseCurrency)})
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {rates.length === 0 ? (
                <p className="text-center py-8 text-gray-500">{appLang === 'en' ? 'No exchange rates defined yet' : 'لا توجد أسعار صرف حتى الآن'}</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{appLang === 'en' ? 'From' : 'من'}</TableHead>
                      <TableHead>{appLang === 'en' ? 'To' : 'إلى'}</TableHead>
                      <TableHead>{appLang === 'en' ? 'Rate' : 'السعر'}</TableHead>
                      <TableHead>{appLang === 'en' ? 'Date' : 'التاريخ'}</TableHead>
                      <TableHead>{appLang === 'en' ? 'Source' : 'المصدر'}</TableHead>
                      <TableHead>{appLang === 'en' ? 'Override' : 'تجاوز'}</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rates.map(rate => (
                      <TableRow key={rate.id} className={rate.is_manual_override ? 'bg-amber-50' : ''}>
                        <TableCell className="font-medium">
                          <span className="text-blue-600 font-bold mr-1">{getCurrencySymbol(rate.from_currency)}</span>
                          {rate.from_currency}
                        </TableCell>
                        <TableCell>
                          <span className="text-green-600 font-bold mr-1">{getCurrencySymbol(rate.to_currency)}</span>
                          {rate.to_currency}
                        </TableCell>
                        <TableCell className="font-mono">{Number(rate.rate).toFixed(6)}</TableCell>
                        <TableCell>{rate.rate_timestamp ? new Date(rate.rate_timestamp).toLocaleDateString() : rate.rate_date}</TableCell>
                        <TableCell>
                          <span className={`px-2 py-1 rounded text-xs ${rate.source === 'api' ? 'bg-blue-100 text-blue-700' : rate.is_manual_override ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-700'}`}>
                            {rate.source === 'api' ? (appLang === 'en' ? 'API' : 'إنترنت') : rate.is_manual_override ? (appLang === 'en' ? 'Override' : 'تجاوز') : (appLang === 'en' ? 'Manual' : 'يدوي')}
                          </span>
                        </TableCell>
                        <TableCell>
                          {rate.is_manual_override && (
                            <span className="text-xs text-amber-600" title={rate.override_reason || ''}>
                              ⚠️ {rate.override_reason?.substring(0, 20)}...
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="flex gap-1">
                          <Button variant="ghost" size="icon" onClick={() => loadRateHistory(rate.from_currency, rate.to_currency)} className="text-blue-500 hover:text-blue-700">
                            <History className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => handleDeleteRate(rate.id)} className="text-red-500 hover:text-red-700">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Info Card */}
          <Card className="bg-blue-50 border-blue-200">
            <CardContent className="pt-4">
              <p className="text-sm text-blue-700">
                {appLang === 'en'
                  ? '💡 Exchange rates are used to convert transactions in foreign currencies to your base currency. You can fetch real-time rates from the internet or enter them manually.'
                  : '💡 تُستخدم أسعار الصرف لتحويل المعاملات بالعملات الأجنبية إلى العملة الأساسية. يمكنك جلب الأسعار اللحظية من الإنترنت أو إدخالها يدوياً.'}
              </p>
            </CardContent>
          </Card>
        </div>{/* End of space-y-4 */}
      </main>
    </div>
  )
}

