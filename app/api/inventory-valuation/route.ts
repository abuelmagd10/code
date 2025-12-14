import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { secureApiRequest } from "@/lib/api-security"
import { apiError, apiSuccess, HTTP_STATUS, internalError } from "@/lib/api-error-handler"

export async function GET(req: NextRequest) {
  try {
    // === تحصين أمني: استخدام secureApiRequest ===
    const { user, companyId, member, error } = await secureApiRequest(req, {
      requireAuth: true,
      requireCompany: true,
      requirePermission: { resource: "reports", action: "read" }
    })

    if (error) return error
    if (!companyId) return apiError(HTTP_STATUS.NOT_FOUND, "لم يتم العثور على الشركة", "Company not found")
    // === نهاية التحصين الأمني ===

    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ""
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
    if (!url || !serviceKey) {
      return apiError(HTTP_STATUS.INTERNAL_ERROR, "خطأ في إعدادات الخادم", "Server configuration error")
    }

    const admin = createClient(url, serviceKey, { global: { headers: { apikey: serviceKey } } })
    const { searchParams } = new URL(req.url)
    const endDate = String(searchParams.get("endDate") || new Date().toISOString().slice(0,10))

    const { data: tx } = await admin
      .from('inventory_transactions')
      .select('product_id, transaction_type, quantity_change, created_at')
      .lte('created_at', endDate)
      .eq('company_id', companyId)
    // Only get products (exclude services from inventory valuation)
    const { data: products } = await admin
      .from('products')
      .select('id, sku, name, cost_price, item_type')
      .eq('company_id', companyId)
      .or('item_type.is.null,item_type.eq.product') // Only products, not services

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
    const result = Object.entries(byProduct).map(([id, v]) => ({ id, code: codeById[id], name: nameById[id] || id, qty: v.qty, avg_cost: Number(costById[id] || 0) }))
    return apiSuccess(result)
  } catch (e: any) {
    return internalError("حدث خطأ أثناء جلب تقييم المخزون", e?.message)
  }
}