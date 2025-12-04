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
    const endDate = String(searchParams.get("endDate") || new Date().toISOString().slice(0,10))

    const { data: member } = await admin.from("company_members").select("company_id").eq("user_id", user.id).limit(1)
    const companyId = Array.isArray(member) && member[0]?.company_id ? String(member[0].company_id) : ""
    if (!companyId) return NextResponse.json([], { status: 200 })

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
    return NextResponse.json(result, { status: 200 })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "unknown_error" }, { status: 500 })
  }
}