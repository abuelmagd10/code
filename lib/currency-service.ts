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

// Centralized currency constants
export const DEFAULT_CURRENCIES = [
  { code: 'EGP', name: 'Egyptian Pound', name_ar: 'الجنيه المصري' },
  { code: 'USD', name: 'US Dollar', name_ar: 'الدولار الأمريكي' },
  { code: 'EUR', name: 'Euro', name_ar: 'اليورو' },
  { code: 'SAR', name: 'Saudi Riyal', name_ar: 'الريال السعودي' }
] as const;

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
 * Get the base currency for a company (from companies.base_currency field)
 */
export async function getBaseCurrency(supabase: SupabaseClient, companyId?: string): Promise<string> {
  try {
    if (companyId) {
      // Get base_currency directly from companies table
      const { data: company } = await supabase
        .from('companies')
        .select('base_currency')
        .eq('id', companyId)
        .maybeSingle()

      if (company?.base_currency) {
        return company.base_currency
      }
    }
    return 'EGP'
  } catch {
    return 'EGP'
  }
}

/**
 * Get all currencies from global_currencies table + mark company's base currency
 * Uses global shared currencies table - NO per-company currency tables
 */
export async function getActiveCurrencies(supabase: SupabaseClient, companyId?: string): Promise<Currency[]> {
  try {
    // Get company's base currency
    let baseCurrencyCode = 'EGP'
    if (companyId) {
      const { data: company } = await supabase
        .from('companies')
        .select('base_currency')
        .eq('id', companyId)
        .maybeSingle()
      if (company?.base_currency) {
        baseCurrencyCode = company.base_currency
      }
    }

    // Get all currencies from global table
    const { data: globalCurrencies } = await supabase
      .from('global_currencies')
      .select('*')
      .eq('is_active', true)
      .order('code')

    if (globalCurrencies && globalCurrencies.length > 0) {
      // Map to Currency interface, marking the company's base currency
      const currencies: Currency[] = globalCurrencies.map((c: any) => ({
        id: c.code, // Use code as ID since global table uses code as PK
        code: c.code,
        name: c.name,
        name_ar: c.name_ar,
        symbol: c.symbol,
        decimals: c.decimals || 2,
        is_active: c.is_active,
        is_base: c.code === baseCurrencyCode
      }))

      // Sort: base currency first, then alphabetically
      currencies.sort((a, b) => {
        if (a.is_base && !b.is_base) return -1
        if (!a.is_base && b.is_base) return 1
        return a.code.localeCompare(b.code)
      })

      return currencies
    }

    return []
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
    try {
      await supabase.from('audit_logs').insert({
        company_id: companyId,
        user_id: userId,
        action: 'manual_exchange_rate',
        table_name: 'exchange_rates',
        record_id: data.id,
        new_values: { from_currency: fromCurrency, to_currency: toCurrency, rate, reason }
      })
    } catch {
      // Don't fail if audit log fails
    }

    return data
  } catch (err) {
    console.error('Error setting manual exchange rate:', err)
    return null
  }
}

// ========================================
// Currency Revaluation System
// ========================================

export interface RevaluationResult {
  success: boolean
  journalEntryId?: string
  totalGain: number
  totalLoss: number
  revaluedAccounts: number
  error?: string
}

export interface AccountRevaluation {
  accountId: string
  accountName: string
  originalCurrency: string
  originalBalance: number
  oldBaseBalance: number
  newBaseBalance: number
  difference: number
}

/**
 * Perform currency revaluation when base currency changes
 *
 * This creates accounting journal entries for the difference in values
 * when converting from old base currency to new base currency.
 *
 * IMPORTANT: This does NOT modify original transaction data.
 * It only creates revaluation adjustment entries.
 */
