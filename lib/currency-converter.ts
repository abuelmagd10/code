/**
 * Currency Converter Library
 * Handles real-time currency conversion across the ERP system
 */

import { createClient } from '@supabase/supabase-js'
import { ExchangeRateError } from './exchange-rates'

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

  // Helper: check staleness of a rate relative to today.
  // < 24h: silent, 1-7 days: warn, > 7 days: throw RATE_TOO_OLD
  const STALE_WARN_DAYS = 1
  const STALE_ERROR_DAYS = 7
  const today = new Date().toISOString().slice(0, 10)
  const evaluateRate = (rate: number, rateDate: string, direction: 'direct' | 'reverse'): number => {
    const daysOld = Math.floor(
      (new Date(today).getTime() - new Date(rateDate).getTime()) / (1000 * 60 * 60 * 24)
    )
    const finalRate = direction === 'reverse' ? 1 / rate : rate
    // Math.floor gives daysOld=0 for "<24h", daysOld=1 for "24-48h", etc.
    // Use >= for warn so a 25h-old rate triggers, matching the "1 day or older" threshold.
    if (daysOld > STALE_ERROR_DAYS) {
      throw new ExchangeRateError(
        'RATE_TOO_OLD',
        `سعر الصرف ${fromCurrency}→${toCurrency} قديم (${daysOld} يوم). آخر سعر معروف: ${finalRate.toFixed(6)} بتاريخ ${rateDate}`,
        finalRate,
        rateDate,
        daysOld
      )
    }
    if (daysOld >= STALE_WARN_DAYS) {
      console.warn(
        `[currency-converter] aged_rate_used: ${fromCurrency}→${toCurrency} rate=${finalRate} ` +
        `from ${rateDate} (${daysOld} days old, threshold=${STALE_WARN_DAYS})`
      )
    }
    return finalRate
  }

  // Try to get rate from database
  const { data } = await supabase
    .from('exchange_rates')
    .select('rate, rate_date')
    .eq('company_id', companyId)
    .eq('from_currency', fromCurrency)
    .eq('to_currency', toCurrency)
    .order('rate_date', { ascending: false })
    .limit(1)
    .single()

  if (data?.rate && data?.rate_date) {
    return evaluateRate(Number(data.rate), data.rate_date, 'direct')
  }

  // Try inverse rate
  const { data: inverseData } = await supabase
    .from('exchange_rates')
    .select('rate, rate_date')
    .eq('company_id', companyId)
    .eq('from_currency', toCurrency)
    .eq('to_currency', fromCurrency)
    .order('rate_date', { ascending: false })
    .limit(1)
    .single()

  if (inverseData?.rate && inverseData?.rate_date) {
    return evaluateRate(Number(inverseData.rate), inverseData.rate_date, 'reverse')
  }

  // Fallback: fetch from API
  try {
    const res = await fetch(`https://api.exchangerate-api.com/v4/latest/${fromCurrency}`)
    const json = await res.json()
    const apiRate = json.rates?.[toCurrency]
    if (apiRate) return apiRate
  } catch {
    // API failed — fall through to stale rate check
  }

  // API failed — try stale rate from DB (any date, no upper bound)
  const { data: staleDirect } = await supabase
    .from('exchange_rates')
    .select('rate, rate_date')
    .eq('company_id', companyId)
    .eq('from_currency', fromCurrency)
    .eq('to_currency', toCurrency)
    .order('rate_date', { ascending: false })
    .limit(1)
    .maybeSingle()

  const staleRecord = staleDirect
    || await (async () => {
      const { data: staleReverse } = await supabase
        .from('exchange_rates')
        .select('rate, rate_date')
        .eq('company_id', companyId)
        .eq('from_currency', toCurrency)
        .eq('to_currency', fromCurrency)
        .order('rate_date', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (staleReverse?.rate) {
        return { rate: 1 / Number(staleReverse.rate), rate_date: staleReverse.rate_date }
      }
      return null
    })()

  if (staleRecord?.rate) {
    const daysOld = Math.floor(
      (new Date(today).getTime() - new Date(staleRecord.rate_date).getTime()) / (1000 * 60 * 60 * 24)
    )

    if (daysOld <= 7) {
      console.warn(
        `[currency-converter] stale_rate_used: ${fromCurrency}→${toCurrency} ` +
        `rate=${staleRecord.rate} from ${staleRecord.rate_date} (${daysOld} days old)`
      )
      return Number(staleRecord.rate)
    }

    throw new ExchangeRateError(
      'RATE_TOO_OLD',
      `سعر الصرف ${fromCurrency}→${toCurrency} قديم (${daysOld} يوم). آخر سعر معروف: ${staleRecord.rate} بتاريخ ${staleRecord.rate_date}`,
      Number(staleRecord.rate),
      staleRecord.rate_date,
      daysOld
    )
  }

  throw new ExchangeRateError(
    'NO_RATE_AVAILABLE',
    `لا يوجد سعر صرف لـ ${fromCurrency}→${toCurrency}. يرجى إدخال السعر يدوياً من إعدادات أسعار الصرف.`
  )
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

