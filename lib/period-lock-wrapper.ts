/**
 * Period Lock Wrapper - حماية جميع العمليات المحاسبية
 * Wraps operations to check period lock before execution
 */

import { SupabaseClient } from "@supabase/supabase-js"
import { assertPeriodNotLocked } from "./accounting-period-lock"

/**
 * Wrapper function for operations that create/modify journal entries
 * 
 * Usage:
 * await withPeriodLockCheck(supabase, companyId, date, async () => {
 *   // Your operation here
 * })
 */
export async function withPeriodLockCheck<T>(
  supabase: SupabaseClient,
  companyId: string,
  date: string,
  operation: () => Promise<T>
): Promise<T> {
  // ✅ Check period lock before operation
  await assertPeriodNotLocked(supabase, { companyId, date })
  
  // Execute operation
  return await operation()
}

/**
 * Helper to get date from various sources
 */
export function getDateFromSource(source: {
  entry_date?: string
  invoice_date?: string
  payment_date?: string
  bill_date?: string
  return_date?: string
  credit_date?: string
  delivery_date?: string
  write_off_date?: string
  transaction_date?: string
  date?: string
}): string {
  return (
    source.entry_date ||
    source.invoice_date ||
    source.payment_date ||
    source.bill_date ||
    source.return_date ||
    source.credit_date ||
    source.delivery_date ||
    source.write_off_date ||
    source.transaction_date ||
    source.date ||
    new Date().toISOString().split("T")[0]
  )
}
