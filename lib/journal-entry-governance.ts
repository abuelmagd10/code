/**
 * 🔐 Journal Entry Governance - حوكمة القيود المحاسبية
 * 
 * ⚠️ ACCOUNTING GOVERNANCE - قواعد إلزامية لمنع الأخطاء المحاسبية
 * 
 * ✅ القواعد الإلزامية:
 * 1. منع إنشاء قيود مكررة لنفس المرجع
 * 2. منع إنشاء COGS بدون إيراد
 * 3. التحقق من توازن القيود قبل الحفظ
 * 4. تسجيل جميع محاولات إنشاء قيود مكررة
 * 
 * ⚠️ DO NOT MODIFY WITHOUT ACCOUNTING REVIEW
 */

import { SupabaseClient } from "@supabase/supabase-js"

export type JournalReferenceType = 
  | "invoice" 
  | "invoice_cogs" 
  | "invoice_payment"
  | "bill" 
  | "bill_payment"
  | "expense"
  | "capital_contribution"
  | "credit_note"
  | "debit_note"
  | "write_off"
  | "customer_payment"
  | "supplier_payment"

/**
 * التحقق من وجود قيد سابق لنفس المرجع
 * @returns true إذا كان القيد موجود مسبقاً
 */
export async function checkDuplicateJournalEntry(
  supabase: SupabaseClient,
  companyId: string,
  referenceType: JournalReferenceType,
  referenceId: string
): Promise<{ exists: boolean; existingEntryId?: string; count?: number }> {
  const { data, error } = await supabase
    .from("journal_entries")
    .select("id")
    .eq("company_id", companyId)
    .eq("reference_type", referenceType)
    .eq("reference_id", referenceId)
    .or("is_deleted.is.null,is_deleted.eq.false")

  if (error) {
    console.error("Error checking duplicate journal entry:", error)
    return { exists: false }
  }

  return {
    exists: (data?.length || 0) > 0,
    existingEntryId: data?.[0]?.id,
    count: data?.length || 0
  }
}

/**
 * التحقق من وجود قيد إيراد قبل إنشاء قيد COGS
 * @returns true إذا كان قيد الإيراد موجود
 */
export async function checkRevenueBeforeCOGS(
  supabase: SupabaseClient,
  companyId: string,
  invoiceId: string
): Promise<{ hasRevenue: boolean; revenueEntryId?: string }> {
  const { data, error } = await supabase
    .from("journal_entries")
    .select("id")
    .eq("company_id", companyId)
    .eq("reference_type", "invoice")
    .eq("reference_id", invoiceId)
    .or("is_deleted.is.null,is_deleted.eq.false")
    .limit(1)

  if (error) {
    console.error("Error checking revenue entry:", error)
    return { hasRevenue: false }
  }

  return {
    hasRevenue: (data?.length || 0) > 0,
    revenueEntryId: data?.[0]?.id
  }
}

/**
 * إنشاء قيد محاسبي مع التحقق من عدم التكرار
 * @throws Error إذا كان القيد موجود مسبقاً
 */
export async function createJournalEntryWithGovernance(
  supabase: SupabaseClient,
  entry: {
    company_id: string
    reference_type: JournalReferenceType
    reference_id: string
    entry_date: string
    description: string
    branch_id?: string | null
    cost_center_id?: string | null
    warehouse_id?: string | null
    status?: string
  }
): Promise<{ success: boolean; entryId?: string; error?: string }> {
  // 1. التحقق من عدم وجود قيد مكرر
  const duplicateCheck = await checkDuplicateJournalEntry(
    supabase,
    entry.company_id,
    entry.reference_type,
    entry.reference_id
  )

  if (duplicateCheck.exists) {
    const errorMsg = `🚨 GOVERNANCE: Duplicate journal entry blocked! Type: ${entry.reference_type}, RefId: ${entry.reference_id}, Existing: ${duplicateCheck.existingEntryId}`
    console.error(errorMsg)
    return { success: false, error: errorMsg }
  }

  // 2. التحقق من وجود إيراد قبل COGS
  if (entry.reference_type === "invoice_cogs") {
    const revenueCheck = await checkRevenueBeforeCOGS(
      supabase,
      entry.company_id,
      entry.reference_id
    )
    if (!revenueCheck.hasRevenue) {
      const errorMsg = `🚨 GOVERNANCE: COGS without revenue blocked! InvoiceId: ${entry.reference_id}`
      console.error(errorMsg)
      return { success: false, error: errorMsg }
    }
  }

  // 3. إنشاء القيد
  const { data, error } = await supabase
    .from("journal_entries")
    .insert({
      ...entry,
      status: entry.status || "posted"
    })
    .select("id")
    .single()

  if (error) {
    console.error("Error creating journal entry:", error)
    return { success: false, error: error.message }
  }

  console.log(`✅ GOVERNANCE: Journal entry created successfully. Type: ${entry.reference_type}, Id: ${data.id}`)
  return { success: true, entryId: data.id }
}

