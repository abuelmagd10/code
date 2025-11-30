"use client"

import { useEffect, useState, useMemo } from "react"
import DashboardCharts from "./DashboardCharts"
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
}

export default function DashboardChartsWrapper({
  monthlyData,
  defaultCurrency,
  appLang
}: DashboardChartsWrapperProps) {
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

  // Recalculate monthly data with currency conversion
  const convertedMonthlyData = useMemo(() => {
    return monthlyData.map(item => ({
      month: item.month,
      revenue: getDisplayAmount(item.revenue, item.display_revenue, item.display_currency, appCurrency),
      expense: getDisplayAmount(item.expense, item.display_expense, item.display_currency, appCurrency)
    }))
  }, [monthlyData, appCurrency])

  return (
    <DashboardCharts
      monthlyData={convertedMonthlyData}
      currency={currency}
      appLang={appLang}
    />
  )
}

