"use client"

import { useEffect, useState, useMemo } from "react"
import DashboardCharts from "./DashboardCharts"
import DateRangeFilter from "./DateRangeFilter"
import { currencySymbols, getDisplayAmount } from "../DashboardAmounts"

interface MonthlyDataItem {
  month: string
  revenue: number
  expense: number
  display_revenue?: number | null
  display_expense?: number | null
  display_currency?: string | null
}

interface DashboardChartsWrapperProps {
  monthlyData: MonthlyDataItem[]
  defaultCurrency: string
  appLang: string
  showDateFilter?: boolean
}

export default function DashboardChartsWrapper({
  monthlyData,
  defaultCurrency,
  appLang,
  showDateFilter = true
}: DashboardChartsWrapperProps) {
  const [appCurrency, setAppCurrency] = useState(defaultCurrency)
  const [chartType, setChartType] = useState<'bar' | 'area' | 'composed'>('composed')

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

  // Recalculate monthly data with currency conversion
  const convertedMonthlyData = useMemo(() => {
    return monthlyData.map(item => ({
      month: item.month,
      revenue: getDisplayAmount(item.revenue, item.display_revenue, item.display_currency, appCurrency),
      expense: getDisplayAmount(item.expense, item.display_expense, item.display_currency, appCurrency)
    }))
  }, [monthlyData, appCurrency])

  const L = appLang === 'en' ? {
    chartType: 'Chart Type',
    bar: 'Bar',
    area: 'Area',
    composed: 'Combined'
  } : {
    chartType: 'نوع الرسم',
    bar: 'أعمدة',
    area: 'مساحة',
    composed: 'مدمج'
  }

  return (
    <div className="space-y-4">
      {/* Chart Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-gray-100 dark:border-slate-800">
        {/* Date Filter */}
        {showDateFilter && (
          <DateRangeFilter appLang={appLang as 'ar' | 'en'} />
        )}

        {/* Chart Type Selector */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500 dark:text-gray-400">{L.chartType}:</span>
          <div className="flex bg-gray-100 dark:bg-slate-800 rounded-lg p-1">
            {(['bar', 'area', 'composed'] as const).map((type) => (
              <button
                key={type}
                onClick={() => setChartType(type)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all duration-200 ${
                  chartType === type
                    ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                }`}
              >
                {L[type]}
              </button>
            ))}
          </div>
        </div>
      </div>

      <DashboardCharts
        monthlyData={convertedMonthlyData}
        currency={currency}
        appLang={appLang}
        chartType={chartType}
      />
    </div>
  )
}

