import { NextRequest, NextResponse } from "next/server"
import { createClient as createSSR } from "@/lib/supabase/server"
import { createClient } from "@supabase/supabase-js"
import { apiError, HTTP_STATUS, internalError } from "@/lib/api-error-handler"

async function getAdmin() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ""
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
  return url && serviceKey ? createClient(url, serviceKey, { global: { headers: { apikey: serviceKey } } }) : null
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createSSR()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return apiError(HTTP_STATUS.UNAUTHORIZED, "غير مصرح", "Unauthorized")

    const body = await req.json()
    const { fixType, issueIds } = body

    // جلب الشركة
    const { data: company } = await supabase
      .from("companies")
      .select("id")
      .eq("user_id", user.id)
      .single()

    if (!company) {
      const { data: member } = await supabase
        .from("company_members")
        .select("company_id")
        .eq("user_id", user.id)
        .single()
      if (!member) return apiError(HTTP_STATUS.NOT_FOUND, "لم يتم العثور على شركة", "Company not found")
    }

    const companyId = company?.id || (await supabase.from("company_members").select("company_id").eq("user_id", user.id).single()).data?.company_id

    const admin = await getAdmin()
    if (!admin) return apiError(HTTP_STATUS.INTERNAL_ERROR, "خطأ في الاتصال", "Admin client error")

    let fixResults: any = {
      fix_type: fixType,
      company_id: companyId,
      timestamp: new Date().toISOString(),
      results: []
    }

    switch (fixType) {
      case 'missing_dimensions':
        fixResults = await fixMissingDimensions(admin, companyId)
        break
      
      case 'unbalanced_entries':
        fixResults = await fixUnbalancedEntries(admin, companyId, issueIds)
        break
      
      case 'accounting_pattern_violations':
        fixResults = await fixAccountingPatternViolations(admin, companyId, issueIds)
        break
      
      case 'orphan_entries':
        fixResults = await fixOrphanEntries(admin, companyId)
        break
      
      default:
        return apiError(HTTP_STATUS.BAD_REQUEST, "نوع إصلاح غير مدعوم", "Unsupported fix type")
    }

    return NextResponse.json({
      success: true,
      message: "تم تطبيق الإصلاحات بنجاح",
      ...fixResults
    })

  } catch (err: any) {
    console.error("ERP Auto-fix error:", err)
    return internalError(err?.message || "خطأ في الإصلاح التلقائي")
  }
}

// =====================================================
// دوال الإصلاح التلقائي
// =====================================================

async function fixMissingDimensions(admin: any, companyId: string) {
  const results: any[] = []
  
  try {
    // إصلاح الفواتير بدون company_id
    const { data: invoicesFixed, error: invoicesError } = await admin
      .from("invoices")
      .update({ company_id: companyId })
      .is("company_id", null)
      .select("id")

    if (!invoicesError && invoicesFixed) {
      results.push({
        table: 'invoices',
        records_fixed: invoicesFixed.length,
        description: 'Added missing company_id to invoices'
      })
    }

    // إصلاح أوامر البيع بدون company_id
    const { data: ordersFixed, error: ordersError } = await admin
      .from("sales_orders")
      .update({ company_id: companyId })
      .is("company_id", null)
      .select("id")

    if (!ordersError && ordersFixed) {
      results.push({
        table: 'sales_orders',
        records_fixed: ordersFixed.length,
        description: 'Added missing company_id to sales orders'
      })
    }

    // إصلاح القيود بدون company_id
    const { data: entriesFixed, error: entriesError } = await admin
      .from("journal_entries")
      .update({ company_id: companyId })
      .is("company_id", null)
      .select("id")

    if (!entriesError && entriesFixed) {
      results.push({
        table: 'journal_entries',
        records_fixed: entriesFixed.length,
        description: 'Added missing company_id to journal entries'
      })
    }

    // إصلاح حركات المخزون بدون company_id
    const { data: inventoryFixed, error: inventoryError } = await admin
      .from("inventory_transactions")
      .update({ company_id: companyId })
      .is("company_id", null)
      .select("id")

    if (!inventoryError && inventoryFixed) {
      results.push({
        table: 'inventory_transactions',
        records_fixed: inventoryFixed.length,
        description: 'Added missing company_id to inventory transactions'
      })
    }

  } catch (error) {
    console.error('Fix missing dimensions error:', error)
  }

  return {
    fix_type: 'missing_dimensions',
    results,
    total_records_fixed: results.reduce((sum, r) => sum + r.records_fixed, 0),
    status: 'COMPLETED'
  }
}

