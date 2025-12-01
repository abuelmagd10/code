import { createClient, SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// Default client (used for fetching exchange rates)
export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Store the authenticated client passed from the component
let authClient: SupabaseClient | null = null

export function setAuthClient(client: SupabaseClient) {
  authClient = client
}

function getClient(): SupabaseClient {
  return authClient || supabase
}

// Currency symbols mapping
export const currencySymbols: Record<string, string> = {
  EGP: '£', USD: '$', EUR: '€', GBP: '£', SAR: '﷼', AED: 'د.إ',
  KWD: 'د.ك', QAR: '﷼', BHD: 'د.ب', OMR: '﷼', JOD: 'د.أ', LBP: 'ل.ل'
}

// Conversion result interface
export interface ConversionResult {
  success: boolean
  error?: string
  convertedCount?: number
  logId?: string
}

// Get exchange rate from database or API
export async function getExchangeRate(fromCurrency: string, toCurrency: string, companyId?: string): Promise<number> {
  if (fromCurrency === toCurrency) return 1

  const client = getClient()

  try {
    // Try database first - direct rate
    if (companyId) {
      const { data } = await client
        .from('exchange_rates')
        .select('rate')
        .eq('company_id', companyId)
        .eq('from_currency', fromCurrency)
        .eq('to_currency', toCurrency)
        .order('rate_date', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (data?.rate) return Number(data.rate)

      // Try reverse rate (1 / rate)
      const { data: reverseData } = await client
        .from('exchange_rates')
        .select('rate')
        .eq('company_id', companyId)
        .eq('from_currency', toCurrency)
        .eq('to_currency', fromCurrency)
        .order('rate_date', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (reverseData?.rate && Number(reverseData.rate) > 0) {
        return 1 / Number(reverseData.rate)
      }
    }

    // Fallback to API
    const res = await fetch(`https://api.exchangerate-api.com/v4/latest/${fromCurrency}`)
    if (res.ok) {
      const data = await res.json()
      return data.rates?.[toCurrency] || 1
    }
  } catch (e) {
    console.error('Error fetching exchange rate:', e)
  }
  return 1
}

// Convert amount with precision (8 decimal places for accuracy)
export function convertAmount(amount: number, rate: number, decimals: number = 4): number {
  const multiplier = Math.pow(10, decimals)
  return Math.round(amount * rate * multiplier) / multiplier
}

// Log exchange rate conversion to exchange_rate_log table
export async function logExchangeRateConversion(
  companyId: string,
  transactionType: string,
  fromCurrency: string,
  toCurrency: string,
  rateUsed: number,
  notes?: string,
  transactionId?: string,
  originalAmount?: number,
  convertedAmount?: number
): Promise<string | null> {
  const client = getClient()
  try {
    const { data, error } = await client
      .from('exchange_rate_log')
      .insert({
        company_id: companyId,
        transaction_type: transactionType,
        transaction_id: transactionId,
        from_currency: fromCurrency,
        to_currency: toCurrency,
        rate_used: rateUsed,
        original_amount: originalAmount,
        converted_amount: convertedAmount,
        notes: notes || `Currency conversion: ${fromCurrency} → ${toCurrency}`
      })
      .select('id')
      .single()

    if (error) {
      console.error('Error logging exchange rate:', error)
      return null
    }
    return data?.id || null
  } catch (e) {
    console.error('Error logging exchange rate:', e)
    return null
  }
}

// Get original system currency
export function getOriginalSystemCurrency(): string {
  if (typeof window === 'undefined') return 'EGP'
  try {
    return localStorage.getItem('original_system_currency') || 'EGP'
  } catch {
    return 'EGP'
  }
}

// Main conversion function - converts all amounts to new display currency
// IMPORTANT: Always converts from ORIGINAL amounts, not from previously converted values
export async function convertAllToDisplayCurrency(
  companyId: string,
  newCurrency: string,
  rate: number,
  fromCurrency?: string
): Promise<ConversionResult> {
  const client = getClient()
  const originalCurrency = fromCurrency || getOriginalSystemCurrency()

  try {
    console.log('convertAllToDisplayCurrency called with:', { companyId, newCurrency, rate, originalCurrency })

    // Log this conversion operation
    const logId = await logExchangeRateConversion(
      companyId,
      'SYSTEM_CURRENCY_CHANGE',
      originalCurrency,
      newCurrency,
      rate,
      `System currency changed from ${originalCurrency} to ${newCurrency}`
    )

    // Parallel bulk updates for better performance
    const results = await Promise.allSettled([
      updateInvoiceDisplayAmountsBulk(companyId, rate, newCurrency),
      updateBillDisplayAmountsBulk(companyId, rate, newCurrency),
      updatePaymentDisplayAmountsBulk(companyId, rate, newCurrency),
      updateProductDisplayPricesBulk(companyId, rate, newCurrency),
      updateJournalDisplayAmountsBulk(companyId, rate, newCurrency),
      updateAccountDisplayBalancesBulk(companyId, rate, newCurrency),
      updateInventoryDisplayAmountsBulk(companyId, rate, newCurrency)
    ])

    // Count successful conversions
    let convertedCount = 0
    results.forEach((result, index) => {
      if (result.status === 'fulfilled' && result.value > 0) {
        convertedCount += result.value
      } else if (result.status === 'rejected') {
        console.error(`Conversion failed for table ${index}:`, result.reason)
      }
    })

    return { success: true, convertedCount, logId: logId || undefined }
  } catch (error: unknown) {
    console.error('Conversion error:', error)
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

// Bulk update functions - much more efficient than one-by-one updates
async function updateInvoiceDisplayAmountsBulk(companyId: string, rate: number, newCurrency: string): Promise<number> {
  const client = getClient()

  // Fetch all invoices with their ORIGINAL amounts including paid_amount
  const { data: invoices, error } = await client
    .from('invoices')
    .select('id, total_amount, subtotal, tax_amount, paid_amount, original_total, original_subtotal, original_tax_amount, original_paid')
    .eq('company_id', companyId)

  if (error || !invoices?.length) return 0

  // Batch update - use original values if available, otherwise use current values
  const updates = invoices.map(inv => ({
    id: inv.id,
    display_total: convertAmount(inv.original_total || inv.total_amount || 0, rate),
    display_subtotal: convertAmount(inv.original_subtotal || inv.subtotal || 0, rate),
    display_paid: convertAmount(inv.original_paid || inv.paid_amount || 0, rate),
    display_currency: newCurrency,
    display_rate: rate,
    exchange_rate_used: rate
  }))

  // Update in batches of 100 for better performance
  const batchSize = 100
  for (let i = 0; i < updates.length; i += batchSize) {
    const batch = updates.slice(i, i + batchSize)
    await Promise.all(batch.map(upd =>
      client.from('invoices').update({
        display_total: upd.display_total,
        display_subtotal: upd.display_subtotal,
        display_paid: upd.display_paid,
        display_currency: upd.display_currency,
        display_rate: upd.display_rate,
        exchange_rate_used: upd.exchange_rate_used
      }).eq('id', upd.id)
    ))
  }

  return invoices.length
}

async function updateBillDisplayAmountsBulk(companyId: string, rate: number, newCurrency: string): Promise<number> {
  const client = getClient()

  const { data: bills, error } = await client
    .from('bills')
    .select('id, total_amount, subtotal, tax_amount, original_total, original_subtotal, original_tax_amount')
    .eq('company_id', companyId)

  if (error || !bills?.length) return 0

  const updates = bills.map(bill => ({
    id: bill.id,
    display_total: convertAmount(bill.original_total || bill.total_amount || 0, rate),
    display_subtotal: convertAmount(bill.original_subtotal || bill.subtotal || 0, rate),
    display_currency: newCurrency,
    display_rate: rate,
    exchange_rate_used: rate
  }))

  const batchSize = 100
  for (let i = 0; i < updates.length; i += batchSize) {
    const batch = updates.slice(i, i + batchSize)
    await Promise.all(batch.map(upd =>
      client.from('bills').update({
        display_total: upd.display_total,
        display_subtotal: upd.display_subtotal,
        display_currency: upd.display_currency,
        display_rate: upd.display_rate,
        exchange_rate_used: upd.exchange_rate_used
      }).eq('id', upd.id)
    ))
  }

  return bills.length
}

async function updatePaymentDisplayAmountsBulk(companyId: string, rate: number, newCurrency: string): Promise<number> {
  const client = getClient()

  const { data: payments, error } = await client
    .from('payments')
    .select('id, amount, original_amount')
    .eq('company_id', companyId)

  if (error || !payments?.length) return 0

  const updates = payments.map(p => ({
    id: p.id,
    display_amount: convertAmount(p.original_amount || p.amount || 0, rate),
    display_currency: newCurrency,
    display_rate: rate,
    exchange_rate_used: rate
  }))

  const batchSize = 100
  for (let i = 0; i < updates.length; i += batchSize) {
    const batch = updates.slice(i, i + batchSize)
    await Promise.all(batch.map(upd =>
      client.from('payments').update({
        display_amount: upd.display_amount,
        display_currency: upd.display_currency,
        display_rate: upd.display_rate,
        exchange_rate_used: upd.exchange_rate_used
      }).eq('id', upd.id)
    ))
  }

  return payments.length
}

async function updateProductDisplayPricesBulk(companyId: string, rate: number, newCurrency: string): Promise<number> {
  const client = getClient()

  const { data: products, error } = await client
    .from('products')
    .select('id, unit_price, cost_price, original_unit_price, original_cost_price')
    .eq('company_id', companyId)

  if (error || !products?.length) return 0

  const updates = products.map(p => ({
    id: p.id,
    display_unit_price: convertAmount(p.original_unit_price || p.unit_price || 0, rate),
    display_cost_price: convertAmount(p.original_cost_price || p.cost_price || 0, rate),
    display_currency: newCurrency,
    display_rate: rate,
    exchange_rate_used: rate
  }))

  const batchSize = 100
  for (let i = 0; i < updates.length; i += batchSize) {
    const batch = updates.slice(i, i + batchSize)
    await Promise.all(batch.map(upd =>
      client.from('products').update({
        display_unit_price: upd.display_unit_price,
        display_cost_price: upd.display_cost_price,
        display_currency: upd.display_currency,
        display_rate: upd.display_rate,
        exchange_rate_used: upd.exchange_rate_used
      }).eq('id', upd.id)
    ))
  }

  return products.length
}

async function updateJournalDisplayAmountsBulk(companyId: string, rate: number, newCurrency: string): Promise<number> {
  const client = getClient()

  // Get all journal entries for this company
  const { data: entries } = await client
    .from('journal_entries')
    .select('id')
    .eq('company_id', companyId)

  if (!entries?.length) return 0

  const entryIds = entries.map(e => e.id)

  // Get all lines for these entries
  const { data: lines, error } = await client
    .from('journal_entry_lines')
    .select('id, debit_amount, credit_amount, original_debit, original_credit')
    .in('journal_entry_id', entryIds)

  if (error || !lines?.length) return 0

  const updates = lines.map(line => ({
    id: line.id,
    display_debit: convertAmount(line.original_debit || line.debit_amount || 0, rate),
    display_credit: convertAmount(line.original_credit || line.credit_amount || 0, rate),
    display_currency: newCurrency,
    display_rate: rate,
    exchange_rate_used: rate
  }))

  const batchSize = 100
  for (let i = 0; i < updates.length; i += batchSize) {
    const batch = updates.slice(i, i + batchSize)
    await Promise.all(batch.map(upd =>
      client.from('journal_entry_lines').update({
        display_debit: upd.display_debit,
        display_credit: upd.display_credit,
        display_currency: upd.display_currency,
        display_rate: upd.display_rate,
        exchange_rate_used: upd.exchange_rate_used
      }).eq('id', upd.id)
    ))
  }

  return lines.length
}

async function updateAccountDisplayBalancesBulk(companyId: string, rate: number, newCurrency: string): Promise<number> {
  const client = getClient()

  const { data: accounts, error } = await client
    .from('chart_of_accounts')
    .select('id, opening_balance, original_opening_balance')
    .eq('company_id', companyId)

  if (error || !accounts?.length) return 0

  const updates = accounts.map(acc => ({
    id: acc.id,
    display_opening_balance: convertAmount(acc.original_opening_balance || acc.opening_balance || 0, rate),
    display_currency: newCurrency,
    display_rate: rate,
    exchange_rate_used: rate
  }))

  const batchSize = 100
  for (let i = 0; i < updates.length; i += batchSize) {
    const batch = updates.slice(i, i + batchSize)
    await Promise.all(batch.map(upd =>
      client.from('chart_of_accounts').update({
        display_opening_balance: upd.display_opening_balance,
        display_currency: upd.display_currency,
        display_rate: upd.display_rate,
        exchange_rate_used: upd.exchange_rate_used
      }).eq('id', upd.id)
    ))
  }

  return accounts.length
}

async function updateInventoryDisplayAmountsBulk(companyId: string, rate: number, newCurrency: string): Promise<number> {
  const client = getClient()

  const { data: transactions, error } = await client
    .from('inventory_transactions')
    .select('id, unit_cost, total_cost, original_unit_cost, original_total_cost')
    .eq('company_id', companyId)

  if (error || !transactions?.length) return 0

  const updates = transactions.map(t => ({
    id: t.id,
    display_unit_cost: convertAmount(t.original_unit_cost || t.unit_cost || 0, rate),
    display_total_cost: convertAmount(t.original_total_cost || t.total_cost || 0, rate),
    display_currency: newCurrency,
    exchange_rate_used: rate
  }))

  const batchSize = 100
  for (let i = 0; i < updates.length; i += batchSize) {
    const batch = updates.slice(i, i + batchSize)
    await Promise.all(batch.map(upd =>
      client.from('inventory_transactions').update({
        display_unit_cost: upd.display_unit_cost,
        display_total_cost: upd.display_total_cost,
        display_currency: upd.display_currency,
        exchange_rate_used: upd.exchange_rate_used
      }).eq('id', upd.id)
    ))
  }

  return transactions.length
}

// Reset to original currency - clears display values and restores originals
export async function resetToOriginalCurrency(companyId: string): Promise<ConversionResult> {
  const client = getClient()
  const originalCurrency = getOriginalSystemCurrency()

  try {
    // Log this reset operation
    await logExchangeRateConversion(
      companyId,
      'RESET_TO_ORIGINAL',
      'CURRENT',
      originalCurrency,
      1,
      `Reset to original system currency: ${originalCurrency}`
    )

    // Clear display values for all tables in parallel
    await Promise.all([
      client.from('invoices')
        .update({ display_currency: null, display_total: null, display_subtotal: null, display_paid: null, display_rate: null, exchange_rate_used: 1 })
        .eq('company_id', companyId),

      client.from('bills')
        .update({ display_currency: null, display_total: null, display_subtotal: null, display_paid: null, display_rate: null, exchange_rate_used: 1 })
        .eq('company_id', companyId),

      client.from('payments')
        .update({ display_currency: null, display_amount: null, display_rate: null, exchange_rate_used: 1 })
        .eq('company_id', companyId),

      client.from('products')
        .update({ display_currency: null, display_unit_price: null, display_cost_price: null, display_rate: null, exchange_rate_used: 1 })
        .eq('company_id', companyId),

      client.from('chart_of_accounts')
        .update({ display_currency: null, display_opening_balance: null, display_rate: null, exchange_rate_used: 1 })
        .eq('company_id', companyId),

      client.from('inventory_transactions')
        .update({ display_currency: null, display_unit_cost: null, display_total_cost: null, exchange_rate_used: 1 })
        .eq('company_id', companyId)
    ])

    // Handle journal entry lines separately (need journal_entry_ids first)
    const { data: entries } = await client
      .from('journal_entries')
      .select('id')
      .eq('company_id', companyId)

    if (entries?.length) {
      const entryIds = entries.map(e => e.id)
      await client
        .from('journal_entry_lines')
        .update({ display_debit: null, display_credit: null, display_rate: null, display_currency: null, exchange_rate_used: 1 })
        .in('journal_entry_id', entryIds)
    }

    return { success: true }
  } catch (error: unknown) {
    console.error('Reset error:', error)
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

// Get the display amount (converted if available, otherwise original)
export function getDisplayAmount(
  originalAmount: number,
  displayAmount: number | null | undefined,
  displayCurrency: string | null | undefined,
  currentCurrency: string
): number {
  // If we have a display amount and it matches current currency, use it
  if (displayAmount != null && displayCurrency === currentCurrency) {
    return displayAmount
  }
  // Otherwise return original
  return originalAmount
}

// Convert a single transaction amount (for use in forms)
export async function convertTransactionAmount(
  companyId: string,
  amount: number,
  fromCurrency: string,
  toCurrency: string,
  transactionType: string,
  transactionId?: string
): Promise<{ convertedAmount: number; rate: number; logId?: string }> {
  const rate = await getExchangeRate(fromCurrency, toCurrency, companyId)
  const convertedAmount = convertAmount(amount, rate)

  // Log this conversion
  const logId = await logExchangeRateConversion(
    companyId,
    transactionType,
    fromCurrency,
    toCurrency,
    rate,
    `Transaction conversion: ${amount} ${fromCurrency} → ${convertedAmount} ${toCurrency}`,
    transactionId,
    amount,
    convertedAmount
  )

  return { convertedAmount, rate, logId: logId || undefined }
}

// Initialize original values for existing records (run once during migration)
export async function initializeOriginalValues(companyId: string): Promise<{ success: boolean; error?: string }> {
  const client = getClient()
  const originalCurrency = getOriginalSystemCurrency()

  try {
    // Update invoices - set original values if not already set
    await client.rpc('exec_sql', {
      sql: `
        UPDATE invoices
        SET original_total = COALESCE(original_total, total_amount),
            original_subtotal = COALESCE(original_subtotal, subtotal),
            original_paid = COALESCE(original_paid, paid_amount),
            original_currency = COALESCE(original_currency, '${originalCurrency}')
        WHERE company_id = '${companyId}'
        AND (original_total IS NULL OR original_currency IS NULL OR original_paid IS NULL)
      `
    }).catch(() => {
      // Fallback if RPC not available
      console.log('RPC not available, using direct updates')
    })

    // Direct update for invoices
    const { data: invoices } = await client
      .from('invoices')
      .select('id, total_amount, subtotal, paid_amount, original_total, original_paid, original_currency')
      .eq('company_id', companyId)

    if (invoices) {
      for (const inv of invoices) {
        if (!inv.original_total || !inv.original_currency || inv.original_paid == null) {
          await client.from('invoices').update({
            original_total: inv.original_total || inv.total_amount,
            original_subtotal: inv.original_total || inv.subtotal,
            original_paid: inv.original_paid ?? inv.paid_amount,
            original_currency: inv.original_currency || originalCurrency
          }).eq('id', inv.id)
        }
      }
    }

    // Similar for other tables...
    // Products
    const { data: products } = await client
      .from('products')
      .select('id, unit_price, cost_price, original_unit_price, original_currency')
      .eq('company_id', companyId)

    if (products) {
      for (const p of products) {
        if (!p.original_unit_price || !p.original_currency) {
          await client.from('products').update({
            original_unit_price: p.original_unit_price || p.unit_price,
            original_cost_price: p.original_cost_price || p.cost_price,
            original_currency: p.original_currency || originalCurrency
          }).eq('id', p.id)
        }
      }
    }

    return { success: true }
  } catch (error: unknown) {
    console.error('Initialize original values error:', error)
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

// Get conversion history for a company
export async function getConversionHistory(
  companyId: string,
  limit: number = 50
): Promise<Array<{
  id: string
  transaction_type: string
  from_currency: string
  to_currency: string
  rate_used: number
  conversion_date: string
  notes: string
}>> {
  const client = getClient()

  const { data, error } = await client
    .from('exchange_rate_log')
    .select('*')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('Error fetching conversion history:', error)
    return []
  }

  return data || []
}

