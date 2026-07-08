/**
 * 📊 Inventory Valuation API - تقييم المخزون
 * 
 * ⚠️ OPERATIONAL REPORT (NOT ACCOUNTING REPORT)
 * 
 * ✅ هذا تقرير تشغيلي - يعتمد على FIFO lots
 * ✅ يستخدم fifo_cost_lots كمصدر الحقيقة الوحيد لتكلفة المخزون
 * 
 * ✅ القواعد:
 * 1. مصدر الكميات: inventory_transactions
 * 2. مصدر التكلفة: fifo_cost_lots (FIFO weighted average)
 * 3. الفلترة: حسب الشركة، الفرع، المخزن، مركز التكلفة
 * 4. FIFO: حساب FIFO weighted average cost لكل منتج
 * 
 * ⚠️ ملاحظة مهمة:
 * - هذا التقرير تشغيلي وليس محاسبي رسمي
 * - يستخدم FIFO lots لحساب قيمة المخزون
 * - لا يعتمد على products.cost_price (يستخدمه فقط كـ fallback للتوافق)
 * 
 * راجع: docs/OPERATIONAL_REPORTS_GUIDE.md
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient as createServerClient } from "@/lib/supabase/server"
import { secureApiRequest, serverError, badRequestError } from "@/lib/api-security-enhanced"

export async function GET(req: NextRequest) {
  try {
    // ✅ إنشاء supabase client للمصادقة
    const authSupabase = await createServerClient()

    // ✅ التحقق من الأمان
    const { user, companyId, branchId, warehouseId, member, error } = await secureApiRequest(req, {
      requireAuth: true,
      requireCompany: true,
      requireBranch: true,
      requirePermission: { resource: "financial_reports", action: "read" },
      allowedRoles: ['owner', 'admin', 'general_manager'],
      supabase: authSupabase // ✅ تمرير supabase client
    })

    if (error) return error
    if (!companyId) return badRequestError("معرف الشركة مطلوب")
    if (!branchId) return badRequestError("معرف الفرع مطلوب")

    const supabase = await createServerClient()
    const { searchParams } = new URL(req.url)
    const endDate = String(searchParams.get("endDate") || new Date().toISOString().slice(0,10))
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

    const { data: tx } = await supabase
      .from('inventory_transactions')
      .select('product_id, transaction_type, quantity_change, created_at, warehouse_id')
      .lte('created_at', endDate)
      .eq('company_id', companyId)
      .eq('branch_id', branchId)
      .eq('warehouse_id', effectiveWarehouseId)
      .eq('cost_center_id', effectiveCostCenterId)
    // Only get products (exclude services from inventory valuation)
    const { data: products } = await supabase
      .from('products')
      .select('id, sku, name, cost_price, item_type')
      .eq('company_id', companyId)
      .or('item_type.is.null,item_type.eq.product')

    const costById: Record<string, number> = {}
    const nameById: Record<string, string> = {}
    const codeById: Record<string, string> = {}
    const productIds = new Set<string>()
    for (const p of (products || [])) {
      const pid = String((p as any).id)
      productIds.add(pid)
      nameById[pid] = String((p as any).name || '')
      codeById[pid] = String(((p as any).sku || ''))
      costById[pid] = Number(((p as any).cost_price || 0))
    }
    const byProduct: Record<string, { qty: number }> = {}
    for (const t of (tx || [])) {
      const pid = String((t as any).product_id)
      // Skip if this is a service (not in productIds set)
      if (!productIds.has(pid)) continue
      if (!byProduct[pid]) byProduct[pid] = { qty: 0 }
      const q = Number((t as any).quantity_change || 0)
      // quantity_change تحتوي على القيمة الصحيحة مباشرة:
      // - موجبة للشراء والتعديل للداخل
      // - سالبة للبيع والتعديل للخارج
      // لذلك نجمعها مباشرة
      byProduct[pid].qty += q
    }

    // 🆕 جلب FIFO lots لكل منتج
    const { data: fifoLots } = await supabase
      .from('fifo_cost_lots')
      .select('product_id, lot_date, lot_type, remaining_quantity, unit_cost')
      .eq('company_id', companyId)
      .gt('remaining_quantity', 0)
      .order('product_id')
      .order('lot_date')

    // تجميع FIFO lots حسب المنتج
    const fifoByProduct: Record<string, Array<{
      lot_date: string
      lot_type: string
      qty: number
      unit_cost: number
      value: number
    }>> = {}

    for (const lot of (fifoLots || [])) {
      const pid = String(lot.product_id)
      if (!fifoByProduct[pid]) fifoByProduct[pid] = []
      fifoByProduct[pid].push({
        lot_date: lot.lot_date,
        lot_type: lot.lot_type,
        qty: Number(lot.remaining_quantity),
        unit_cost: Number(lot.unit_cost),
        value: Number(lot.remaining_quantity) * Number(lot.unit_cost)
      })
    }

    // ✅ حساب FIFO weighted average cost
    // ✅ FIFO Weighted Average = SUM(remaining_quantity * unit_cost) / SUM(remaining_quantity)
    const fifoAvgCost: Record<string, number> = {}
    for (const [pid, lots] of Object.entries(fifoByProduct)) {
      const totalQty = lots.reduce((sum, lot) => sum + lot.qty, 0)
      const totalValue = lots.reduce((sum, lot) => sum + lot.value, 0)
      fifoAvgCost[pid] = totalQty > 0 ? totalValue / totalQty : 0
    }

    // ✅ بناء النتيجة مع FIFO lots
    // ⚠️ avg_cost من products.cost_price (للتوافق فقط - لا يُستخدم في الحسابات)
    // ✅ fifo_avg_cost من fifo_cost_lots (المصدر الوحيد للحقيقة)
    const result = Object.entries(byProduct).map(([id, v]) => ({
      id,
      code: codeById[id],
      name: nameById[id] || id,
      qty: v.qty,
      avg_cost: Number(costById[id] || 0), // ⚠️ للتوافق فقط (deprecated)
      fifo_avg_cost: fifoAvgCost[id] || 0, // ✅ FIFO Weighted Average (المصدر الوحيد)
      fifo_lots: fifoByProduct[id] || [] // ✅ FIFO layers
    }))
    
    return NextResponse.json({
      success: true,
      data: result
    })
  } catch (e: any) {
    return serverError(`حدث خطأ أثناء جلب تقييم المخزون: ${e?.message}`)
  }
}