async function fixUnbalancedEntries(admin: any, companyId: string, issueIds?: string[]) {
  const results: any[] = []
  
  try {
    // جلب القيود غير المتوازنة
    let query = `
      SELECT 
        je.id as journal_entry_id, je.reference_type, je.reference_id,
        COALESCE(SUM(jel.debit_amount), 0) as total_debit,
        COALESCE(SUM(jel.credit_amount), 0) as total_credit,
        COALESCE(SUM(jel.debit_amount), 0) - COALESCE(SUM(jel.credit_amount), 0) as difference
      FROM journal_entries je
      LEFT JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
      WHERE je.company_id = '${companyId}'
    `
    
    if (issueIds && issueIds.length > 0) {
      query += ` AND je.id IN ('${issueIds.join("','")}')`
    }
    
    query += `
      GROUP BY je.id, je.reference_type, je.reference_id
      HAVING ABS(COALESCE(SUM(jel.debit_amount), 0) - COALESCE(SUM(jel.credit_amount), 0)) > 0.01
    `

    const { data: unbalancedEntries } = await admin.rpc("sql", { query })

    for (const entry of unbalancedEntries || []) {
      const difference = Math.abs(entry.difference)
      
      if (difference > 0.01) {
        // إنشاء قيد ضبط (Adjustment Entry)
        const adjustmentEntry = {
          company_id: companyId,
          reference_type: 'adjustment',
          reference_id: entry.journal_entry_id,
          entry_date: new Date().toISOString().split('T')[0],
          description: `قيد ضبط للقيد رقم ${entry.journal_entry_id} - فرق ${difference}`,
          created_by: companyId // سيتم استبداله بـ user_id الفعلي
        }

        const { data: newEntry, error: entryError } = await admin
          .from("journal_entries")
          .insert(adjustmentEntry)
          .select("id")
          .single()

        if (!entryError && newEntry) {
          // إضافة سطر الضبط
          const adjustmentLine = {
            journal_entry_id: newEntry.id,
            account_id: await getAdjustmentAccountId(admin, companyId),
            description: `ضبط فرق القيد ${entry.journal_entry_id}`,
            debit_amount: entry.difference > 0 ? 0 : Math.abs(entry.difference),
            credit_amount: entry.difference > 0 ? entry.difference : 0
          }

          await admin
            .from("journal_entry_lines")
            .insert(adjustmentLine)

          results.push({
            original_entry_id: entry.journal_entry_id,
            adjustment_entry_id: newEntry.id,
            difference_fixed: difference,
            description: 'Created adjustment entry for unbalanced journal'
          })
        }
      }
    }

  } catch (error) {
    console.error('Fix unbalanced entries error:', error)
  }

  return {
    fix_type: 'unbalanced_entries',
    results,
    total_entries_fixed: results.length,
    status: 'COMPLETED'
  }
}

