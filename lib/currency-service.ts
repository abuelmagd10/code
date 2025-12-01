/**
 * Professional Currency Service for Multi-Currency ERP
 * 
 * This service handles:
 * - Currency conversion with historical rates
 * - Exchange rate fetching and caching
 * - FX Gain/Loss calculations
 * - Rate source tracking (API/manual)
 */

import { SupabaseClient } from '@supabase/supabase-js'

// Types
export interface Currency {
  id: string
  code: string
  name: string
  name_ar?: string
  symbol: string
  decimals: number
  is_active: boolean
  is_base: boolean
}

export interface ExchangeRate {
  id: string
  from_currency: string
  to_currency: string
  rate: number
  rate_date: string
  rate_timestamp?: string
  source: string
  source_detail?: string
  is_manual_override: boolean
  override_reason?: string
  company_id?: string
}

export interface ConversionResult {
  original_amount: number
  original_currency: string
  converted_amount: number
  target_currency: string
  exchange_rate: number
  exchange_rate_id?: string
  rate_source: string
  rate_date: string
}

// Cache for exchange rates (valid for 60 seconds)
const rateCache: Map<string, { rate: number; timestamp: number; rateId?: string }> = new Map()
const CACHE_TTL = 60 * 1000 // 60 seconds

/**
 * Get the base currency for a company
 */
export async function getBaseCurrency(supabase: SupabaseClient, companyId?: string): Promise<string> {
  try {
    const query = supabase.from('currencies').select('code').eq('is_base', true)
    if (companyId) query.eq('company_id', companyId)
    const { data } = await query.limit(1).single()
    return data?.code || 'EGP'
  } catch {
    return 'EGP'
  }
}

/**
 * Get all active currencies
 */
export async function getActiveCurrencies(supabase: SupabaseClient, companyId?: string): Promise<Currency[]> {
  try {
    const query = supabase.from('currencies').select('*').eq('is_active', true)
    if (companyId) query.eq('company_id', companyId)
    const { data } = await query.order('is_base', { ascending: false })
    return data || []
  } catch {
    return []
  }
}

/**
 * Get exchange rate from database or API
 */
export async function getExchangeRate(
  supabase: SupabaseClient,
  fromCurrency: string,
  toCurrency: string,
  date?: Date,
  companyId?: string
): Promise<{ rate: number; rateId?: string; source: string }> {
  // Same currency = rate 1
  if (fromCurrency === toCurrency) {
    return { rate: 1, source: 'same_currency' }
  }

  const cacheKey = `${fromCurrency}_${toCurrency}_${date?.toISOString().split('T')[0] || 'latest'}`
  const cached = rateCache.get(cacheKey)
  
  // Return cached rate if valid
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return { rate: cached.rate, rateId: cached.rateId, source: 'cache' }
  }

  // Try to get from database first
  const dbRate = await getRateFromDatabase(supabase, fromCurrency, toCurrency, date, companyId)
  if (dbRate) {
    rateCache.set(cacheKey, { rate: dbRate.rate, timestamp: Date.now(), rateId: dbRate.id })
    return { rate: dbRate.rate, rateId: dbRate.id, source: 'database' }
  }

  // Fallback to API
  const apiRate = await fetchRateFromAPI(fromCurrency, toCurrency)
  if (apiRate) {
    // Save to database for history
    const savedRate = await saveExchangeRate(supabase, fromCurrency, toCurrency, apiRate, 'api', companyId)
    rateCache.set(cacheKey, { rate: apiRate, timestamp: Date.now(), rateId: savedRate?.id })
    return { rate: apiRate, rateId: savedRate?.id, source: 'api' }
  }

  throw new Error(`Exchange rate not found for ${fromCurrency} to ${toCurrency}`)
}

/**
 * Get rate from database (historical or latest)
 */
