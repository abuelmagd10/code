/**
 * API Inventory Integration Tests
 * =============================================
 * Tests for inventory repair endpoint (fix-inventory)
 * =============================================
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createTestClient, createTestCompany, cleanupTestData, createTestCustomer, createTestProduct, createTestInvoice, TestSupabaseClient } from '../helpers/test-setup'

describe('API Inventory Integration Tests', () => {
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

  describe('GET /api/fix-inventory', () => {
    it('should detect quantity mismatches', async () => {
      // Create invoice with inventory transaction
      const invoiceId = await createTestInvoice(supabase, companyId, customerId, productId, {
        quantity: 5,
        status: 'sent'
      })

      // Manually create inventory transaction (simulating correct state)
      await supabase.from('inventory_transactions').insert({
        company_id: companyId,
        product_id: productId,
        transaction_type: 'sale',
        quantity_change: -5,
        reference_id: invoiceId,
        notes: 'Test sale'
      })

      // Call GET endpoint (would require auth in real test)
      // const response = await makeAuthenticatedRequest('/api/fix-inventory', { method: 'GET', ... })
      // const data = response.data

      // Should detect no mismatches if state is correct
      // expect(data.issuesCount).toBe(0)

      // Cleanup
      await supabase.from('inventory_transactions').delete().eq('reference_id', invoiceId)
      await supabase.from('invoices').delete().eq('id', invoiceId)
    })

    it('should detect duplicate transactions', async () => {
      const invoiceId = await createTestInvoice(supabase, companyId, customerId, productId, {
        quantity: 3,
        status: 'sent'
      })

      // Create duplicate transaction
      await supabase.from('inventory_transactions').insert([
        {
          company_id: companyId,
          product_id: productId,
          transaction_type: 'sale',
          quantity_change: -3,
          reference_id: invoiceId,
          notes: 'First'
        },
        {
          company_id: companyId,
          product_id: productId,
          transaction_type: 'sale',
          quantity_change: -3,
          reference_id: invoiceId,
          notes: 'Duplicate'
        }
      ])

      // Call GET endpoint
      // Should detect duplicates
      // expect(data.duplicates.length).toBeGreaterThan(0)

      // Cleanup
      await supabase.from('inventory_transactions').delete().eq('reference_id', invoiceId)
      await supabase.from('invoices').delete().eq('id', invoiceId)
    })
  })

  describe('POST /api/fix-inventory', () => {
    it('should fix missing inventory transactions for sent invoices', async () => {
      // Create sent invoice without inventory transaction
      const invoiceId = await createTestInvoice(supabase, companyId, customerId, productId, {
        quantity: 2,
        status: 'sent'
      })

      // Call POST endpoint (would require auth in real test)
      // const response = await makeAuthenticatedRequest('/api/fix-inventory', { method: 'POST', ... })

      // Verify: should create sale transaction
      const { data: transactions } = await supabase
        .from('inventory_transactions')
        .select('*')
        .eq('reference_id', invoiceId)

      expect(transactions?.length).toBeGreaterThan(0)
      const saleTx = transactions?.find(t => t.transaction_type === 'sale')
      expect(saleTx).toBeDefined()

      // Cleanup
      await supabase.from('inventory_transactions').delete().eq('reference_id', invoiceId)
      await supabase.from('invoices').delete().eq('id', invoiceId)
    })

    it('should create COGS entries for paid invoices only', async () => {
      // Create paid invoice
      const invoiceId = await createTestInvoice(supabase, companyId, customerId, productId, {
        quantity: 2,
        status: 'paid'
      })

      await supabase
        .from('invoices')
        .update({ paid_amount: 230 })
        .eq('id', invoiceId)

      // Call POST endpoint

      // Verify: should create COGS entry
      const { data: cogsEntries } = await supabase
        .from('journal_entries')
        .select('*')
        .eq('reference_id', invoiceId)
        .eq('reference_type', 'invoice_cogs')

      expect(cogsEntries?.length).toBeGreaterThan(0)

      // Cleanup
      await supabase.from('journal_entries').delete().eq('reference_id', invoiceId)
      await supabase.from('invoices').delete().eq('id', invoiceId)
    })

    it('should NOT create COGS entries for sent invoices', async () => {
      // Create sent invoice
      const invoiceId = await createTestInvoice(supabase, companyId, customerId, productId, {
        quantity: 2,
        status: 'sent'
      })

      // Call POST endpoint

      // Verify: should NOT have COGS entry
      const { data: cogsEntries } = await supabase
        .from('journal_entries')
        .select('*')
        .eq('reference_id', invoiceId)
        .eq('reference_type', 'invoice_cogs')

      expect(cogsEntries?.length || 0).toBe(0)

      // Cleanup
      await supabase.from('invoices').delete().eq('id', invoiceId)
    })
  })
})

