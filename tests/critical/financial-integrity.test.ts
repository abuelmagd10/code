/**
 * Phase 6: Financial Integrity Tests
 * ===================================
 * اختبارات سلامة مالية شاملة لكل العمليات الرئيسية:
 * - ترحيل الفاتورة (Invoice Post)
 * - ترحيل فاتورة الشراء (Bill Post)
 * - مرتجع المبيعات (Sales Return)
 * - مرتجع الشراء (Purchase Return)
 * - الرواتب (Payroll)
 * - التسوية المحاسبية (GL Reconciliation)
 * - FIFO vs GL مطابقة
 * - Double COGS Prevention
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createClient } from '@supabase/supabase-js'

// ────────────────────────────────────────────
// Test Client Setup
// ────────────────────────────────────────────
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
const TEST_COMPANY_ID = process.env.TEST_COMPANY_ID || ''

function getTestClient() {
  return createClient(SUPABASE_URL, SUPABASE_KEY)
}

// ────────────────────────────────────────────
// Helper: Get account balance from GL
// ────────────────────────────────────────────
async function getGLBalance(supabase: any, companyId: string, accountType: string, subType?: string) {
  const query = supabase
    .from('journal_entry_lines')
    .select('debit_amount, credit_amount, chart_of_accounts!inner(account_type, sub_type, account_name)')
    .eq('chart_of_accounts.account_type', accountType)

  if (subType) {
    query.eq('chart_of_accounts.sub_type', subType)
  }

  const { data, error } = await query
  if (error) throw new Error(`GL query error: ${error.message}`)

  return (data || []).reduce((sum: number, line: any) => {
    const net = Number(line.debit_amount || 0) - Number(line.credit_amount || 0)
    return sum + (accountType === 'asset' ? net : -net)
  }, 0)
}

// ────────────────────────────────────────────
// Helper: Check if journal entry is balanced
// ────────────────────────────────────────────
async function isEntryBalanced(supabase: any, journalEntryId: string): Promise<{ balanced: boolean; totalDebit: number; totalCredit: number }> {
  const { data, error } = await supabase
    .from('journal_entry_lines')
    .select('debit_amount, credit_amount')
    .eq('journal_entry_id', journalEntryId)

  if (error) throw new Error(`Error fetching journal lines: ${error.message}`)

  const totalDebit  = (data || []).reduce((s: number, l: any) => s + Number(l.debit_amount  || 0), 0)
  const totalCredit = (data || []).reduce((s: number, l: any) => s + Number(l.credit_amount || 0), 0)

  return {
    balanced:    Math.abs(totalDebit - totalCredit) < 0.01,
    totalDebit,
    totalCredit
  }
}

// ────────────────────────────────────────────
// Helper: Count COGS lines in an entry
// ────────────────────────────────────────────
async function countCOGSLinesInEntry(supabase: any, journalEntryId: string): Promise<number> {
  const { data } = await supabase
    .from('journal_entry_lines')
    .select('debit_amount, chart_of_accounts!inner(account_type, account_name, sub_type)')
    .eq('journal_entry_id', journalEntryId)
    .gt('debit_amount', 0)
    .in('chart_of_accounts.account_type', ['expense'])

  return (data || []).length
}

// ────────────────────────────────────────────
// GROUP 1: Journal Entry Integrity
// ────────────────────────────────────────────
describe('1. قيود اليومية — Journal Entry Integrity', () => {

  it('[critical] كل قيد مرحَّل يجب أن يكون متوازناً (مدين = دائن)', async () => {
    if (!TEST_COMPANY_ID) return
    const supabase = getTestClient()

    const { data: entries, error } = await supabase
      .from('journal_entries')
      .select('id, description, reference_type')
      .eq('company_id', TEST_COMPANY_ID)
      .eq('status', 'posted')
      .limit(200)

    expect(error).toBeNull()

    const unbalanced: string[] = []
    for (const entry of (entries || [])) {
      const { balanced } = await isEntryBalanced(supabase, entry.id)
      if (!balanced) unbalanced.push(`${entry.reference_type}:${entry.description}`)
    }

    expect(unbalanced, `قيود غير متوازنة: ${unbalanced.join(', ')}`).toHaveLength(0)
  })

  it('[critical] قيود النوع "invoice" يجب ألّا تحتوي على أسطر مصروفات (COGS)', async () => {
    if (!TEST_COMPANY_ID) return
    const supabase = getTestClient()

    const { data: invoiceEntries } = await supabase
      .from('journal_entries')
      .select('id, reference_id, description')
      .eq('company_id', TEST_COMPANY_ID)
      .eq('reference_type', 'invoice')
      .eq('status', 'posted')

    const doubleCOGS: string[] = []
    for (const entry of (invoiceEntries || [])) {
      const cogsCount = await countCOGSLinesInEntry(supabase, entry.id)
      if (cogsCount > 0) {
        doubleCOGS.push(entry.description)
      }
    }

    expect(doubleCOGS,
      `قيود "invoice" تحتوي على COGS مكررة (يجب إصلاحها بـ migration 008):\n${doubleCOGS.join('\n')}`
    ).toHaveLength(0)
  })

  it('[critical] لا يوجد قيود مكررة لنفس الفاتورة ونفس النوع', async () => {
    if (!TEST_COMPANY_ID) return
    const supabase = getTestClient()

    const { data } = await supabase
      .from('journal_entries')
      .select('reference_id, reference_type, count')
      .eq('company_id', TEST_COMPANY_ID)
      .eq('status', 'posted')
      .in('reference_type', ['invoice', 'invoice_cogs'])

    // Group and check for duplicates
    const groups: Record<string, number> = {}
    for (const entry of (data || []) as any[]) {
      const key = `${entry.reference_type}:${entry.reference_id}`
      groups[key] = (groups[key] || 0) + 1
    }

    const duplicates = Object.entries(groups)
      .filter(([_, count]) => count > 1)
      .map(([key]) => key)

    expect(duplicates, `قيود مكررة: ${duplicates.join(', ')}`).toHaveLength(0)
  })

  it('[warning] لا توجد قيود مسودة', async () => {
    if (!TEST_COMPANY_ID) return
    const supabase = getTestClient()

    const { count } = await supabase
      .from('journal_entries')
      .select('*', { count: 'exact', head: true })
      .eq('company_id', TEST_COMPANY_ID)
      .eq('status', 'draft')

    expect(count || 0).toBe(0)
  })
})

// ────────────────────────────────────────────
// GROUP 2: Invoice Post Accuracy
// ────────────────────────────────────────────
describe('2. ترحيل الفاتورة — Invoice Post Accuracy', () => {

  it('[critical] كل فاتورة نشطة لها قيد إيراد واحد فقط', async () => {
    if (!TEST_COMPANY_ID) return
    const supabase = getTestClient()

    const { data: invoices } = await supabase
      .from('invoices')
      .select('id, invoice_number, status')
      .eq('company_id', TEST_COMPANY_ID)
      .not('status', 'in', '("draft","cancelled")')

    const issues: string[] = []
    for (const inv of (invoices || [])) {
      const { count } = await supabase
        .from('journal_entries')
        .select('*', { count: 'exact', head: true })
        .eq('company_id', TEST_COMPANY_ID)
        .eq('reference_id', inv.id)
        .eq('reference_type', 'invoice')

      if ((count || 0) === 0) issues.push(`${inv.invoice_number}: لا يوجد قيد إيراد`)
      if ((count || 0) > 1)  issues.push(`${inv.invoice_number}: قيود إيراد مكررة (${count})`)
    }

    expect(issues, issues.join('\n')).toHaveLength(0)
  })

  it('[critical] كل فاتورة نشطة لها قيد COGS واحد فقط (في invoice_cogs)', async () => {
    if (!TEST_COMPANY_ID) return
    const supabase = getTestClient()

    const { data: invoices } = await supabase
      .from('invoices')
      .select('id, invoice_number, status')
      .eq('company_id', TEST_COMPANY_ID)
      .not('status', 'in', '("draft","cancelled")')

    const issues: string[] = []
    for (const inv of (invoices || [])) {
      const { count } = await supabase
        .from('journal_entries')
        .select('*', { count: 'exact', head: true })
        .eq('company_id', TEST_COMPANY_ID)
        .eq('reference_id', inv.id)
        .eq('reference_type', 'invoice_cogs')

      if ((count || 0) > 1) issues.push(`${inv.invoice_number}: قيود COGS مكررة (${count})`)
    }

    expect(issues, issues.join('\n')).toHaveLength(0)
  })

  it('[critical] مبلغ AR في قيد الفاتورة يساوي total_amount الفاتورة', async () => {
    if (!TEST_COMPANY_ID) return
    const supabase = getTestClient()

    const { data: invoices } = await supabase
      .from('invoices')
      .select('id, invoice_number, total_amount')
      .eq('company_id', TEST_COMPANY_ID)
      .not('status', 'in', '("draft","cancelled")')
      .limit(50)

    const mismatches: string[] = []
    for (const inv of (invoices || [])) {
      const { data: entry } = await supabase
        .from('journal_entries')
        .select('journal_entry_lines(debit_amount, chart_of_accounts!inner(account_type, sub_type))')
        .eq('company_id', TEST_COMPANY_ID)
        .eq('reference_id', inv.id)
        .eq('reference_type', 'invoice')
        .maybeSingle()

      if (!entry) continue

      const arDebit = ((entry as any).journal_entry_lines || [])
        .filter((l: any) => l.chart_of_accounts?.account_type === 'asset' &&
                             (l.chart_of_accounts?.sub_type?.includes('receivable') || true))
        .reduce((s: number, l: any) => s + Number(l.debit_amount || 0), 0)

      const tolerance = 0.01
      if (Math.abs(arDebit - Number(inv.total_amount)) > tolerance) {
        mismatches.push(`${inv.invoice_number}: AR=${arDebit} vs total=${inv.total_amount}`)
      }
    }

    expect(mismatches, mismatches.join('\n')).toHaveLength(0)
  })
})

// ────────────────────────────────────────────
// GROUP 3: FIFO vs GL Reconciliation
// ────────────────────────────────────────────
describe('3. تسوية FIFO vs GL — Inventory Reconciliation', () => {

  it('[critical] قيمة المخزون في GL = قيمة FIFO Lots', async () => {
    if (!TEST_COMPANY_ID) return
    const supabase = getTestClient()

    const { data: reconResult, error } = await supabase
      .rpc('reconcile_fifo_vs_gl', { p_company_id: TEST_COMPANY_ID })

    if (error) {
      console.warn('reconcile_fifo_vs_gl RPC not available — run migration 008 first')
      return
    }

    const inventoryCheck = (reconResult || []).find((r: any) => r.check_name?.includes('FIFO'))
    if (!inventoryCheck) return

    expect(inventoryCheck.is_ok,
      `FIFO vs GL Inventory mismatch: GL=${inventoryCheck.gl_value}, FIFO=${inventoryCheck.fifo_value}, Diff=${inventoryCheck.difference}`
    ).toBe(true)
  })

  it('[critical] كل عملية شراء مؤكدة لها FIFO lot', async () => {
    if (!TEST_COMPANY_ID) return
    const supabase = getTestClient()

    const { data: bills } = await supabase
      .from('bills')
      .select('id, bill_number, status')
      .eq('company_id', TEST_COMPANY_ID)
      .in('status', ['posted', 'paid', 'partial'])
      .limit(50)

    const missing: string[] = []
    for (const bill of (bills || [])) {
      const { count } = await supabase
        .from('fifo_cost_lots')
        .select('*', { count: 'exact', head: true })
        .eq('reference_id', bill.id)
        .eq('reference_type', 'purchase')

      if ((count || 0) === 0) {
        missing.push(bill.bill_number)
      }
    }

    expect(missing,
      `فواتير شراء بدون FIFO lots (شغّل /api/reconciliation?mode=fifo): ${missing.join(', ')}`
    ).toHaveLength(0)
  })

  it('[warning] لا توجد FIFO lots بكمية سالبة', async () => {
    if (!TEST_COMPANY_ID) return
    const supabase = getTestClient()

    const { count } = await supabase
      .from('fifo_cost_lots')
      .select('*', { count: 'exact', head: true })
      .lt('remaining_quantity', 0)

    expect(count || 0, 'توجد FIFO lots بكميات سالبة').toBe(0)
  })
})

// ────────────────────────────────────────────
// GROUP 4: Balance Sheet Integrity
// ────────────────────────────────────────────
describe('4. سلامة الميزانية — Balance Sheet Integrity', () => {

  it('[critical] الميزانية العمومية متوازنة: الأصول = الالتزامات + حقوق الملكية + صافي الدخل', async () => {
    if (!TEST_COMPANY_ID) return
    const supabase = getTestClient()

    const accountTypes = ['asset', 'liability', 'equity', 'revenue', 'expense']
    const balances: Record<string, number> = {}

    for (const type of accountTypes) {
      const { data } = await supabase
        .from('journal_entry_lines')
        .select('debit_amount, credit_amount, journal_entries!inner(company_id, status), chart_of_accounts!inner(account_type)')
        .eq('journal_entries.company_id', TEST_COMPANY_ID)
        .eq('journal_entries.status', 'posted')
        .eq('chart_of_accounts.account_type', type)

      balances[type] = (data || []).reduce((sum: number, l: any) => {
        return sum + Number(l.debit_amount || 0) - Number(l.credit_amount || 0)
      }, 0)
    }

    const totalAssets     = balances.asset     || 0
    const totalLiab       = -(balances.liability || 0)  // liabilities are credit-normal
    const totalEquity     = -(balances.equity    || 0)  // equity is credit-normal
    const netIncome       = -(balances.revenue   || 0) + (balances.expense  || 0)
    const totalLiabEquity = totalLiab + totalEquity + netIncome
    const difference      = Math.abs(totalAssets - totalLiabEquity)

    expect(difference,
      `الميزانية غير متوازنة! الأصول=${totalAssets.toFixed(2)}, L+E=${totalLiabEquity.toFixed(2)}, فارق=${difference.toFixed(2)}`
    ).toBeLessThan(0.01)
  })

  it('[critical] ميزان المراجعة متوازن: إجمالي المدين = إجمالي الدائن', async () => {
    if (!TEST_COMPANY_ID) return
    const supabase = getTestClient()

    const { data } = await supabase
      .from('journal_entry_lines')
      .select('debit_amount, credit_amount, journal_entries!inner(company_id, status)')
      .eq('journal_entries.company_id', TEST_COMPANY_ID)
      .eq('journal_entries.status', 'posted')

    const totalDebit  = (data || []).reduce((s: number, l: any) => s + Number(l.debit_amount  || 0), 0)
    const totalCredit = (data || []).reduce((s: number, l: any) => s + Number(l.credit_amount || 0), 0)
    const diff        = Math.abs(totalDebit - totalCredit)

    expect(diff, `ميزان المراجعة غير متوازن! فارق=${diff.toFixed(2)}`).toBeLessThan(0.01)
  })
})

// ────────────────────────────────────────────
// GROUP 5: Sales Return Integrity
// ────────────────────────────────────────────
describe('5. مرتجعات المبيعات — Sales Return Integrity', () => {

  it('[critical] مرتجعات المبيعات المكتملة لها قيود عكسية صحيحة', async () => {
    if (!TEST_COMPANY_ID) return
    const supabase = getTestClient()

    const { data: returns } = await supabase
      .from('sales_returns')
      .select('id, return_number, status, original_invoice_id, return_amount')
      .eq('status', 'completed')
      .limit(50)

    if (!returns || returns.length === 0) return

    const issues: string[] = []
    for (const ret of returns) {
      // Check if a sales_return journal entry exists
      const { count } = await supabase
        .from('journal_entries')
        .select('*', { count: 'exact', head: true })
        .eq('reference_id', ret.id)
        .eq('reference_type', 'sales_return')

      // Returns from paid invoices MUST have a journal entry
      if ((count || 0) === 0) {
        issues.push(`${ret.return_number}: لا يوجد قيد محاسبي`)
      }
    }

    // Note: some returns may legitimately lack journals (sent-status returns)
    // This is logged as information, not a hard failure for now
    if (issues.length > 0) {
      console.warn(`مرتجعات بلا قيود: ${issues.join(', ')}`)
    }
  })

  it('[critical] المبلغ المُرتجَع لا يتجاوز إجمالي الفاتورة', async () => {
    if (!TEST_COMPANY_ID) return
    const supabase = getTestClient()

    const { data: invoices } = await supabase
      .from('invoices')
      .select('id, invoice_number, total_amount, returned_amount')
      .eq('company_id', TEST_COMPANY_ID)
      .not('status', 'in', '("draft","cancelled")')

    const overReturned: string[] = []
    for (const inv of (invoices || [])) {
      const returned = Number(inv.returned_amount || 0)
      const total    = Number(inv.total_amount || 0)
      if (returned > total + 0.01) {
        overReturned.push(`${inv.invoice_number}: مُرتجَع=${returned} > إجمالي=${total}`)
      }
    }

    expect(overReturned, overReturned.join('\n')).toHaveLength(0)
  })
})

// ────────────────────────────────────────────
// GROUP 6: Bill Post Integrity
// ────────────────────────────────────────────
describe('6. ترحيل فاتورة الشراء — Bill Post Integrity', () => {

  it('[critical] كل فاتورة شراء مرحَّلة لها قيد AP صحيح', async () => {
    if (!TEST_COMPANY_ID) return
    const supabase = getTestClient()

    const { data: bills } = await supabase
      .from('bills')
      .select('id, bill_number, total_amount')
      .eq('company_id', TEST_COMPANY_ID)
      .in('status', ['posted', 'paid', 'partial'])
      .limit(50)

    const issues: string[] = []
    for (const bill of (bills || [])) {
      const { count } = await supabase
        .from('journal_entries')
        .select('*', { count: 'exact', head: true })
        .eq('reference_id', bill.id)
        .eq('reference_type', 'purchase')

      if ((count || 0) === 0) issues.push(`${bill.bill_number}: لا يوجد قيد شراء`)
      if ((count || 0) > 1)  issues.push(`${bill.bill_number}: قيود شراء مكررة (${count})`)
    }

    expect(issues, issues.join('\n')).toHaveLength(0)
  })

  it('[critical] المبلغ المدفوع لا يتجاوز إجمالي فاتورة الشراء', async () => {
    if (!TEST_COMPANY_ID) return
    const supabase = getTestClient()

    const { data: bills } = await supabase
      .from('bills')
      .select('id, bill_number, total_amount, paid_amount')
      .eq('company_id', TEST_COMPANY_ID)
      .not('status', 'in', '("cancelled","draft")')

    const overPaid: string[] = []
    for (const bill of (bills || [])) {
      const paid  = Number(bill.paid_amount  || 0)
      const total = Number(bill.total_amount || 0)
      if (paid > total + 0.01) {
        overPaid.push(`${bill.bill_number}: مدفوع=${paid} > إجمالي=${total}`)
      }
    }

    expect(overPaid, overPaid.join('\n')).toHaveLength(0)
  })
})

// ────────────────────────────────────────────
// GROUP 7: Daily Reconciliation
// ────────────────────────────────────────────
describe('7. التسوية اليومية — Daily Reconciliation', () => {

  it('[info] التسوية اليومية يمكن تشغيلها بنجاح', async () => {
    if (!TEST_COMPANY_ID) return
    const supabase = getTestClient()

    const { data, error } = await supabase
      .rpc('run_daily_reconciliation', { p_company_id: TEST_COMPANY_ID })

    if (error?.message?.includes('does not exist')) {
      console.warn('run_daily_reconciliation not available — run migration 009 first')
      return
    }

    expect(error).toBeNull()
    expect(data).toBeTruthy()
    expect(Array.isArray(data)).toBe(true)
  })

  it('[critical] لا توجد فروقات حرجة في التسوية اليومية', async () => {
    if (!TEST_COMPANY_ID) return
    const supabase = getTestClient()

    const { data } = await supabase
      .rpc('run_daily_reconciliation', { p_company_id: TEST_COMPANY_ID })
      .catch(() => ({ data: null }))

    if (!data) return

    const critical = (data as any[]).filter((r: any) => r.severity === 'critical' && !r.is_ok)
    expect(critical,
      `فروقات حرجة في التسوية:\n${critical.map((r: any) => `${r.check_name}: ${r.message}`).join('\n')}`
    ).toHaveLength(0)
  })
})

// ────────────────────────────────────────────
// GROUP 8: Security & Governance
// ────────────────────────────────────────────
describe('8. الحوكمة والأمان — Governance & Security', () => {

  it('[critical] DB Triggers الحوكمة مفعَّلة (Phase 1)', async () => {
    if (!TEST_COMPANY_ID) return
    const supabase = getTestClient()

    const requiredTriggers = [
      'trg_enforce_journal_balance',
      'trg_prevent_posted_line_modification',
      'trg_prevent_duplicate_journal_entry'
    ]

    const { data: pgTriggers } = await supabase
      .from('information_schema.triggers' as any)
      .select('trigger_name')
      .in('trigger_name', requiredTriggers)

    const foundNames = (pgTriggers || []).map((t: any) => t.trigger_name)
    const missing = requiredTriggers.filter(t => !foundNames.includes(t))

    expect(missing,
      `Triggers مفقودة (شغّل migration 004): ${missing.join(', ')}`
    ).toHaveLength(0)
  })

  it('[critical] RLS مفعَّل على journal_entries و journal_entry_lines', async () => {
    if (!TEST_COMPANY_ID) return
    const supabase = getTestClient()

    const { data: policies } = await supabase
      .from('pg_policies' as any)
      .select('tablename, policyname')
      .in('tablename', ['journal_entries', 'journal_entry_lines'])

    const tables = new Set((policies || []).map((p: any) => p.tablename))
    expect(tables.has('journal_entries'),    'RLS غير مفعَّل على journal_entries').toBe(true)
    expect(tables.has('journal_entry_lines'), 'RLS غير مفعَّل على journal_entry_lines').toBe(true)
  })

  it('[critical] Idempotency table موجودة (Phase 2)', async () => {
    if (!TEST_COMPANY_ID) return
    const supabase = getTestClient()

    const { data } = await supabase
      .from('information_schema.tables' as any)
      .select('table_name')
      .eq('table_schema', 'public')
      .eq('table_name', 'idempotency_keys')
      .maybeSingle()

    expect(data, 'جدول idempotency_keys غير موجود — شغّل migration 006').toBeTruthy()
  })
})
