/**
 * Exchange Rates Management Library
 * نظام إدارة أسعار الصرف المتعدد العملات
 */

import { SupabaseClient } from '@supabase/supabase-js'

// Custom error for exchange rate failures
export class ExchangeRateError extends Error {
  constructor(
    public code: 'RATE_TOO_OLD' | 'NO_RATE_AVAILABLE' | 'API_FAILED',
    message: string,
    public staleRate?: number,
    public rateDate?: string,
    public daysOld?: number
  ) {
    super(message)
    this.name = 'ExchangeRateError'
  }
}

// Currency definitions with symbols and names
export const CURRENCIES: Record<string, { symbol: string; nameEn: string; nameAr: string; decimals: number }> = {
  EGP: { symbol: '£', nameEn: 'Egyptian Pound', nameAr: 'الجنيه المصري', decimals: 2 },
  USD: { symbol: '$', nameEn: 'US Dollar', nameAr: 'الدولار الأمريكي', decimals: 2 },
  EUR: { symbol: '€', nameEn: 'Euro', nameAr: 'اليورو', decimals: 2 },
  GBP: { symbol: '£', nameEn: 'British Pound', nameAr: 'الجنيه الإسترليني', decimals: 2 },
  SAR: { symbol: '﷼', nameEn: 'Saudi Riyal', nameAr: 'الريال السعودي', decimals: 2 },
  AED: { symbol: 'د.إ', nameEn: 'UAE Dirham', nameAr: 'الدرهم الإماراتي', decimals: 2 },
  KWD: { symbol: 'د.ك', nameEn: 'Kuwaiti Dinar', nameAr: 'الدينار الكويتي', decimals: 3 },
  QAR: { symbol: '﷼', nameEn: 'Qatari Riyal', nameAr: 'الريال القطري', decimals: 2 },
  BHD: { symbol: 'د.ب', nameEn: 'Bahraini Dinar', nameAr: 'الدينار البحريني', decimals: 3 },
  OMR: { symbol: '﷼', nameEn: 'Omani Rial', nameAr: 'الريال العماني', decimals: 3 },
  JOD: { symbol: 'د.أ', nameEn: 'Jordanian Dinar', nameAr: 'الدينار الأردني', decimals: 3 },
  LBP: { symbol: 'ل.ل', nameEn: 'Lebanese Pound', nameAr: 'الليرة اللبنانية', decimals: 2 },
}

export interface ExchangeRate {
  id?: string
  company_id: string
  from_currency: string
  to_currency: string
  rate: number
  rate_date: string
  source: 'manual' | 'api' | 'exchangerate-api'
}

// Get the base currency from localStorage or default
export function getBaseCurrency(): string {
  if (typeof window === 'undefined') return 'EGP'
  try {
    return localStorage.getItem('app_currency') || 'EGP'
  } catch {
    return 'EGP'
  }
}

// Get currency symbol
export function getCurrencySymbol(code: string): string {
  return CURRENCIES[code]?.symbol || code
}

// Get currency name
export function getCurrencyName(code: string, lang: 'en' | 'ar' = 'ar'): string {
  const currency = CURRENCIES[code]
  if (!currency) return code
  return lang === 'en' ? currency.nameEn : currency.nameAr
}

// Format amount with currency
export function formatCurrency(amount: number, currencyCode: string, lang: 'en' | 'ar' = 'ar'): string {
  const decimals = CURRENCIES[currencyCode]?.decimals || 2
  const symbol = getCurrencySymbol(currencyCode)
  const formatted = amount.toFixed(decimals)
  return lang === 'ar' ? `${formatted} ${symbol}` : `${symbol}${formatted}`
}

// Convert amount between currencies
export function convertAmount(amount: number, exchangeRate: number): number {
  return Number((amount * exchangeRate).toFixed(8))
}

// Fetch exchange rate from API (free API)
export async function fetchExchangeRateFromAPI(
  fromCurrency: string,
  toCurrency: string
): Promise<number | null> {
  try {
    // Using exchangerate-api.com free tier
    const response = await fetch(
      `https://api.exchangerate-api.com/v4/latest/${fromCurrency}`
    )
    if (!response.ok) return null
    const data = await response.json()
    return data.rates?.[toCurrency] || null
  } catch (error) {
    console.error('Error fetching exchange rate:', error)
    return null
  }
}

