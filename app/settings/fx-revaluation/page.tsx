"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { useSupabase } from "@/lib/supabase/hooks"
import { Calculator, TrendingUp, TrendingDown, FileText, AlertTriangle, CheckCircle, Loader2 } from "lucide-react"

interface RevaluationDetail {
  documentType: 'invoice' | 'bill'
  documentId: string
  documentNumber: string
  currency: string
  originalRate: number
  closingRate: number
  openAmountFC: number
  bookedBaseAmount: number
  revaluedBaseAmount: number
  diff: number
}

interface RevaluationResult {
  success: boolean
  error?: string
  baseCurrency?: string
  periodEndDate?: string
  details: RevaluationDetail[]
  totalGain: number
  totalLoss: number
  revaluedDocuments: number
  journalEntryId?: string
  dryRun: boolean
}

export default function FXRevaluationPage() {
  const supabase = useSupabase()
  const [appLang, setAppLang] = useState<'ar'|'en'>('ar')
  const [periodEndDate, setPeriodEndDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  )
  // Start empty — the system will use the latest rates from the exchange_rates table by default
  const [closingRatesText, setClosingRatesText] = useState<string>('')
  const [isLoading, setIsLoading] = useState(false)
  const [result, setResult] = useState<RevaluationResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const t = (en: string, ar: string) => appLang === 'en' ? en : ar

  useEffect(() => {
    const handler = () => {
      try {
        setAppLang(localStorage.getItem('app_language') === 'en' ? 'en' : 'ar')
      } catch {}
    }
    handler()
    window.addEventListener('app_language_changed', handler)
    return () => window.removeEventListener('app_language_changed', handler)
  }, [])

  const parseClosingRates = (): Record<string, number> => {
    const rates: Record<string, number> = {}
    for (const line of closingRatesText.split('\n')) {
      const m = line.trim().match(/^([A-Za-z]{3})\s*=\s*([\d.]+)$/)
      if (m) {
        const code = m[1].toUpperCase()
        const rate = Number(m[2])
        if (rate > 0) rates[code] = rate
      }
    }
    return rates
  }

  const runRevaluation = async (dryRun: boolean) => {
    setIsLoading(true)
    setError(null)
    setResult(null)
    try {
      const res = await fetch('/api/fx-revaluation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          periodEndDate,
          closingRates: parseClosingRates(),
          dryRun,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'فشلت العملية')
        return
      }
      setResult(data)
    } catch (err: any) {
      setError(err?.message || 'Network error')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
      <main className="flex-1 md:mr-64 p-4 md:p-8 pt-20 md:pt-8">
        <div className="space-y-6 max-w-6xl">
          {/* Header */}
          <Card className="bg-white dark:bg-slate-900 border-0 shadow-sm">
            <CardContent className="py-6">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-gradient-to-br from-amber-500 to-orange-600 rounded-xl shadow-lg">
                  <Calculator className="w-7 h-7 text-white" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                    {t("Period-End FX Revaluation", "إعادة تقييم الأرصدة بالعملات الأجنبية")}
                  </h1>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    {t(
                      "IAS 21 §28 — Retranslate monetary AR/AP at closing rate",
                      "معيار IAS 21 — إعادة ترجمة الأرصدة النقدية المفتوحة بسعر الإقفال"
                    )}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Warning */}
          <Alert className="bg-amber-50 dark:bg-amber-900/20 border-amber-200">
            <AlertTriangle className="w-5 h-5 text-amber-600" />
            <AlertDescription className="text-amber-800 dark:text-amber-200 mr-2">
              {t(
                "Always run as 'Dry Run' first to preview the impact. The created journal entry will require approval before it affects the trial balance.",
                "شغّل أولاً كـ 'محاكاة' لمعاينة الأثر. القيد المُنشأ يحتاج إلى اعتماد قبل أن يؤثر فى ميزان المراجعة."
              )}
            </AlertDescription>
          </Alert>

          {/* Inputs */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">{t("Settings", "الإعدادات")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>{t("Period End Date", "تاريخ نهاية الفترة")}</Label>
                <Input
                  type="date"
                  value={periodEndDate}
                  onChange={(e) => setPeriodEndDate(e.target.value)}
                  className="w-60"
                />
              </div>
              <div>
                <Label>
                  {t("Closing Rates Override (optional)", "أسعار الإقفال (اختيارى - للتجاوز اليدوى)")}
                </Label>
                <textarea
                  className="w-full border rounded-md p-2 text-sm dark:bg-slate-800 dark:border-slate-700 font-mono"
                  rows={4}
                  value={closingRatesText}
                  onChange={(e) => setClosingRatesText(e.target.value)}
                  placeholder={t(
                    "Leave empty to use latest rates from exchange_rates table.\nOr override per line, e.g.:\nUSD=53.11\nEUR=58.20",
                    "اتركه فارغاً لاستخدام أحدث الأسعار من جدول exchange_rates.\nأو تجاوز يدوياً سطر لكل عملة، مثال:\nUSD=53.11\nEUR=58.20"
                  )}
                />
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-1 font-medium">
                  {t(
                    "⚠️ Only fill this if you need to override the system rates. Empty = automatic.",
                    "⚠️ املأ فقط لو تريد تجاوز الأسعار التلقائية. فاضى = استخدام أسعار جدول exchange_rates."
                  )}
                </p>
              </div>
              <div className="flex gap-3 pt-2">
                <Button
                  onClick={() => runRevaluation(true)}
                  disabled={isLoading}
                  variant="outline"
                >
                  {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  {t("Preview (Dry Run)", "معاينة (محاكاة)")}
                </Button>
                <Button
                  onClick={() => runRevaluation(false)}
                  disabled={isLoading || !result || result.dryRun !== true}
                  className="bg-amber-600 hover:bg-amber-700"
                >
                  {t("Commit Revaluation", "تنفيذ الإعتماد")}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Error */}
          {error && (
            <Alert className="bg-red-50 dark:bg-red-900/20 border-red-200">
              <AlertDescription className="text-red-800 dark:text-red-200">{error}</AlertDescription>
            </Alert>
          )}

          {/* Result */}
          {result && (
            <>
              {/* Stats */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card className="bg-blue-50 dark:bg-blue-900/20 border-0">
                  <CardContent className="p-4 text-center">
                    <FileText className="w-6 h-6 mx-auto text-blue-600 mb-2" />
                    <p className="text-2xl font-bold text-blue-700">{result.revaluedDocuments}</p>
                    <p className="text-xs text-blue-600">{t("Documents", "مستندات")}</p>
                  </CardContent>
                </Card>
                <Card className="bg-green-50 dark:bg-green-900/20 border-0">
                  <CardContent className="p-4 text-center">
                    <TrendingUp className="w-6 h-6 mx-auto text-green-600 mb-2" />
                    <p className="text-2xl font-bold text-green-700">
                      {result.totalGain.toLocaleString()}
                    </p>
                    <p className="text-xs text-green-600">{t("Total Gain", "إجمالى الأرباح")}</p>
                  </CardContent>
                </Card>
                <Card className="bg-red-50 dark:bg-red-900/20 border-0">
                  <CardContent className="p-4 text-center">
                    <TrendingDown className="w-6 h-6 mx-auto text-red-600 mb-2" />
                    <p className="text-2xl font-bold text-red-700">
                      {result.totalLoss.toLocaleString()}
                    </p>
                    <p className="text-xs text-red-600">{t("Total Loss", "إجمالى الخسائر")}</p>
                  </CardContent>
                </Card>
                <Card className={result.dryRun ? "bg-gray-50 dark:bg-gray-900/20 border-0" : "bg-emerald-50 dark:bg-emerald-900/20 border-0"}>
                  <CardContent className="p-4 text-center">
                    <CheckCircle className={`w-6 h-6 mx-auto mb-2 ${result.dryRun ? 'text-gray-600' : 'text-emerald-600'}`} />
                    <p className={`text-sm font-bold ${result.dryRun ? 'text-gray-700' : 'text-emerald-700'}`}>
                      {result.dryRun ? t("Dry Run", "محاكاة") : t("Committed", "تم التنفيذ")}
                    </p>
                    {result.journalEntryId && (
                      <p className="text-xs mt-1 truncate">{result.journalEntryId.slice(0, 8)}…</p>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Details Table */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">{t("Revaluation Details", "تفاصيل إعادة التقييم")}</CardTitle>
                </CardHeader>
                <CardContent>
                  {result.details.length === 0 ? (
                    <p className="text-center text-gray-500 py-8">
                      {t("No foreign-currency monetary items to revalue.", "لا توجد أرصدة مفتوحة بعملات أجنبية تستوجب إعادة التقييم.")}
                    </p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b dark:border-gray-700 text-xs text-gray-500">
                            <th className="text-right py-2 px-2">{t("Type", "النوع")}</th>
                            <th className="text-right py-2 px-2">{t("Document", "المستند")}</th>
                            <th className="text-right py-2 px-2">{t("Currency", "العملة")}</th>
                            <th className="text-right py-2 px-2">{t("Open FC", "الرصيد المفتوح FC")}</th>
                            <th className="text-right py-2 px-2">{t("Original Rate", "السعر الأصلى")}</th>
                            <th className="text-right py-2 px-2">{t("Closing Rate", "سعر الإقفال")}</th>
                            <th className="text-right py-2 px-2">{t("Booked", "المسجل")}</th>
                            <th className="text-right py-2 px-2">{t("Revalued", "بعد التقييم")}</th>
                            <th className="text-right py-2 px-2">{t("Diff", "الفرق")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {result.details.map((d, idx) => (
                            <tr key={idx} className="border-b dark:border-gray-700">
                              <td className="py-2 px-2">
                                <Badge variant="outline">{d.documentType === 'invoice' ? t('Invoice', 'فاتورة') : t('Bill', 'فاتورة مورد')}</Badge>
                              </td>
                              <td className="py-2 px-2 font-medium">{d.documentNumber}</td>
                              <td className="py-2 px-2">{d.currency}</td>
                              <td className="py-2 px-2 text-right">{d.openAmountFC.toLocaleString()}</td>
                              <td className="py-2 px-2 text-right">{d.originalRate.toFixed(4)}</td>
                              <td className="py-2 px-2 text-right">{d.closingRate.toFixed(4)}</td>
                              <td className="py-2 px-2 text-right">{d.bookedBaseAmount.toLocaleString()}</td>
                              <td className="py-2 px-2 text-right">{d.revaluedBaseAmount.toLocaleString()}</td>
                              <td className={`py-2 px-2 text-right font-bold ${d.diff > 0 ? 'text-green-600' : 'text-red-600'}`}>
                                {d.diff > 0 ? '+' : ''}{d.diff.toLocaleString()}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </main>
    </div>
  )
}
