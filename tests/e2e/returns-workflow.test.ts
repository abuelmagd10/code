/**
 * E2E Tests: Returns Workflow
 * =============================================
 * End-to-end test for: Returns (Partial / Full)
 * =============================================
 * 📌 النمط المحاسبي الصارم: لا COGS
 * - مرتجع Sent: مخزون فقط
 * - مرتجع Paid: مخزون + قيد sales_return + Customer Credit
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createTestClient, createTestCompany, cleanupTestData, createTestCustomer, createTestProduct, createTestInvoice, TestSupabaseClient } from '../helpers/test-setup'

describe('E2E: Returns Workflow (Partial / Full)', () => {
  let supabase: TestSupabaseClient
  let companyId: string
  let userId: string
  let customerId: string
  let productId: string

  beforeAll(async () => {
    supabase = createTestClient()
    const setup = await createTestCompany(supabase)
    companyId = setup.companyId
    userId = setup.userId

    customerId = await createTestCustomer(supabase, companyId)
    productId = await createTestProduct(supabase, companyId, { quantity: 100, costPrice: 50, unitPrice: 100 })
  })

  afterAll(async () => {
    if (companyId && userId) {
      await cleanupTestData(supabase, companyId, userId)
    }
  })

  describe('Partial Return Workflow', () => {
    // 📌 النمط المحاسبي الصارم: لا COGS Reversal
    it('should handle: Paid Invoice → Partial Return → Inventory + Return Entry (NO COGS)', async () => {
      // Step 1: Create and pay invoice
      const invoiceId = await createTestInvoice(supabase, companyId, customerId, productId, {
        quantity: 10,
        status: 'paid'
      })

      await supabase
        .from('invoices')
        .update({ paid_amount: 1150 })
        .eq('id', invoiceId)

      // Create accounting entries (via fix endpoint)
      // ... (would call fix endpoint in real test)

      // Step 2: Create partial return
      const returnQty = 3
      await supabase
        .from('invoice_items')
        .update({ returned_quantity: returnQty })
        .eq('invoice_id', invoiceId)

      await supabase
        .from('invoices')
        .update({
          returned_amount: 345, // 3 * 115
          invoice_type: 'sales_return'
        })
        .eq('id', invoiceId)

      // Call fix endpoint to create return entries

      // Verify: Should have return entry
      const { data: returnEntries } = await supabase
        .from('journal_entries')
        .select('*')
        .eq('reference_id', invoiceId)
        .eq('reference_type', 'sales_return')

      expect(returnEntries?.length).toBeGreaterThan(0)

      // 📌 النمط المحاسبي الصارم: لا COGS Reversal
      // COGS يُحسب عند الحاجة من cost_price × quantity المباع

      // Verify: Should have sale_return inventory transaction
      const { data: returnTx } = await supabase
        .from('inventory_transactions')
        .select('*')
        .eq('reference_id', invoiceId)
        .eq('transaction_type', 'sale_return')

      expect(returnTx?.length).toBeGreaterThan(0)
      expect(returnTx?.[0].quantity_change).toBe(returnQty) // Positive for return

      // Cleanup
      await supabase.from('journal_entries').delete().eq('reference_id', invoiceId)
      await supabase.from('inventory_transactions').delete().eq('reference_id', invoiceId)
      await supabase.from('invoices').delete().eq('id', invoiceId)
    })
  })

  describe('Full Return Workflow', () => {
    it('should handle: Paid Invoice → Full Return → Customer Credit', async () => {
      // Step 1: Create and pay invoice
      const invoiceId = await createTestInvoice(supabase, companyId, customerId, productId, {
        quantity: 5,
        status: 'paid'
      })

      await supabase
        .from('invoices')
        .update({ paid_amount: 575 })
        .eq('id', invoiceId)

      // Step 2: Create full return
      await supabase
        .from('invoice_items')
        .update({ returned_quantity: 5 })
        .eq('invoice_id', invoiceId)

      await supabase
        .from('invoices')
        .update({
          returned_amount: 575,
          invoice_type: 'sales_return'
        })
        .eq('id', invoiceId)

      // Call fix endpoint

      // Verify: Should have customer credit
      const { data: credits } = await supabase
        .from('customer_credits')
        .select('*')
        .eq('reference_id', invoiceId)
        .eq('reference_type', 'invoice_return')

      expect(credits?.length).toBeGreaterThan(0)

      // Cleanup
      await supabase.from('customer_credits').delete().eq('reference_id', invoiceId)
      await supabase.from('journal_entries').delete().eq('reference_id', invoiceId)
      await supabase.from('inventory_transactions').delete().eq('reference_id', invoiceId)
      await supabase.from('invoices').delete().eq('id', invoiceId)
    })
  })
})

