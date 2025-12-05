"use client"

import { useEffect, useState } from "react"

// Currency symbol mapping
export const currencySymbols: Record<string, string> = {
  EGP: '£', USD: '$', EUR: '€', GBP: '£', SAR: '﷼', AED: 'د.إ',
  KWD: 'د.ك', QAR: '﷼', BHD: 'د.ب', OMR: '﷼', JOD: 'د.أ', LBP: 'ل.ل'
}

// Helper function to get the display amount based on current currency
export function getDisplayAmount(
  originalAmount: number,
  displayAmount: number | null | undefined,
  displayCurrency: string | null | undefined,
  currentCurrency: string
): number {
  if (displayAmount != null && displayCurrency === currentCurrency) {
    return displayAmount
  }
  return originalAmount
}

interface DashboardAmountsProps {
  originalAmount: number
  displayAmount?: number | null
  displayCurrency?: string | null
  displayRate?: number | null
  defaultCurrency: string
  appLang: string
  showOriginal?: boolean
  className?: string
}

export default function DashboardAmounts({
  originalAmount,
  displayAmount,
  displayCurrency,
  displayRate,
  defaultCurrency,
  appLang,
  showOriginal = true,
  className = ""
}: DashboardAmountsProps) {
  const [appCurrency, setAppCurrency] = useState(defaultCurrency)

  useEffect(() => {
    // Get current app currency from localStorage
    const storedCurrency = localStorage.getItem('app_currency')
    if (storedCurrency) {
      setAppCurrency(storedCurrency)
    }

    // Listen for currency changes
    const handleCurrencyChange = () => {
      const newCurrency = localStorage.getItem('app_currency')
      if (newCurrency) {
        setAppCurrency(newCurrency)
      }
    }

    window.addEventListener('app_currency_changed', handleCurrencyChange)
    return () => window.removeEventListener('app_currency_changed', handleCurrencyChange)
  }, [])

  // Get the appropriate amount
  const amount = getDisplayAmount(originalAmount, displayAmount, displayCurrency, appCurrency)
  const symbol = currencySymbols[appCurrency] || appCurrency
  const originalSymbol = currencySymbols[defaultCurrency] || defaultCurrency
  const shouldShowOriginal = showOriginal && displayCurrency === appCurrency && displayAmount != null

  const formatNumber = (n: number) => n.toLocaleString(appLang === 'en' ? 'en' : 'ar')

  return (
    <span className={className}>
      <span className="font-bold">{formatNumber(amount)}</span>
      <span className="text-xs text-gray-400 dark:text-gray-500 mr-1">{symbol}</span>
      {shouldShowOriginal && (
        <span className="text-xs text-gray-400 dark:text-gray-500 block">
          ({formatNumber(originalAmount)} {originalSymbol})
        </span>
      )}
    </span>
  )
}

// Helper component for simple amount display with currency
export function CurrencyAmount({
  amount,
  currency,
  appLang,
  className = ""
}: {
  amount: number
  currency: string
  appLang: string
  className?: string
}) {
  const symbol = currencySymbols[currency] || currency
  const formatNumber = (n: number) => n.toLocaleString(appLang === 'en' ? 'en' : 'ar')

  return (
    <span className={className}>
      {formatNumber(amount)} {symbol}
    </span>
  )
}

