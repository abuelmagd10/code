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
    const from = String(searchParams.get("from") || "0001-01-01")
    const to = String(searchParams.get("to") || "9999-12-31")
    const itemType = String(searchParams.get("item_type") || "all") // 'all', 'product', 'service'
    const statusFilter = String(searchParams.get("status") || "all") // 'all', 'sent', 'paid', 'partially_paid'
    const customerId = searchParams.get("customer_id") || ""
    const productId = searchParams.get("product_id") || ""

    // Get invoices with items and product info for item_type filtering
    let invoicesQuery = admin
      .from("invoices")
      .select("id, total_amount, invoice_date, status, customer_id, customers(name), created_by")
      .eq("company_id", companyId)
      .or("is_deleted.is.null,is_deleted.eq.false")
      .gte("invoice_date", from)
      .lte("invoice_date", to)

    // تطبيق فلتر الحالة
    if (statusFilter === "all") {
      invoicesQuery = invoicesQuery.in("status", ["sent", "partially_paid", "paid"])
    } else {
      invoicesQuery = invoicesQuery.eq("status", statusFilter)
    }

    // تطبيق فلتر العميل
    if (customerId) {
      invoicesQuery = invoicesQuery.eq("customer_id", customerId)
    }

    const { data: invoices } = await invoicesQuery

    if (!invoices || invoices.length === 0) {
      return apiSuccess([])
    }

    const invoiceIds = invoices.map((inv: any) => inv.id)

    // Get invoice items with product info
    let itemsQuery = admin
      .from("invoice_items")
      .select("invoice_id, line_total, product_id, products(item_type, name)")
      .in("invoice_id", invoiceIds)

    // تطبيق فلتر المنتج إذا تم تحديده
    if (productId) {
      itemsQuery = itemsQuery.eq("product_id", productId)
    }

    const { data: invoiceItems } = await itemsQuery

    // Build a map of invoice_id -> { productTotal, serviceTotal }
    const invoiceTotals = new Map<string, { productTotal: number; serviceTotal: number }>()
    for (const item of invoiceItems || []) {
      const invId = String((item as any).invoice_id)
      const lineTotal = Number((item as any).line_total || 0)
      const prodItemType = (item as any).products?.item_type || 'product'

      const existing = invoiceTotals.get(invId) || { productTotal: 0, serviceTotal: 0 }
      if (prodItemType === 'service') {
        existing.serviceTotal += lineTotal
      } else {
        existing.productTotal += lineTotal
      }
      invoiceTotals.set(invId, existing)
    }

    // Group by customer with item type filtering
    const grouped: Record<string, { customerId: string; total: number; count: number; productSales: number; serviceSales: number }> = {}
    for (const inv of invoices) {
      const name = String(((inv as any).customers || {}).name || "Unknown")
      const customerId = String((inv as any).customer_id || "")
      const invId = String((inv as any).id)
      const totals = invoiceTotals.get(invId) || { productTotal: 0, serviceTotal: 0 }

      // Apply item type filter
      let relevantTotal = 0
      if (itemType === 'product') {
        relevantTotal = totals.productTotal
      } else if (itemType === 'service') {
        relevantTotal = totals.serviceTotal
      } else {
        relevantTotal = totals.productTotal + totals.serviceTotal
      }

      // Skip if no relevant sales
      if (relevantTotal === 0) continue

      const prev = grouped[name] || { customerId, total: 0, count: 0, productSales: 0, serviceSales: 0 }
      grouped[name] = {
        customerId,
        total: prev.total + relevantTotal,
        count: prev.count + 1,
        productSales: prev.productSales + totals.productTotal,
        serviceSales: prev.serviceSales + totals.serviceTotal
      }
    }

    const result = Object.entries(grouped).map(([customer_name, v]) => ({
      customer_id: v.customerId,
      customer_name,
      total_sales: v.total,
      invoice_count: v.count,
      product_sales: v.productSales,
      service_sales: v.serviceSales
    }))
    return apiSuccess(result)
  } catch (e: any) {
    return internalError("حدث خطأ أثناء جلب تقرير المبيعات", e?.message)
  }
}