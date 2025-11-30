import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Currency symbols mapping
export const currencySymbols: Record<string, string> = {
  EGP: '£', USD: '$', EUR: '€', GBP: '£', SAR: '﷼', AED: 'د.إ',
  KWD: 'د.ك', QAR: '﷼', BHD: 'د.ب', OMR: '﷼', JOD: 'د.أ', LBP: 'ل.ل'
}

// Get exchange rate from database or API
export async function getExchangeRate(fromCurrency: string, toCurrency: string, companyId?: string): Promise<number> {
  if (fromCurrency === toCurrency) return 1

  try {
    // Try database first - direct rate
    if (companyId) {
      const { data } = await supabase
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
      const { data: reverseData } = await supabase
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

// Convert amount with precision
export function convertAmount(amount: number, rate: number): number {
  return Math.round(amount * rate * 100) / 100
}

// Main conversion function - converts all amounts to new display currency
export async function convertAllToDisplayCurrency(
  companyId: string,
  newCurrency: string,
  rate: number
): Promise<{ success: boolean; error?: string }> {
  try {
    // 1. Update invoices - set display values and calculate converted amounts
    await supabase
      .from('invoices')
      .update({
        display_currency: newCurrency,
        display_rate: rate
      })
      .eq('company_id', companyId)

    // Calculate display_total and display_subtotal manually
    await updateInvoiceDisplayAmounts(companyId, rate, newCurrency)

    // 2. Update bills
    await supabase
      .from('bills')
      .update({
        display_currency: newCurrency,
        display_rate: rate
      })
      .eq('company_id', companyId)

    await updateBillDisplayAmounts(companyId, rate, newCurrency)

    // 3. Update payments
    await supabase
      .from('payments')
      .update({
        display_currency: newCurrency,
        display_rate: rate
      })
      .eq('company_id', companyId)

    await updatePaymentDisplayAmounts(companyId, rate, newCurrency)

    // 4. Update products
    await supabase
      .from('products')
      .update({
        display_currency: newCurrency,
        display_rate: rate
      })
      .eq('company_id', companyId)

    await updateProductDisplayPrices(companyId, rate, newCurrency)

    // 5. Update journal entries
    await updateJournalDisplayAmounts(companyId, rate)

    // 6. Update chart of accounts
    await updateAccountDisplayBalances(companyId, rate)

    return { success: true }
  } catch (error: unknown) {
    console.error('Conversion error:', error)
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

// Helper functions for individual table updates
async function updateInvoiceDisplayAmounts(companyId: string, rate: number, newCurrency: string) {
  const { data: invoices } = await supabase
    .from('invoices')
    .select('id, total_amount, subtotal')
    .eq('company_id', companyId)

  if (invoices) {
    for (const inv of invoices) {
      await supabase
        .from('invoices')
        .update({
          display_total: convertAmount(inv.total_amount || 0, rate),
          display_subtotal: convertAmount(inv.subtotal || 0, rate),
          display_currency: newCurrency,
          display_rate: rate
        })
        .eq('id', inv.id)
    }
  }
}

async function updateBillDisplayAmounts(companyId: string, rate: number, newCurrency: string) {
  const { data: bills } = await supabase
    .from('bills')
    .select('id, total_amount, subtotal')
    .eq('company_id', companyId)

  if (bills) {
    for (const bill of bills) {
      await supabase
        .from('bills')
        .update({
          display_total: convertAmount(bill.total_amount || 0, rate),
          display_subtotal: convertAmount(bill.subtotal || 0, rate),
          display_currency: newCurrency,
          display_rate: rate
        })
        .eq('id', bill.id)
    }
  }
}

async function updatePaymentDisplayAmounts(companyId: string, rate: number, newCurrency: string) {
  const { data: payments } = await supabase
    .from('payments')
    .select('id, amount')
    .eq('company_id', companyId)

  if (payments) {
    for (const payment of payments) {
      await supabase
        .from('payments')
        .update({
          display_amount: convertAmount(payment.amount || 0, rate),
          display_currency: newCurrency,
          display_rate: rate
        })
        .eq('id', payment.id)
    }
  }
}

async function updateProductDisplayPrices(companyId: string, rate: number, newCurrency: string) {
  const { data: products } = await supabase
    .from('products')
    .select('id, unit_price, cost_price')
    .eq('company_id', companyId)

  if (products) {
    for (const product of products) {
      await supabase
        .from('products')
        .update({
          display_unit_price: convertAmount(product.unit_price || 0, rate),
          display_cost_price: convertAmount(product.cost_price || 0, rate),
          display_currency: newCurrency,
          display_rate: rate
        })
        .eq('id', product.id)
    }
  }
}

async function updateJournalDisplayAmounts(companyId: string, rate: number) {
  // Get journal entries for this company
  const { data: entries } = await supabase
    .from('journal_entries')
    .select('id')
    .eq('company_id', companyId)

  if (entries) {
    for (const entry of entries) {
      const { data: lines } = await supabase
        .from('journal_entry_lines')
        .select('id, original_debit, original_credit, debit_amount, credit_amount')
        .eq('journal_entry_id', entry.id)

      if (lines) {
        for (const line of lines) {
          await supabase
            .from('journal_entry_lines')
            .update({
              display_debit: convertAmount(line.original_debit || line.debit_amount || 0, rate),
              display_credit: convertAmount(line.original_credit || line.credit_amount || 0, rate),
              display_rate: rate
            })
            .eq('id', line.id)
        }
      }
    }
  }
}

async function updateAccountDisplayBalances(companyId: string, rate: number) {
  const { data: accounts } = await supabase
    .from('chart_of_accounts')
    .select('id, original_opening_balance, opening_balance')
    .eq('company_id', companyId)

  if (accounts) {
    for (const account of accounts) {
      await supabase
        .from('chart_of_accounts')
        .update({
          display_opening_balance: convertAmount(account.original_opening_balance || account.opening_balance || 0, rate),
          display_rate: rate
        })
        .eq('id', account.id)
    }
  }
}

// Reset to original currency - clears display values
export async function resetToOriginalCurrency(companyId: string): Promise<{ success: boolean; error?: string }> {
  try {
    // Clear display values for all tables
    await supabase
      .from('invoices')
      .update({ display_currency: null, display_total: null, display_subtotal: null, display_rate: null })
      .eq('company_id', companyId)

    await supabase
      .from('bills')
      .update({ display_currency: null, display_total: null, display_subtotal: null, display_rate: null })
      .eq('company_id', companyId)

    await supabase
      .from('payments')
      .update({ display_currency: null, display_amount: null, display_rate: null })
      .eq('company_id', companyId)

    await supabase
      .from('products')
      .update({ display_currency: null, display_unit_price: null, display_cost_price: null, display_rate: null })
      .eq('company_id', companyId)

    // Get journal entries for this company
    const { data: entries } = await supabase
      .from('journal_entries')
      .select('id')
      .eq('company_id', companyId)

    if (entries) {
      for (const entry of entries) {
        await supabase
          .from('journal_entry_lines')
          .update({ display_debit: null, display_credit: null, display_rate: null })
          .eq('journal_entry_id', entry.id)
      }
    }

    await supabase
      .from('chart_of_accounts')
      .update({ display_currency: null, display_opening_balance: null, display_rate: null })
      .eq('company_id', companyId)

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

