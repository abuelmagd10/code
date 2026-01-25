"use client"

import { useState, useEffect } from "react"
import { Sidebar } from "@/components/sidebar"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useSupabase } from "@/lib/supabase/hooks"
import Link from "next/link"
import { getActiveCompanyId } from "@/lib/company"
import { computeBalanceSheetTotalsFromBalances } from "@/lib/ledger"
import { Download, ArrowRight } from "lucide-react"
import { useRouter } from "next/navigation"
import { CompanyHeader } from "@/components/company-header"
import { ResponsiveContainer, BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip, Legend, PieChart, Pie, Cell } from "recharts"

interface AccountBalance {
  account_id: string
  account_name: string
  account_type: string
  balance: number
}

export default function BalanceSheetPage() {
  const supabase = useSupabase()
  const [balances, setBalances] = useState<AccountBalance[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [endDate, setEndDate] = useState<string>(() => new Date().toISOString().slice(0, 10))
  const router = useRouter()
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
  const numberFmt = new Intl.NumberFormat(appLang==='en' ? 'en-EG' : 'ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  // Currency support
  const [baseCurrency] = useState<string>(() => {
    if (typeof window === 'undefined') return 'EGP'
    try { return localStorage.getItem('app_currency') || 'EGP' } catch { return 'EGP' }
  })
  const currencySymbols: Record<string, string> = {
    EGP: '£', USD: '$', EUR: '€', GBP: '£', SAR: '﷼', AED: 'د.إ',
    KWD: 'د.ك', QAR: '﷼', BHD: 'د.ب', OMR: '﷼', JOD: 'د.أ', LBP: 'ل.ل'
  }
  const currencySymbol = currencySymbols[baseCurrency] || baseCurrency

  useEffect(() => {
    loadBalances(endDate)
  }, [endDate])

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

  /**
   * 🔐 تحميل أرصدة الحسابات من journal_entries فقط
   * 
   * ⚠️ FINAL APPROVED LOGIC - DO NOT MODIFY WITHOUT REVIEW
   * 
   * ✅ القواعد الإلزامية الثابتة:
   * 1. جميع الأرصدة تأتي من journal_entries → journal_entry_lines فقط
   * 2. لا قيم ثابتة أو محفوظة مسبقًا
   * 3. الرصيد = opening_balance + movements من القيود
   * 4. عدم عرض أي حساب رصيده = 0
   * 5. الربح/الخسارة الجارية من قائمة الدخل فقط
   * 6. معادلة الميزانية إلزامية: الأصول = الالتزامات + حقوق الملكية
   */
  const loadBalances = async (asOfDate: string) => {
    try {
      setIsLoading(true)
      setError(null)
      const companyId = await getActiveCompanyId(supabase)
      if (!companyId) {
        setError('لم يتم العثور على شركة نشطة')
        return
      }

      // ✅ جلب الأرصدة من API الذي يعتمد فقط على journal_entries
      const res = await fetch(`/api/account-balances?companyId=${encodeURIComponent(companyId)}&asOf=${encodeURIComponent(asOfDate)}`)

      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.message || errorData.error || 'فشل في تحميل الميزانية العمومية')
      }

      const computed = await res.json()

      if (Array.isArray(computed)) {
        setBalances(computed.map((b: any) => ({
          account_id: b.account_id,
          account_name: b.account_name,
          account_type: b.account_type,
          balance: b.balance
        })))
        setError(null)
      } else {
        throw new Error('البيانات المستلمة غير صحيحة')
      }
    } catch (error: any) {
      console.error("Error loading balances:", error)
      setError(error.message || 'حدث خطأ أثناء تحميل الميزانية العمومية')
      setBalances([])
    } finally {
      setIsLoading(false)
    }
  }

  const calculateTotalsByType = (type: string) => {
    return balances.filter((b) => b.account_type === type).reduce((sum, b) => sum + b.balance, 0)
  }

  // ✅ حساب إجماليات الميزانية من الأرصدة (التي تأتي من journal_entries فقط)
  // ✅ الربح/الخسارة الجارية = income - expense (من قائمة الدخل)
  const { 
    assets, 
    liabilities, 
    equity, 
    income, 
    expense, 
    netIncomeSigned, // ✅ صافي الربح من قائمة الدخل (income - expense)
    equityTotalSigned, 
    totalLiabilitiesAndEquitySigned,
    isBalanced, // ✅ التحقق من المعادلة: الأصول = الالتزامات + حقوق الملكية
    balanceDifference
  } = computeBalanceSheetTotalsFromBalances(balances)
  const netIncomeDisplay = Math.abs(netIncomeSigned)
  const equityTotalDisplay = Math.abs(equityTotalSigned)
  const totalLiabilitiesAndEquityAbs = Math.abs(totalLiabilitiesAndEquitySigned)
  
  // ✅ حساب الإجماليات من الحسابات المفلترة (التي لها رصيد فعلي >= 0.01)
  // ✅ هذا يضمن أن الإجمالي المعروض يطابق مجموع الصفوف المعروضة في الجدول
  
  // حساب إجمالي الأصول من الحسابات المفلترة
  const filteredAssets = balances.filter((b) => 
    b.account_type === "asset" && Math.abs(b.balance) >= 0.01
  )
  const assetsDisplay = Math.abs(filteredAssets.reduce((sum, b) => sum + b.balance, 0))
  
  // حساب إجمالي الالتزامات من الحسابات المفلترة
  const filteredLiabilities = balances.filter((b) => {
    if (b.account_type !== "liability") return false
    return Math.abs(b.balance) >= 0.01
  })
  const liabilitiesDisplay = Math.abs(filteredLiabilities.reduce((sum, b) => sum + b.balance, 0))
  
  // حساب إجمالي حقوق الملكية من الحسابات المفلترة + الربح/الخسارة الجارية
  const filteredEquity = balances.filter((b) => {
    if (b.account_type !== "equity") return false
    return Math.abs(b.balance) >= 0.01
  })
  const equityDisplay = Math.abs(filteredEquity.reduce((sum, b) => sum + b.balance, 0) + netIncomeSigned)
  
  // ✅ حساب التوازن من القيم المفلترة (لضمان الاتساق مع العرض)
  // ✅ هذا يضمن أن رسالة التوازن تطابق الأرقام المعروضة
  const filteredBalanceDifference = Math.abs(assetsDisplay - (liabilitiesDisplay + equityDisplay))
  const isFilteredBalanced = filteredBalanceDifference < 0.01

  const handlePrint = () => {
    window.print()
  }

  const handleExportCsv = () => {
    const headers = ["type", "account_name", "balance"]
    const rows = balances.map((b) => [b.account_type, b.account_name, b.balance.toFixed(2)])
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n")
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `balance-sheet-${endDate}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
      <Sidebar />
      {/* Main Content - تحسين للهاتف */}
      <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 overflow-x-hidden">
        <div className="space-y-4 sm:space-y-6 max-w-full">
          <CompanyHeader />
          <div className="flex flex-col sm:flex-row sm:justify-between items-start gap-3 print:hidden">
            <div className="min-w-0">
              <h1 className="text-xl sm:text-3xl font-bold text-gray-900 dark:text-white truncate" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Balance Sheet' : 'الميزانية العمومية'}</h1>
              <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-1 sm:mt-2" suppressHydrationWarning>{(hydrated && appLang==='en') ? new Date().toLocaleDateString('en') : new Date().toLocaleDateString('ar')}</p>
            </div>
            <div className="flex gap-2 items-center flex-wrap">
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="border rounded px-3 py-2 text-sm bg-white dark:bg-slate-900 w-full sm:w-40"
              />
              <Button variant="outline" onClick={handlePrint}>
                <Download className="w-4 h-4 mr-2" />
                {(hydrated && appLang==='en') ? 'Print' : 'طباعة'}
              </Button>
              <Button variant="outline" onClick={handleExportCsv}>
                <Download className="w-4 h-4 mr-2" />
                {(hydrated && appLang==='en') ? 'Export CSV' : 'تصدير CSV'}
              </Button>
              <Button variant="outline" onClick={() => router.push("/reports")}> 
                <ArrowRight className="w-4 h-4 mr-2" />
                {(hydrated && appLang==='en') ? 'Back' : 'العودة'}
              </Button>
            </div>
          </div>

          {isLoading ? (
            <div className="flex justify-center items-center py-20">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600"></div>
            </div>
          ) : error ? (
            <Card className="border-r-4 border-r-red-500">
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-red-100 dark:bg-red-900/50 rounded-xl">
                    <Download className="w-8 h-8 text-red-600 dark:text-red-400" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-red-900 dark:text-red-100 mb-1">
                      {(hydrated && appLang==='en') ? 'Error Loading Report' : 'حدث خطأ في تحميل التقرير'}
                    </h3>
                    <p className="text-red-700 dark:text-red-300">{error}</p>
                    <Button
                      onClick={() => loadBalances(endDate)}
                      variant="outline"
                      className="mt-3 border-red-300 text-red-700 hover:bg-red-50"
                    >
                      {(hydrated && appLang==='en') ? 'Try Again' : 'حاول مرة أخرى'}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : balances.length === 0 ? (
            <Card>
              <CardContent className="pt-6">
                <p className="text-center text-gray-600 dark:text-gray-400" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'No data to display for selected date.' : 'لا توجد بيانات لعرضها في التاريخ المحدد.'}</p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="pt-6 space-y-6">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <Card>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={260}>
                        <PieChart>
                          <Pie data={[{ name: (hydrated && appLang==='en') ? 'Assets' : 'الأصول', value: assetsDisplay }, { name: (hydrated && appLang==='en') ? 'Liabilities + Equity' : 'الالتزامات + حقوق الملكية', value: liabilitiesDisplay + equityDisplay }]} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label>
                            {[
                              { color: '#3b82f6' },
                              { color: '#ef4444' },
                            ].map((entry, index) => (
                              <Cell key={index} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip />
                          <Legend />
                        </PieChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={260}>
                        <BarChart data={[{ name: (hydrated && appLang==='en') ? 'Totals' : 'الإجماليات', assets: assetsDisplay, liabilities: liabilitiesDisplay, equity: equityDisplay }]}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="name" />
                          <YAxis />
                          <Tooltip />
                          <Legend />
                          <Bar dataKey="assets" fill="#3b82f6" name={(hydrated && appLang==='en') ? 'Assets' : 'الأصول'} />
                          <Bar dataKey="liabilities" fill="#ef4444" name={(hydrated && appLang==='en') ? 'Liabilities' : 'الالتزامات'} />
                          <Bar dataKey="equity" fill="#10b981" name={(hydrated && appLang==='en') ? 'Equity' : 'حقوق الملكية'} />
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                </div>
                <div className="space-y-8">
                  <div>
                    <h2 className="text-xl font-bold mb-4" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Assets' : 'الأصول'}</h2>
                    <div className="overflow-x-auto">
                    <table className="min-w-[560px] w-full text-sm mb-4">
                      <tbody>
                        {balances
                          .filter((b) => b.account_type === "asset" && Math.abs(b.balance) >= 0.01)
                          .map((item, idx) => (
                            <tr key={idx} className="border-b hover:bg-gray-50 dark:hover:bg-slate-900">
                              <td className="px-4 py-2">
                                <Link href={`/journal-entries?account_id=${encodeURIComponent(item.account_id)}&to=${encodeURIComponent(endDate)}`}>{item.account_name}</Link>
                              </td>
                              <td className="px-4 py-2">{numberFmt.format(item.balance)}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                    </div>
                    <div className="flex justify-between font-bold text-lg bg-gray-100 dark:bg-slate-800 px-4 py-2 rounded">
                      <span suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Total Assets:' : 'إجمالي الأصول:'}</span>
                      <span>{numberFmt.format(assetsDisplay)} {currencySymbol}</span>
                    </div>
                  </div>

                  <div>
                    <h2 className="text-xl font-bold mb-4" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Liabilities' : 'الالتزامات'}</h2>
                    <div className="overflow-x-auto">
                    <table className="min-w-[560px] w-full text-sm mb-4">
                      <tbody>
                        {balances
                          .filter((b) => {
                            // ✅ عرض فقط حسابات الالتزامات التي لها رصيد فعلي
                            if (b.account_type !== "liability") return false
                            // ✅ إزالة الحسابات التي رصيدها = 0
                            return Math.abs(b.balance) >= 0.01
                          })
                          .map((item, idx) => (
                            <tr key={idx} className="border-b hover:bg-gray-50 dark:hover:bg-slate-900">
                              <td className="px-4 py-2">
                                <Link href={`/journal-entries?account_id=${encodeURIComponent(item.account_id)}&to=${encodeURIComponent(endDate)}`}>{item.account_name}</Link>
                              </td>
                              <td className="px-4 py-2">{numberFmt.format(item.balance)}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                    </div>
                    <div className="flex justify-between font-bold text-lg bg-gray-100 dark:bg-slate-800 px-4 py-2 rounded">
                      <span suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Total Liabilities:' : 'إجمالي الالتزامات:'}</span>
                      <span>{numberFmt.format(liabilitiesDisplay)} {currencySymbol}</span>
                      {filteredLiabilities.reduce((sum, b) => sum + b.balance, 0) < 0 && (
                        <span className="text-xs text-gray-500 ml-2" suppressHydrationWarning>
                          {(hydrated && appLang==='en') ? '(Supplier Advances)' : '(سلف موردين)'}
                        </span>
                      )}
                    </div>
                  </div>

                  <div>
                    <h2 className="text-xl font-bold mb-4" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Equity' : 'حقوق الملكية'}</h2>
                    <div className="overflow-x-auto">
                    <table className="min-w-[560px] w-full text-sm mb-4">
                      <tbody>
                        {balances
                          .filter((b) => {
                            // ✅ عرض فقط حسابات حقوق الملكية التي لها رصيد فعلي
                            if (b.account_type !== "equity") return false
                            // ✅ إزالة الحسابات التي رصيدها = 0
                            return Math.abs(b.balance) >= 0.01
                          })
                          .map((item, idx) => (
                            <tr key={idx} className="border-b hover:bg-gray-50 dark:hover:bg-slate-900">
                              <td className="px-4 py-2">
                                <Link href={`/journal-entries?account_id=${encodeURIComponent(item.account_id)}&to=${encodeURIComponent(endDate)}`}>{item.account_name}</Link>
                              </td>
                              <td className="px-4 py-2">{numberFmt.format(item.balance)}</td>
                            </tr>
                          ))}
                        <tr className="border-b bg-gray-50 dark:bg-slate-900">
                          <td className="px-4 py-2 font-medium" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Current period profit/loss' : 'الأرباح/الخسائر الجارية'}</td>
                          <td className="px-4 py-2 font-medium">{numberFmt.format(netIncomeDisplay)}</td>
                        </tr>
                      </tbody>
                    </table>
                    </div>
                    <div className="flex justify-between font-bold text-lg bg-gray-100 dark:bg-slate-800 px-4 py-2 rounded">
                      <span suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Total Equity:' : 'إجمالي حقوق الملكية:'}</span>
                      <span>{numberFmt.format(equityDisplay)} {currencySymbol}</span>
                    </div>
                  </div>

                  <div className="border-t pt-4">
                    <div className="flex justify-between font-bold text-lg">
                      <span suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Total Liabilities + Equity:' : 'إجمالي الالتزامات + حقوق الملكية:'}</span>
                      <span
                        className={
                          isFilteredBalanced ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
                        }
                      >
                        {numberFmt.format(liabilitiesDisplay + equityDisplay)} {currencySymbol}
                      </span>
                    </div>
                    {/* ✅ التحقق التلقائي من المعادلة الإلزامية: الأصول = الالتزامات + حقوق الملكية */}
                    {/* ✅ يستخدم القيم المفلترة لضمان الاتساق مع العرض */}
                    {/* ⚠️ أي فرق يعتبر خطأ نظام وليس مجرد تحذير شكلي */}
                    {isFilteredBalanced ? (
                      <p className="text-sm text-green-600 dark:text-green-400 mt-2 font-medium">
                        ✓ {(hydrated && appLang==='en') ? 'Balance Sheet is balanced' : 'الميزانية العمومية متوازنة'}
                      </p>
                    ) : (
                      <div className="mt-2 p-3 bg-red-50 dark:bg-red-900/20 border-2 border-red-500 dark:border-red-600 rounded">
                        <p className="text-sm text-red-700 dark:text-red-300 font-bold">
                          ⚠️ {(hydrated && appLang==='en') ? 'SYSTEM ERROR: Balance Sheet is NOT balanced!' : 'خطأ نظام: الميزانية العمومية غير متوازنة!'}
                        </p>
                        <p className="text-xs text-red-600 dark:text-red-400 mt-1 font-semibold">
                          {(hydrated && appLang==='en') 
                            ? `Difference: ${numberFmt.format(filteredBalanceDifference || 0)} ${currencySymbol}. This is a SYSTEM ERROR, not a warning.`
                            : `الفرق: ${numberFmt.format(filteredBalanceDifference || 0)} ${currencySymbol}. هذا خطأ نظام وليس تحذيرًا.`}
                        </p>
                        <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                          {(hydrated && appLang==='en')
                            ? 'All amounts must come from journal_entries only. Check for missing entries, unbalanced entries, or calculation errors.'
                            : 'جميع المبالغ يجب أن تأتي من journal_entries فقط. تحقق من القيود المفقودة أو غير المتوازنة أو أخطاء الحساب.'}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  )
}
