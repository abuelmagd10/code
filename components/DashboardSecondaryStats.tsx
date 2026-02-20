"use client"

import { useEffect, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { TrendingUp, TrendingDown, Wallet, CreditCard } from "lucide-react"
import { currencySymbols, getDisplayAmount } from "./DashboardAmounts"

interface Invoice {
  id: string
  total_amount: number
  paid_amount?: number
  returned_amount?: number
  invoice_date?: string
  status?: string
  display_total?: number | null
  display_currency?: string | null
}

interface Bill {
  id: string
  total_amount: number
  paid_amount?: number
  returned_amount?: number
  bill_date?: string
  status?: string
  display_total?: number | null
  display_currency?: string | null
}

interface DashboardSecondaryStatsProps {
  invoicesData: Invoice[]
  billsData: Bill[]
  defaultCurrency: string
  appLang: string
}

export default function DashboardSecondaryStats({
  invoicesData,
  billsData,
  defaultCurrency,
  appLang
}: DashboardSecondaryStatsProps) {
  const [appCurrency, setAppCurrency] = useState(defaultCurrency)
  
  useEffect(() => {
    const storedCurrency = localStorage.getItem('app_currency')
    if (storedCurrency) setAppCurrency(storedCurrency)
    
    const handleCurrencyChange = () => {
      const newCurrency = localStorage.getItem('app_currency')
      if (newCurrency) setAppCurrency(newCurrency)
    }
    
    window.addEventListener('app_currency_changed', handleCurrencyChange)
    return () => window.removeEventListener('app_currency_changed', handleCurrencyChange)
  }, [])
  
  const currency = currencySymbols[appCurrency] || appCurrency
  const formatNumber = (n: number) => n.toLocaleString('en-US')
  
  // ─── ثوابت الحالات المستثناة ────────────────────────────────────────────────
  // للذمم (receivables/payables): يُستثنى "paid" أيضاً لأن الفاتورة المسددة
  //   لا تمثل مبلغاً معلقاً — المديونية صفر بالفعل.
  const OUTSTANDING_INVOICE_EXCLUDED = ["draft", "paid", "cancelled", "voided"]
  const OUTSTANDING_BILL_EXCLUDED    = ["draft", "paid", "cancelled", "voided"]

  // للإجماليات الشهرية (income/expense): "paid" مُدرَج لأن الفاتورة المسددة
  //   هي إيراد/مصروف حقيقي. يُستثنى فقط ما لم يُلزَم (draft) أو أُلغي.
  const MONTHLY_INVOICE_EXCLUDED = ["draft", "cancelled", "voided"]
  const MONTHLY_BILL_EXCLUDED    = ["draft", "cancelled", "voided"]

  // الذمم المدينة = ما لم يُسدَّد من الفواتير المرسلة/المتأخرة/المدفوعة جزئياً
  const receivablesOutstanding = invoicesData
    .filter((i) => !OUTSTANDING_INVOICE_EXCLUDED.includes(String(i.status || "").toLowerCase()))
    .reduce((sum, i) => {
      const total = getDisplayAmount(i.total_amount || 0, i.display_total, i.display_currency, appCurrency)
      const paid = Number(i.paid_amount || 0)
      const returned = Number(i.returned_amount || 0)
      return sum + Math.max(total - paid - returned, 0)
    }, 0)

  // الذمم الدائنة = ما لم يُسدَّد للموردين من الفواتير المرسلة/المتأخرة/المدفوعة جزئياً
  const payablesOutstanding = billsData
    .filter((b) => !OUTSTANDING_BILL_EXCLUDED.includes(String(b.status || "").toLowerCase()))
    .reduce((sum, b) => {
      const total = getDisplayAmount(b.total_amount || 0, b.display_total, b.display_currency, appCurrency)
      const paid = Number(b.paid_amount || 0)
      const returned = Number(b.returned_amount || 0)
      return sum + Math.max(total - paid - returned, 0)
    }, 0)

  // عدد المستندات المعلقة — يستخدم نفس فلتر الذمم لضمان التوافق
  const pendingInvoicesCount = invoicesData.filter(
    (i) => !OUTSTANDING_INVOICE_EXCLUDED.includes(String(i.status || "").toLowerCase())
  ).length
  const pendingBillsCount = billsData.filter(
    (b) => !OUTSTANDING_BILL_EXCLUDED.includes(String(b.status || "").toLowerCase())
  ).length

  const now = new Date()
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`

  // دخل الشهر = مجموع الفواتير − مرتجعات البيع (للشهر الحالي فقط)
  // يشمل الفواتير المسددة (paid) لأنها إيراد حقيقي محقق
  const incomeThisMonth = invoicesData
    .filter((i) => String(i.invoice_date || "").startsWith(ym) && !MONTHLY_INVOICE_EXCLUDED.includes(String(i.status || "").toLowerCase()))
    .reduce((sum, i) => {
      const gross = getDisplayAmount(i.total_amount || 0, i.display_total, i.display_currency, appCurrency)
      const returned = Number(i.returned_amount || 0)
      return sum + Math.max(gross - returned, 0)
    }, 0)

  // مصروف الشهر = مجموع فواتير الموردين − مرتجعات الشراء (للشهر الحالي فقط)
  // يشمل الفواتير المسددة (paid) لأنها مصروف حقيقي محقق
  const expenseThisMonth = billsData
    .filter((b) => String(b.bill_date || "").startsWith(ym) && !MONTHLY_BILL_EXCLUDED.includes(String(b.status || "").toLowerCase()))
    .reduce((sum, b) => {
      const gross = getDisplayAmount(b.total_amount || 0, b.display_total, b.display_currency, appCurrency)
      const returned = Number(b.returned_amount || 0)
      return sum + Math.max(gross - returned, 0)
    }, 0)
  
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {/* ذمم مدينة */}
      <Card className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/50 dark:to-indigo-950/50 border border-blue-100 dark:border-blue-900 shadow-sm">
        <CardContent className="p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/50 rounded-lg">
              <Wallet className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
              {appLang==='en' ? 'Receivables' : 'ذمم مدينة'}
            </span>
          </div>
          <p className="text-2xl font-bold text-blue-700 dark:text-blue-300">{formatNumber(receivablesOutstanding)}</p>
          <p className="text-xs text-blue-600/70 dark:text-blue-400/70 mt-1">
            {currency}
            {pendingInvoicesCount > 0 && (
              <span className="mr-1 text-blue-400">
                · {pendingInvoicesCount} {appLang === 'en' ? 'pending' : 'فاتورة معلقة'}
              </span>
            )}
            {receivablesOutstanding === 0 && pendingInvoicesCount === 0 && (
              <span className="mr-1 text-emerald-500">
                · {appLang === 'en' ? 'All invoices settled' : 'جميع الفواتير مسددة'}
              </span>
            )}
          </p>
        </CardContent>
      </Card>

      {/* ذمم دائنة */}
      <Card className="bg-gradient-to-br from-red-50 to-rose-50 dark:from-red-950/50 dark:to-rose-950/50 border border-red-100 dark:border-red-900 shadow-sm">
        <CardContent className="p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-red-100 dark:bg-red-900/50 rounded-lg">
              <CreditCard className="w-5 h-5 text-red-600 dark:text-red-400" />
            </div>
            <span className="text-sm font-medium text-red-700 dark:text-red-300">
              {appLang==='en' ? 'Payables' : 'ذمم دائنة'}
            </span>
          </div>
          <p className="text-2xl font-bold text-red-700 dark:text-red-300">{formatNumber(payablesOutstanding)}</p>
          <p className="text-xs text-red-600/70 dark:text-red-400/70 mt-1">
            {currency}
            {pendingBillsCount > 0 && (
              <span className="mr-1 text-red-400">
                · {pendingBillsCount} {appLang === 'en' ? 'pending' : 'فاتورة معلقة'}
              </span>
            )}
            {payablesOutstanding === 0 && pendingBillsCount === 0 && (
              <span className="mr-1 text-emerald-500">
                · {appLang === 'en' ? 'All bills settled' : 'جميع الفواتير مسددة'}
              </span>
            )}
          </p>
        </CardContent>
      </Card>

      {/* دخل هذا الشهر */}
      <Card className="bg-gradient-to-br from-emerald-50 to-green-50 dark:from-emerald-950/50 dark:to-green-950/50 border border-emerald-100 dark:border-emerald-900 shadow-sm">
        <CardContent className="p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-emerald-100 dark:bg-emerald-900/50 rounded-lg">
              <TrendingUp className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <span className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
              {appLang==='en' ? 'Income This Month' : 'دخل الشهر'}
            </span>
          </div>
          <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-300">{formatNumber(incomeThisMonth)}</p>
          <p className="text-xs text-emerald-600/70 dark:text-emerald-400/70 mt-1">{currency}</p>
        </CardContent>
      </Card>

      {/* مصروف هذا الشهر */}
      <Card className="bg-gradient-to-br from-amber-50 to-yellow-50 dark:from-amber-950/50 dark:to-yellow-950/50 border border-amber-100 dark:border-amber-900 shadow-sm">
        <CardContent className="p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-amber-100 dark:bg-amber-900/50 rounded-lg">
              <TrendingDown className="w-5 h-5 text-amber-600 dark:text-amber-400" />
            </div>
            <span className="text-sm font-medium text-amber-700 dark:text-amber-300">
              {appLang==='en' ? 'Expense This Month' : 'مصروف الشهر'}
            </span>
          </div>
          <p className="text-2xl font-bold text-amber-700 dark:text-amber-300">{formatNumber(expenseThisMonth)}</p>
          <p className="text-xs text-amber-600/70 dark:text-amber-400/70 mt-1">{currency}</p>
        </CardContent>
      </Card>
    </div>
  )
}

