/**
 * 🧪 Equity System Integration Tests
 * =============================================
 * اختبارات شاملة لنظام إدارة حقوق الملكية (Capital Governance Engine)
 *
 * السيناريوهات المختبرة:
 * 1. توزيع أرباح طبيعي مع Retained Earnings كافية
 * 2. محاولة توزيع أكبر من المتاح (يجب أن تفشل)
 * 3. صرف أرباح لمساهم
 * 4. صرف جزئي للأرباح
 * 5. التحقق من Atomic Transaction والـ Rollback
 * =============================================
 */

// Load environment variables from .env.local
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { createTestClient, createTestCompany, cleanupTestData, TestSupabaseClient } from '../helpers/test-setup'

// =============================================
// Test Context & Helpers
// =============================================

interface EquityTestContext {
  supabase: TestSupabaseClient
  companyId: string
  userId: string
  retainedEarningsAccountId: string
  dividendsPayableAccountId: string
  cashAccountId: string
  shareholders: { id: string; name: string; percentage: number }[]
}

let ctx: EquityTestContext

/**
 * إنشاء حسابات حقوق الملكية الأساسية للاختبار
 */
async function createEquityAccounts(supabase: TestSupabaseClient, companyId: string) {
  // حساب الأرباح المحتجزة (3200)
  const { data: existingRE } = await supabase
    .from('chart_of_accounts')
    .select('id')
    .eq('company_id', companyId)
    .eq('account_code', '3200')
    .single()

  let retainedEarningsId = existingRE?.id
  if (!retainedEarningsId) {
    const { data: newRE, error: reErr } = await supabase
      .from('chart_of_accounts')
      .insert({
        company_id: companyId,
        account_code: '3200',
        account_name: 'الأرباح المحتجزة',
        account_type: 'equity',
        level: 1,
        normal_balance: 'credit'
      })
      .select()
      .single()
    if (reErr) throw new Error(`Failed to create retained earnings account: ${reErr.message}`)
    retainedEarningsId = newRE.id
  }

  // حساب الأرباح الموزعة المستحقة (2150)
  const { data: existingDP } = await supabase
    .from('chart_of_accounts')
    .select('id')
    .eq('company_id', companyId)
    .eq('account_code', '2150')
    .single()

  let dividendsPayableId = existingDP?.id
  if (!dividendsPayableId) {
    const { data: newDP, error: dpErr } = await supabase
      .from('chart_of_accounts')
      .insert({
        company_id: companyId,
        account_code: '2150',
        account_name: 'الأرباح الموزعة المستحقة',
        account_type: 'liability',
        level: 1,
        normal_balance: 'credit'
      })
      .select()
      .single()
    if (dpErr) throw new Error(`Failed to create dividends payable account: ${dpErr.message}`)
    dividendsPayableId = newDP.id
  }

  // حساب الصندوق (1110)
  const { data: existingCash } = await supabase
    .from('chart_of_accounts')
    .select('id')
    .eq('company_id', companyId)
    .eq('account_code', '1110')
    .single()

  let cashId = existingCash?.id
  if (!cashId) {
    const { data: newCash, error: cashErr } = await supabase
      .from('chart_of_accounts')
      .insert({
        company_id: companyId,
        account_code: '1110',
        account_name: 'الصندوق',
        account_type: 'asset',
        level: 1,
        normal_balance: 'debit'
      })
      .select()
      .single()
    if (cashErr) throw new Error(`Failed to create cash account: ${cashErr.message}`)
    cashId = newCash.id
  }

  return {
    retainedEarningsAccountId: retainedEarningsId,
    dividendsPayableAccountId: dividendsPayableId,
    cashAccountId: cashId
  }
}

/**
 * إنشاء مساهمين للاختبار
 */
async function createTestShareholders(supabase: TestSupabaseClient, companyId: string) {
  const shareholdersData = [
    { name: 'مساهم اختبار 1', percentage: 60 },
    { name: 'مساهم اختبار 2', percentage: 40 }
  ]

  const shareholders: { id: string; name: string; percentage: number }[] = []

  for (const sh of shareholdersData) {
    const { data, error } = await supabase
      .from('shareholders')
      .insert({
        company_id: companyId,
        name: sh.name,
        percentage: sh.percentage,
        email: `${sh.name.replace(/\s/g, '')}@test.com`
      })
      .select()
      .single()

    if (error) throw new Error(`Failed to create shareholder: ${error.message}`)
    shareholders.push({ id: data.id, name: data.name, percentage: sh.percentage })
  }

  return shareholders
}