/**
 * التحقق من توازن سطور القيد (مدين = دائن)
 */
export function validateJournalEntryBalance(
  lines: Array<{ debit_amount: number; credit_amount: number }>
): { balanced: boolean; totalDebit: number; totalCredit: number; difference: number } {
  const totalDebit = lines.reduce((sum, line) => sum + (line.debit_amount || 0), 0)
  const totalCredit = lines.reduce((sum, line) => sum + (line.credit_amount || 0), 0)
  const difference = Math.abs(totalDebit - totalCredit)

  return {
    balanced: difference < 0.01, // السماح بفرق أقل من 0.01 للتقريب
    totalDebit,
    totalCredit,
    difference
  }
}

/**
 * إنشاء قيد محاسبي كامل مع السطور والتحقق من التوازن
 */
export async function createCompleteJournalEntry(
  supabase: SupabaseClient,
  entry: {
    company_id: string
    reference_type: JournalReferenceType
    reference_id: string
    entry_date: string
    description: string
    branch_id?: string | null
    cost_center_id?: string | null
    warehouse_id?: string | null
  },
  lines: Array<{
    account_id: string
    debit_amount: number
    credit_amount: number
    description?: string
    branch_id?: string | null
    cost_center_id?: string | null
  }>
): Promise<{ success: boolean; entryId?: string; error?: string }> {
  // 1. التحقق من توازن السطور
  const balanceCheck = validateJournalEntryBalance(lines)
  if (!balanceCheck.balanced) {
    const errorMsg = `🚨 GOVERNANCE: Unbalanced journal entry blocked! Debit: ${balanceCheck.totalDebit}, Credit: ${balanceCheck.totalCredit}, Diff: ${balanceCheck.difference}`
    console.error(errorMsg)
    return { success: false, error: errorMsg }
  }

  // 2. إنشاء القيد الرئيسي
  const entryResult = await createJournalEntryWithGovernance(supabase, entry)
  if (!entryResult.success || !entryResult.entryId) {
    return entryResult
  }

  // 3. إنشاء سطور القيد
  const linesWithEntryId = lines.map(line => ({
    ...line,
    journal_entry_id: entryResult.entryId,
    branch_id: line.branch_id || entry.branch_id || null,
    cost_center_id: line.cost_center_id || entry.cost_center_id || null
  }))

  const { error: linesError } = await supabase
    .from("journal_entry_lines")
    .insert(linesWithEntryId)

  if (linesError) {
    // Rollback: حذف القيد الرئيسي
    await supabase.from("journal_entries").delete().eq("id", entryResult.entryId)
    console.error("Error creating journal entry lines:", linesError)
    return { success: false, error: linesError.message }
  }

  return { success: true, entryId: entryResult.entryId }
}

/**
 * 🔐 VALIDATION LAYER - طبقة التحقق الإلزامية
 * التحقق من اكتمال القيود المحاسبية قبل إنشاء التقارير
 */
