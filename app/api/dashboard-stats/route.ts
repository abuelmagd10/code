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
    // 3. إحصائيات تشغيلية للمشتريات (عدد الفواتير فقط — لا تُستخدم للأرقام المالية)
    // =============================================
    const { data: bills } = await supabase
      .from("bills")
      .select("id, total_amount, paid_amount, status, bill_date")
      .eq("company_id", companyId)
      .gte("bill_date", fromDate)
      .lte("bill_date", toDate)

    const purchasesStats = { total: 0, paid: 0, unpaid: 0, count: 0 }
    for (const bill of bills || []) {
      if (bill.status !== "draft" && bill.status !== "cancelled") {
        purchasesStats.total += Number(bill.total_amount || 0)
        purchasesStats.paid += Number(bill.paid_amount || 0)
        purchasesStats.unpaid += Number(bill.total_amount || 0) - Number(bill.paid_amount || 0)
        purchasesStats.count++
      }
    }

    // =============================================
    // 5. إحصائيات المخزون من inventory_transactions
    // =============================================
    const { data: products } = await supabase
      .from("products")
      .select("id, name, cost_price, unit_price, reorder_level, item_type")
      .eq("company_id", companyId)
      .or("item_type.is.null,item_type.eq.product")

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

    const { data: transactions } = await supabase
      .from("inventory_transactions")
      .select("product_id, quantity_change")
      .eq("company_id", companyId)
      .eq("branch_id", branchId)
      .eq("warehouse_id", effectiveWarehouseId)
      .eq("cost_center_id", effectiveCostCenterId)
      .or("is_deleted.is.null,is_deleted.eq.false")

    const qtyByProduct: Record<string, number> = {}
    for (const t of transactions || []) {
      const pid = String(t.product_id)
      qtyByProduct[pid] = (qtyByProduct[pid] || 0) + Number(t.quantity_change || 0)
    }

    // ✅ حساب FIFO weighted average cost لكل منتج
    const { data: fifoLots } = await supabase
      .from('fifo_cost_lots')
      .select('product_id, remaining_quantity, unit_cost')
      .eq('company_id', companyId)
      .gt('remaining_quantity', 0)

    const fifoAvgCostByProduct: Record<string, number> = {}
    const fifoValueByProduct: Record<string, number> = {}
    
    for (const lot of fifoLots || []) {
      const pid = String(lot.product_id)
      if (!fifoValueByProduct[pid]) {
        fifoValueByProduct[pid] = 0
        fifoValueByProduct[pid + '_qty'] = 0
      }
      fifoValueByProduct[pid] += Number(lot.remaining_quantity) * Number(lot.unit_cost)
      fifoValueByProduct[pid + '_qty'] += Number(lot.remaining_quantity)
    }

    for (const pid of Object.keys(fifoValueByProduct)) {
      if (pid.endsWith('_qty')) continue
      const qty = fifoValueByProduct[pid + '_qty'] || 0
      if (qty > 0) {
        fifoAvgCostByProduct[pid] = fifoValueByProduct[pid] / qty
      }
    }

    let inventoryValue = 0
    let inventoryRetailValue = 0
    let lowStockCount = 0
    let outOfStockCount = 0
    let totalQuantity = 0

    for (const p of products || []) {
      const qty = qtyByProduct[p.id] || 0
      totalQuantity += Math.max(0, qty)
      
      // ✅ استخدام FIFO weighted average cost بدلاً من cost_price
      const fifoCost = fifoAvgCostByProduct[p.id] || Number(p.cost_price || 0)
      inventoryValue += Math.max(0, qty) * fifoCost
      inventoryRetailValue += Math.max(0, qty) * Number(p.unit_price || 0)
      if (qty <= 0) outOfStockCount++
      else if (qty < (p.reorder_level || 5)) lowStockCount++
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
    // 7. الذمم المدينة والدائنة
    // =============================================
    const { data: allInvoices } = await supabase
      .from("invoices")
      .select("total_amount, paid_amount, status")
      .eq("company_id", companyId)
      .in("status", ["sent", "partially_paid"])
      .or("is_deleted.is.null,is_deleted.eq.false")

    let receivables = 0
    for (const inv of allInvoices || []) {
      receivables += Number(inv.total_amount || 0) - Number(inv.paid_amount || 0)
    }

    const { data: allBills } = await supabase
      .from("bills")
      .select("total_amount, paid_amount, status")
      .eq("company_id", companyId)
      .in("status", ["received", "partially_paid"])

    let payables = 0
    for (const bill of allBills || []) {
      payables += Number(bill.total_amount || 0) - Number(bill.paid_amount || 0)
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
          totalProducts: products?.length || 0,
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

