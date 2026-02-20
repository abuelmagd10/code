"use client"

import { useEffect, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { TrendingUp, TrendingDown, ShoppingCart, BadgeDollarSign, FileText, ArrowUpRight, ArrowDownRight } from "lucide-react"
import { currencySymbols, getDisplayAmount } from "./DashboardAmounts"

interface Invoice {
  id: string
  total_amount: number
  paid_amount?: number
  invoice_date?: string
  status?: string
  display_total?: number | null
  display_currency?: string | null
}

interface Bill {
  id: string
  total_amount: number
  paid_amount?: number
  bill_date?: string
  status?: string
  display_total?: number | null
  display_currency?: string | null
}

interface DashboardStatsProps {
  invoicesData: Invoice[]
  billsData: Bill[]
  defaultCurrency: string
  appLang: string
  incomeChangePct: number
  expenseChangePct: number
  profitChangePct: number
  totalCOGS?: number // تكلفة البضاعة المباعة الفعلية
  totalShipping?: number // إجمالي مصاريف الشحن
}

export default function DashboardStats({
  invoicesData,
  billsData,
  defaultCurrency,
  appLang,
  incomeChangePct,
  expenseChangePct,
  profitChangePct,
  totalCOGS = 0,
  totalShipping = 0
}: DashboardStatsProps) {
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

  // Calculate totals using display amounts when available
  const totalSales = invoicesData.reduce((sum, inv) => {
    const amount = getDisplayAmount(inv.total_amount || 0, inv.display_total, inv.display_currency, appCurrency)
    return sum + amount
  }, 0)

  const totalPurchases = billsData.reduce((sum, bill) => {
    const amount = getDisplayAmount(bill.total_amount || 0, bill.display_total, bill.display_currency, appCurrency)
    return sum + amount
  }, 0)

  // صافي الربح الإجمالي = المبيعات - المشتريات
  // يتطابق مع مخططات لوحة التحكم ويعطي صورة موحدة
  const expectedProfit = totalSales - totalPurchases
  // هامش الربح الإجمالي = المبيعات - تكلفة البضاعة المباعة (للعرض المساعد فقط)
  const grossProfitFromCOGS = totalCOGS > 0 ? (totalSales - totalCOGS - totalShipping) : null
  const invoicesCount = invoicesData.length

  const currency = currencySymbols[appCurrency] || appCurrency
  const formatNumber = (n: number) => n.toLocaleString('en-US')

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {/* إجمالي المبيعات */}
      <Card className="bg-white dark:bg-slate-900 border-0 shadow-sm hover:shadow-md transition-all overflow-hidden">
        <CardContent className="p-6 relative">
          <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-blue-500/10 to-transparent rounded-bl-full" />
          <div className="flex items-center justify-between relative z-10">
            <div>
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                {appLang === 'en' ? 'Total Sales' : 'إجمالي المبيعات'}
              </p>
              <p className="text-2xl lg:text-3xl font-bold text-gray-900 dark:text-white mt-2">{formatNumber(totalSales)}</p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{currency}</p>
            </div>
            <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-xl">
              <TrendingUp className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            </div>
          </div>
          <div className="flex items-center gap-1 mt-3 relative z-10">
            {incomeChangePct >= 0 ? (
              <ArrowUpRight className="w-4 h-4 text-emerald-500" />
            ) : (
              <ArrowDownRight className="w-4 h-4 text-red-500" />
            )}
            <span className={`text-sm font-medium ${incomeChangePct >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              {incomeChangePct >= 0 ? '+' : ''}{incomeChangePct.toFixed(1)}%
            </span>
            <span className="text-xs text-gray-400 dark:text-gray-500">{appLang === 'en' ? 'vs last month' : 'عن الشهر الماضي'}</span>
          </div>
        </CardContent>
      </Card>

      {/* إجمالي المشتريات */}
      <Card className="bg-white dark:bg-slate-900 border-0 shadow-sm hover:shadow-md transition-all overflow-hidden">
        <CardContent className="p-6 relative">
          <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-orange-500/10 to-transparent rounded-bl-full" />
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                {appLang === 'en' ? 'Total Purchases' : 'إجمالي المشتريات'}
              </p>
              <p className="text-2xl lg:text-3xl font-bold text-gray-900 dark:text-white mt-2">{formatNumber(totalPurchases)}</p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{currency}</p>
            </div>
            <div className="p-3 bg-orange-100 dark:bg-orange-900/30 rounded-xl">
              <ShoppingCart className="w-6 h-6 text-orange-600 dark:text-orange-400" />
            </div>
          </div>
          <div className="flex items-center gap-1 mt-3">
            {expenseChangePct >= 0 ? (
              <ArrowUpRight className="w-4 h-4 text-red-500" />
            ) : (
              <ArrowDownRight className="w-4 h-4 text-emerald-500" />
            )}
            <span className={`text-sm font-medium ${expenseChangePct >= 0 ? 'text-red-600' : 'text-emerald-600'}`}>
              {expenseChangePct >= 0 ? '+' : ''}{expenseChangePct.toFixed(1)}%
            </span>
            <span className="text-xs text-gray-400 dark:text-gray-500">{appLang === 'en' ? 'vs last month' : 'عن الشهر الماضي'}</span>
          </div>
        </CardContent>
      </Card>

      {/* صافي الربح */}
      <Card className="bg-white dark:bg-slate-900 border-0 shadow-sm hover:shadow-md transition-all overflow-hidden">
        <CardContent className="p-6 relative">
          <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-emerald-500/10 to-transparent rounded-bl-full" />
          <div className="flex items-center justify-between relative z-10">
            <div>
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                {appLang === 'en' ? 'Net Profit' : 'صافي الربح'}
              </p>
              <p className={`text-2xl lg:text-3xl font-bold mt-2 ${expectedProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                {formatNumber(expectedProfit)}
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                {currency}
                {grossProfitFromCOGS !== null && (
                  <span className="mr-2 text-gray-400">
                    {' · '}{appLang === 'en' ? 'Gross' : 'إجمالي'}: {formatNumber(Math.round(grossProfitFromCOGS))}
                  </span>
                )}
              </p>
            </div>
            <div className="p-3 bg-emerald-100 dark:bg-emerald-900/30 rounded-xl">
              <BadgeDollarSign className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
            </div>
          </div>
          <div className="flex items-center gap-1 mt-3 relative z-10">
            {profitChangePct >= 0 ? (
              <ArrowUpRight className="w-4 h-4 text-emerald-500" />
            ) : (
              <ArrowDownRight className="w-4 h-4 text-red-500" />
            )}
            <span className={`text-sm font-medium ${profitChangePct >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              {profitChangePct >= 0 ? '+' : ''}{profitChangePct.toFixed(1)}%
            </span>
            <span className="text-xs text-gray-400 dark:text-gray-500">{appLang === 'en' ? 'vs last month' : 'عن الشهر الماضي'}</span>
          </div>
        </CardContent>
      </Card>

      {/* عدد الفواتير */}
      <Card className="bg-white dark:bg-slate-900 border-0 shadow-sm hover:shadow-md transition-all overflow-hidden">
        <CardContent className="p-6 relative">
          <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-violet-500/10 to-transparent rounded-bl-full" />
          <div className="flex items-center justify-between relative z-10">
            <div>
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                {appLang === 'en' ? 'Invoices Count' : 'عدد الفواتير'}
              </p>
              <p className="text-2xl lg:text-3xl font-bold text-gray-900 dark:text-white mt-2">{formatNumber(invoicesCount)}</p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{invoicesCount > 0 ? (appLang === 'en' ? 'invoices' : 'فاتورة') : (appLang === 'en' ? 'No invoices yet' : 'لا توجد فواتير')}</p>
            </div>
            <div className="p-3 bg-violet-100 dark:bg-violet-900/30 rounded-xl">
              <FileText className="w-6 h-6 text-violet-600 dark:text-violet-400" />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