export async function performCurrencyRevaluation(
  supabase: SupabaseClient,
  companyId: string,
  oldBaseCurrency: string,
  newBaseCurrency: string,
  exchangeRate: number,
  userId?: string
): Promise<RevaluationResult> {
  try {
    const revaluationDate = new Date().toISOString().split('T')[0]
    const revaluations: AccountRevaluation[] = []
    let totalGain = 0
    let totalLoss = 0

    // Get FX accounts for gain/loss
    const { data: fxAccounts } = await supabase
      .from('chart_of_accounts')
      .select('id, account_code, account_name')
      .eq('company_id', companyId)
      .in('account_code', ['4200', '5200', '7100', '8100']) // Common FX gain/loss codes
      .limit(4)

    // Find or use default FX accounts
    let fxGainAccountId = fxAccounts?.find(a =>
      a.account_code === '4200' || a.account_name?.includes('أرباح') || a.account_name?.includes('Gain')
    )?.id
    let fxLossAccountId = fxAccounts?.find(a =>
      a.account_code === '5200' || a.account_name?.includes('خسائر') || a.account_name?.includes('Loss')
    )?.id

    // If no FX accounts found, create them
    if (!fxGainAccountId || !fxLossAccountId) {
      const { data: newAccounts } = await createFXAccountsIfNeeded(supabase, companyId)
      if (newAccounts) {
        fxGainAccountId = fxGainAccountId || newAccounts.gainAccountId
        fxLossAccountId = fxLossAccountId || newAccounts.lossAccountId
      }
    }

    if (!fxGainAccountId || !fxLossAccountId) {
      return {
        success: false,
        error: 'Could not find or create FX gain/loss accounts',
        totalGain: 0,
        totalLoss: 0,
        revaluedAccounts: 0
      }
    }

    // Get all monetary accounts with foreign currency balances
    // This includes: AR, AP, Bank accounts, Cash accounts
    const { data: accounts } = await supabase
      .from('chart_of_accounts')
      .select('id, account_code, account_name, account_type, balance, currency_code')
      .eq('company_id', companyId)
      .in('account_type', ['asset', 'liability'])
      .not('balance', 'is', null)

    if (!accounts || accounts.length === 0) {
      return {
        success: true,
        totalGain: 0,
        totalLoss: 0,
        revaluedAccounts: 0
      }
    }

    // Calculate revaluation for each account
    for (const account of accounts) {
      const balance = Number(account.balance || 0)
      if (Math.abs(balance) < 0.01) continue

      // Calculate old and new base values
      const oldBaseBalance = balance // Already in old base currency
      const newBaseBalance = roundToDecimals(balance * exchangeRate, 2)
      const difference = roundToDecimals(newBaseBalance - oldBaseBalance, 2)

      if (Math.abs(difference) > 0.01) {
        revaluations.push({
          accountId: account.id,
          accountName: account.account_name || account.account_code,
          originalCurrency: oldBaseCurrency,
          originalBalance: balance,
          oldBaseBalance,
          newBaseBalance,
          difference
        })

        if (difference > 0) {
          totalGain += difference
        } else {
          totalLoss += Math.abs(difference)
        }
      }
    }

    // If no revaluations needed, return success
    if (revaluations.length === 0) {
      return {
        success: true,
        totalGain: 0,
        totalLoss: 0,
        revaluedAccounts: 0
      }
    }

    // Create revaluation journal entry
    const { data: journalEntry, error: entryError } = await supabase
      .from('journal_entries')
      .insert({
        company_id: companyId,
        entry_date: revaluationDate,
        description: `إعادة تقييم العملة: ${oldBaseCurrency} → ${newBaseCurrency} بسعر ${exchangeRate}`,
        reference_type: 'currency_revaluation',
        reference_id: `REVAL-${Date.now()}`,
        is_approved: true,
        created_by: userId
      })
      .select()
      .single()

    if (entryError) throw entryError

    // Create journal entry lines for each revaluation
    const journalLines: any[] = []

    for (const reval of revaluations) {
      if (reval.difference > 0) {
        // Gain: Debit account, Credit FX Gain
        journalLines.push({
          journal_entry_id: journalEntry.id,
          account_id: reval.accountId,
          debit_amount: reval.difference,
          credit_amount: 0,
          description: `إعادة تقييم: ${reval.accountName}`,
          original_debit: reval.difference,
          original_credit: 0,
          original_currency: newBaseCurrency,
          exchange_rate_used: 1
        })
        journalLines.push({
          journal_entry_id: journalEntry.id,
          account_id: fxGainAccountId,
          debit_amount: 0,
          credit_amount: reval.difference,
          description: `أرباح إعادة تقييم: ${reval.accountName}`,
          original_debit: 0,
          original_credit: reval.difference,
          original_currency: newBaseCurrency,
          exchange_rate_used: 1
        })
      } else {
        // Loss: Debit FX Loss, Credit account
        const absAmount = Math.abs(reval.difference)
        journalLines.push({
          journal_entry_id: journalEntry.id,
          account_id: fxLossAccountId,
          debit_amount: absAmount,
          credit_amount: 0,
          description: `خسائر إعادة تقييم: ${reval.accountName}`,
          original_debit: absAmount,
          original_credit: 0,
          original_currency: newBaseCurrency,
          exchange_rate_used: 1
        })
        journalLines.push({
          journal_entry_id: journalEntry.id,
          account_id: reval.accountId,
          debit_amount: 0,
          credit_amount: absAmount,
          description: `إعادة تقييم: ${reval.accountName}`,
          original_debit: 0,
          original_credit: absAmount,
          original_currency: newBaseCurrency,
          exchange_rate_used: 1
        })
      }
    }

    // Insert all journal lines
    const { error: linesError } = await supabase
      .from('journal_entry_lines')
      .insert(journalLines)

    if (linesError) throw linesError

    // Log to audit
    try {
      await supabase.from('audit_logs').insert({
        company_id: companyId,
        user_id: userId,
        action: 'currency_revaluation',
        table_name: 'journal_entries',
        record_id: journalEntry.id,
        new_values: {
          old_base_currency: oldBaseCurrency,
          new_base_currency: newBaseCurrency,
          exchange_rate: exchangeRate,
          total_gain: totalGain,
          total_loss: totalLoss,
          accounts_revalued: revaluations.length
        }
      })
    } catch {
      // Don't fail if audit log fails
    }

    return {
      success: true,
      journalEntryId: journalEntry.id,
      totalGain: roundToDecimals(totalGain, 2),
      totalLoss: roundToDecimals(totalLoss, 2),
      revaluedAccounts: revaluations.length
    }
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error'
    console.error('Error performing currency revaluation:', err)
    return {
      success: false,
      error: errorMessage,
      totalGain: 0,
      totalLoss: 0,
      revaluedAccounts: 0
    }
  }
}

