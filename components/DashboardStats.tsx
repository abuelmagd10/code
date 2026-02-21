"use client"

import { useEffect, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { TrendingUp, TrendingDown, BadgeDollarSign, FileText, ArrowUpRight, ArrowDownRight, ShoppingCart } from "lucide-react"
import { currencySymbols } from "./DashboardAmounts"

interface DashboardStatsProps {
  // ✅ GL-First: الأرقام الرئيسية من دفتر الأستاذ العام
  glRevenue: number
  glCogs: number
  glExpenses: number
  glNetProfit: number
  // عدد الفواتير (من الجداول التشغيلية – لا يوجد مكافئ في GL)
  invoicesCount: number
  defaultCurrency: string
  appLang: string
  // نسب التغيير الشهري (تُحسب من GL في page.tsx)
  incomeChangePct: number
  expenseChangePct: number
  profitChangePct: number
}

export default function DashboardStats({
  glRevenue,
  glCogs,
  glExpenses,
  glNetProfit,
  invoicesCount,
  defaultCurrency,
  appLang,
  incomeChangePct,
  expenseChangePct,
  profitChangePct,
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

  const currency = currencySymbols[appCurrency] || appCurrency
  const formatNumber = (n: number) => Math.round(n).toLocaleString('en-US')

  const GLBadge = () => (
    <span className="inline-block text-[10px] font-bold bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 px-1.5 py-0.5 rounded mr-1">
      ✓ GL
    </span>
  )

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">

      {/* إجمالي الإيرادات — من GL */}
      <Card className="bg-white dark:bg-slate-900 border-0 shadow-sm hover:shadow-md transition-all overflow-hidden">
        <CardContent className="p-6 relative">
          <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-blue-500/10 to-transparent rounded-bl-full" />
          <div className="flex items-center justify-between relative z-10">
            <div>
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400 flex items-center gap-1">
                <GLBadge />
                {appLang === 'en' ? 'Revenue' : 'الإيرادات'}
              </p>
              <p className="text-2xl lg:text-3xl font-bold text-gray-900 dark:text-white mt-2">{formatNumber(glRevenue)}</p>
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

      {/* تكلفة البضاعة + المصروفات — من GL */}
      <Card className="bg-white dark:bg-slate-900 border-0 shadow-sm hover:shadow-md transition-all overflow-hidden">
        <CardContent className="p-6 relative">
          <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-orange-500/10 to-transparent rounded-bl-full" />
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400 flex items-center gap-1">
                <GLBadge />
                {appLang === 'en' ? 'COGS & Expenses' : 'تكلفة + مصروفات'}
              </p>
              <p className="text-2xl lg:text-3xl font-bold text-gray-900 dark:text-white mt-2">{formatNumber(glCogs + glExpenses)}</p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                {currency}
                {glCogs > 0 && (
                  <span className="mr-1 text-orange-400">
                    · COGS: {formatNumber(glCogs)}
                  </span>
                )}
              </p>
            </div>
            <div className="p-3 bg-orange-100 dark:bg-orange-900/30 rounded-xl">
              <ShoppingCart className="w-6 h-6 text-orange-600 dark:text-orange-400" />
            </div>
          </div>
          <div className="flex items-center gap-1 mt-3">
            {expenseChangePct <= 0 ? (
              <ArrowDownRight className="w-4 h-4 text-emerald-500" />
            ) : (
              <ArrowUpRight className="w-4 h-4 text-red-500" />
            )}
            <span className={`text-sm font-medium ${expenseChangePct <= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              {expenseChangePct >= 0 ? '+' : ''}{expenseChangePct.toFixed(1)}%
            </span>
            <span className="text-xs text-gray-400 dark:text-gray-500">{appLang === 'en' ? 'vs last month' : 'عن الشهر الماضي'}</span>
          </div>
        </CardContent>
      </Card>

      {/* صافي الربح — من GL */}
      <Card className="bg-white dark:bg-slate-900 border-0 shadow-sm hover:shadow-md transition-all overflow-hidden">
        <CardContent className="p-6 relative">
          <div className={`absolute top-0 right-0 w-32 h-32 bg-gradient-to-br ${glNetProfit >= 0 ? 'from-emerald-500/10' : 'from-red-500/10'} to-transparent rounded-bl-full`} />
          <div className="flex items-center justify-between relative z-10">
            <div>
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400 flex items-center gap-1">
                <GLBadge />
                {appLang === 'en' ? 'Net Profit' : 'صافي الربح'}
              </p>
              <p className={`text-2xl lg:text-3xl font-bold mt-2 ${glNetProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                {formatNumber(glNetProfit)}
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                {currency}
                {glRevenue > 0 && (
                  <span className="mr-1">
                    · {appLang === 'en' ? 'Margin' : 'هامش'}: {((glNetProfit / glRevenue) * 100).toFixed(1)}%
                  </span>
                )}
              </p>
            </div>
            <div className={`p-3 ${glNetProfit >= 0 ? 'bg-emerald-100 dark:bg-emerald-900/30' : 'bg-red-100 dark:bg-red-900/30'} rounded-xl`}>
              <BadgeDollarSign className={`w-6 h-6 ${glNetProfit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`} />
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

      {/* عدد الفواتير — من الجداول التشغيلية */}
      <Card className="bg-white dark:bg-slate-900 border-0 shadow-sm hover:shadow-md transition-all overflow-hidden">
        <CardContent className="p-6 relative">
          <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-violet-500/10 to-transparent rounded-bl-full" />
          <div className="flex items-center justify-between relative z-10">
            <div>
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                {appLang === 'en' ? 'Invoices Count' : 'عدد الفواتير'}
              </p>
              <p className="text-2xl lg:text-3xl font-bold text-gray-900 dark:text-white mt-2">{formatNumber(invoicesCount)}</p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                {invoicesCount > 0
                  ? (appLang === 'en' ? 'invoices' : 'فاتورة')
                  : (appLang === 'en' ? 'No invoices yet' : 'لا توجد فواتير')}
              </p>
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
