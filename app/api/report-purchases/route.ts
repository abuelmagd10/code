import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { createClient as createSSR } from "@/lib/supabase/server"

export async function GET(req: NextRequest) {
  try {
    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ""
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
    if (!url || !serviceKey) return NextResponse.json({ error: "server_not_configured" }, { status: 500 })
    const admin = createClient(url, serviceKey, { global: { headers: { apikey: serviceKey } } })
    const ssr = await createSSR()
    const { data: { user } } = await ssr.auth.getUser()
    if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    const { searchParams } = new URL(req.url)
    const from = String(searchParams.get("from") || "0001-01-01")
    const to = String(searchParams.get("to") || "9999-12-31")
    const itemType = String(searchParams.get("item_type") || "all") // 'all', 'product', 'service'
    const { data: member } = await admin.from("company_members").select("company_id").eq("user_id", user.id).limit(1)
    const companyId = Array.isArray(member) && member[0]?.company_id ? String(member[0].company_id) : ""
    if (!companyId) return NextResponse.json([], { status: 200 })

    // Get bills with items and product info for item_type filtering
    const { data: bills } = await admin
      .from("bills")
      .select("id, total_amount, bill_date, status, supplier_id, suppliers(name)")
      .eq("company_id", companyId)
      .in("status", ["received", "partially_paid", "paid"])
      .gte("bill_date", from)
      .lte("bill_date", to)

    if (!bills || bills.length === 0) {
      return NextResponse.json([], { status: 200 })
    }

    const billIds = bills.map((b: any) => b.id)

    // Get bill items with product info
    const { data: billItems } = await admin
      .from("bill_items")
      .select("bill_id, line_total, product_id, products(item_type)")
      .in("bill_id", billIds)

    // Build a map of bill_id -> { productTotal, serviceTotal }
    const billTotals = new Map<string, { productTotal: number; serviceTotal: number }>()
    for (const item of billItems || []) {
      const billId = String((item as any).bill_id)
      const lineTotal = Number((item as any).line_total || 0)
      const prodItemType = (item as any).products?.item_type || 'product'

      const existing = billTotals.get(billId) || { productTotal: 0, serviceTotal: 0 }
      if (prodItemType === 'service') {
        existing.serviceTotal += lineTotal
      } else {
        existing.productTotal += lineTotal
      }
      billTotals.set(billId, existing)
    }

    // Group by supplier with item type filtering
    const grouped: Record<string, { total: number; count: number; productPurchases: number; servicePurchases: number }> = {}
    for (const bill of bills) {
      const name = String(((bill as any).suppliers || {}).name || "Unknown")
      const billId = String((bill as any).id)
      const totals = billTotals.get(billId) || { productTotal: 0, serviceTotal: 0 }

      // Apply item type filter
      let relevantTotal = 0
      if (itemType === 'product') {
        relevantTotal = totals.productTotal
      } else if (itemType === 'service') {
        relevantTotal = totals.serviceTotal
      } else {
        relevantTotal = totals.productTotal + totals.serviceTotal
      }

      // Skip if no relevant purchases
      if (relevantTotal === 0) continue

      const prev = grouped[name] || { total: 0, count: 0, productPurchases: 0, servicePurchases: 0 }
      grouped[name] = {
        total: prev.total + relevantTotal,
        count: prev.count + 1,
        productPurchases: prev.productPurchases + totals.productTotal,
        servicePurchases: prev.servicePurchases + totals.serviceTotal
      }
    }

    const result = Object.entries(grouped).map(([supplier_name, v]) => ({
      supplier_name,
      total_purchases: v.total,
      bill_count: v.count,
      product_purchases: v.productPurchases,
      service_purchases: v.servicePurchases
    }))
    return NextResponse.json(result, { status: 200 })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "unknown_error" }, { status: 500 })
  }
}