/**
 * Create FX Gain/Loss accounts if they don't exist
 */
async function createFXAccountsIfNeeded(
  supabase: SupabaseClient,
  companyId: string
): Promise<{ data: { gainAccountId: string; lossAccountId: string } | null }> {
  try {
    // Check if accounts exist
    const { data: existing } = await supabase
      .from('chart_of_accounts')
      .select('id, account_code')
      .eq('company_id', companyId)
      .in('account_code', ['4200', '5200'])

    let gainAccountId = existing?.find(a => a.account_code === '4200')?.id
    let lossAccountId = existing?.find(a => a.account_code === '5200')?.id

    // Create gain account if needed
    if (!gainAccountId) {
      const { data: gainAccount } = await supabase
        .from('chart_of_accounts')
        .insert({
          company_id: companyId,
          account_code: '4200',
          account_name: 'أرباح فروق صرف العملات',
          account_name_en: 'Foreign Exchange Gains',
          account_type: 'revenue',
          is_active: true
        })
        .select()
        .single()
      gainAccountId = gainAccount?.id
    }

    // Create loss account if needed
    if (!lossAccountId) {
      const { data: lossAccount } = await supabase
        .from('chart_of_accounts')
        .insert({
          company_id: companyId,
          account_code: '5200',
          account_name: 'خسائر فروق صرف العملات',
          account_name_en: 'Foreign Exchange Losses',
          account_type: 'expense',
          is_active: true
        })
        .select()
        .single()
      lossAccountId = lossAccount?.id
    }

    if (gainAccountId && lossAccountId) {
      return { data: { gainAccountId, lossAccountId } }
    }
    return { data: null }
  } catch (err) {
    console.error('Error creating FX accounts:', err)
    return { data: null }
  }
}