export async function validateAccountingIntegrity(
  supabase: SupabaseClient,
  companyId: string
): Promise<{
  valid: boolean
  errors: string[]
  warnings: string[]
  stats: {
    totalInvoices: number
    invoicesWithJournals: number
    invoicesWithoutJournals: number
    totalExpenses: number
    expensesWithJournals: number
    expensesWithoutJournals: number
    duplicateEntries: number
    cogsWithoutRevenue: number
  }
}> {
  const errors: string[] = []
  const warnings: string[] = []
  const stats = {
    totalInvoices: 0,
    invoicesWithJournals: 0,
    invoicesWithoutJournals: 0,
    totalExpenses: 0,
    expensesWithJournals: 0,
    expensesWithoutJournals: 0,
    duplicateEntries: 0,
    cogsWithoutRevenue: 0
  }

  // 1. التحقق من الفواتير المدفوعة بدون قيود
  const { data: paidInvoices } = await supabase
    .from("invoices")
    .select("id, invoice_number, status")
    .eq("company_id", companyId)
    .eq("status", "paid")

  stats.totalInvoices = paidInvoices?.length || 0

  for (const invoice of paidInvoices || []) {
    const { data: journalEntry } = await supabase
      .from("journal_entries")
      .select("id")
      .eq("company_id", companyId)
      .eq("reference_type", "invoice")
      .eq("reference_id", invoice.id)
      .or("is_deleted.is.null,is_deleted.eq.false")
      .limit(1)

    if (journalEntry && journalEntry.length > 0) {
      stats.invoicesWithJournals++
    } else {
      stats.invoicesWithoutJournals++
      errors.push(`فاتورة مدفوعة بدون قيد محاسبي: ${invoice.invoice_number}`)
    }
  }

  // 2. التحقق من المصروفات المعتمدة بدون قيود
  const { data: approvedExpenses } = await supabase
    .from("expenses")
    .select("id, expense_number, status")
    .eq("company_id", companyId)
    .eq("status", "approved")

  stats.totalExpenses = approvedExpenses?.length || 0

  for (const expense of approvedExpenses || []) {
    const { data: journalEntry } = await supabase
      .from("journal_entries")
      .select("id")
      .eq("company_id", companyId)
      .eq("reference_type", "expense")
      .eq("reference_id", expense.id)
      .or("is_deleted.is.null,is_deleted.eq.false")
      .limit(1)

    if (journalEntry && journalEntry.length > 0) {
      stats.expensesWithJournals++
    } else {
      stats.expensesWithoutJournals++
      errors.push(`مصروف معتمد بدون قيد محاسبي: ${expense.expense_number}`)
    }
  }

  // 3. التحقق من القيود المكررة
  const { data: duplicates } = await supabase
    .rpc("find_duplicate_journal_entries", { p_company_id: companyId })

  if (duplicates && duplicates.length > 0) {
    stats.duplicateEntries = duplicates.length
    for (const dup of duplicates) {
      errors.push(`قيد مكرر: ${dup.reference_type} - ${dup.reference_id} (${dup.count} مرات)`)
    }
  }

  // 4. التحقق من COGS بدون إيراد
  const { data: cogsEntries } = await supabase
    .from("journal_entries")
    .select("id, reference_id")
    .eq("company_id", companyId)
    .eq("reference_type", "invoice_cogs")
    .or("is_deleted.is.null,is_deleted.eq.false")

  for (const cogs of cogsEntries || []) {
    const { data: revenueEntry } = await supabase
      .from("journal_entries")
      .select("id")
      .eq("company_id", companyId)
      .eq("reference_type", "invoice")
      .eq("reference_id", cogs.reference_id)
      .or("is_deleted.is.null,is_deleted.eq.false")
      .limit(1)

    if (!revenueEntry || revenueEntry.length === 0) {
      stats.cogsWithoutRevenue++
      errors.push(`قيد COGS بدون إيراد للفاتورة: ${cogs.reference_id}`)
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    stats
  }
}

/**
 * إنشاء قيد مصروف تلقائياً عند اعتماد المصروف
 */
export async function createExpenseJournalEntry(
  supabase: SupabaseClient,
  expense: {
    id: string
    company_id: string
    expense_number: string
    expense_date: string
    amount: number
    branch_id?: string | null
    cost_center_id?: string | null
  },
  expenseAccountId: string,
  cashAccountId: string
): Promise<{ success: boolean; entryId?: string; error?: string }> {
  return createCompleteJournalEntry(
    supabase,
    {
      company_id: expense.company_id,
      reference_type: "expense",
      reference_id: expense.id,
      entry_date: expense.expense_date,
      description: `مصروف - ${expense.expense_number}`,
      branch_id: expense.branch_id,
      cost_center_id: expense.cost_center_id
    },
    [
      {
        account_id: expenseAccountId,
        debit_amount: expense.amount,
        credit_amount: 0,
        description: `مصروف ${expense.expense_number}`
      },
      {
        account_id: cashAccountId,
        debit_amount: 0,
        credit_amount: expense.amount,
        description: `سداد مصروف ${expense.expense_number}`
      }
    ]
  )
}

