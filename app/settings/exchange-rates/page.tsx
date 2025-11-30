"use client"
import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useSupabase } from "@/lib/supabase/hooks"
import { getActiveCompanyId } from "@/lib/company"
import { useToast } from "@/hooks/use-toast"
import { RefreshCw, Plus, Trash2, ArrowLeft, Globe } from "lucide-react"
import Link from "next/link"
import { CURRENCIES, getBaseCurrency, fetchExchangeRateFromAPI, getCurrencySymbol } from "@/lib/exchange-rates"

interface ExchangeRateRow {
  id: string
  from_currency: string
  to_currency: string
  rate: number
  rate_date: string
  source: string
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

  useEffect(() => {
    const loadData = async () => {
      try {
        const cid = await getActiveCompanyId(supabase)
        if (cid) {
          setCompanyId(cid)
          const base = getBaseCurrency()
          setBaseCurrency(base)
          setNewToCurrency(base)
          
          const { data } = await supabase
            .from('exchange_rates')
            .select('*')
            .eq('company_id', cid)
            .order('rate_date', { ascending: false })
          
          setRates(data || [])
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

  const currencyOptions = Object.entries(CURRENCIES).map(([code, info]) => ({
    code, label: appLang === 'en' ? `${code} - ${info.nameEn}` : `${code} - ${info.nameAr}`, symbol: info.symbol
  }))

  if (loading) return <div className="p-8 text-center">{appLang === 'en' ? 'Loading...' : 'جاري التحميل...'}</div>

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6" dir={appLang === 'ar' ? 'rtl' : 'ltr'}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/settings"><Button variant="ghost" size="icon"><ArrowLeft className="h-5 w-5" /></Button></Link>
          <h1 className="text-2xl font-bold">{appLang === 'en' ? 'Exchange Rates Management' : 'إدارة أسعار الصرف'}</h1>
        </div>
        <div className="flex gap-2">
          <Button onClick={handleRefreshAllRates} disabled={fetchingApi} variant="outline">
            <Globe className="h-4 w-4 mr-2" />
            {appLang === 'en' ? 'Update All from API' : 'تحديث الكل من الإنترنت'}
          </Button>
        </div>
      </div>
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
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rates.map(rate => (
                  <TableRow key={rate.id}>
                    <TableCell className="font-medium">
                      <span className="text-blue-600 font-bold mr-1">{getCurrencySymbol(rate.from_currency)}</span>
                      {rate.from_currency}
                    </TableCell>
                    <TableCell>
                      <span className="text-green-600 font-bold mr-1">{getCurrencySymbol(rate.to_currency)}</span>
                      {rate.to_currency}
                    </TableCell>
                    <TableCell className="font-mono">{Number(rate.rate).toFixed(6)}</TableCell>
                    <TableCell>{rate.rate_date}</TableCell>
                    <TableCell>
                      <span className={`px-2 py-1 rounded text-xs ${rate.source === 'api' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700'}`}>
                        {rate.source === 'api' ? (appLang === 'en' ? 'API' : 'إنترنت') : (appLang === 'en' ? 'Manual' : 'يدوي')}
                      </span>
                    </TableCell>
                    <TableCell>
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
    </div>
  )
}

