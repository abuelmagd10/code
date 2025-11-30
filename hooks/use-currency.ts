/**
 * Currency Hook
 * Provides currency conversion and formatting utilities for React components
 */

'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSupabase } from '@/lib/supabase/hooks'
import { getActiveCompanyId } from '@/lib/company'
import { 
  getAppCurrency, 
  getCurrencySymbol, 
  getExchangeRate, 
  convertAmount,
  formatCurrency,
  CURRENCY_SYMBOLS 
} from '@/lib/currency-converter'

export interface UseCurrencyResult {
  appCurrency: string
  currencySymbol: string
  isLoading: boolean
  convert: (amount: number, fromCurrency: string) => Promise<number>
  format: (amount: number, currency?: string) => string
  getRate: (fromCurrency: string) => Promise<number>
  refresh: () => void
}

export function useCurrency(): UseCurrencyResult {
  const supabase = useSupabase()
  const [appCurrency, setAppCurrency] = useState<string>('EGP')
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [rateCache, setRateCache] = useState<Record<string, number>>({})

  // Load currency settings
  useEffect(() => {
    const loadSettings = async () => {
      setIsLoading(true)
      try {
        const currency = getAppCurrency()
        setAppCurrency(currency)
        
        const cid = await getActiveCompanyId(supabase)
        setCompanyId(cid)
      } finally {
        setIsLoading(false)
      }
    }
    
    loadSettings()

    // Listen for currency changes
    const handleCurrencyChange = () => {
      const newCurrency = getAppCurrency()
      setAppCurrency(newCurrency)
      setRateCache({}) // Clear cache when currency changes
    }

    window.addEventListener('app_currency_changed', handleCurrencyChange)
    window.addEventListener('storage', (e) => {
      if (e.key === 'app_currency') handleCurrencyChange()
    })

    return () => {
      window.removeEventListener('app_currency_changed', handleCurrencyChange)
    }
  }, [supabase])

  // Get exchange rate
  const getRate = useCallback(async (fromCurrency: string): Promise<number> => {
    if (fromCurrency === appCurrency) return 1
    
    const cacheKey = `${fromCurrency}_${appCurrency}`
    if (rateCache[cacheKey]) return rateCache[cacheKey]

    if (!companyId) return 1

    const rate = await getExchangeRate(supabase, fromCurrency, appCurrency, companyId)
    setRateCache(prev => ({ ...prev, [cacheKey]: rate }))
    return rate
  }, [supabase, appCurrency, companyId, rateCache])

  // Convert amount
  const convert = useCallback(async (amount: number, fromCurrency: string): Promise<number> => {
    if (!amount || fromCurrency === appCurrency) return amount
    const rate = await getRate(fromCurrency)
    return amount * rate
  }, [appCurrency, getRate])

  // Format amount with currency
  const format = useCallback((amount: number, currency?: string): string => {
    const curr = currency || appCurrency
    return formatCurrency(amount, curr)
  }, [appCurrency])

  // Refresh rates
  const refresh = useCallback(() => {
    setRateCache({})
  }, [])

  return {
    appCurrency,
    currencySymbol: getCurrencySymbol(appCurrency),
    isLoading,
    convert,
    format,
    getRate,
    refresh
  }
}

/**
 * Simple hook to just get the current app currency
 */
export function useAppCurrency(): { currency: string; symbol: string } {
  const [currency, setCurrency] = useState<string>('EGP')

  useEffect(() => {
    setCurrency(getAppCurrency())
    
    const handleChange = () => setCurrency(getAppCurrency())
    window.addEventListener('app_currency_changed', handleChange)
    return () => window.removeEventListener('app_currency_changed', handleChange)
  }, [])

  return {
    currency,
    symbol: getCurrencySymbol(currency)
  }
}

