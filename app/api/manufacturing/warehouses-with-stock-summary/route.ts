/**
 * v3.74.269 - Manufacturing: list warehouses in a branch with a
 * one-line summary of raw-material stock in each. Used by the BOM
 * "Issue Warehouse" picker so the owner can tell at a glance which
 * warehouse currently holds raw materials (and which holds finished
 * goods instead). The picker no longer auto-selects on the user's
 * behalf - it just shows them the facts and lets them choose.
 *
 * Returns:
 *   {
 *     data: [
 *       {
 *         id: "<uuid>",
 *         name: "...",
 *         code: "...",
 *         is_main: boolean,
 *         raw_item_count: number,   // distinct raw materials with stock > 0
 *         raw_total_qty: number,    // total units of raw materials
 *       },
 *       ...
 *     ]
 *   }
 *
 * Ordered: warehouses that actually contain raw materials first.
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 })

    const branchId = req.nextUrl.searchParams.get("branch_id")

    // Find caller's company.
    let companyId: string | undefined
    const { data: member } = await supabase
      .from("company_members")
      .select("company_id")
      .eq("user_id", user.id)
      .maybeSingle()
    companyId = member?.company_id
    if (!companyId) {
      const { data: ownedCompany } = await supabase
        .from("companies")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle()
      companyId = ownedCompany?.id
    }
    if (!companyId) {
      return NextResponse.json({ error: "no_company" }, { status: 404 })
    }

    // Load active warehouses for the branch (or all branches if no filter).
    let whQuery = supabase
      .from("warehouses")
      .select("id, name, code, is_main, branch_id")
      .eq("company_id", companyId)
      .eq("is_active", true)
    if (branchId) whQuery = whQuery.eq("branch_id", branchId)
    const { data: warehouses, error: whErr } = await whQuery
    if (whErr) return NextResponse.json({ error: whErr.message }, { status: 500 })

    const warehouseIds = (warehouses || []).map(w => w.id)
    if (warehouseIds.length === 0) {
      return NextResponse.json({ data: [] })
    }

    // Read raw-material balances for these warehouses in one shot.
    // inventory_available_balance is a view keyed on (warehouse_id, product_id)
    // and we filter to product_type = 'raw_material' via a join on products.
    const { data: balances } = await supabase
      .from("inventory_available_balance")
      .select("warehouse_id, product_id, available_quantity, products!inner(product_type)")
      .in("warehouse_id", warehouseIds)
      .eq("products.product_type", "raw_material")
      .gt("available_quantity", 0)

    // Aggregate per warehouse.
    const summary = new Map<string, { count: number; qty: number }>()
    for (const row of balances || []) {
      const wid = (row as any).warehouse_id as string
      const qty = Number((row as any).available_quantity || 0)
      const cur = summary.get(wid) || { count: 0, qty: 0 }
      cur.count += 1
      cur.qty += qty
      summary.set(wid, cur)
    }

    const result = (warehouses || []).map(w => {
      const s = summary.get(w.id) || { count: 0, qty: 0 }
      return {
        id: w.id,
        name: w.name,
        code: w.code,
        is_main: !!w.is_main,
        branch_id: w.branch_id,
        raw_item_count: s.count,
        raw_total_qty: s.qty,
      }
    })

    // Sort: warehouses holding raw materials first, then by name.
    result.sort((a, b) => {
      if (b.raw_item_count !== a.raw_item_count) return b.raw_item_count - a.raw_item_count
      if (b.raw_total_qty !== a.raw_total_qty) return b.raw_total_qty - a.raw_total_qty
      return String(a.name || "").localeCompare(String(b.name || ""))
    })

    return NextResponse.json({ data: result })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "error" }, { status: 500 })
  }
}
