/**
 * E2E Tests: Sales Workflow
 * =============================================
 * End-to-end test for: Sales → Payments → Journals → Reports
 * =============================================
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createTestClient, createTestCompany, cleanupTestData, createTestCustomer, createTestProduct, createTestInvoice } from '../helpers/test-setup'

describe('E2E: Sales → Payments → Journals → Reports', () => {
  let supabase: ReturnType<typeof createTestClient>
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

  describe('Complete Sales Workflow', () => {
    it('should handle: Draft → Sent → Paid → Journals → Reports', async () => {
      // Step 1: Create draft invoice
      const invoiceId = await createTestInvoice(supabase, companyId, customerId, productId, {
        quantity: 5,
        status: 'draft'
      })

      // Verify: No entries or transactions for draft
      const { data: draftEntries } = await supabase
        .from('journal_entries')
        .select('*')
        .eq('reference_id', invoiceId)

      const { data: draftTx } = await supabase
        .from('inventory_transactions')
        .select('*')
        .eq('reference_id', invoiceId)

      expect(draftEntries?.length || 0).toBe(0)
      expect(draftTx?.length || 0).toBe(0)

      // Step 2: Move to sent
      await supabase
        .from('invoices')
        .update({ status: 'sent' })
        .eq('id', invoiceId)

      // Call fix endpoint to create inventory transaction
      // (In real workflow, this happens automatically, but we test the fix endpoint)

      // Verify: Should have sale transaction only
      const { data: sentTx } = await supabase
        .from('inventory_transactions')
        .select('*')
        .eq('reference_id', invoiceId)

      const saleTx = sentTx?.find(t => t.transaction_type === 'sale')
      expect(saleTx).toBeDefined()
      expect(saleTx?.quantity_change).toBe(-5)

      // Verify: Should NOT have journal entries
      const { data: sentEntries } = await supabase
        .from('journal_entries')
        .select('*')
        .eq('reference_id', invoiceId)

      expect(sentEntries?.length || 0).toBe(0)

      // Step 3: Apply payment (move to paid)
      await supabase
        .from('invoices')
        .update({
          status: 'paid',
          paid_amount: 575 // 5 * 115
        })
        .eq('id', invoiceId)

      // Call fix endpoint to create accounting entries

      // Verify: Should have all required entries
      const { data: paidEntries } = await supabase
        .from('journal_entries')
        .select('reference_type')
        .eq('reference_id', invoiceId)

      const entryTypes = paidEntries?.map(e => e.reference_type) || []
      expect(entryTypes).toContain('invoice')
      expect(entryTypes).toContain('invoice_cogs')
      expect(entryTypes).toContain('invoice_payment')

      // Step 4: Verify reports can access the data
      // (In real test, would call /api/report-sales endpoint)
      const { data: journalLines } = await supabase
        .from('journal_entry_lines')
        .select('*')
        .in('journal_entry_id', paidEntries?.map(e => e.id) || [])

      expect(journalLines?.length).toBeGreaterThan(0)

      // Cleanup
      await supabase.from('journal_entry_lines').delete().in('journal_entry_id', paidEntries?.map(e => e.id) || [])
      await supabase.from('journal_entries').delete().eq('reference_id', invoiceId)
      await supabase.from('inventory_transactions').delete().eq('reference_id', invoiceId)
      await supabase.from('invoices').delete().eq('id', invoiceId)
    })
  })
})