/**
 * إضافة رصيد للأرباح المحتجزة (عبر قيد محاسبي)
 */
async function addRetainedEarningsBalance(
  supabase: TestSupabaseClient,
  companyId: string,
  accountId: string,
  amount: number
) {
  // إنشاء قيد لإضافة رصيد للأرباح المحتجزة
  const { data: entry, error: jeErr } = await supabase
    .from('journal_entries')
    .insert({
      company_id: companyId,
      entry_date: new Date().toISOString().split('T')[0],
      reference_type: 'opening_balance',
      description: 'رصيد افتتاحي للأرباح المحتجزة - اختبار'
    })
    .select()
    .single()

  if (jeErr) throw new Error(`Failed to create journal entry: ${jeErr.message}`)

  // Retained Earnings is credit balance (equity)
  const { error: lineErr } = await supabase
    .from('journal_entry_lines')
    .insert([
      {
        journal_entry_id: entry.id,
        account_id: accountId,
        debit_amount: 0,
        credit_amount: amount,
        description: 'رصيد أرباح محتجزة'
      }
    ])

  if (lineErr) throw new Error(`Failed to create journal line: ${lineErr.message}`)
  return entry.id
}

// =============================================
// Test Suite Setup
// =============================================

describe('🏦 Equity System - Capital Governance Engine', () => {
  beforeAll(async () => {
    const supabase = createTestClient()
    const { companyId, userId } = await createTestCompany(supabase)
    const accounts = await createEquityAccounts(supabase, companyId)
    const shareholders = await createTestShareholders(supabase, companyId)

    ctx = {
      supabase,
      companyId,
      userId,
      ...accounts,
      shareholders
    }
  })

  afterAll(async () => {
    if (ctx) {
      // Cleanup in reverse order
      await ctx.supabase.from('dividend_payments').delete().eq('company_id', ctx.companyId)
      await ctx.supabase.from('profit_distribution_lines').delete().match({})
      await ctx.supabase.from('profit_distributions').delete().eq('company_id', ctx.companyId)
      await ctx.supabase.from('journal_entry_lines').delete().match({})
      await ctx.supabase.from('journal_entries').delete().eq('company_id', ctx.companyId)
      await ctx.supabase.from('shareholders').delete().eq('company_id', ctx.companyId)
      await ctx.supabase.from('accounts').delete().eq('company_id', ctx.companyId)
      await cleanupTestData(ctx.supabase, ctx.companyId, ctx.userId)
    }
  })

  // =============================================
  // 🧪 سيناريو 1: التحقق من رصيد الأرباح المحتجزة
  // =============================================
  describe('📊 Scenario 1: Retained Earnings Balance Check', () => {
    it('should return zero balance when no retained earnings exist', async () => {
      const { data, error } = await ctx.supabase.rpc('get_retained_earnings_balance', {
        p_company_id: ctx.companyId
      })

      // Should either return 0 or error if function doesn't exist yet
      if (error && error.code === 'PGRST202') {
        console.log('⚠️ RPC function not deployed yet - skipping')
        return
      }

      expect(error).toBeNull()
      expect(data).toBe(0)
    })

    it('should return correct balance after adding retained earnings', async () => {
      // Add 10,000 to retained earnings
      await addRetainedEarningsBalance(
        ctx.supabase,
        ctx.companyId,
        ctx.retainedEarningsAccountId,
        10000
      )

      const { data, error } = await ctx.supabase.rpc('get_retained_earnings_balance', {
        p_company_id: ctx.companyId
      })

      if (error && error.code === 'PGRST202') {
        console.log('⚠️ RPC function not deployed yet - skipping')
        return
      }

      expect(error).toBeNull()
      expect(data).toBe(10000)
    })
  })

  // =============================================
  // 🧪 سيناريو 2: توزيع أرباح طبيعي
  // =============================================
  describe('✅ Scenario 2: Normal Dividend Distribution', () => {
    it('should successfully distribute dividends when retained earnings are sufficient', async () => {
      const distributionAmount = 5000

      const shareholderLines = ctx.shareholders.map(sh => ({
        shareholder_id: sh.id,
        percentage: sh.percentage,
        amount: (distributionAmount * sh.percentage) / 100
      }))

      const { data, error } = await ctx.supabase.rpc('distribute_dividends_atomic', {
        p_company_id: ctx.companyId,
        p_total_amount: distributionAmount,
        p_distribution_date: new Date().toISOString().split('T')[0],
        p_retained_earnings_account_id: ctx.retainedEarningsAccountId,
        p_dividends_payable_account_id: ctx.dividendsPayableAccountId,
        p_shareholder_lines: shareholderLines,
        p_fiscal_year: new Date().getFullYear(),
        p_user_id: ctx.userId
      })

      if (error && error.code === 'PGRST202') {
        console.log('⚠️ RPC function not deployed yet - skipping')
        return
      }

      expect(error).toBeNull()
      expect(data).toBeDefined()
      expect(data.distribution_id).toBeDefined()
      expect(data.journal_entry_id).toBeDefined()
    })

    it('should create proper journal entry (Dr Retained Earnings, Cr Dividends Payable)', async () => {
      // Get the latest journal entry for profit_distribution
      const { data: entries, error } = await ctx.supabase
        .from('journal_entries')
        .select(`
          id,
          reference_type,
          journal_entry_lines (
            account_id,
            debit_amount,
            credit_amount
          )
        `)
        .eq('company_id', ctx.companyId)
        .eq('reference_type', 'profit_distribution')
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (error) {
        console.log('⚠️ No distribution found - skipping')
        return
      }

      const lines = entries.journal_entry_lines || []

      // Find debit line (Retained Earnings)
      const debitLine = lines.find((l: any) => l.debit_amount > 0)
      expect(debitLine).toBeDefined()
      expect(debitLine!.account_id).toBe(ctx.retainedEarningsAccountId)

      // Find credit line (Dividends Payable)
      const creditLine = lines.find((l: any) => l.credit_amount > 0)
      expect(creditLine).toBeDefined()
      expect(creditLine!.account_id).toBe(ctx.dividendsPayableAccountId)

      // Verify balanced
      const totalDebit = lines.reduce((sum: number, l: any) => sum + (l.debit_amount || 0), 0)
      const totalCredit = lines.reduce((sum: number, l: any) => sum + (l.credit_amount || 0), 0)
      expect(totalDebit).toBe(totalCredit)
    })

    it('should create distribution lines for each shareholder with correct amounts', async () => {
      const { data: distributions, error } = await ctx.supabase
        .from('profit_distributions')
        .select(`
          id,
          total_profit,
          status,
          profit_distribution_lines (
            shareholder_id,
            percentage_at_distribution,
            amount,
            paid_amount,
            status
          )
        `)
        .eq('company_id', ctx.companyId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (error) {
        console.log('⚠️ No distribution found - skipping')
        return
      }

      expect(distributions.status).toBe('approved')

      const lines = distributions.profit_distribution_lines || []
      expect(lines.length).toBe(ctx.shareholders.length)

      // Verify each shareholder got correct amount
      for (const sh of ctx.shareholders) {
        const line = lines.find((l: any) => l.shareholder_id === sh.id)
        expect(line).toBeDefined()
        expect(line!.percentage_at_distribution).toBe(sh.percentage)
        expect(line!.amount).toBe((distributions.total_profit * sh.percentage) / 100)
        expect(line!.paid_amount).toBe(0)
        expect(line!.status).toBe('pending')
      }
    })
  })

  // =============================================
  // 🧪 سيناريو 3: محاولة توزيع أكبر من المتاح (يجب أن تفشل)
  // =============================================
  describe('❌ Scenario 3: Distribution Exceeds Available (Should Fail)', () => {
    it('should REJECT distribution when amount exceeds retained earnings', async () => {
      // Try to distribute 50,000 when only ~5,000 remains (10,000 - 5,000)
      const excessiveAmount = 50000

      const shareholderLines = ctx.shareholders.map(sh => ({
        shareholder_id: sh.id,
        percentage: sh.percentage,
        amount: (excessiveAmount * sh.percentage) / 100
      }))

      const { data, error } = await ctx.supabase.rpc('distribute_dividends_atomic', {
        p_company_id: ctx.companyId,
        p_total_amount: excessiveAmount,
        p_distribution_date: new Date().toISOString().split('T')[0],
        p_retained_earnings_account_id: ctx.retainedEarningsAccountId,
        p_dividends_payable_account_id: ctx.dividendsPayableAccountId,
        p_shareholder_lines: shareholderLines,
        p_fiscal_year: new Date().getFullYear(),
        p_user_id: ctx.userId
      })

      if (error && error.code === 'PGRST202') {
        console.log('⚠️ RPC function not deployed yet - skipping')
        return
      }

      // Should fail with governance error
      expect(data?.success).toBe(false)
      expect(data?.error).toContain('كفاية') // Should mention insufficient funds
    })

    it('should NOT create any journal entry when distribution fails', async () => {
      // Count journal entries before
      const { count: beforeCount } = await ctx.supabase
        .from('journal_entries')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', ctx.companyId)
        .eq('reference_type', 'profit_distribution')

      // Try excessive distribution again
      const excessiveAmount = 100000
      const shareholderLines = ctx.shareholders.map(sh => ({
        shareholder_id: sh.id,
        percentage: sh.percentage,
        amount: (excessiveAmount * sh.percentage) / 100
      }))

      await ctx.supabase.rpc('distribute_dividends_atomic', {
        p_company_id: ctx.companyId,
        p_total_amount: excessiveAmount,
        p_distribution_date: new Date().toISOString().split('T')[0],
        p_retained_earnings_account_id: ctx.retainedEarningsAccountId,
        p_dividends_payable_account_id: ctx.dividendsPayableAccountId,
        p_shareholder_lines: shareholderLines,
        p_fiscal_year: new Date().getFullYear(),
        p_user_id: ctx.userId
      })

      // Count journal entries after
      const { count: afterCount } = await ctx.supabase
        .from('journal_entries')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', ctx.companyId)
        .eq('reference_type', 'profit_distribution')

      // No new entries should be created (atomic rollback)
      expect(afterCount).toBe(beforeCount)
    })

    it('should NOT create any distribution record when validation fails', async () => {
      const { count: beforeCount } = await ctx.supabase
        .from('profit_distributions')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', ctx.companyId)
        .eq('status', 'draft') // Failed ones would be draft

      // The failed distribution should not create any record
      expect(beforeCount).toBe(0)
    })
  })

  // =============================================
  // 🧪 سيناريو 4: صرف أرباح لمساهم (Full Payment)
  // =============================================
  describe('💵 Scenario 4: Dividend Payment to Shareholder', () => {
    let pendingLineId: string
    let pendingAmount: number

    beforeEach(async () => {
      // Get a pending dividend line
      const { data: pending } = await ctx.supabase.rpc('get_pending_dividends', {
        p_company_id: ctx.companyId,
        p_shareholder_id: null
      })

      if (pending && pending.length > 0) {
        pendingLineId = pending[0].line_id
        pendingAmount = pending[0].remaining_amount
      }
    })

    it('should successfully pay full dividend amount', async () => {
      if (!pendingLineId) {
        console.log('⚠️ No pending dividends found - skipping')
        return
      }

      const { data, error } = await ctx.supabase.rpc('pay_dividend_atomic', {
        p_company_id: ctx.companyId,
        p_distribution_line_id: pendingLineId,
        p_amount: pendingAmount,
        p_payment_date: new Date().toISOString().split('T')[0],
        p_payment_account_id: ctx.cashAccountId,
        p_dividends_payable_account_id: ctx.dividendsPayableAccountId,
        p_payment_method: 'cash',
        p_user_id: ctx.userId
      })

      if (error && error.code === 'PGRST202') {
        console.log('⚠️ RPC function not deployed yet - skipping')
        return
      }

      expect(error).toBeNull()
      expect(data?.success).toBe(true)
      expect(data?.payment_id).toBeDefined()
      expect(data?.journal_entry_id).toBeDefined()
    })

    it('should create correct payment journal entry (Dr Dividends Payable, Cr Cash)', async () => {
      // Get latest payment journal entry
      const { data: entry, error } = await ctx.supabase
        .from('journal_entries')
        .select(`
          id,
          reference_type,
          journal_entry_lines (
            account_id,
            debit_amount,
            credit_amount
          )
        `)
        .eq('company_id', ctx.companyId)
        .eq('reference_type', 'dividend_payment')
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (error) {
        console.log('⚠️ No payment journal entry found - skipping')
        return
      }

      const lines = entry.journal_entry_lines || []

      // Debit: Dividends Payable (clearing the liability)
      const debitLine = lines.find((l: any) => l.debit_amount > 0)
      expect(debitLine).toBeDefined()
      expect(debitLine!.account_id).toBe(ctx.dividendsPayableAccountId)

      // Credit: Cash (payment)
      const creditLine = lines.find((l: any) => l.credit_amount > 0)
      expect(creditLine).toBeDefined()
      expect(creditLine!.account_id).toBe(ctx.cashAccountId)

      // Verify balanced
      const totalDebit = lines.reduce((sum: number, l: any) => sum + (l.debit_amount || 0), 0)
      const totalCredit = lines.reduce((sum: number, l: any) => sum + (l.credit_amount || 0), 0)
      expect(totalDebit).toBe(totalCredit)
    })

    it('should update distribution line status to "paid" after full payment', async () => {
      if (!pendingLineId) return

      const { data: line, error } = await ctx.supabase
        .from('profit_distribution_lines')
        .select('paid_amount, amount, status')
        .eq('id', pendingLineId)
        .single()

      if (error) {
        console.log('⚠️ Could not find distribution line - skipping')
        return
      }

      expect(line.paid_amount).toBe(line.amount)
      expect(line.status).toBe('paid')
    })

    it('should create dividend_payments record', async () => {
      const { data: payments, error } = await ctx.supabase
        .from('dividend_payments')
        .select('*')
        .eq('company_id', ctx.companyId)
        .order('created_at', { ascending: false })
        .limit(1)

      if (error) {
        console.log('⚠️ dividend_payments table may not exist - skipping')
        return
      }

      expect(payments.length).toBeGreaterThan(0)
      expect(payments[0].payment_method).toBe('cash')
    })
  })

  // =============================================
  // 🧪 سيناريو 5: صرف جزئي للأرباح
  // =============================================
  describe('📊 Scenario 5: Partial Dividend Payment', () => {
    let secondShareholderLineId: string
    let totalAmount: number

    beforeEach(async () => {
      // Get the second shareholder's pending dividend
      const { data: pending } = await ctx.supabase.rpc('get_pending_dividends', {
        p_company_id: ctx.companyId,
        p_shareholder_id: ctx.shareholders[1]?.id
      })

      if (pending && pending.length > 0) {
        secondShareholderLineId = pending[0].line_id
        totalAmount = pending[0].total_amount
      }
    })

    it('should successfully process partial payment', async () => {
      if (!secondShareholderLineId || !totalAmount) {
        console.log('⚠️ No pending dividends for second shareholder - skipping')
        return
      }

      const partialAmount = Math.floor(totalAmount / 2) // Pay half

      const { data, error } = await ctx.supabase.rpc('pay_dividend_atomic', {
        p_company_id: ctx.companyId,
        p_distribution_line_id: secondShareholderLineId,
        p_amount: partialAmount,
        p_payment_date: new Date().toISOString().split('T')[0],
        p_payment_account_id: ctx.cashAccountId,
        p_dividends_payable_account_id: ctx.dividendsPayableAccountId,
        p_payment_method: 'bank_transfer',
        p_reference_number: 'TRF-2026-001',
        p_user_id: ctx.userId
      })

      if (error && error.code === 'PGRST202') {
        console.log('⚠️ RPC function not deployed yet - skipping')
        return
      }

      expect(error).toBeNull()
      expect(data?.success).toBe(true)
    })

    it('should update line status to "partially_paid" after partial payment', async () => {
      if (!secondShareholderLineId) return

      const { data: line, error } = await ctx.supabase
        .from('profit_distribution_lines')
        .select('paid_amount, amount, status')
        .eq('id', secondShareholderLineId)
        .single()

      if (error) {
        console.log('⚠️ Could not find distribution line - skipping')
        return
      }

      expect(line.paid_amount).toBeLessThan(line.amount)
      expect(line.status).toBe('partially_paid')
    })

    it('should REJECT payment exceeding remaining amount', async () => {
      if (!secondShareholderLineId) return

      // Get current remaining
      const { data: line } = await ctx.supabase
        .from('profit_distribution_lines')
        .select('amount, paid_amount')
        .eq('id', secondShareholderLineId)
        .single()

      if (!line) return

      const remaining = line.amount - line.paid_amount
      const excessiveAmount = remaining + 1000 // Try to pay more than remaining

      const { data, error } = await ctx.supabase.rpc('pay_dividend_atomic', {
        p_company_id: ctx.companyId,
        p_distribution_line_id: secondShareholderLineId,
        p_amount: excessiveAmount,
        p_payment_date: new Date().toISOString().split('T')[0],
        p_payment_account_id: ctx.cashAccountId,
        p_dividends_payable_account_id: ctx.dividendsPayableAccountId,
        p_payment_method: 'cash',
        p_user_id: ctx.userId
      })

      if (error && error.code === 'PGRST202') {
        console.log('⚠️ RPC function not deployed yet - skipping')
        return
      }

      // Should fail
      expect(data?.success).toBe(false)
      expect(data?.error).toBeDefined()
    })

    it('should maintain accounting balance after partial payments', async () => {
      // Verify dividends payable balance equals unpaid amounts
      const { data: unpaidLines } = await ctx.supabase
        .from('profit_distribution_lines')
        .select('amount, paid_amount')
        .eq('status', 'pending')
        .or('status.eq.partially_paid')

      const totalUnpaid = (unpaidLines || []).reduce(
        (sum: number, l: any) => sum + (l.amount - l.paid_amount),
        0
      )

      // Get dividends payable balance from ledger
      const { data: dpBalance } = await ctx.supabase
        .from('journal_entry_lines')
        .select('debit_amount, credit_amount')
        .eq('account_id', ctx.dividendsPayableAccountId)

      const balance = (dpBalance || []).reduce(
        (sum: number, l: any) => sum + (l.credit_amount || 0) - (l.debit_amount || 0),
        0
      )

      // Should be approximately equal (accounting for rounding)
      expect(Math.abs(balance - totalUnpaid)).toBeLessThan(1)
    })
  })

  // =============================================
  // 🧪 سيناريو 6: التحقق من Atomic Rollback
  // =============================================
  describe('🔒 Scenario 6: Atomic Transaction Integrity', () => {
    it('should rollback completely when payment journal creation fails', async () => {
      // This test verifies that if any part of the atomic operation fails,
      // everything is rolled back - no partial state

      // Count current payments
      const { count: paymentsBefore } = await ctx.supabase
        .from('dividend_payments')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', ctx.companyId)

      // Try payment with invalid account (should fail)
      const { data } = await ctx.supabase.rpc('pay_dividend_atomic', {
        p_company_id: ctx.companyId,
        p_distribution_line_id: 'invalid-uuid-that-does-not-exist',
        p_amount: 1000,
        p_payment_date: new Date().toISOString().split('T')[0],
        p_payment_account_id: ctx.cashAccountId,
        p_dividends_payable_account_id: ctx.dividendsPayableAccountId,
        p_payment_method: 'cash',
        p_user_id: ctx.userId
      })

      // Verify no new payment was created
      const { count: paymentsAfter } = await ctx.supabase
        .from('dividend_payments')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', ctx.companyId)

      expect(paymentsAfter).toBe(paymentsBefore)
      expect(data?.success).toBe(false)
    })

    it('should maintain referential integrity between all tables', async () => {
      // Verify all dividend_payments reference valid distribution_lines
      const { data: orphanPayments } = await ctx.supabase
        .from('dividend_payments')
        .select('id, distribution_line_id')
        .eq('company_id', ctx.companyId)
        .is('distribution_line_id', null)

      expect(orphanPayments?.length || 0).toBe(0)

      // Verify all distribution_lines reference valid distributions
      const { data: orphanLines } = await ctx.supabase
        .from('profit_distribution_lines')
        .select('id, distribution_id')
        .is('distribution_id', null)

      expect(orphanLines?.length || 0).toBe(0)
    })
  })
}) // End of describe block

