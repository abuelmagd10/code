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

// ========================================
// FX Account Configuration
// ========================================

/**
 * Get the configured FX Gain/Loss account IDs for a company.
 *
 * Resolution order:
 *   1. companies.fx_gain_account_id / fx_loss_account_id (if configured)
 *   2. Default accounts by code: 4320 (FX Gains) / 5310 (FX Losses)
 *   3. Throw FX_ACCOUNTS_NOT_CONFIGURED error
 *
 * The try/catch around the companies query ensures the code works even if
 * the migration adding fx_gain_account_id/fx_loss_account_id has not been
 * applied yet (columns don't exist → query fails → fall through to defaults).
 */
export async function getFXAccounts(
  supabase: SupabaseClient,
  companyId: string
): Promise<{ gainId: string; lossId: string }> {
  let configuredGainId: string | null = null
  let configuredLossId: string | null = null

  // Step 1: Try reading company-level configuration
  try {
    const { data, error } = await supabase
      .from('companies')
      .select('fx_gain_account_id, fx_loss_account_id')
      .eq('id', companyId)
      .single()

    if (data && !error) {
      configuredGainId = data.fx_gain_account_id
      configuredLossId = data.fx_loss_account_id
    }
  } catch {
    // Columns may not exist yet (migration not applied) — fall through to defaults
    console.warn('[getFXAccounts] FX configuration columns not available, using defaults')
  }

  // If both are configured, return them directly
  if (configuredGainId && configuredLossId) {
    return { gainId: configuredGainId, lossId: configuredLossId }
  }

  // Step 2: Fall back to default account codes 4320 / 5310
  const codesToFind: string[] = []
  if (!configuredGainId) codesToFind.push('4320')
  if (!configuredLossId) codesToFind.push('5310')

  const { data: defaultAccounts } = await supabase
    .from('chart_of_accounts')
    .select('id, account_code')
    .eq('company_id', companyId)
    .in('account_code', codesToFind)

  const gain4320 = defaultAccounts?.find(a => a.account_code === '4320')
  const loss5310 = defaultAccounts?.find(a => a.account_code === '5310')

  const gainId = configuredGainId || gain4320?.id
  const lossId = configuredLossId || loss5310?.id

  if (!gainId || !lossId) {
    const missing: string[] = []
    if (!gainId) missing.push('4320 (أرباح فروق العملة)')
    if (!lossId) missing.push('5310 (خسائر فروق العملة)')
    throw new Error(
      `FX_ACCOUNTS_NOT_CONFIGURED: حسابات فروق العملة غير موجودة: ${missing.join(' و ')}. ` +
      'يرجى تشغيل Migration 20260519000200 أو تهيئة الحسابات يدوياً من الإعدادات.'
    )
  }

  return { gainId, lossId }
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

    // Log to audit. Schema: action must be one of (INSERT, UPDATE, DELETE, SETTINGS, ...).
    // 'manual_exchange_rate' is an UPDATE/INSERT of exchange_rates; use 'INSERT' (new rate row) + reason.
    try {
      await supabase.from('audit_logs').insert({
        company_id: companyId,
        user_id: userId,
        action: 'INSERT',
        target_table: 'exchange_rates',
        record_id: data.id,
        reason: 'manual_exchange_rate',
        new_data: { from_currency: fromCurrency, to_currency: toCurrency, rate, override_reason: reason }
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

    // Get FX accounts (configured or default 4320/5310)
    let fxGainAccountId: string
    let fxLossAccountId: string
    try {
      const fxAccounts = await getFXAccounts(supabase, companyId)
      fxGainAccountId = fxAccounts.gainId
      fxLossAccountId = fxAccounts.lossId
    } catch (fxErr: unknown) {
      const fxMessage = fxErr instanceof Error ? fxErr.message : 'FX accounts not found'
      return {
        success: false,
        error: fxMessage,
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

    // Log to audit. Schema: action must be one of CHECK constraint values
    // (INSERT/UPDATE/DELETE/SETTINGS/...). Original event name goes in `reason`.
    try {
      await supabase.from('audit_logs').insert({
        company_id: companyId,
        user_id: userId,
        action: 'SETTINGS',
        target_table: 'journal_entries',
        record_id: journalEntry.id,
        reason: 'currency_revaluation',
        new_data: {
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
 * Look up FX Gain/Loss accounts by default codes (4320/5310).
 *
 * @deprecated Use getFXAccounts() instead — it checks company configuration first.
 * Kept for backward compatibility; internally delegates to getFXAccounts().
 */
async function createFXAccountsIfNeeded(
  supabase: SupabaseClient,
  companyId: string
): Promise<{ data: { gainAccountId: string; lossAccountId: string } | null }> {
  try {
    const { gainId, lossId } = await getFXAccounts(supabase, companyId)
    return { data: { gainAccountId: gainId, lossAccountId: lossId } }
  } catch (err) {
    console.error('Error finding FX accounts:', err)
    return { data: null }
  }
}

// ========================================
// Period-End FX Revaluation (IAS 21 §28)
// ========================================

export interface PeriodEndRevaluationDetail {
  documentType: 'invoice' | 'bill'
  documentId: string
  documentNumber: string
  currency: string
  originalRate: number
  closingRate: number
  openAmountFC: number
  bookedBaseAmount: number
  revaluedBaseAmount: number
  diff: number  // revalued - booked
}

export interface PeriodEndRevaluationResult {
  success: boolean
  error?: string
  baseCurrency?: string
  periodEndDate?: string
  details: PeriodEndRevaluationDetail[]
  totalGain: number  // accumulated gain in base currency
  totalLoss: number  // accumulated loss in base currency (positive number)
  revaluedDocuments: number
  journalEntryId?: string
  dryRun: boolean
}

/**
 * Revalue period-end FX balances per IAS 21 §28
 *
 * At each reporting date, monetary items (AR, AP, cash in foreign currency)
 * must be retranslated using the closing rate. The difference vs. the
 * historical (transaction) rate is recognized as FX gain/loss in P&L.
 *
 * What this revalues:
 *   - Open invoices (status != 'paid', != 'cancelled', != 'draft')
 *     where currency_code != base_currency
 *   - Open bills with the same conditions
 *
 * What this does NOT revalue (intentionally — future enhancement):
 *   - Cash / bank account balances in foreign currency
 *   - Other monetary items (loans, deposits, etc.)
 *
 * Closing rate source priority:
 *   1. `closingRates` parameter (manual override per currency)
 *   2. exchange_rates table entry with rate_date <= periodEndDate (latest)
 *   3. throw error if no rate found
 *
 * @param dryRun If true, returns the calculation without creating a journal entry.
 *               Use this to preview the impact before committing.
 */
export async function revaluePeriodEndFXBalances(
  supabase: SupabaseClient,
  params: {
    companyId: string
    periodEndDate: string  // ISO date YYYY-MM-DD
    closingRates?: Record<string, number>  // { 'USD': 31.5, 'EUR': 34.2 }
    userId?: string
    dryRun?: boolean
  }
): Promise<PeriodEndRevaluationResult> {
  const dryRun = !!params.dryRun
  const details: PeriodEndRevaluationDetail[] = []
  let totalGain = 0
  let totalLoss = 0

  try {
    // 1. Get company base currency
    const { data: company, error: compErr } = await supabase
      .from('companies')
      .select('base_currency')
      .eq('id', params.companyId)
      .single()
    if (compErr || !company) throw new Error('Company not found')
    const baseCurrency = (company.base_currency || 'EGP').toUpperCase()

    // 2. Resolve FX accounts (will fall back to 4320/5310 if not linked)
    const { gainId: fxGainAccountId, lossId: fxLossAccountId } =
      await getFXAccounts(supabase, params.companyId)

    // 3. Helper to look up closing rate for a currency
    const rateCache: Record<string, number> = {}
    const getClosingRate = async (currency: string): Promise<number> => {
      const c = currency.toUpperCase()
      if (c === baseCurrency) return 1
      if (rateCache[c] != null) return rateCache[c]
      // Manual override?
      if (params.closingRates && params.closingRates[c] > 0) {
        rateCache[c] = params.closingRates[c]
        return rateCache[c]
      }
      // Fetch from exchange_rates table
      const { data: rate } = await supabase
        .from('exchange_rates')
        .select('rate')
        .eq('from_currency', c)
        .eq('to_currency', baseCurrency)
        .lte('rate_date', params.periodEndDate)
        .order('rate_date', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (!rate || !rate.rate) {
        throw new Error(
          `No exchange rate found for ${c} → ${baseCurrency} on or before ${params.periodEndDate}. ` +
          `Either add a rate to exchange_rates or pass closingRates.${c} in the request.`
        )
      }
      rateCache[c] = Number(rate.rate)
      return rateCache[c]
    }

    // 4. Fetch open foreign-currency invoices
    const { data: openInvoices } = await supabase
      .from('invoices')
      .select('id, invoice_number, currency_code, exchange_rate, total_amount, paid_amount, base_currency_total, status')
      .eq('company_id', params.companyId)
      .neq('currency_code', baseCurrency)
      .not('currency_code', 'is', null)
      .not('status', 'in', '("paid","cancelled","draft")')
      .or('is_deleted.is.null,is_deleted.eq.false')

    for (const inv of (openInvoices || [])) {
      const currency = String(inv.currency_code || '').toUpperCase()
      if (!currency || currency === baseCurrency) continue
      const originalRate = Number(inv.exchange_rate || 0)
      if (originalRate <= 0) continue

      // Open amount in foreign currency = total - paid (assume both in FC)
      const totalFC = Number(inv.total_amount || 0)
      const paidFC = Number(inv.paid_amount || 0)
      const openFC = totalFC - paidFC
      if (openFC <= 0.01) continue

      const closingRate = await getClosingRate(currency)
      const bookedBaseAmount = openFC * originalRate
      const revaluedBaseAmount = openFC * closingRate
      const diff = revaluedBaseAmount - bookedBaseAmount

      if (Math.abs(diff) < 0.01) continue

      details.push({
        documentType: 'invoice',
        documentId: inv.id,
        documentNumber: String(inv.invoice_number || inv.id),
        currency,
        originalRate,
        closingRate,
        openAmountFC: openFC,
        bookedBaseAmount,
        revaluedBaseAmount,
        diff,
      })

      // For AR (asset): positive diff = closing rate higher = AR worth more in base = GAIN
      if (diff > 0) totalGain += diff
      else totalLoss += Math.abs(diff)
    }

    // 5. Fetch open foreign-currency bills (same logic, AP side)
    const { data: openBills } = await supabase
      .from('bills')
      .select('id, bill_number, currency_code, exchange_rate, total_amount, paid_amount, base_currency_total, status')
      .eq('company_id', params.companyId)
      .neq('currency_code', baseCurrency)
      .not('currency_code', 'is', null)
      .not('status', 'in', '("paid","cancelled","draft")')
      .or('is_deleted.is.null,is_deleted.eq.false')

    for (const bill of (openBills || [])) {
      const currency = String(bill.currency_code || '').toUpperCase()
      if (!currency || currency === baseCurrency) continue
      const originalRate = Number(bill.exchange_rate || 0)
      if (originalRate <= 0) continue

      const totalFC = Number(bill.total_amount || 0)
      const paidFC = Number(bill.paid_amount || 0)
      const openFC = totalFC - paidFC
      if (openFC <= 0.01) continue

      const closingRate = await getClosingRate(currency)
      const bookedBaseAmount = openFC * originalRate
      const revaluedBaseAmount = openFC * closingRate
      const diff = revaluedBaseAmount - bookedBaseAmount

      if (Math.abs(diff) < 0.01) continue

      details.push({
        documentType: 'bill',
        documentId: bill.id,
        documentNumber: String(bill.bill_number || bill.id),
        currency,
        originalRate,
        closingRate,
        openAmountFC: openFC,
        bookedBaseAmount,
        revaluedBaseAmount,
        diff,
      })

      // For AP (liability): positive diff = closing rate higher = AP worth more = LOSS
      if (diff > 0) totalLoss += diff
      else totalGain += Math.abs(diff)
    }

    // 6. If dryRun OR no items to revalue, return early
    if (dryRun || details.length === 0) {
      return {
        success: true,
        baseCurrency,
        periodEndDate: params.periodEndDate,
        details,
        totalGain: roundToDecimals(totalGain, 2),
        totalLoss: roundToDecimals(totalLoss, 2),
        revaluedDocuments: details.length,
        dryRun,
      }
    }

    // 7. Get AR/AP mapping
    const { data: accounts } = await supabase
      .from('chart_of_accounts')
      .select('id, account_code, sub_type, account_type')
      .eq('company_id', params.companyId)
      .eq('is_active', true)
    const findAcct = (subType: string, fallback?: string) => {
      let a = accounts?.find(x => x.sub_type === subType)
      if (!a && fallback) a = accounts?.find(x => x.account_code === fallback)
      return a?.id
    }
    const arAccountId = findAcct('accounts_receivable', '1210')
    const apAccountId = findAcct('accounts_payable', '2110')
    if (!arAccountId || !apAccountId) {
      throw new Error('AR or AP account not found in chart_of_accounts')
    }

    // 8. Create journal entry header
    const reference = `FX-REVAL-${params.periodEndDate}-${Date.now()}`
    const { data: journalEntry, error: entryError } = await supabase
      .from('journal_entries')
      .insert({
        company_id: params.companyId,
        entry_date: params.periodEndDate,
        description: `إعادة تقييم الأرصدة بالعملات الأجنبية - ${params.periodEndDate}`,
        reference_type: 'fx_period_end_revaluation',
        reference_id: reference,
        is_approved: false,  // requires approval workflow
        created_by: params.userId,
      })
      .select()
      .single()
    if (entryError) throw entryError

    // 9. Build journal lines
    const lines: any[] = []
    let arNetDiff = 0  // sum of diffs on AR side
    let apNetDiff = 0  // sum of diffs on AP side

    for (const d of details) {
      if (d.documentType === 'invoice') arNetDiff += d.diff
      else apNetDiff += d.diff
    }

    // AR adjustment: if arNetDiff > 0, AR increases (Dr AR, Cr 4320 Gain)
    //               if arNetDiff < 0, AR decreases (Dr 5310 Loss, Cr AR)
    if (Math.abs(arNetDiff) >= 0.01) {
      if (arNetDiff > 0) {
        lines.push({
          journal_entry_id: journalEntry.id,
          account_id: arAccountId,
          debit_amount: arNetDiff,
          credit_amount: 0,
          description: `إعادة تقييم AR بسعر الإقفال ${params.periodEndDate}`,
        })
        lines.push({
          journal_entry_id: journalEntry.id,
          account_id: fxGainAccountId,
          debit_amount: 0,
          credit_amount: arNetDiff,
          description: `أرباح إعادة تقييم AR`,
        })
      } else {
        const abs = Math.abs(arNetDiff)
        lines.push({
          journal_entry_id: journalEntry.id,
          account_id: fxLossAccountId,
          debit_amount: abs,
          credit_amount: 0,
          description: `خسائر إعادة تقييم AR`,
        })
        lines.push({
          journal_entry_id: journalEntry.id,
          account_id: arAccountId,
          debit_amount: 0,
          credit_amount: abs,
          description: `إعادة تقييم AR بسعر الإقفال ${params.periodEndDate}`,
        })
      }
    }

    // AP adjustment: if apNetDiff > 0, AP increases (Dr 5310 Loss, Cr AP)
    //               if apNetDiff < 0, AP decreases (Dr AP, Cr 4320 Gain)
    if (Math.abs(apNetDiff) >= 0.01) {
      if (apNetDiff > 0) {
        const v = apNetDiff
        lines.push({
          journal_entry_id: journalEntry.id,
          account_id: fxLossAccountId,
          debit_amount: v,
          credit_amount: 0,
          description: `خسائر إعادة تقييم AP`,
        })
        lines.push({
          journal_entry_id: journalEntry.id,
          account_id: apAccountId,
          debit_amount: 0,
          credit_amount: v,
          description: `إعادة تقييم AP بسعر الإقفال ${params.periodEndDate}`,
        })
      } else {
        const abs = Math.abs(apNetDiff)
        lines.push({
          journal_entry_id: journalEntry.id,
          account_id: apAccountId,
          debit_amount: abs,
          credit_amount: 0,
          description: `إعادة تقييم AP بسعر الإقفال ${params.periodEndDate}`,
        })
        lines.push({
          journal_entry_id: journalEntry.id,
          account_id: fxGainAccountId,
          debit_amount: 0,
          credit_amount: abs,
          description: `أرباح إعادة تقييم AP`,
        })
      }
    }

    const { error: linesError } = await supabase
      .from('journal_entry_lines')
      .insert(lines)
    if (linesError) throw linesError

    // 10. Audit log (correct schema)
    try {
      await supabase.from('audit_logs').insert({
        company_id: params.companyId,
        user_id: params.userId,
        action: 'INSERT',
        target_table: 'journal_entries',
        record_id: journalEntry.id,
        reason: 'fx_period_end_revaluation',
        new_data: {
          period_end_date: params.periodEndDate,
          total_gain: roundToDecimals(totalGain, 2),
          total_loss: roundToDecimals(totalLoss, 2),
          revalued_documents: details.length,
          documents: details.map(d => ({
            type: d.documentType,
            number: d.documentNumber,
            currency: d.currency,
            diff: roundToDecimals(d.diff, 2),
          })),
        },
      })
    } catch (auditErr) {
      console.warn('FX revaluation audit log failed:', auditErr)
    }

    return {
      success: true,
      baseCurrency,
      periodEndDate: params.periodEndDate,
      details,
      totalGain: roundToDecimals(totalGain, 2),
      totalLoss: roundToDecimals(totalLoss, 2),
      revaluedDocuments: details.length,
      journalEntryId: journalEntry.id,
      dryRun: false,
    }
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error'
    console.error('Period-end FX revaluation error:', err)
    return {
      success: false,
      error: errorMessage,
      details,
      totalGain,
      totalLoss,
      revaluedDocuments: details.length,
      dryRun,
    }
  }
}