// Get exchange rate from database or API
export async function getExchangeRate(
  supabase: SupabaseClient,
  companyId: string,
  fromCurrency: string,
  toCurrency: string,
  date?: string
): Promise<number> {
  // Same currency = 1
  if (fromCurrency === toCurrency) return 1

  const targetDate = date || new Date().toISOString().slice(0, 10)

  // Helper: check staleness of a rate relative to targetDate.
  // Returns the rate if usable, throws RATE_TOO_OLD if too old.
  const STALE_WARN_DAYS = 1   // > 24 hours → warn
  const STALE_ERROR_DAYS = 7  // > 7 days → throw
  const evaluateRate = (rate: number, rateDate: string, direction: 'direct' | 'reverse'): number => {
    const daysOld = Math.floor(
      (new Date(targetDate).getTime() - new Date(rateDate).getTime()) / (1000 * 60 * 60 * 24)
    )
    const finalRate = direction === 'reverse' ? 1 / rate : rate
    // Note: daysOld uses Math.floor, so daysOld=0 means "<24h", daysOld=1 means "24-48h", etc.
    // Use >= for warn so a 25-hour-old rate (daysOld=1) triggers the warning,
    // matching the documented "1 day or older" threshold.
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
        `[exchange-rates] aged_rate_used: ${fromCurrency}→${toCurrency} rate=${finalRate} ` +
        `from ${rateDate} (${daysOld} days old, threshold=${STALE_WARN_DAYS})`
      )
    }
    return finalRate
  }

  // Try to get from database first
  const { data: dbRate } = await supabase
    .from('exchange_rates')
    .select('rate, rate_date')
    .eq('company_id', companyId)
    .eq('from_currency', fromCurrency)
    .eq('to_currency', toCurrency)
    .lte('rate_date', targetDate)
    .order('rate_date', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (dbRate?.rate && dbRate.rate_date) {
    return evaluateRate(Number(dbRate.rate), dbRate.rate_date, 'direct')
  }

  // Try reverse rate
  const { data: reverseRate } = await supabase
    .from('exchange_rates')
    .select('rate, rate_date')
    .eq('company_id', companyId)
    .eq('from_currency', toCurrency)
    .eq('to_currency', fromCurrency)
    .lte('rate_date', targetDate)
    .order('rate_date', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (reverseRate?.rate && reverseRate.rate_date) {
    return evaluateRate(Number(reverseRate.rate), reverseRate.rate_date, 'reverse')
  }

  // Fetch from API as fallback
  const apiRate = await fetchExchangeRateFromAPI(fromCurrency, toCurrency)
  if (apiRate) {
    // Save to database for future use
    await saveExchangeRate(supabase, companyId, fromCurrency, toCurrency, apiRate, 'api')
    return apiRate
  }

  // API failed — try stale rate (any date, no upper bound)
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
      (new Date(targetDate).getTime() - new Date(staleRecord.rate_date).getTime()) / (1000 * 60 * 60 * 24)
    )

    if (daysOld <= 7) {
      console.warn(
        `[exchange-rates] stale_rate_used: ${fromCurrency}→${toCurrency} rate=${staleRecord.rate} ` +
        `from ${staleRecord.rate_date} (${daysOld} days old)`
      )
      return Number(staleRecord.rate)
    }

    // Rate too old — let the caller decide
    throw new ExchangeRateError(
      'RATE_TOO_OLD',
      `سعر الصرف ${fromCurrency}→${toCurrency} قديم (${daysOld} يوم). آخر سعر معروف: ${staleRecord.rate} بتاريخ ${staleRecord.rate_date}`,
      Number(staleRecord.rate),
      staleRecord.rate_date,
      daysOld
    )
  }

  // No rate exists at all
  throw new ExchangeRateError(
    'NO_RATE_AVAILABLE',
    `لا يوجد سعر صرف لـ ${fromCurrency}→${toCurrency}. يرجى إدخال السعر يدوياً من إعدادات أسعار الصرف.`
  )
}

// Save exchange rate to database (insert; duplicate same-day rate is ignored to avoid 400 from upsert constraint mismatch)
export async function saveExchangeRate(
  supabase: SupabaseClient,
  companyId: string,
  fromCurrency: string,
  toCurrency: string,
  rate: number,
  source: 'manual' | 'api' = 'manual'
): Promise<boolean> {
  const rateDate = new Date().toISOString().slice(0, 10)
  const { error } = await supabase.from('exchange_rates').insert({
    company_id: companyId,
    from_currency: fromCurrency,
    to_currency: toCurrency,
    rate,
    rate_date: rateDate,
    rate_timestamp: new Date().toISOString(),
    source,
    source_detail: source === 'api' ? 'exchangerate-api.com' : undefined,
    is_manual_override: source === 'manual',
  })
  if (error && (error as { code?: string }).code !== '23505') return false
  return true
}

