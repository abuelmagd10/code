"use client"
import { useState, useEffect } from "react"
import { Sidebar } from "@/components/sidebar"
import { CompanyHeader } from "@/components/company-header"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useSupabase } from "@/lib/supabase/hooks"
import { getActiveCompanyId } from "@/lib/company"
import { useToast } from "@/hooks/use-toast"
import { RefreshCw, Plus, Trash2, ArrowLeft, Globe, Edit2, History, AlertCircle, Loader2, Coins } from "lucide-react"
import Link from "next/link"
import { CURRENCIES, getBaseCurrency, fetchExchangeRateFromAPI, getCurrencySymbol } from "@/lib/exchange-rates"
import { setManualExchangeRate, getActiveCurrencies, type Currency } from "@/lib/currency-service"
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
  const [appLang, setAppLang] = useState<'ar'|'en'>('ar')

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
          const base = getBaseCurrency()
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
            // Fetch all rates automatically
            const currList = Object.keys(CURRENCIES).filter(c => c !== base)
            for (const curr of currList) {
              try {
                const rate = await fetchExchangeRateFromAPI(curr, base)
                if (rate) {
                  await supabase.from('exchange_rates').upsert({
                    company_id: cid,
                    from_currency: curr,
                    to_currency: base,
                    rate,
                    rate_date: today,
                    rate_timestamp: new Date().toISOString(),
                    source: 'api',
                    source_detail: 'exchangerate-api.com',
                    is_manual_override: false
                  }, { onConflict: 'company_id,from_currency,to_currency,rate_date' })
                }
              } catch {}
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
    try { setAppLang(localStorage.getItem('app_language') === 'en' ? 'en' : 'ar') } catch {}
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
      const currencies = Object.keys(CURRENCIES).filter(c => c !== baseCurrency)
      for (const curr of currencies) {
        const rate = await fetchExchangeRateFromAPI(curr, baseCurrency)
        if (rate) {
          await supabase.from('exchange_rates').upsert({
            company_id: companyId,
            from_currency: curr,
            to_currency: baseCurrency,
            rate,
            rate_date: new Date().toISOString().slice(0, 10),
            source: 'api'
          }, { onConflict: 'company_id,from_currency,to_currency,rate_date' })
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
    ? currencies.map(c => ({ code: c.code, label: appLang === 'en' ? `${c.code} - ${c.name_en}` : `${c.code} - ${c.name_ar}`, symbol: c.symbol }))
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
      await setManualExchangeRate(supabase, companyId, {
        fromCurrency: overrideFromCurrency,
        toCurrency: overrideToCurrency,
        rate: parseFloat(overrideRate),
        reason: overrideReason
      })
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
        <Sidebar />
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
      <Sidebar />
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
                <Input type="number" step="0.000001" value={overrideRate} onChange={e => setOverrideRate(e.target.value)} placeholder="0.000000" />
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
              <Input type="number" step="0.000001" value={newRate} onChange={e => setNewRate(e.target.value)} placeholder="0.00" />
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

