/**
 * إقفال الفترات المحاسبية - Period Closing
 * ERP-Grade Professional Accounting Period Closing System
 * 
 * القواعد الذهبية:
 * 1. Retained Earnings = حساب محاسبي فقط (لا يُحسب يدوياً)
 * 2. تحديث Retained Earnings يتم فقط عبر Period Closing Entry
 * 3. لا يُسمح بإقفال نفس الفترة مرتين
 */

import { SupabaseClient } from "@supabase/supabase-js"

export interface PeriodClosingParams {
  companyId: string
  periodStart: string // YYYY-MM-DD
  periodEnd: string // YYYY-MM-DD
  closedByUserId: string
  periodName?: string // مثال: "يناير 2026"
  notes?: string
}

export interface PeriodClosingResult {
  success: boolean
  error?: string
  journalEntryId?: string
  periodId?: string
  netIncome?: number
  retainedEarningsBalance?: number
}

/**
 * حساب صافي الربح للفترة من journal_entry_lines فقط
 */
async function calculateNetIncomeForPeriod(
  supabase: SupabaseClient,
  companyId: string,
  periodStart: string,
  periodEnd: string
): Promise<{ netIncome: number; income: number; expense: number }> {
  // ✅ جلب جميع القيود في الفترة
  const { data: journalEntries, error: entriesError } = await supabase
    .from("journal_entries")
    .select("id")
    .eq("company_id", companyId)
    .gte("entry_date", periodStart)
    .lte("entry_date", periodEnd)
    .or("is_deleted.is.null,is_deleted.eq.false") // ✅ استثناء القيود المحذوفة (is_deleted)
    .is("deleted_at", null) // ✅ استثناء القيود المحذوفة (deleted_at)

  if (entriesError) {
    throw new Error(`خطأ في جلب القيود: ${entriesError.message}`)
  }

  const journalEntryIds = (journalEntries || []).map((je: any) => je.id)

  if (journalEntryIds.length === 0) {
    return { netIncome: 0, income: 0, expense: 0 }
  }

  // ✅ جلب سطور القيود للحسابات income و expense
  const { data: journalLines, error: linesError } = await supabase
    .from("journal_entry_lines")
    .select(`
      account_id,
      debit_amount,
      credit_amount,
      chart_of_accounts!inner(
        account_type,
        account_code
      )
    `)
    .in("journal_entry_id", journalEntryIds)

  if (linesError) {
    throw new Error(`خطأ في جلب سطور القيود: ${linesError.message}`)
  }

  // ✅ حساب الإيرادات والمصروفات
  let income = 0
  let expense = 0

  for (const line of journalLines || []) {
    const accountType = (line.chart_of_accounts as any)?.account_type
    const debit = Number(line.debit_amount || 0)
    const credit = Number(line.credit_amount || 0)

    if (accountType === "income") {
      // الإيرادات تزيد بالدائن (Credit)
      income += credit - debit
    } else if (accountType === "expense") {
      // المصروفات تزيد بالمدين (Debit)
      expense += debit - credit
    }
  }

  const netIncome = income - expense

  return { netIncome, income, expense }
}

/**
 * جلب حسابات النظام المطلوبة
 */
async function getSystemAccounts(
  supabase: SupabaseClient,
  companyId: string
): Promise<{
  retainedEarningsAccountId: string | null
  incomeSummaryAccountId: string | null
}> {
  // ✅ جلب حساب الأرباح المحتجزة (3200)
  const { data: retainedEarningsAccount } = await supabase
    .from("chart_of_accounts")
    .select("id")
    .eq("company_id", companyId)
    .or("account_code.eq.3200,sub_type.eq.retained_earnings")
    .eq("is_active", true)
    .limit(1)
    .single()

  // ✅ جلب حساب Income Summary (3300) أو إنشاؤه إذا لم يكن موجوداً
  let { data: incomeSummaryAccount } = await supabase
    .from("chart_of_accounts")
    .select("id")
    .eq("company_id", companyId)
    .or("account_code.eq.3300,account_name.ilike.%صافي ربح/خسارة الفترة%")
    .eq("is_active", true)
    .limit(1)
    .single()

  // إذا لم يكن موجوداً، إنشاؤه
  if (!incomeSummaryAccount) {
    // جلب حساب حقوق الملكية الرئيسي (3000)
    const { data: equityAccount } = await supabase
      .from("chart_of_accounts")
      .select("id")
      .eq("company_id", companyId)
      .eq("account_code", "3000")
      .eq("account_type", "equity")
      .limit(1)
      .single()

    const { data: newIncomeSummaryAccount, error: createError } = await supabase
      .from("chart_of_accounts")
      .insert({
        company_id: companyId,
        account_code: "3300",
        account_name: "صافي ربح/خسارة الفترة",
        account_name_en: "Net Income / Loss",
        account_type: "equity",
        normal_balance: "credit",
        sub_type: "income_summary",
        parent_id: equityAccount?.id || null,
        level: 3,
        opening_balance: 0,
        is_active: true,
      })
      .select()
      .single()

    if (createError) {
      throw new Error(`خطأ في إنشاء حساب Income Summary: ${createError.message}`)
    }

    incomeSummaryAccount = newIncomeSummaryAccount
  }

  return {
    retainedEarningsAccountId: retainedEarningsAccount?.id || null,
    incomeSummaryAccountId: incomeSummaryAccount?.id || null,
  }
}

