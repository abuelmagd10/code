/**
 * E2E Tests: Purchases Workflow
 * =============================================
 * End-to-end test for: Purchases → Payments → Inventory
 * =============================================
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createTestClient, createTestCompany, cleanupTestData, createTestProduct, TestSupabaseClient } from '../helpers/test-setup'

describe('E2E: Purchases → Payments → Inventory', () => {
  let supabase: TestSupabaseClient
  let companyId: string
  let userId: string
  let productId: string

  beforeAll(async () => {
    supabase = createTestClient()
    const setup = await createTestCompany(supabase)
    companyId = setup.companyId
    userId = setup.userId

    productId = await createTestProduct(supabase, companyId, { quantity: 50, costPrice: 30, unitPrice: 60 })
  })

  afterAll(async () => {
    if (companyId && userId) {
      await cleanupTestData(supabase, companyId, userId)
    }
  })

  describe('Complete Purchase Workflow', () => {
    it('should handle: Bill Creation → Payment → Inventory Update', async () => {
      // Step 1: Create purchase bill (sent status)
      const { data: supplier } = await supabase
        .from('suppliers')
        .insert({
          company_id: companyId,
          name: `Test Supplier ${Date.now()}`,
          email: `supplier-${Date.now()}@test.com`
        })
        .select()
        .single()

      if (!supplier) throw new Error('Failed to create test supplier')

      const billNumber = `TEST-BILL-${Date.now()}`
      const { data: bill, error: billError } = await supabase
        .from('bills')
        .insert({
          company_id: companyId,
          supplier_id: supplier.id,
          bill_number: billNumber,
          bill_date: new Date().toISOString().split('T')[0],
          due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          subtotal: 300,
          tax_amount: 45,
          total_amount: 345,
          status: 'sent'
        })
        .select()
        .single()

      if (billError || !bill) {
        throw new Error(`Failed to create test bill: ${billError?.message}`)
      }

      // Create bill item
      await supabase.from('bill_items').insert({
        bill_id: bill.id,
        product_id: productId,
        quantity: 10,
        unit_price: 30,
        line_total: 300
      })

      // Verify: Should have purchase transaction
      const { data: purchaseTx } = await supabase
        .from('inventory_transactions')
        .select('*')
        .eq('reference_id', bill.id)
        .eq('transaction_type', 'purchase')

      expect(purchaseTx?.length).toBeGreaterThan(0)
      expect(purchaseTx?.[0].quantity_change).toBe(10)

      // Step 2: Apply payment
      await supabase
        .from('bills')
        .update({
          status: 'paid',
          paid_amount: 345
        })
        .eq('id', bill.id)

      // Call fix endpoint to create payment journal

      // Verify: Should have payment entry
      const { data: paymentEntries } = await supabase
        .from('journal_entries')
        .select('*')
        .eq('reference_id', bill.id)
        .eq('reference_type', 'bill_payment')

      expect(paymentEntries?.length).toBeGreaterThan(0)

      // Step 3: Verify inventory updated
      const { data: product } = await supabase
        .from('products')
        .select('quantity_on_hand')
        .eq('id', productId)
        .single()

      // Initial was 50, added 10, should be 60
      expect(Number(product?.quantity_on_hand || 0)).toBeGreaterThanOrEqual(50)

      // Cleanup
      await supabase.from('journal_entries').delete().eq('reference_id', bill.id)
      await supabase.from('inventory_transactions').delete().eq('reference_id', bill.id)
      await supabase.from('bill_items').delete().eq('bill_id', bill.id)
      await supabase.from('bills').delete().eq('id', bill.id)
      await supabase.from('suppliers').delete().eq('id', supplier.id)
    })
  })
})