async function getRateFromDatabase(
  supabase: SupabaseClient,
  fromCurrency: string,
  toCurrency: string,
  date?: Date,
  companyId?: string
): Promise<ExchangeRate | null> {
  try {
    let query = supabase
      .from('exchange_rates')
      .select('*')
      .eq('from_currency', fromCurrency)
      .eq('to_currency', toCurrency)
      .eq('is_active', true)

    if (companyId) query = query.eq('company_id', companyId)

    if (date) {
      // Get rate closest to the specified date
      query = query.lte('rate_date', date.toISOString().split('T')[0])
    }

    const { data } = await query.order('rate_date', { ascending: false }).limit(1).single()
    return data
  } catch {
    // Try reverse rate
    try {
      let reverseQuery = supabase
        .from('exchange_rates')
        .select('*')
        .eq('from_currency', toCurrency)
        .eq('to_currency', fromCurrency)
        .eq('is_active', true)

      if (companyId) reverseQuery = reverseQuery.eq('company_id', companyId)
      if (date) reverseQuery = reverseQuery.lte('rate_date', date.toISOString().split('T')[0])

      const { data } = await reverseQuery.order('rate_date', { ascending: false }).limit(1).single()
      if (data) {
        return { ...data, rate: 1 / data.rate, from_currency: fromCurrency, to_currency: toCurrency }
      }
    } catch {}
    return null
  }
}

/**
 * Fetch rate from external API
 */
async function fetchRateFromAPI(fromCurrency: string, toCurrency: string): Promise<number | null> {
  try {
    const response = await fetch(`https://api.exchangerate-api.com/v4/latest/${fromCurrency}`)
    if (!response.ok) return null
    const data = await response.json()
    return data.rates?.[toCurrency] || null
  } catch {
    return null
  }
}

/**
 * Save exchange rate to database
 */
async function saveExchangeRate(
  supabase: SupabaseClient,
  fromCurrency: string,
  toCurrency: string,
  rate: number,
  source: string,
  companyId?: string,
  isManualOverride: boolean = false,
  overrideReason?: string
): Promise<ExchangeRate | null> {
  try {
    const { data, error } = await supabase.from('exchange_rates').insert({
      from_currency: fromCurrency,
      to_currency: toCurrency,
      rate,
      rate_date: new Date().toISOString().split('T')[0],
      rate_timestamp: new Date().toISOString(),
      source,
      source_detail: source === 'api' ? 'exchangerate-api.com' : undefined,
      is_manual_override: isManualOverride,
      override_reason: overrideReason,
      company_id: companyId,
      is_active: true
    }).select().single()

    if (error) throw error
    return data
  } catch (err) {
    console.error('Error saving exchange rate:', err)
    return null
  }
}

/**
 * Convert amount between currencies
 */
export async function convertCurrency(
  supabase: SupabaseClient,
  amount: number,
  fromCurrency: string,
  toCurrency: string,
  date?: Date,
  companyId?: string
): Promise<ConversionResult> {
  const { rate, rateId, source } = await getExchangeRate(supabase, fromCurrency, toCurrency, date, companyId)

  // Get decimal places for target currency
  const decimals = await getCurrencyDecimals(supabase, toCurrency)
  const convertedAmount = roundToDecimals(amount * rate, decimals)

  return {
    original_amount: amount,
    original_currency: fromCurrency,
    converted_amount: convertedAmount,
    target_currency: toCurrency,
    exchange_rate: rate,
    exchange_rate_id: rateId,
    rate_source: source,
    rate_date: date?.toISOString().split('T')[0] || new Date().toISOString().split('T')[0]
  }
}

/**
 * Get currency decimal places
 */
async function getCurrencyDecimals(supabase: SupabaseClient, currencyCode: string): Promise<number> {
  try {
    const { data } = await supabase
      .from('currencies')
      .select('decimals')
      .eq('code', currencyCode)
      .limit(1)
      .single()
    return data?.decimals || 2
  } catch {
    return 2
  }
}

/**
 * Round to specific decimal places
 */
export function roundToDecimals(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals)
  return Math.round(value * factor) / factor
}

// ========================================
// FX Gain/Loss Calculations
// ========================================

export interface FXGainLossResult {
  hasGainLoss: boolean
  amount: number  // Positive = gain, Negative = loss
  invoiceRate: number
  paymentRate: number
  invoiceBaseAmount: number
  paymentBaseAmount: number
  difference: number
}

/**
 * Calculate FX Gain/Loss when paying an invoice
 *
 * Formula:
 * - Invoice recorded at rate R1 → Base Amount = Invoice Amount * R1
 * - Payment made at rate R2 → Base Amount = Payment Amount * R2
 * - FX Gain/Loss = Payment Base Amount - Invoice Base Amount (for same original amount)
 */
