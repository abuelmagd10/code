/**
 * Enhanced Dashboard Stats with Memoization
 * 
 * Provides dashboard statistics with intelligent caching and memoization
 * to improve performance and reduce unnecessary recalculations.
 */

"use client"

import { useEffect, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { TrendingUp, TrendingDown, ShoppingCart, BadgeDollarSign, FileText, ArrowUpRight, ArrowDownRight, RefreshCw, Clock } from "lucide-react"
import { currencySymbols, getDisplayAmount } from "./DashboardAmounts"
import { useMemo } from "react"

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

interface DashboardStatsEnhancedProps {
  invoicesData: Invoice[]
  billsData: Bill[]
  defaultCurrency: string
  appLang: string
  incomeChangePct: number
  expenseChangePct: number
  profitChangePct: number
  totalCOGS?: number // تكلفة البضاعة المباعة الفعلية
  totalShipping?: number // إجمالي مصاريف الشحن
  cacheInfo?: {
    isCached: boolean
    cachedAt?: number
  }
  onRefresh?: () => void
  isLoading?: boolean
}

export default function DashboardStatsEnhanced({
  invoicesData,
  billsData,
  defaultCurrency,
  appLang,
  incomeChangePct,
  expenseChangePct,
  profitChangePct,
  totalCOGS = 0,
  totalShipping = 0,
  cacheInfo,
  onRefresh,
  isLoading = false
}: DashboardStatsEnhancedProps) {
  const [appCurrency, setAppCurrency] = useState(defaultCurrency)
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date())

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

  // Simple format function for cache time
  const formatCacheTime = (timestamp: number): string => {
    const now = Date.now()
    const diff = now - timestamp
    const minutes = Math.floor(diff / 60000)

    if (minutes < 1) return appLang === 'en' ? 'just now' : 'الآن'
    if (minutes < 60) return `${minutes} ${appLang === 'en' ? 'min ago' : 'دقيقة مضت'}`

    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours} ${appLang === 'en' ? 'hour ago' : 'ساعة مضت'}`

    const days = Math.floor(hours / 24)
    return `${days} ${appLang === 'en' ? 'day ago' : 'يوم مضت'}`
  }

  // Memoized calculations to prevent unnecessary recalculations
  const totalSales = useMemo(
    () => invoicesData.reduce((sum, inv) => {
      const amount = getDisplayAmount(inv.total_amount || 0, inv.display_total, inv.display_currency, appCurrency)
      return sum + amount
    }, 0),
    [invoicesData, appCurrency]
  )

  const totalPurchases = useMemo(
    () => billsData.reduce((sum, bill) => {
      const amount = getDisplayAmount(bill.total_amount || 0, bill.display_total, bill.display_currency, appCurrency)
      return sum + amount
    }, 0),
    [billsData, appCurrency]
  )

  const totalExpenses = useMemo(
    () => totalCOGS > 0 ? (totalCOGS + totalShipping) : totalPurchases,
    [totalCOGS, totalShipping, totalPurchases]
  )

  const expectedProfit = useMemo(
    () => totalSales - totalExpenses,
    [totalSales, totalExpenses]
  )

  const invoicesCount = useMemo(
    () => invoicesData.length,
    [invoicesData.length]
  )

  // Update last updated time when data changes
  useEffect(() => {
    setLastUpdated(new Date())
  }, [invoicesData, billsData])

  const currency = currencySymbols[appCurrency] || appCurrency
  const formatNumber = (n: number) => n.toLocaleString('en-US')

  const renderTrendIndicator = (percentage: number, label: string) => {
    const isPositive = percentage >= 0
    const Icon = isPositive ? ArrowUpRight : ArrowDownRight
    const colorClass = isPositive ? 'text-green-600' : 'text-red-600'
    const bgClass = isPositive ? 'bg-green-100' : 'bg-red-100'

    return (
      <div className={`flex items-center gap-1 px-2 py-1 rounded-lg ${bgClass}`}>
        <Icon className={`w-3 h-3 ${colorClass}`} />
        <span className={`text-xs font-medium ${colorClass}`}>
          {isPositive ? '+' : ''}{percentage.toFixed(1)}%
        </span>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Cache Status Bar */}
      {cacheInfo?.isCached && (
        <div className="flex items-center justify-between p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-blue-600" />
            <span className="text-sm text-blue-700 dark:text-blue-300">
              {appLang === 'en' ? 'Data cached' : 'البيانات مخزنة مؤقتاً'}
            </span>
          </div>
          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={isLoading}
              className="flex items-center gap-1 px-3 py-1 text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-md hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`} />
              {appLang === 'en' ? 'Refresh' : 'تحديث'}
            </button>
          )}
        </div>
      )}

      {/* Stats Grid */}
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
                <TrendingUp className="w-6 h-6 text-blue-600" />
              </div>
            </div>
            {incomeChangePct !== 0 && (
              <div className="mt-3 relative z-10">
                {renderTrendIndicator(incomeChangePct, appLang === 'en' ? 'vs last month' : 'مقارنة بالشهر الماضي')}
              </div>
            )}
          </CardContent>
        </Card>

        {/* إجمالي المشتريات */}
        <Card className="bg-white dark:bg-slate-900 border-0 shadow-sm hover:shadow-md transition-all overflow-hidden">
          <CardContent className="p-6 relative">
            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-orange-500/10 to-transparent rounded-bl-full" />
            <div className="flex items-center justify-between relative z-10">
              <div>
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                  {appLang === 'en' ? 'Total Purchases' : 'إجمالي المشتريات'}
                </p>
                <p className="text-2xl lg:text-3xl font-bold text-gray-900 dark:text-white mt-2">{formatNumber(totalPurchases)}</p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{currency}</p>
              </div>
              <div className="p-3 bg-orange-100 dark:bg-orange-900/30 rounded-xl">
                <ShoppingCart className="w-6 h-6 text-orange-600" />
              </div>
            </div>
            {expenseChangePct !== 0 && (
              <div className="mt-3 relative z-10">
                {renderTrendIndicator(expenseChangePct, appLang === 'en' ? 'vs last month' : 'مقارنة بالشهر الماضي')}
              </div>
            )}
          </CardContent>
        </Card>

        {/* الربح المتوقع */}
        <Card className="bg-white dark:bg-slate-900 border-0 shadow-sm hover:shadow-md transition-all overflow-hidden">
          <CardContent className="p-6 relative">
            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-green-500/10 to-transparent rounded-bl-full" />
            <div className="flex items-center justify-between relative z-10">
              <div>
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                  {appLang === 'en' ? 'Expected Profit' : 'الربح المتوقع'}
                </p>
                <p className="text-2xl lg:text-3xl font-bold text-gray-900 dark:text-white mt-2">{formatNumber(expectedProfit)}</p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{currency}</p>
              </div>
              <div className="p-3 bg-green-100 dark:bg-green-900/30 rounded-xl">
                <BadgeDollarSign className="w-6 h-6 text-green-600" />
              </div>
            </div>
            {profitChangePct !== 0 && (
              <div className="mt-3 relative z-10">
                {renderTrendIndicator(profitChangePct, appLang === 'en' ? 'vs last month' : 'مقارنة بالشهر الماضي')}
              </div>
            )}
          </CardContent>
        </Card>

        {/* عدد الفواتير */}
        <Card className="bg-white dark:bg-slate-900 border-0 shadow-sm hover:shadow-md transition-all overflow-hidden">
          <CardContent className="p-6 relative">
            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-purple-500/10 to-transparent rounded-bl-full" />
            <div className="flex items-center justify-between relative z-10">
              <div>
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                  {appLang === 'en' ? 'Invoices Count' : 'عدد الفواتير'}
                </p>
                <p className="text-2xl lg:text-3xl font-bold text-gray-900 dark:text-white mt-2">{formatNumber(invoicesCount)}</p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                  {appLang === 'en' ? 'invoice' : 'فاتورة'}{invoicesCount !== 1 ? (appLang === 'en' ? 's' : 'ات') : ''}
                </p>
              </div>
              <div className="p-3 bg-purple-100 dark:bg-purple-900/30 rounded-xl">
                <FileText className="w-6 h-6 text-purple-600" />
              </div>
            </div>
            {incomeChangePct !== 0 && (
              <div className="mt-3 relative z-10">
                {renderTrendIndicator(incomeChangePct, appLang === 'en' ? 'vs last month' : 'مقارنة بالشهر الماضي')}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Last Updated Indicator */}
      <div className="flex items-center justify-end text-xs text-gray-500 dark:text-gray-400">
        <Clock className="w-3 h-3 mr-1" />
        {appLang === 'en' ? 'Last updated' : 'آخر تحديث'}: {formatCacheTime(lastUpdated.getTime())}
      </div>
    </div>
  )
}