/**
 * التحقق من أن الفترة لم يتم إقفالها مسبقاً
 */
async function checkPeriodNotClosed(
  supabase: SupabaseClient,
  companyId: string,
  periodStart: string,
  periodEnd: string
): Promise<{ isClosed: boolean; periodId?: string }> {
  const { data: existingPeriod } = await supabase
    .from("accounting_periods")
    .select("id, status, journal_entry_id")
    .eq("company_id", companyId)
    .eq("period_start", periodStart)
    .eq("period_end", periodEnd)
    .in("status", ["closed", "locked"])
    .limit(1)
    .single()

  if (existingPeriod) {
    return {
      isClosed: true,
      periodId: existingPeriod.id,
    }
  }

  return { isClosed: false }
}

/**
 * إنشاء قيد إقفال الفترة المحاسبية
 * 
 * القيود المحاسبية:
 * - إذا كان صافي الربح موجباً (ربح):
 *   Dr. Income Summary        XXX
 *   Cr. Retained Earnings    XXX
 * 
 * - إذا كان صافي الربح سالباً (خسارة):
 *   Dr. Retained Earnings    XXX
 *   Cr. Income Summary       XXX
 */
export async function createPeriodClosingEntry(
  supabase: SupabaseClient,
  params: PeriodClosingParams
): Promise<PeriodClosingResult> {
  try {
    const { companyId, periodStart, periodEnd, closedByUserId, periodName, notes } = params

    // ✅ 1. التحقق من أن الفترة لم يتم إقفالها مسبقاً
    const { isClosed, periodId: existingPeriodId } = await checkPeriodNotClosed(
      supabase,
      companyId,
      periodStart,
      periodEnd
    )

    if (isClosed) {
      return {
        success: false,
        error: "الفترة المحاسبية مغلقة بالفعل",
      }
    }

    // ✅ 2. حساب صافي الربح للفترة من journal_entry_lines فقط
    const { netIncome, income, expense } = await calculateNetIncomeForPeriod(
      supabase,
      companyId,
      periodStart,
      periodEnd
    )

    // ✅ 3. جلب حسابات النظام المطلوبة
    const { retainedEarningsAccountId, incomeSummaryAccountId } = await getSystemAccounts(
      supabase,
      companyId
    )

    if (!retainedEarningsAccountId) {
      return {
        success: false,
        error: "حساب الأرباح المحتجزة غير موجود. يجب إنشاؤه في دليل الحسابات (رمز: 3200)",
      }
    }

    if (!incomeSummaryAccountId) {
      return {
        success: false,
        error: "حساب Income Summary غير موجود. يجب إنشاؤه في دليل الحسابات (رمز: 3300)",
      }
    }

    // ✅ 4. إذا كان صافي الربح صفر، لا حاجة لإنشاء قيد
    if (Math.abs(netIncome) < 0.01) {
      return {
        success: true,
        netIncome: 0,
        error: "صافي الربح صفر - لا حاجة لإنشاء قيد إقفال",
      }
    }

    // ✅ 5. إنشاء Journal Entry
    const description = periodName 
      ? `إقفال الفترة المحاسبية: ${periodName}`
      : `إقفال الفترة المحاسبية: ${periodStart} إلى ${periodEnd}`

    const { data: journalEntry, error: entryError } = await supabase
      .from("journal_entries")
      .insert({
        company_id: companyId,
        reference_type: "period_closing",
        entry_date: periodEnd, // تاريخ إقفال الفترة
        description: description,
        status: "posted", // قيد منشور مباشرة
      })
      .select()
      .single()

    if (entryError) {
      return {
        success: false,
        error: `خطأ في إنشاء القيد: ${entryError.message}`,
      }
    }

    const journalEntryId = journalEntry.id

    // ✅ 6. إنشاء سطور القيد
    const lines: Array<{
      journal_entry_id: string
      account_id: string
      debit_amount: number
      credit_amount: number
      description: string
    }> = []

    if (netIncome > 0) {
      // ربح: Dr. Income Summary, Cr. Retained Earnings
      lines.push({
        journal_entry_id: journalEntryId,
        account_id: incomeSummaryAccountId,
        debit_amount: netIncome,
        credit_amount: 0,
        description: "ترحيل صافي الربح إلى الأرباح المحتجزة",
      })
      lines.push({
        journal_entry_id: journalEntryId,
        account_id: retainedEarningsAccountId,
        debit_amount: 0,
        credit_amount: netIncome,
        description: "إضافة صافي الربح إلى الأرباح المحتجزة",
      })
    } else {
      // خسارة: Dr. Retained Earnings, Cr. Income Summary
      const lossAmount = Math.abs(netIncome)
      lines.push({
        journal_entry_id: journalEntryId,
        account_id: retainedEarningsAccountId,
        debit_amount: lossAmount,
        credit_amount: 0,
        description: "خصم صافي الخسارة من الأرباح المحتجزة",
      })
      lines.push({
        journal_entry_id: journalEntryId,
        account_id: incomeSummaryAccountId,
        debit_amount: 0,
        credit_amount: lossAmount,
        description: "ترحيل صافي الخسارة من الأرباح المحتجزة",
      })
    }

    const { error: linesError } = await supabase
      .from("journal_entry_lines")
      .insert(lines)

    if (linesError) {
      // حذف القيد الرئيسي في حالة فشل إنشاء السطور
      await supabase.from("journal_entries").delete().eq("id", journalEntryId)

      return {
        success: false,
        error: `خطأ في إنشاء سطور القيد: ${linesError.message}`,
      }
    }

    // ✅ 7. تحديث أو إنشاء سجل الفترة في accounting_periods
    let periodId: string

    // البحث عن فترة موجودة
    const { data: existingPeriod } = await supabase
      .from("accounting_periods")
      .select("id")
      .eq("company_id", companyId)
      .eq("period_start", periodStart)
      .eq("period_end", periodEnd)
      .limit(1)
      .single()

    if (existingPeriod) {
      // تحديث الفترة الموجودة
      const { data: updatedPeriod, error: updateError } = await supabase
        .from("accounting_periods")
        .update({
          status: "closed",
          closed_by: closedByUserId,
          closed_at: new Date().toISOString(),
          journal_entry_id: journalEntryId,
          notes: notes || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingPeriod.id)
        .select()
        .single()

      if (updateError) {
        return {
          success: false,
          error: `خطأ في تحديث الفترة: ${updateError.message}`,
        }
      }

      periodId = updatedPeriod.id
    } else {
      // إنشاء فترة جديدة
      const periodNameFinal = periodName || `${periodStart} إلى ${periodEnd}`
      const { data: newPeriod, error: createError } = await supabase
        .from("accounting_periods")
        .insert({
          company_id: companyId,
          period_name: periodNameFinal,
          period_start: periodStart,
          period_end: periodEnd,
          status: "closed",
          closed_by: closedByUserId,
          closed_at: new Date().toISOString(),
          journal_entry_id: journalEntryId,
          notes: notes || null,
        })
        .select()
        .single()

      if (createError) {
        return {
          success: false,
          error: `خطأ في إنشاء الفترة: ${createError.message}`,
        }
      }

      periodId = newPeriod.id
    }

    // ✅ 8. حساب رصيد الأرباح المحتجزة بعد الإقفال
    const { data: retainedEarningsLines } = await supabase
      .from("journal_entry_lines")
      .select("debit_amount, credit_amount, journal_entries!inner(company_id, is_deleted, deleted_at)")
      .eq("account_id", retainedEarningsAccountId)
      .eq("journal_entries.company_id", companyId)
      .neq("journal_entries.is_deleted", true) // ✅ استثناء القيود المحذوفة (is_deleted)
      .is("journal_entries.deleted_at", null) // ✅ استثناء القيود المحذوفة (deleted_at)

    let retainedEarningsBalance = 0
    for (const line of retainedEarningsLines || []) {
      retainedEarningsBalance += Number(line.credit_amount || 0) - Number(line.debit_amount || 0)
    }

    return {
      success: true,
      journalEntryId,
      periodId,
      netIncome,
      retainedEarningsBalance,
    }
  } catch (error: any) {
    return {
      success: false,
      error: error.message || "حدث خطأ غير متوقع",
    }
  }
}

/**
 * التحقق من إمكانية إقفال الفترة
 */
export async function canClosePeriod(
  supabase: SupabaseClient,
  companyId: string,
  periodStart: string,
  periodEnd: string
): Promise<{ canClose: boolean; error?: string }> {
  try {
    const { isClosed } = await checkPeriodNotClosed(supabase, companyId, periodStart, periodEnd)

    if (isClosed) {
      return {
        canClose: false,
        error: "الفترة المحاسبية مغلقة بالفعل",
      }
    }

    // التحقق من وجود حسابات النظام المطلوبة
    const { retainedEarningsAccountId, incomeSummaryAccountId } = await getSystemAccounts(
      supabase,
      companyId
    )

    if (!retainedEarningsAccountId) {
      return {
        canClose: false,
        error: "حساب الأرباح المحتجزة غير موجود (رمز: 3200)",
      }
    }

    if (!incomeSummaryAccountId) {
      return {
        canClose: false,
        error: "حساب Income Summary غير موجود (رمز: 3300)",
      }
    }

    return { canClose: true }
  } catch (error: any) {
    return {
      canClose: false,
      error: error.message || "حدث خطأ في التحقق",
    }
  }
}
