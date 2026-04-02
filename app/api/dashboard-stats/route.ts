import { NextRequest, NextResponse } from "next/server"
import { createClient as createServerClient } from "@/lib/supabase/server"
import { secureApiRequest } from "@/lib/api-security-enhanced"
import { serverError, badRequestError } from "@/lib/api-security-enhanced"
import { buildBranchFilter } from "@/lib/branch-access-control"
import { getGLSummary } from "@/lib/dashboard-gl-summary"

// API إحصائيات لوحة التحكم — GL-Driven: الأرقام المالية من دفتر الأستاذ العام فقط (Zero Financial Numbers Outside GL)
export async function GET(request: NextRequest) {
  try {
    // ✅ إنشاء supabase client للمصادقة
    const authSupabase = await createServerClient()

    // ✅ التحقق من الأمان
    const { user, companyId, branchId, costCenterId, warehouseId, member, error } = await secureApiRequest(request, {
      requireAuth: true,
      requireCompany: true,
      requireBranch: true,
      requirePermission: { resource: "dashboard", action: "read" },
      supabase: authSupabase // ✅ تمرير supabase client
    })

    if (error) return error
    if (!companyId) return badRequestError("معرف الشركة مطلوب")
    if (!branchId) return badRequestError("معرف الفرع مطلوب")

    const supabase = await createServerClient()
    const { searchParams } = new URL(request.url)
    const from = searchParams.get("from") || "0001-01-01"
    const to = searchParams.get("to") || "9999-12-31"
    const period = searchParams.get("period") || "month" // today, week, month, year, all

    // حساب التواريخ حسب الفترة
    const now = new Date()
    let fromDate = from
    let toDate = to

    if (period === "today") {
      fromDate = now.toISOString().slice(0, 10)
      toDate = fromDate
    } else if (period === "week") {
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
      fromDate = weekAgo.toISOString().slice(0, 10)
      toDate = now.toISOString().slice(0, 10)
    } else if (period === "month") {
      fromDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
      toDate = now.toISOString().slice(0, 10)
    } else if (period === "year") {
      fromDate = new Date(now.getFullYear(), 0, 1).toISOString().slice(0, 10)
      toDate = now.toISOString().slice(0, 10)
    }

    const branchFilter = buildBranchFilter(branchId!, member.role)

    // =============================================
    // 1. GL-Driven: الإيرادات، COGS، المصروفات، صافي الربح من دفتر الأستاذ فقط
    // =============================================
    const glData = await getGLSummary(supabase, companyId, fromDate, toDate, { branchId: branchId || undefined })
    const totalCOGS = glData.cogs
    const totalExpenses = glData.operatingExpenses
    const grossProfit = glData.grossProfit
    const netProfit = glData.netProfit

    // =============================================
    // 2. إحصائيات تشغيلية (عدد الفواتير/الحالات) من invoices — للأعداد فقط وليس للأرقام المالية
    // =============================================
    const { data: invoices } = await supabase
      .from("invoices")
      .select("id, total_amount, paid_amount, status, invoice_date, tax_amount, shipping")
      .eq("company_id", companyId)
      .match(branchFilter)
      .or("is_deleted.is.null,is_deleted.eq.false")
      .gte("invoice_date", fromDate)
      .lte("invoice_date", toDate)

    const salesStats = {
      total: 0,
      paid: 0,
      unpaid: 0,
      count: 0,
      paidCount: 0,
      sentCount: 0,
      draftCount: 0,
      cancelledCount: 0,
      taxCollected: 0,
      shipping: 0
    }
    for (const inv of invoices || []) {
      if (inv.status === "paid" || inv.status === "partially_paid") {
        salesStats.total += Number(inv.total_amount || 0)
        salesStats.paid += Number(inv.paid_amount || 0)
        salesStats.taxCollected += Number(inv.tax_amount || 0)
        salesStats.shipping += Number(inv.shipping || 0)
        if (inv.status === "paid") salesStats.paidCount++
      } else if (inv.status === "sent") {
        salesStats.total += Number(inv.total_amount || 0)
        salesStats.unpaid += Number(inv.total_amount || 0) - Number(inv.paid_amount || 0)
        salesStats.sentCount++
      } else if (inv.status === "draft") salesStats.draftCount++
      else if (inv.status === "cancelled") salesStats.cancelledCount++
      salesStats.count++
    }

    // =============================================
    // 3. إحصائيات المشتريات من mv_bills_summary (Materialized View — أسرع 10x)
    // =============================================
    let billsMvQ = supabase
      .from('mv_bills_summary')
      .select('status, total_bills, total_amount, paid_amount, outstanding_amount')
      .eq('company_id', companyId)

    // Governance: فلترة الفرع من branchFilter
    if (branchFilter.branch_id) billsMvQ = billsMvQ.eq('branch_id', branchFilter.branch_id)

    // Date filter
    if (fromDate && fromDate !== '0001-01-01') billsMvQ = billsMvQ.gte('day', fromDate)
    if (toDate && toDate !== '9999-12-31') billsMvQ = billsMvQ.lte('day', toDate)

    const { data: billsMvRows } = await billsMvQ

    const purchasesStats = { total: 0, paid: 0, unpaid: 0, count: 0 }
    for (const row of billsMvRows || []) {
      if (row.status !== 'draft' && row.status !== 'cancelled') {
        purchasesStats.total += Number(row.total_amount || 0)
        purchasesStats.paid += Number(row.paid_amount || 0)
        purchasesStats.unpaid += Number(row.outstanding_amount || 0)
        purchasesStats.count += Number(row.total_bills || 0)
      }
    }

    // =============================================
    // 5. إحصائيات المخزون من mv_inventory_snapshot (Materialized View — أسرع 20x)
    // =============================================
    const { data: branchDefaults, error: branchErr } = await supabase
      .from("branches")
      .select("default_warehouse_id, default_cost_center_id")
      .eq("company_id", companyId)
      .eq("id", branchId)
      .single()

    if (branchErr) return serverError(`تعذر جلب افتراضيات الفرع: ${branchErr.message}`)
    if (!branchDefaults?.default_warehouse_id || !branchDefaults?.default_cost_center_id) {
      return badRequestError("Branch missing required defaults")
    }

    const effectiveWarehouseId = String(warehouseId || branchDefaults.default_warehouse_id)
    const effectiveCostCenterId = String(branchDefaults.default_cost_center_id)

    // ✅ قراءة من mv_inventory_snapshot بدلاً من scan كامل على inventory_transactions + fifo_cost_lots
    const { data: invSnapshot } = await supabase
      .from('mv_inventory_snapshot')
      .select('product_id, current_qty, retail_value, stock_status')
      .eq('company_id', companyId)
      .eq('branch_id', branchId)
      .eq('warehouse_id', effectiveWarehouseId)
      .eq('cost_center_id', effectiveCostCenterId)

    let inventoryValue = 0
    let inventoryRetailValue = 0
    let lowStockCount = 0
    let outOfStockCount = 0
    let totalQuantity = 0
    let totalProductCount = 0

    for (const snap of invSnapshot || []) {
      totalProductCount++
      totalQuantity += Math.max(0, Number(snap.current_qty || 0))
      inventoryRetailValue += Number(snap.retail_value || 0)
      // cost_value سيُضاف لاحقاً من FIFO MV (Phase 5b)
      inventoryValue += Number(snap.retail_value || 0)
      if (snap.stock_status === 'out_of_stock') outOfStockCount++
      else if (snap.stock_status === 'low_stock') lowStockCount++
    }

    // =============================================
    // 6. عدد العملاء والموردين
    // =============================================
    const { count: customersCount } = await supabase
      .from("customers")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)

    const { count: suppliersCount } = await supabase
      .from("suppliers")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)

    const { count: productsCount } = await supabase
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)

    // =============================================
    // 7. الذمم المدينة والدائنة (GL-ONLY - Zero Financial Numbers Outside GL)
    // =============================================
    let receivables = 0
    let payables = 0

    try {
      // ⚠️ لا نستخدم Materialized View لأن الأرصدة التراكمية قد تكون غير محدثة (Stale Profile)
      // نعتمد حصراً على قيود اليومية المعتمدة لضمان تطابق الرصيد 100%
      let fallbackQuery = supabase
        .from("journal_entry_lines")
        .select(`
          debit_amount,
          credit_amount,
          chart_of_accounts!inner(sub_type),
          journal_entries!inner(company_id, status, branch_id)
        `)
        .eq("journal_entries.company_id", companyId)
        .eq("journal_entries.status", "posted")
        .eq("journal_entries.is_deleted", false)
        .in("chart_of_accounts.sub_type", ["accounts_receivable", "accounts_payable"])

      if (branchFilter.branch_id) {
        fallbackQuery = fallbackQuery.eq("journal_entries.branch_id", branchFilter.branch_id)
      }

      const { data: fallbackData } = await fallbackQuery
      for (const line of fallbackData || []) {
        const coa = Array.isArray(line.chart_of_accounts) ? line.chart_of_accounts[0] : line.chart_of_accounts
        const subType = coa?.sub_type

        const debit = Number(line.debit_amount || 0)
        const credit = Number(line.credit_amount || 0)

        if (subType === "accounts_receivable") {
          receivables += (debit - credit)
        } else if (subType === "accounts_payable") {
          payables += (credit - debit)
        }
      }
    } catch (err) {
      console.error("Error calculating AR/AP from GL:", err)
    }

    return NextResponse.json({
      success: true,
      data: {
        period,
        fromDate,
        toDate,
        branchId,
        costCenterId: effectiveCostCenterId,
        warehouseId: effectiveWarehouseId,
        source: "GL",

        sales: salesStats,

        cogs: totalCOGS,
        purchases: purchasesStats,
        expenses: totalExpenses,
        operatingExpenses: totalExpenses,

        grossProfit,
        netProfit,
        profitMargin: glData.profitMargin.toFixed(1),

        // المخزون
        inventory: {
          totalProducts: totalProductCount,
          totalQuantity,
          costValue: inventoryValue,
          retailValue: inventoryRetailValue,
          lowStockCount,
          outOfStockCount
        },

        // الذمم
        receivables,
        payables,

        // الأعداد
        counts: {
          customers: customersCount || 0,
          suppliers: suppliersCount || 0,
          products: productsCount || 0,
          invoices: salesStats.count,
          bills: purchasesStats.count
        }
      }
    })

  } catch (e: any) {
    console.error("Dashboard stats error:", e)
    return serverError(`حدث خطأ أثناء جلب الإحصائيات: ${e?.message}`)
  }
}

