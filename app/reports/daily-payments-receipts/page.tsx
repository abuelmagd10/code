"use client"

import { useState, useEffect } from "react"
import { Sidebar } from "@/components/sidebar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useSupabase } from "@/lib/supabase/hooks"
import { getActiveCompanyId } from "@/lib/company"
import { Download, ArrowRight, TrendingUp, TrendingDown, DollarSign, ArrowUpCircle, ArrowDownCircle } from "lucide-react"
import { useRouter } from "next/navigation"
import { ResponsiveContainer, BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip, Legend, LineChart, Line } from "recharts"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"

interface Transaction {
  id: string
  date: string
  type: "payment" | "receipt"
  amount: number
  method: string
  reference: string
  customer_name?: string
  supplier_name?: string
  account_name?: string
}

interface PeriodData {
  date: string
  payments: number
  receipts: number
  net_cash_flow: number
  transactions: Transaction[]
}

interface Summary {
  total_payments: number
  total_receipts: number
  net_cash_flow: number
}

export default function DailyPaymentsReceiptsPage() {
  const supabase = useSupabase()
  const router = useRouter()
  const [periodData, setPeriodData] = useState<PeriodData[]>([])
  const [summary, setSummary] = useState<Summary>({ total_payments: 0, total_receipts: 0, net_cash_flow: 0 })
  const [accounts, setAccounts] = useState<Array<{ id: string; account_name: string; account_code: string }>>([])
  const [isLoading, setIsLoading] = useState(true)
  const [appLang, setAppLang] = useState<'ar' | 'en'>('ar')

  // Helper function to format date
  const formatLocalDate = (date: Date): string => {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  const today = new Date()
  const defaultTo = formatLocalDate(today)
  const defaultFrom = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`

  const [fromDate, setFromDate] = useState<string>(defaultFrom)
  const [toDate, setToDate] = useState<string>(defaultTo)
  const [paymentType, setPaymentType] = useState<'all' | 'payments' | 'receipts'>('all')
  const [paymentMethod, setPaymentMethod] = useState<string>("")
  const [accountId, setAccountId] = useState<string>("")
  const [groupBy, setGroupBy] = useState<'day' | 'week' | 'month'>('day')
  const [selectedPeriod, setSelectedPeriod] = useState<string>("")

  useEffect(() => {
    const handler = () => {
      try {
        const v = localStorage.getItem('app_language') || 'ar'
        setAppLang(v === 'en' ? 'en' : 'ar')
      } catch {}
    }
    handler()
    window.addEventListener('app_language_changed', handler)
    return () => window.removeEventListener('app_language_changed', handler)
  }, [])

  const t = (en: string, ar: string) => appLang === 'en' ? en : ar
  const numberFmt = new Intl.NumberFormat(appLang === 'en' ? "en-EG" : "ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  // Load accounts
  useEffect(() => {
    const loadAccounts = async () => {
      const companyId = await getActiveCompanyId(supabase)
      if (!companyId) return

      const { data } = await supabase
        .from("chart_of_accounts")
        .select("id, account_name, account_code")
        .eq("company_id", companyId)
        .in("account_type", ["asset"])
        .in("sub_type", ["cash", "bank"])
        .order("account_name")

      setAccounts((data || []) as Array<{ id: string; account_name: string; account_code: string }>)
    }
    loadAccounts()
  }, [supabase])

  useEffect(() => {
    if (fromDate && toDate) {
      loadData()
    }
  }, [fromDate, toDate, paymentType, paymentMethod, accountId, groupBy])

  /**
   * ✅ تحميل بيانات المدفوعات والمقبوضات اليومية
   * ⚠️ OPERATIONAL REPORT - تقرير تشغيلي (من payments مباشرة)
   * راجع: docs/OPERATIONAL_REPORTS_GUIDE.md
   */
  const loadData = async () => {
    try {
      setIsLoading(true)
      const params = new URLSearchParams({
        from: fromDate,
        to: toDate,
        type: paymentType,
        group_by: groupBy
      })
      if (paymentMethod) params.set('payment_method', paymentMethod)
      if (accountId) params.set('account_id', accountId)

      const res = await fetch(`/api/daily-payments-receipts?${params.toString()}`)
      if (!res.ok) {
        console.error("API Error:", res.status)
        setPeriodData([])
        setSummary({ total_payments: 0, total_receipts: 0, net_cash_flow: 0 })
        return
      }

      const data = await res.json()
      setPeriodData(Array.isArray(data.data) ? data.data : [])
      setSummary(data.summary || { total_payments: 0, total_receipts: 0, net_cash_flow: 0 })
    } catch (error) {
      console.error("Error loading data:", error)
      setPeriodData([])
      setSummary({ total_payments: 0, total_receipts: 0, net_cash_flow: 0 })
    } finally {
      setIsLoading(false)
    }
  }

  const handleExportCsv = () => {
    const headers = ["date", "type", "amount", "method", "reference", "customer_name", "supplier_name", "account_name"]
    const rowsCsv: string[][] = []
    periodData.forEach(period => {
      period.transactions.forEach(tx => {
        rowsCsv.push([
          tx.date,
          tx.type === "payment" ? t("Payment", "مدفوع") : t("Receipt", "مقبوض"),
          tx.amount.toFixed(2),
          tx.method,
          tx.reference,
          tx.customer_name || "",
          tx.supplier_name || "",
          tx.account_name || ""
        ])
      })
    })
    const csv = [headers.join(","), ...rowsCsv.map((r) => r.join(","))].join("\n")
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const aEl = document.createElement("a")
    aEl.href = url
    aEl.download = `daily-payments-receipts-${fromDate}-${toDate}.csv`
    aEl.click()
    URL.revokeObjectURL(url)
  }

  const chartData = periodData.map(p => ({
    date: p.date,
    payments: p.payments,
    receipts: p.receipts,
    net: p.net_cash_flow
  }))

  const selectedPeriodData = periodData.find(p => p.date === selectedPeriod)

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
      <Sidebar />
      <main className="flex-1 md:mr-64 p-4 md:p-8 pt-20 md:pt-8">
        <div className="space-y-6">
          {/* Header */}
          <Card className="bg-white dark:bg-slate-900 border-0 shadow-sm">
            <CardContent className="py-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl shadow-lg">
                    <DollarSign className="w-7 h-7 text-white" />
                  </div>
                  <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                      {t("Daily Payments & Receipts", "المدفوعات والمقبوضات اليومية")}
                    </h1>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                      {t("Track daily cash flow", "تتبع التدفقات النقدية اليومية")}
                    </p>
                  </div>
                </div>
                <Button variant="outline" onClick={() => router.push("/reports")}>
                  <ArrowRight className="w-4 h-4 ml-2" />
                  {t("Back", "العودة")}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="dark:bg-gray-800">
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{t("Total Payments", "إجمالي المدفوعات")}</p>
                    <p className="text-2xl font-bold text-red-600">{numberFmt.format(summary.total_payments)}</p>
                  </div>
                  <ArrowDownCircle className="w-8 h-8 text-red-500" />
                </div>
              </CardContent>
            </Card>
            <Card className="dark:bg-gray-800">
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{t("Total Receipts", "إجمالي المقبوضات")}</p>
                    <p className="text-2xl font-bold text-green-600">{numberFmt.format(summary.total_receipts)}</p>
                  </div>
                  <ArrowUpCircle className="w-8 h-8 text-green-500" />
                </div>
              </CardContent>
            </Card>
            <Card className="dark:bg-gray-800">
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{t("Net Cash Flow", "صافي التدفق النقدي")}</p>
                    <p className={`text-2xl font-bold ${summary.net_cash_flow >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {numberFmt.format(summary.net_cash_flow)}
                    </p>
                  </div>
                  {summary.net_cash_flow >= 0 ? (
                    <TrendingUp className="w-8 h-8 text-green-500" />
                  ) : (
                    <TrendingDown className="w-8 h-8 text-red-500" />
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Filters */}
          <Card className="dark:bg-gray-800">
            <CardContent className="py-4">
              <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
                <div>
                  <Label className="text-xs">{t("From Date", "من تاريخ")}</Label>
                  <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="w-full" />
                </div>
                <div>
                  <Label className="text-xs">{t("To Date", "إلى تاريخ")}</Label>
                  <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="w-full" />
                </div>
                <div>
                  <Label className="text-xs">{t("Type", "النوع")}</Label>
                  <Select value={paymentType} onValueChange={(v) => setPaymentType(v as 'all' | 'payments' | 'receipts')}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t("All", "الكل")}</SelectItem>
                      <SelectItem value="payments">{t("Payments Only", "المدفوعات فقط")}</SelectItem>
                      <SelectItem value="receipts">{t("Receipts Only", "المقبوضات فقط")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">{t("Group By", "التجميع")}</Label>
                  <Select value={groupBy} onValueChange={(v) => setGroupBy(v as 'day' | 'week' | 'month')}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="day">{t("Daily", "يومي")}</SelectItem>
                      <SelectItem value="week">{t("Weekly", "أسبوعي")}</SelectItem>
                      <SelectItem value="month">{t("Monthly", "شهري")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">{t("Account", "الحساب")}</Label>
                  <Select value={accountId} onValueChange={setAccountId}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder={t("All Accounts", "جميع الحسابات")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">{t("All Accounts", "جميع الحسابات")}</SelectItem>
                      {accounts.map((acc) => (
                        <SelectItem key={acc.id} value={acc.id}>{acc.account_name} ({acc.account_code})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end gap-2">
                  <Button onClick={loadData} className="flex-1">
                    {t("Load", "تحميل")}
                  </Button>
                  <Button variant="outline" onClick={handleExportCsv}>
                    <Download className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Charts */}
          {!isLoading && chartData.length > 0 && (
            <div className="grid grid-cols-1 gap-6">
              <Card className="dark:bg-gray-800">
                <CardHeader>
                  <CardTitle>{t("Cash Flow Trend", "اتجاه التدفق النقدي")}</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="payments" fill="#ef4444" name={t("Payments", "المدفوعات")} />
                      <Bar dataKey="receipts" fill="#10b981" name={t("Receipts", "المقبوضات")} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
              <Card className="dark:bg-gray-800">
                <CardHeader>
                  <CardTitle>{t("Net Cash Flow", "صافي التدفق النقدي")}</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={250}>
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Line type="monotone" dataKey="net" stroke="#3b82f6" name={t("Net Flow", "صافي التدفق")} />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Period Summary Table */}
          <Card className="dark:bg-gray-800">
            <CardHeader>
              <CardTitle>{t("Period Summary", "ملخص الفترات")} ({periodData.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="text-center py-8 text-gray-500">{t("Loading...", "جاري التحميل...")}</div>
              ) : periodData.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <DollarSign className="w-12 h-12 mx-auto text-gray-300 mb-4" />
                  <p>{t("No transactions found", "لا توجد معاملات")}</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b dark:border-gray-700">
                        <th className="text-right py-3 px-2">{t("Period", "الفترة")}</th>
                        <th className="text-right py-3 px-2">{t("Payments", "المدفوعات")}</th>
                        <th className="text-right py-3 px-2">{t("Receipts", "المقبوضات")}</th>
                        <th className="text-right py-3 px-2">{t("Net Flow", "صافي التدفق")}</th>
                        <th className="text-right py-3 px-2">{t("Actions", "الإجراءات")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {periodData.map((period, idx) => (
                        <tr key={idx} className="border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-slate-700">
                          <td className="py-3 px-2 font-medium">{period.date}</td>
                          <td className="py-3 px-2 text-red-600 font-semibold">{numberFmt.format(period.payments)}</td>
                          <td className="py-3 px-2 text-green-600 font-semibold">{numberFmt.format(period.receipts)}</td>
                          <td className={`py-3 px-2 font-semibold ${period.net_cash_flow >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {numberFmt.format(period.net_cash_flow)}
                          </td>
                          <td className="py-3 px-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setSelectedPeriod(selectedPeriod === period.date ? "" : period.date)}
                            >
                              {selectedPeriod === period.date ? t("Hide", "إخفاء") : t("Show", "عرض")}
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Transactions Detail */}
          {selectedPeriodData && selectedPeriodData.transactions.length > 0 && (
            <Card className="dark:bg-gray-800">
              <CardHeader>
                <CardTitle>{t("Transactions for", "المعاملات لـ")} {selectedPeriodData.date}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b dark:border-gray-700">
                        <th className="text-right py-3 px-2">{t("Date", "التاريخ")}</th>
                        <th className="text-right py-3 px-2">{t("Type", "النوع")}</th>
                        <th className="text-right py-3 px-2">{t("Amount", "المبلغ")}</th>
                        <th className="text-right py-3 px-2">{t("Method", "الطريقة")}</th>
                        <th className="text-right py-3 px-2">{t("Reference", "المرجع")}</th>
                        <th className="text-right py-3 px-2">{t("Customer/Supplier", "العميل/المورد")}</th>
                        <th className="text-right py-3 px-2">{t("Account", "الحساب")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedPeriodData.transactions.map((tx) => (
                        <tr key={tx.id} className="border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-slate-700">
                          <td className="py-3 px-2">{tx.date}</td>
                          <td className="py-3 px-2">
                            <Badge className={tx.type === "payment" ? "bg-red-100 text-red-800" : "bg-green-100 text-green-800"}>
                              {tx.type === "payment" ? t("Payment", "مدفوع") : t("Receipt", "مقبوض")}
                            </Badge>
                          </td>
                          <td className="py-3 px-2 font-semibold">{numberFmt.format(tx.amount)}</td>
                          <td className="py-3 px-2">{tx.method}</td>
                          <td className="py-3 px-2">{tx.reference}</td>
                          <td className="py-3 px-2">{tx.customer_name || tx.supplier_name || "—"}</td>
                          <td className="py-3 px-2">{tx.account_name || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  )
}
