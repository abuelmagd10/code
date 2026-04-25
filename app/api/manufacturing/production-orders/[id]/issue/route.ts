import { NextRequest, NextResponse } from "next/server"
import { asyncAuditLog } from "@/lib/core"
import {
  assertProductionOrderAccessible,
  assertProductionOrderExecutionOpen,
  getManufacturingApiContext,
  handleManufacturingApiError,
  issueProductionOrderMaterialsSchema,
  loadProductionOrderInventoryExecutionSnapshot,
  parseJsonBody,
} from "@/lib/manufacturing/inventory-execution-api"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { supabase, admin, companyId, user } = await getManufacturingApiContext(request, "update")
    const payload = await parseJsonBody(request, issueProductionOrderMaterialsSchema)
    const existing = await assertProductionOrderAccessible(supabase, companyId, id)

    assertProductionOrderExecutionOpen(existing)

    const { data, error } = await admin.rpc("issue_manufacturing_production_order_materials_atomic", {
      p_company_id: companyId,
      p_production_order_id: id,
      p_posted_by: user.id,
      p_lines: payload.lines,
      p_posted_at: payload.posted_at ?? null,
      p_notes: payload.notes ?? null,
      p_command_key: payload.command_key ?? null,
    })

    if (error) throw error

    const snapshot = await loadProductionOrderInventoryExecutionSnapshot(supabase, companyId, id)

    asyncAuditLog({
      companyId,
      userId: user.id,
      userEmail: user.email || undefined,
      action: "CREATE",
      table: "production_order_issue_events",
      recordId: data?.issue_event_id || id,
      recordIdentifier: existing.order_no,
      newData: {
        line_count: payload.lines.length,
        total_issued_qty: data?.total_issued_qty ?? null,
        total_issued_cost: data?.total_issued_cost ?? null,
        auto_started_order: data?.auto_started_order ?? false,
        command_key: payload.command_key ?? null,
      },
      reason: "Posted production material issue via atomic RPC",
    })

    return NextResponse.json({
      success: true,
      data: snapshot,
      meta: {
        command_result: data,
      },
    })
  } catch (error) {
    return handleManufacturingApiError(error)
  }
}
