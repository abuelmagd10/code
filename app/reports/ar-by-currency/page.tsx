"use client"

/**
 * AR by Currency Report (v3.12.0)
 *
 * Lists open invoices grouped by their original currency, with:
 *   - Original FC amount (e.g., 100 USD)
 *   - Booked base amount (at original rate)
 *   - Current market rate (from exchange_rates table)
 *   - Hypothetical revalued amount (if revalued today)
 *   - FX exposure (potential gain/loss)
 *
 * Complements the period-end FX Revaluation feature by showing
 * the live FX exposure at any moment.
 */

import { useState, useEffect } from "react"
import { useSupabase } from "@/lib/supabase/hooks"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { TrendingUp, TrendingDown, AlertCircle, Download, RefreshCw, DollarSign } from "lucide-react"
import { getActiveCompanyId } from "@/lib/company"
import { canAction } from "@/lib/authz"
import Link from "next/link"
import { useAutoRefresh } from "@/hooks/use-auto-refresh"

interface OpenInvoice {
  id: string
  invoice_number: string
  invoice_date: string
  customer_name: string
  currency_code: string
  exchange_rate: number  // original at issue time
  total_amount: number   // in FC
  paid_amount: number    // in FC (assumed)
  open_fc: number        // outstanding in FC
  booked_base: number    // open_fc × exchange_rate (original)
  current_rate: number   // latest from exchange_rates
  revalued_base: number  // open_fc × current_rate
  fx_exposure: number    // revalued_base - booked_base
}

interface CurrencyGroup {
  currency: string
  invoiceCount: number
  totalOpenFC: number
  totalBookedBase: number
  totalRevaluedBase: number
  totalExposure: number
  invoices: OpenInvoice[]
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  EGP: '£', USD: '$', EUR: '€', GBP: '£', SAR: '﷼', AED: 'د.إ',
}

