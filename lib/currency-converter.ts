/**
 * Currency Converter Library
 * Handles real-time currency conversion across the ERP system
 */

import { createClient } from '@supabase/supabase-js'

export interface ConversionResult {
  originalAmount: number
  originalCurrency: string
  convertedAmount: number
  targetCurrency: string
  exchangeRate: number
  conversionDate: string
}

export interface ExchangeRate {
  from_currency: string
  to_currency: string
  rate: number
  rate_date: string
}

// Currency symbols map
export const CURRENCY_SYMBOLS: Record<string, string> = {
  EGP: '£', USD: '$', EUR: '€', GBP: '£', SAR: '﷼', AED: 'د.إ',
  KWD: 'د.ك', QAR: '﷼', BHD: 'د.ب', OMR: '﷼', JOD: 'د.أ', LBP: 'ل.ل'
}

/**
 * Get the current app currency from localStorage
 */
export function getAppCurrency(): string {
  if (typeof window === 'undefined') return 'EGP'
  try {
    return localStorage.getItem('app_currency') || 'EGP'
  } catch {
    return 'EGP'
  }
}

/**
 * Get currency symbol
 */
export function getCurrencySymbol(code: string): string {
  return CURRENCY_SYMBOLS[code] || code
}

/**
 * Fetch exchange rate from database
 */
export async function getExchangeRate(
  supabase: any,
  fromCurrency: string,
  toCurrency: string,
  companyId: string
): Promise<number> {
  if (fromCurrency === toCurrency) return 1

  // Try to get rate from database
  const { data } = await supabase
    .from('exchange_rates')
    .select('rate')
    .eq('company_id', companyId)
    .eq('from_currency', fromCurrency)
    .eq('to_currency', toCurrency)
    .order('rate_date', { ascending: false })
    .limit(1)
    .single()

  if (data?.rate) return Number(data.rate)

  // Try inverse rate
  const { data: inverseData } = await supabase
    .from('exchange_rates')
    .select('rate')
    .eq('company_id', companyId)
    .eq('from_currency', toCurrency)
    .eq('to_currency', fromCurrency)
    .order('rate_date', { ascending: false })
    .limit(1)
    .single()

  if (inverseData?.rate) return 1 / Number(inverseData.rate)

  // Fallback: fetch from API
  try {
    const res = await fetch(`https://api.exchangerate-api.com/v4/latest/${fromCurrency}`)
    const json = await res.json()
    return json.rates?.[toCurrency] || 1
  } catch {
    return 1
  }
}

/**
 * Convert amount from one currency to another
 */
export async function convertAmount(
  supabase: any,
  amount: number,
  fromCurrency: string,
  toCurrency: string,
  companyId: string
): Promise<ConversionResult> {
  const rate = await getExchangeRate(supabase, fromCurrency, toCurrency, companyId)
  
  return {
    originalAmount: amount,
    originalCurrency: fromCurrency,
    convertedAmount: amount * rate,
    targetCurrency: toCurrency,
    exchangeRate: rate,
    conversionDate: new Date().toISOString().slice(0, 10)
  }
}

/**
 * Convert multiple amounts at once
 */
export async function convertAmounts(
  supabase: any,
  items: Array<{ amount: number; currency: string }>,
  toCurrency: string,
  companyId: string
): Promise<ConversionResult[]> {
  const results: ConversionResult[] = []
  
  // Cache exchange rates to avoid multiple API calls
  const rateCache: Record<string, number> = {}
  
  for (const item of items) {
    const cacheKey = `${item.currency}_${toCurrency}`
    
    if (!rateCache[cacheKey]) {
      rateCache[cacheKey] = await getExchangeRate(supabase, item.currency, toCurrency, companyId)
    }
    
    const rate = rateCache[cacheKey]
    results.push({
      originalAmount: item.amount,
      originalCurrency: item.currency,
      convertedAmount: item.amount * rate,
      targetCurrency: toCurrency,
      exchangeRate: rate,
      conversionDate: new Date().toISOString().slice(0, 10)
    })
  }
  
  return results
}

/**
 * Format amount with currency symbol
 */
export function formatCurrency(amount: number, currencyCode: string, locale: string = 'ar-EG'): string {
  const symbol = getCurrencySymbol(currencyCode)
  const formatted = new Intl.NumberFormat(locale, { 
    minimumFractionDigits: 2, 
    maximumFractionDigits: 2 
  }).format(amount)
  return `${formatted} ${symbol}`
}

