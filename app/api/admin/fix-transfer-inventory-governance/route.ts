import { NextRequest, NextResponse } from "next/server"
import { createClient as createServerClient } from "@/lib/supabase/server"
import { requireOwnerOrAdmin } from "@/lib/api-security"
import { createClient } from "@supabase/supabase-js"

export async function POST(req: NextRequest) {
  await createServerClient()
  const { companyId, error } = await requireOwnerOrAdmin(req)
  if (error) return error
  if (!companyId) {
    return NextResponse.json({ success: false, error: "معرف الشركة مطلوب" }, { status: 400 })
  }

  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ""
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
  if (!url || !serviceKey) {
    return NextResponse.json({ success: false, error: "Server configuration error" }, { status: 500 })
  }

  const admin = createClient(url, serviceKey, { global: { headers: { apikey: serviceKey } } })

  try {
    const { data: branches } = await admin
      .from("branches")
      .select("id, default_cost_center_id")
      .eq("company_id", companyId)

    const costCenterByBranch = new Map<string, string>()
    for (const b of branches || []) {
      if (b?.id && b?.default_cost_center_id) costCenterByBranch.set(String(b.id), String(b.default_cost_center_id))
    }

    const { data: txRows, error: txErr } = await admin
      .from("inventory_transactions")
      .select("id, branch_id, warehouse_id, transaction_type")
      .eq("company_id", companyId)
      .is("cost_center_id", null)
      .in("transaction_type", ["transfer_out", "transfer_in", "transfer_cancelled"])
      .limit(10000)

    if (txErr) throw txErr

    const warehouseIds = Array.from(new Set((txRows || []).map((t: any) => String(t.warehouse_id || "")).filter(Boolean)))
    const { data: warehouses } = await admin
      .from("warehouses")
      .select("id, branch_id")
      .eq("company_id", companyId)
      .in("id", warehouseIds.length ? warehouseIds : ["00000000-0000-0000-0000-000000000000"])

    const branchByWarehouse = new Map<string, string>()
    for (const w of warehouses || []) {
      if (w?.id && w?.branch_id) branchByWarehouse.set(String(w.id), String(w.branch_id))
    }

    let updated = 0
    let skipped = 0

    const updates = (txRows || []).map(async (t: any) => {
      const txId = String(t.id)
      const whId = String(t.warehouse_id || "")
      if (!txId || !whId) {
        skipped++
        return
      }

      const branchId = String(t.branch_id || branchByWarehouse.get(whId) || "")
      const costCenterId = costCenterByBranch.get(branchId || "") || ""
      if (!branchId || !costCenterId) {
        skipped++
        return
      }

      const { error: updErr } = await admin
        .from("inventory_transactions")
        .update({ branch_id: branchId, cost_center_id: costCenterId })
        .eq("id", txId)
        .eq("company_id", companyId)
        .is("cost_center_id", null)

      if (updErr) {
        skipped++
        return
      }
      updated++
    })

    for (let i = 0; i < updates.length; i += 50) {
      await Promise.all(updates.slice(i, i + 50))
    }

    return NextResponse.json({
      success: true,
      data: {
        scanned: (txRows || []).length,
        updated,
        skipped,
      }
    })
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message || "Unknown error" },
      { status: 500 }
    )
  }
}
