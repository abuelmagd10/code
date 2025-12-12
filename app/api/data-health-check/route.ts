import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

// API لفحص صحة البيانات ومنع الأخطاء
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

    const { data: company } = await supabase
      .from("companies")
      .select("id")
      .eq("user_id", user.id)
      .single()

    if (!company) return NextResponse.json({ error: "no company" }, { status: 401 })

    const issues: any[] = []
    const companyId = company.id

    // ======================================
    // 1. فحص الفواتير المدفوعة بدون قيود
    // ======================================
    const { data: paidWithoutEntries } = await supabase.rpc("check_paid_invoices_without_entries", {
      p_company_id: companyId
    })
    if (paidWithoutEntries?.length > 0) {
      issues.push({
        type: "CRITICAL",
        category: "invoices",
        title_ar: "فواتير مدفوعة بدون قيود محاسبية",
        title_en: "Paid invoices without journal entries",
        count: paidWithoutEntries.length,
        items: paidWithoutEntries,
        fix_action: "repair_invoice"
      })
    }

    // ======================================
    // 2. فحص تطابق رصيد المخزون
    // ======================================
    const { data: stockMismatch } = await supabase.rpc("check_stock_mismatch", {
      p_company_id: companyId
    })
    if (stockMismatch?.length > 0) {
      issues.push({
        type: "WARNING",
        category: "inventory",
        title_ar: "عدم تطابق رصيد المخزون",
        title_en: "Stock quantity mismatch",
        count: stockMismatch.length,
        items: stockMismatch,
        fix_action: "sync_stock"
      })
    }

    // ======================================
    // 3. فحص قيود المرتجعات الخاطئة
    // ======================================
    const { data: wrongReturnEntries } = await supabase.rpc("check_wrong_return_entries", {
      p_company_id: companyId
    })
    if (wrongReturnEntries?.length > 0) {
      issues.push({
        type: "WARNING",
        category: "journals",
        title_ar: "قيود مرتجعات بحسابات خاطئة",
        title_en: "Return entries with wrong accounts",
        count: wrongReturnEntries.length,
        items: wrongReturnEntries,
        fix_action: "fix_return_entries"
      })
    }

    // ======================================
    // 4. فحص حركات مخزون للفواتير الملغاة
    // ======================================
    const { data: cancelledInvoiceTx } = await supabase.rpc("check_cancelled_invoice_transactions", {
      p_company_id: companyId
    })
    if (cancelledInvoiceTx?.length > 0) {
      issues.push({
        type: "WARNING",
        category: "inventory",
        title_ar: "حركات مخزون لفواتير ملغاة",
        title_en: "Inventory transactions for cancelled invoices",
        count: cancelledInvoiceTx.length,
        items: cancelledInvoiceTx,
        fix_action: "remove_orphan_transactions"
      })
    }

    // ======================================
    // 5. فحص القيود غير المتوازنة
    // ======================================
    const { data: unbalancedEntries } = await supabase.rpc("check_unbalanced_entries", {
      p_company_id: companyId
    })
    if (unbalancedEntries?.length > 0) {
      issues.push({
        type: "CRITICAL",
        category: "journals",
        title_ar: "قيود يومية غير متوازنة",
        title_en: "Unbalanced journal entries",
        count: unbalancedEntries.length,
        items: unbalancedEntries,
        fix_action: "fix_unbalanced_entries"
      })
    }

    return NextResponse.json({
      success: true,
      company_id: companyId,
      check_date: new Date().toISOString(),
      total_issues: issues.reduce((sum, i) => sum + i.count, 0),
      critical_count: issues.filter(i => i.type === "CRITICAL").reduce((sum, i) => sum + i.count, 0),
      warning_count: issues.filter(i => i.type === "WARNING").reduce((sum, i) => sum + i.count, 0),
      issues,
      health_status: issues.length === 0 ? "HEALTHY" : 
                     issues.some(i => i.type === "CRITICAL") ? "CRITICAL" : "WARNING"
    })
  } catch (error: any) {
    console.error("Health check error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