async function fixAccountingPatternViolations(admin: any, companyId: string, issueIds?: string[]) {
  const results: any[] = []
  
  try {
    // إصلاح الفواتير المرسلة بدون قيود
    const { data: sentInvoicesNoEntries } = await admin
      .from("invoices")
      .select("id, invoice_number, total_amount, customer_id, invoice_date")
      .eq("company_id", companyId)
      .in("status", ["sent", "paid", "partially_paid"])

    for (const invoice of sentInvoicesNoEntries || []) {
      // التحقق من عدم وجود قيد
      const { data: existingEntry } = await admin
        .from("journal_entries")
        .select("id")
        .eq("reference_id", invoice.id)
        .eq("reference_type", "invoice")
        .single()

      if (!existingEntry) {
        // إنشاء قيد للفاتورة
        const journalEntry = {
          company_id: companyId,
          reference_type: 'invoice',
          reference_id: invoice.id,
          entry_date: invoice.invoice_date,
          description: `فاتورة بيع رقم ${invoice.invoice_number}`,
          created_by: companyId
        }

        const { data: newEntry, error: entryError } = await admin
          .from("journal_entries")
          .insert(journalEntry)
          .select("id")
          .single()

        if (!entryError && newEntry) {
          // إضافة سطور القيد
          const arAccountId = await getARAccountId(admin, companyId)
          const salesAccountId = await getSalesAccountId(admin, companyId)

          const journalLines = [
            {
              journal_entry_id: newEntry.id,
              account_id: arAccountId,
              description: `ذمم عملاء - ${invoice.invoice_number}`,
              debit_amount: invoice.total_amount,
              credit_amount: 0
            },
            {
              journal_entry_id: newEntry.id,
              account_id: salesAccountId,
              description: `مبيعات - ${invoice.invoice_number}`,
              debit_amount: 0,
              credit_amount: invoice.total_amount
            }
          ]

          await admin
            .from("journal_entry_lines")
            .insert(journalLines)

          results.push({
            invoice_id: invoice.id,
            invoice_number: invoice.invoice_number,
            journal_entry_id: newEntry.id,
            description: 'Created missing journal entry for sent invoice'
          })
        }
      }
    }

  } catch (error) {
    console.error('Fix accounting pattern violations error:', error)
  }

  return {
    fix_type: 'accounting_pattern_violations',
    results,
    total_violations_fixed: results.length,
    status: 'COMPLETED'
  }
}

async function fixOrphanEntries(admin: any, companyId: string) {
  const results: any[] = []
  
  try {
    // حذف القيود بدون سطور
    const { data: entriesWithoutLines } = await admin.rpc("sql", {
      query: `
        SELECT je.id, je.reference_type, je.reference_id
        FROM journal_entries je
        WHERE je.company_id = '${companyId}'
        AND NOT EXISTS (
          SELECT 1 FROM journal_entry_lines jel 
          WHERE jel.journal_entry_id = je.id
        )
      `
    })

    for (const entry of entriesWithoutLines || []) {
      const { error: deleteError } = await admin
        .from("journal_entries")
        .delete()
        .eq("id", entry.id)

      if (!deleteError) {
        results.push({
          entry_id: entry.id,
          reference_type: entry.reference_type,
          reference_id: entry.reference_id,
          action: 'deleted',
          description: 'Removed orphan journal entry without lines'
        })
      }
    }

  } catch (error) {
    console.error('Fix orphan entries error:', error)
  }

  return {
    fix_type: 'orphan_entries',
    results,
    total_orphans_fixed: results.length,
    status: 'COMPLETED'
  }
}

// =====================================================
// دوال مساعدة
// =====================================================

async function getAdjustmentAccountId(admin: any, companyId: string) {
  const { data: account } = await admin
    .from("chart_of_accounts")
    .select("id")
    .eq("company_id", companyId)
    .eq("account_code", "9999")
    .single()

  return account?.id || null
}

async function getARAccountId(admin: any, companyId: string) {
  const { data: account } = await admin
    .from("chart_of_accounts")
    .select("id")
    .eq("company_id", companyId)
    .eq("sub_type", "accounts_receivable")
    .single()

  return account?.id || null
}

async function getSalesAccountId(admin: any, companyId: string) {
  const { data: account } = await admin
    .from("chart_of_accounts")
    .select("id")
    .eq("company_id", companyId)
    .eq("sub_type", "sales_revenue")
    .single()

  return account?.id || null
}