export default function ARByCurrencyReportPage() {
  const supabase = useSupabase()
  const [appLang, setAppLang] = useState<'ar'|'en'>('ar')

  // v3.74.581 — financial report: requires financial_reports (top management only)
  const [permChecked, setPermChecked] = useState(false)
  const [canViewFinancial, setCanViewFinancial] = useState(false)

  useEffect(() => {
    (async () => {
      setCanViewFinancial(await canAction(supabase, "financial_reports", "read"))
      setPermChecked(true)
    })()
  }, [supabase])
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [baseCurrency, setBaseCurrency] = useState<string>('EGP')
  const [groups, setGroups] = useState<CurrencyGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [grandTotalExposure, setGrandTotalExposure] = useState(0)
  const [asOfDate, setAsOfDate] = useState<string>(new Date().toISOString().slice(0, 10))

  const t = (en: string, ar: string) => appLang === 'en' ? en : ar

  useEffect(() => {
    try { setAppLang((localStorage.getItem('app_language') || 'ar') === 'en' ? 'en' : 'ar') } catch {}
  }, [])

  // v3.74.59 — تَحديث تِلقائى عِندَ العَودَة للنّافِذَة/التَّبويب
  useAutoRefresh({ onRefresh: () => loadData() })

  const loadData = async () => {
    setLoading(true)
    try {
      const cid = await getActiveCompanyId(supabase)
      if (!cid) return
      setCompanyId(cid)

      const { data: company } = await supabase
        .from('companies')
        .select('base_currency')
        .eq('id', cid)
        .maybeSingle()
      const base = (company?.base_currency || 'EGP').toUpperCase()
      setBaseCurrency(base)

      // Fetch open foreign-currency invoices
      const { data: invoices } = await supabase
        .from('invoices')
        .select(`
          id, invoice_number, invoice_date,
          currency_code, exchange_rate,
          total_amount, paid_amount,
          customers(name)
        `)
        .eq('company_id', cid)
        .not('currency_code', 'is', null)
        .neq('currency_code', base)
        .not('status', 'in', '("paid","cancelled","draft")')
        .or('is_deleted.is.null,is_deleted.eq.false')
        .order('invoice_date', { ascending: false })

      const list = (invoices || []) as any[]

      // Get unique currencies to fetch closing rates
      const currencies = Array.from(new Set(list.map(i => String(i.currency_code).toUpperCase())))
      const closingRates: Record<string, number> = {}
      for (const c of currencies) {
        const { data: rate } = await supabase
          .from('exchange_rates')
          .select('rate')
          .eq('from_currency', c)
          .eq('to_currency', base)
          .lte('rate_date', asOfDate)
          .order('rate_date', { ascending: false })
          .limit(1)
          .maybeSingle()
        closingRates[c] = Number(rate?.rate || 0)
      }

      // Build OpenInvoice list
      const openInvoices: OpenInvoice[] = []
      let grandExposure = 0
      for (const inv of list) {
        const currency = String(inv.currency_code).toUpperCase()
        const originalRate = Number(inv.exchange_rate || 0)
        const totalFC = Number(inv.total_amount || 0)
        const paidFC = Number(inv.paid_amount || 0)
        const openFC = totalFC - paidFC
        if (openFC <= 0.01) continue
        const currentRate = closingRates[currency] || originalRate
        const bookedBase = openFC * originalRate
        const revaluedBase = openFC * currentRate
        const exposure = revaluedBase - bookedBase
        grandExposure += exposure
        const customer = Array.isArray(inv.customers) ? inv.customers[0] : inv.customers
        openInvoices.push({
          id: inv.id,
          invoice_number: inv.invoice_number,
          invoice_date: inv.invoice_date,
          customer_name: customer?.name || '-',
          currency_code: currency,
          exchange_rate: originalRate,
          total_amount: totalFC,
          paid_amount: paidFC,
          open_fc: openFC,
          booked_base: Math.round(bookedBase * 100) / 100,
          current_rate: currentRate,
          revalued_base: Math.round(revaluedBase * 100) / 100,
          fx_exposure: Math.round(exposure * 100) / 100,
        })
      }
      setGrandTotalExposure(Math.round(grandExposure * 100) / 100)

      // Group by currency
      const groupMap = new Map<string, CurrencyGroup>()
      for (const oi of openInvoices) {
        if (!groupMap.has(oi.currency_code)) {
          groupMap.set(oi.currency_code, {
            currency: oi.currency_code,
            invoiceCount: 0,
            totalOpenFC: 0,
            totalBookedBase: 0,
            totalRevaluedBase: 0,
            totalExposure: 0,
            invoices: [],
          })
        }
        const g = groupMap.get(oi.currency_code)!
        g.invoiceCount += 1
        g.totalOpenFC += oi.open_fc
        g.totalBookedBase += oi.booked_base
        g.totalRevaluedBase += oi.revalued_base
        g.totalExposure += oi.fx_exposure
        g.invoices.push(oi)
      }
      const result = Array.from(groupMap.values()).map(g => ({
        ...g,
        totalOpenFC: Math.round(g.totalOpenFC * 100) / 100,
        totalBookedBase: Math.round(g.totalBookedBase * 100) / 100,
        totalRevaluedBase: Math.round(g.totalRevaluedBase * 100) / 100,
        totalExposure: Math.round(g.totalExposure * 100) / 100,
      }))
      setGroups(result.sort((a, b) => Math.abs(b.totalExposure) - Math.abs(a.totalExposure)))
    } catch (err: any) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadData() }, [asOfDate])

  const baseSymbol = CURRENCY_SYMBOLS[baseCurrency] || baseCurrency

  const exportCsv = () => {
    const rows: any[] = [['Currency','Invoice','Date','Customer','Open FC','Original Rate','Booked Base','Current Rate','Revalued Base','FX Exposure']]
    for (const g of groups) {
      for (const i of g.invoices) {
        rows.push([
          i.currency_code, i.invoice_number, i.invoice_date, i.customer_name,
          i.open_fc.toFixed(2), i.exchange_rate.toFixed(4), i.booked_base.toFixed(2),
          i.current_rate.toFixed(4), i.revalued_base.toFixed(2), i.fx_exposure.toFixed(2),
        ])
      }
    }
    const csv = rows.map(r => r.join(',')).join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `ar-by-currency-${asOfDate}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (permChecked && !canViewFinancial) {
    return (
      <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900" dir={appLang === 'ar' ? 'rtl' : 'ltr'}>
        <main className="flex-1 md:mr-64 p-4 md:p-8 pt-20 md:pt-8">
          <Card className="border-red-200 dark:border-red-800">
            <CardContent className="pt-6">
              <p className="text-red-600 dark:text-red-400">
                {appLang === 'en' ? 'You do not have permission to view this report.' : 'ليس لديك صلاحية لعرض هذا التقرير.'}
              </p>
            </CardContent>
          </Card>
        </main>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900" dir={appLang === 'ar' ? 'rtl' : 'ltr'}>
      <main className="flex-1 md:mr-64 p-4 md:p-8 pt-20 md:pt-8">
        <div className="space-y-6 max-w-7xl mx-auto">

          {/* Header */}
          <Card className="bg-white dark:bg-slate-900 border-0 shadow-sm">
            <CardContent className="py-5">
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg">
                    <DollarSign className="w-6 h-6 text-emerald-600" />
                  </div>
                  <div>
                    <h1 className="text-xl font-bold">{t('AR by Currency Report', 'تقرير الذمم المدينة حسب العملة')}</h1>
                    <p className="text-sm text-muted-foreground">{t('Open invoices in foreign currencies with current FX exposure', 'الفواتير المفتوحة بعملات أجنبية مع تعرض FX الحالى')}</p>
                  </div>
                </div>
                <div className="flex gap-2 items-center">
                  <div className="flex items-center gap-2">
                    <label className="text-xs">{t('As of:', 'كما فى:')}</label>
                    <input type="date" value={asOfDate} onChange={e => setAsOfDate(e.target.value)} className="border rounded px-2 py-1 text-sm dark:bg-slate-800" />
                  </div>
                  <Button variant="outline" size="sm" onClick={loadData} disabled={loading} className="gap-2">
                    <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />{t('Refresh', 'تحديث')}
                  </Button>
                  <Button variant="outline" size="sm" onClick={exportCsv} className="gap-2">
                    <Download className="w-4 h-4" />{t('Export', 'تصدير')}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Grand Total Exposure Alert */}
          {groups.length > 0 && (
            <Alert className={grandTotalExposure > 0 ? "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200" : grandTotalExposure < 0 ? "bg-red-50 dark:bg-red-900/20 border-red-200" : "bg-gray-50 dark:bg-gray-900/20"}>
              {grandTotalExposure > 0 ? <TrendingUp className="w-4 h-4 text-emerald-600" /> : grandTotalExposure < 0 ? <TrendingDown className="w-4 h-4 text-red-600" /> : <AlertCircle className="w-4 h-4 text-gray-600" />}
              <AlertDescription className="mr-2 font-medium">
                {t('Total FX Exposure if revalued today:', 'إجمالى التعرض لـ FX لو أُعيد التقييم اليوم:')}{' '}
                <span className={grandTotalExposure > 0 ? 'text-emerald-700' : grandTotalExposure < 0 ? 'text-red-700' : ''}>
                  {grandTotalExposure > 0 ? '+' : ''}{grandTotalExposure.toLocaleString()} {baseSymbol}
                </span>
                {' '}
                <Link href="/settings/fx-revaluation" className="underline text-sm hover:text-blue-700">
                  ← {t('Run Period-End Revaluation', 'تشغيل إعادة تقييم نهاية الفترة')}
                </Link>
              </AlertDescription>
            </Alert>
          )}

          {/* Groups by currency */}
          {loading ? (
            <Card><CardContent className="py-12 text-center text-gray-500">{t('Loading...', 'جارى التحميل...')}</CardContent></Card>
          ) : groups.length === 0 ? (
            <Card><CardContent className="py-12 text-center text-gray-500">
              <DollarSign className="w-12 h-12 mx-auto text-gray-300 mb-3" />
              <p>{t('No open foreign-currency invoices', 'لا توجد فواتير مفتوحة بعملات أجنبية')}</p>
            </CardContent></Card>
          ) : (
            groups.map(g => {
              const fcSymbol = CURRENCY_SYMBOLS[g.currency] || g.currency
              return (
                <Card key={g.currency}>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center justify-between">
                      <span className="flex items-center gap-3">
                        <Badge className="text-base">{g.currency}</Badge>
                        <span>{g.invoiceCount} {t('invoice(s)', 'فاتورة')}</span>
                      </span>
                      <span className={`text-base ${g.totalExposure > 0 ? 'text-emerald-700' : g.totalExposure < 0 ? 'text-red-700' : ''}`}>
                        {t('Exposure:', 'التعرض:')} {g.totalExposure > 0 ? '+' : ''}{g.totalExposure.toLocaleString()} {baseSymbol}
                      </span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {/* Summary row */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4 p-3 bg-gray-50 dark:bg-slate-800/50 rounded-md">
                      <div>
                        <div className="text-xs text-gray-500">{t('Total Open FC', 'إجمالى المفتوح FC')}</div>
                        <div className="text-base font-semibold">{g.totalOpenFC.toLocaleString()} {fcSymbol}</div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-500">{t('Booked at Original Rate', 'المسجل بالسعر الأصلى')}</div>
                        <div className="text-base font-semibold">{g.totalBookedBase.toLocaleString()} {baseSymbol}</div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-500">{t('Revalued at Current Rate', 'بعد التقييم بالسعر الحالى')}</div>
                        <div className="text-base font-semibold">{g.totalRevaluedBase.toLocaleString()} {baseSymbol}</div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-500">{t('FX Exposure', 'التعرض لـ FX')}</div>
                        <div className={`text-base font-bold ${g.totalExposure > 0 ? 'text-emerald-700' : g.totalExposure < 0 ? 'text-red-700' : ''}`}>
                          {g.totalExposure > 0 ? '+' : ''}{g.totalExposure.toLocaleString()} {baseSymbol}
                        </div>
                      </div>
                    </div>

                    {/* Detail table */}
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b dark:border-gray-700 text-xs text-gray-500">
                            <th className="text-right py-2 px-2">{t('Invoice #', 'رقم الفاتورة')}</th>
                            <th className="text-right py-2 px-2">{t('Date', 'التاريخ')}</th>
                            <th className="text-right py-2 px-2">{t('Customer', 'العميل')}</th>
                            <th className="text-right py-2 px-2">{t('Open FC', 'المفتوح FC')}</th>
                            <th className="text-right py-2 px-2">{t('Orig Rate', 'السعر الأصلى')}</th>
                            <th className="text-right py-2 px-2">{t('Booked', 'المسجل')}</th>
                            <th className="text-right py-2 px-2">{t('Cur Rate', 'السعر الحالى')}</th>
                            <th className="text-right py-2 px-2">{t('Revalued', 'بعد التقييم')}</th>
                            <th className="text-right py-2 px-2">{t('Exposure', 'الفرق')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {g.invoices.map(i => (
                            <tr key={i.id} className="border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-slate-800">
                              <td className="py-2 px-2 font-medium">
                                <Link href={`/invoices/${i.id}`} className="text-blue-600 hover:underline">{i.invoice_number}</Link>
                              </td>
                              <td className="py-2 px-2">{i.invoice_date}</td>
                              <td className="py-2 px-2">{i.customer_name}</td>
                              <td className="py-2 px-2 text-right">{i.open_fc.toLocaleString()}</td>
                              <td className="py-2 px-2 text-right">{i.exchange_rate.toFixed(4)}</td>
                              <td className="py-2 px-2 text-right">{i.booked_base.toLocaleString()}</td>
                              <td className="py-2 px-2 text-right">{i.current_rate.toFixed(4)}</td>
                              <td className="py-2 px-2 text-right">{i.revalued_base.toLocaleString()}</td>
                              <td className={`py-2 px-2 text-right font-bold ${i.fx_exposure > 0 ? 'text-emerald-700' : i.fx_exposure < 0 ? 'text-red-700' : ''}`}>
                                {i.fx_exposure > 0 ? '+' : ''}{i.fx_exposure.toLocaleString()}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              )
            })
          )}

        </div>
      </main>
    </div>
  )
}