export function calculateFXGainLoss(
  originalAmount: number,
  invoiceExchangeRate: number,
  paymentExchangeRate: number,
  baseCurrencyDecimals: number = 2
): FXGainLossResult {
  const invoiceBaseAmount = roundToDecimals(originalAmount * invoiceExchangeRate, baseCurrencyDecimals)
  const paymentBaseAmount = roundToDecimals(originalAmount * paymentExchangeRate, baseCurrencyDecimals)
  const difference = roundToDecimals(paymentBaseAmount - invoiceBaseAmount, baseCurrencyDecimals)

  return {
    hasGainLoss: Math.abs(difference) > 0.001,
    amount: difference,
    invoiceRate: invoiceExchangeRate,
    paymentRate: paymentExchangeRate,
    invoiceBaseAmount,
    paymentBaseAmount,
    difference
  }
}

/**
 * Create FX Gain/Loss journal entry
 */
export async function createFXGainLossEntry(
  supabase: SupabaseClient,
  companyId: string,
  fxResult: FXGainLossResult,
  referenceType: string,
  referenceId: string,
  fxGainAccountId: string,
  fxLossAccountId: string,
  relatedAccountId: string,
  description: string,
  baseCurrency: string
): Promise<{ success: boolean; entryId?: string; error?: string }> {
  if (!fxResult.hasGainLoss) {
    return { success: true }
  }

  try {
    const isGain = fxResult.amount > 0
    const absAmount = Math.abs(fxResult.amount)

    // Create journal entry header
    const { data: entry, error: entryError } = await supabase
      .from('journal_entries')
      .insert({
        company_id: companyId,
        entry_date: new Date().toISOString().split('T')[0],
        description: `${description} - ${isGain ? 'ربح' : 'خسارة'} فروق صرف`,
        reference_type: 'fx_gain_loss',
        reference_id: referenceId,
        is_approved: true
      })
      .select()
      .single()

    if (entryError) throw entryError

    // Create journal entry lines
    const lines = isGain
      ? [
          // Gain: Debit related account, Credit FX Gain
          { journal_entry_id: entry.id, account_id: relatedAccountId, debit_amount: absAmount, credit_amount: 0, description: 'تسوية فروق صرف', original_debit: absAmount, original_credit: 0, original_currency: baseCurrency, exchange_rate_used: 1 },
          { journal_entry_id: entry.id, account_id: fxGainAccountId, debit_amount: 0, credit_amount: absAmount, description: 'أرباح فروق صرف', original_debit: 0, original_credit: absAmount, original_currency: baseCurrency, exchange_rate_used: 1 }
        ]
      : [
          // Loss: Debit FX Loss, Credit related account
          { journal_entry_id: entry.id, account_id: fxLossAccountId, debit_amount: absAmount, credit_amount: 0, description: 'خسائر فروق صرف', original_debit: absAmount, original_credit: 0, original_currency: baseCurrency, exchange_rate_used: 1 },
          { journal_entry_id: entry.id, account_id: relatedAccountId, debit_amount: 0, credit_amount: absAmount, description: 'تسوية فروق صرف', original_debit: 0, original_credit: absAmount, original_currency: baseCurrency, exchange_rate_used: 1 }
        ]

    const { error: linesError } = await supabase.from('journal_entry_lines').insert(lines)
    if (linesError) throw linesError

    return { success: true, entryId: entry.id }
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error'
    console.error('Error creating FX gain/loss entry:', err)
    return { success: false, error: errorMessage }
  }
}

/**
 * Manual rate override with audit trail
 */
export async function setManualExchangeRate(
  supabase: SupabaseClient,
  fromCurrency: string,
  toCurrency: string,
  rate: number,
  reason: string,
  companyId?: string,
  userId?: string
): Promise<ExchangeRate | null> {
  try {
    const { data, error } = await supabase.from('exchange_rates').insert({
      from_currency: fromCurrency,
      to_currency: toCurrency,
      rate,
      rate_date: new Date().toISOString().split('T')[0],
      rate_timestamp: new Date().toISOString(),
      source: 'manual',
      source_detail: `Manual override by user`,
      is_manual_override: true,
      override_reason: reason,
      company_id: companyId,
      created_by: userId,
      is_active: true
    }).select().single()

    if (error) throw error

    // Log to audit
    await supabase.from('audit_logs').insert({
      company_id: companyId,
      user_id: userId,
      action: 'manual_exchange_rate',
      table_name: 'exchange_rates',
      record_id: data.id,
      new_values: { from_currency: fromCurrency, to_currency: toCurrency, rate, reason }
    }).catch(() => {}) // Don't fail if audit log fails

    return data
  } catch (err) {
    console.error('Error setting manual exchange rate:', err)
    return null
  }
}

