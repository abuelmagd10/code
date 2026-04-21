import { NextRequest, NextResponse } from "next/server"
import { asyncAuditLog } from "@/lib/core"
import {
  assertBomAccessible,
  createBomVersionSchema,
  getManufacturingApiContext,
  handleManufacturingApiError,
  parseOptionalJsonBody,
} from "@/lib/manufacturing/bom-api"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { supabase, admin, companyId, user } = await getManufacturingApiContext(request, "write")
    const payload = await parseOptionalJsonBody(request, createBomVersionSchema)
    const bom = await assertBomAccessible(supabase, companyId, id)

    const { data, error } = await admin.rpc("create_manufacturing_bom_version_atomic", {
      p_company_id: companyId,
      p_bom_id: id,
      p_created_by: user.id,
      p_clone_from_version_id: payload.clone_from_version_id ?? null,
      p_effective_from: payload.effective_from ?? null,
      p_effective_to: payload.effective_to ?? null,
      p_base_output_qty: payload.base_output_qty,
      p_change_summary: payload.change_summary ?? null,
      p_notes: payload.notes ?? null,
    })

    if (error) throw error

    asyncAuditLog({
      companyId,
      userId: user.id,
      userEmail: user.email || undefined,
      action: "CREATE",
      table: "manufacturing_bom_versions",
      recordId: data?.bom_version_id || id,
      recordIdentifier: `${bom.bom_code}-v${data?.version_no || "?"}`,
      newData: {
        bom_id: id,
        version_no: data?.version_no,
        cloned: data?.cloned || false,
      },
      reason: "Created manufacturing BOM version via atomic RPC",
    })

    return NextResponse.json({ success: true, data }, { status: 201 })
  } catch (error) {
    return handleManufacturingApiError(error)
  }
}
