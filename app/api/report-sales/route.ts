import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { secureApiRequest, serverError, badRequestError } from "@/lib/api-security-enhanced"
import { buildBranchFilter } from "@/lib/branch-access-control"

export async function GET(req: NextRequest) {
  try {
    const { user, companyId, branchId, member, error } = await secureApiRequest(req, {
      requireAuth: true,
      requireCompany: true,
      requireBranch: true,
      requirePermission: { resource: "reports", action: "read" }
    })

    if (error) return error
    if (!companyId) return badRequestError("معرف الشركة مطلوب")
    if (!branchId) return badRequestError("معرف الفرع مطلوب")

    const supabase = createClient()
    const { searchParams } = new URL(req.url)
    const from = String(searchParams.get("from") || "0001-01-01")
    const to = String(searchParams.get("to") || "9999-12-31")
    const itemType = String(searchParams.get("item_type") || "all")
    const statusFilter = String(searchParams.get("status") || "all")
    const customerId = searchParams.get("customer_id") || ""
    const productId = searchParams.get("product_id") || ""
    const branchFilter = buildBranchFilter(branchId!, member.role)

    let invoicesQuery = supabase
      .from("invoices")
      .select("id, total_amount, invoice_date, status, customer_id, customers!left(name)")
      .eq("company_id", companyId)
      .match(branchFilter)
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

    const { data: invoices, error: invoicesError } = await invoicesQuery

    if (invoicesError) {
      return serverError(`خطأ في جلب الفواتير: ${invoicesError.message}`)
    }

    if (!invoices || invoices.length === 0) {
      return NextResponse.json({
        success: true,
        data: []
      })
    }

    const invoiceIds = invoices.map((inv: any) => inv.id)

    // Get invoice items with product info (LEFT JOIN to include items without products)
    // Note: In Supabase, default join is LEFT JOIN, but we make it explicit
    let itemsQuery = supabase
      .from("invoice_items")
      .select("invoice_id, line_total, product_id, products(item_type, name)")
      .in("invoice_id", invoiceIds)

    // تطبيق فلتر المنتج إذا تم تحديده
    if (productId) {
      itemsQuery = itemsQuery.eq("product_id", productId)
    }

    const { data: invoiceItems, error: itemsError } = await itemsQuery
    
    if (itemsError) {
      console.warn("خطأ في جلب عناصر الفواتير:", itemsError)
    }

    // Build a map of invoice_id -> { productTotal, serviceTotal }
    const invoiceTotals = new Map<string, { productTotal: number; serviceTotal: number }>()
    for (const item of invoiceItems || []) {
      const invId = String((item as any).invoice_id)
      const lineTotal = Number((item as any).line_total || 0)
      if (lineTotal <= 0) continue // Skip zero or negative amounts
      
      // Handle products that might be null or deleted
      const products = (item as any).products
      const prodItemType = products?.item_type || 'product'

      const existing = invoiceTotals.get(invId) || { productTotal: 0, serviceTotal: 0 }
      if (prodItemType === 'service') {
        existing.serviceTotal += lineTotal
      } else {
        existing.productTotal += lineTotal
      }
      invoiceTotals.set(invId, existing)
    }

    // Get customer names if needed (fallback if JOIN didn't work)
    const customerIds = Array.from(new Set(invoices.map((inv: any) => String(inv.customer_id || "")).filter(Boolean)))
    const { data: customersData } = await supabase
      .from("customers")
      .select("id, name")
      .in("id", customerIds.length > 0 ? customerIds : ["00000000-0000-0000-0000-000000000000"])
      .eq("company_id", companyId)
      .match(branchFilter)
    
    const customerMap = new Map<string, string>()
    for (const cust of customersData || []) {
      customerMap.set(String(cust.id), String(cust.name || "Unknown"))
    }

    // Group by customer with item type filtering
    // Use total_amount as fallback if invoice_items sum doesn't match or is missing
    const grouped: Record<string, { customerId: string; total: number; count: number; productSales: number; serviceSales: number }> = {}
    for (const inv of invoices) {
      const invCustomerId = String((inv as any).customer_id || "")
      // Try to get name from JOIN first, then from customerMap
      const customerNameFromJoin = ((inv as any).customers || {})?.name
      const name = customerNameFromJoin || customerMap.get(invCustomerId) || "Unknown"
      const customerId = invCustomerId
      const invId = String((inv as any).id)
      const invTotalAmount = Number((inv as any).total_amount || 0)
      const totals = invoiceTotals.get(invId) || { productTotal: 0, serviceTotal: 0 }
      
      // Calculate sum of items
      const itemsSum = totals.productTotal + totals.serviceTotal
      
      // If items sum is zero or significantly different from total_amount, use total_amount as fallback
      // This handles cases where invoice_items might be missing or incomplete
      if (itemsSum === 0 && invTotalAmount > 0) {
        // No items found but invoice has amount - treat as product sales
        totals.productTotal = invTotalAmount
        totals.serviceTotal = 0
      } else if (itemsSum > 0 && Math.abs(itemsSum - invTotalAmount) > 0.01 && invTotalAmount > itemsSum) {
        // Items found but sum is less than total_amount - add difference to productTotal
        // This handles cases where some items might be missing from invoice_items
        const difference = invTotalAmount - itemsSum
        totals.productTotal += difference
      }

      // Apply item type filter
      let relevantTotal = 0
      if (itemType === 'product') {
        relevantTotal = totals.productTotal
      } else if (itemType === 'service') {
        relevantTotal = totals.serviceTotal
      } else {
        relevantTotal = totals.productTotal + totals.serviceTotal
      }

      // Skip if no relevant sales (but log for debugging)
      if (relevantTotal === 0) {
        continue
      }

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
    
    return NextResponse.json({
      success: true,
      data: result
    })
  } catch (e: any) {
    return serverError(`حدث خطأ أثناء جلب تقرير المبيعات: ${e?.message}`)
  }
}