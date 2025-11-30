/**
 * Exchange Rates Management Library
 * نظام إدارة أسعار الصرف المتعدد العملات
 */

import { SupabaseClient } from '@supabase/supabase-js'

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

  // Try to get from database first
  const { data: dbRate } = await supabase
    .from('exchange_rates')
    .select('rate')
    .eq('company_id', companyId)
    .eq('from_currency', fromCurrency)
    .eq('to_currency', toCurrency)
    .lte('rate_date', targetDate)
    .order('rate_date', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (dbRate?.rate) {
    return Number(dbRate.rate)
  }

  // Try reverse rate
  const { data: reverseRate } = await supabase
    .from('exchange_rates')
    .select('rate')
    .eq('company_id', companyId)
    .eq('from_currency', toCurrency)
    .eq('to_currency', fromCurrency)
    .lte('rate_date', targetDate)
    .order('rate_date', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (reverseRate?.rate) {
    return 1 / Number(reverseRate.rate)
  }

  // Fetch from API as fallback
  const apiRate = await fetchExchangeRateFromAPI(fromCurrency, toCurrency)
  if (apiRate) {
    // Save to database for future use
    await saveExchangeRate(supabase, companyId, fromCurrency, toCurrency, apiRate, 'api')
    return apiRate
  }

  return 1 // Default to 1 if all else fails
}

// Save exchange rate to database
export async function saveExchangeRate(
  supabase: SupabaseClient,
  companyId: string,
  fromCurrency: string,
  toCurrency: string,
  rate: number,
  source: 'manual' | 'api' = 'manual'
): Promise<boolean> {
  const { error } = await supabase.from('exchange_rates').upsert({
    company_id: companyId,
    from_currency: fromCurrency,
    to_currency: toCurrency,
    rate,
    rate_date: new Date().toISOString().slice(0, 10),
    source,
  }, {
    onConflict: 'company_id,from_currency,to_currency,rate_date'
  })
  return !error
}

