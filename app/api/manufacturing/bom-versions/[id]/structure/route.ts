import { NextRequest, NextResponse } from "next/server"
import { asyncAuditLog } from "@/lib/core"
import {
  assertBomVersionAccessible,
  getManufacturingApiContext,
  handleManufacturingApiError,
  parseJsonBody,
  updateBomStructureSchema,
} from "@/lib/manufacturing/bom-api"

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { supabase, admin, companyId, user } = await getManufacturingApiContext(request, "update")
    const payload = await parseJsonBody(request, updateBomStructureSchema)
    const version = await assertBomVersionAccessible(supabase, companyId, id)

    const { data, error } = await admin.rpc("update_manufacturing_bom_structure_atomic", {
      p_company_id: companyId,
      p_bom_version_id: id,
      p_updated_by: user.id,
      p_lines: payload.lines,
    })

    if (error) throw error

    asyncAuditLog({
      companyId,
      userId: user.id,
      userEmail: user.email || undefined,
      action: "UPDATE",
      table: "manufacturing_bom_versions",
      recordId: id,
      recordIdentifier: `bom-version-${version.version_no}`,
      newData: {
        line_count: data?.line_count ?? payload.lines.length,
        substitute_count: data?.substitute_count ?? payload.lines.reduce((sum, line) => sum + (line.substitutes?.length || 0), 0),
      },
      reason: "Updated manufacturing BOM structure via atomic RPC",
    })

    return NextResponse.json({ success: true, data })
  } catch (error) {
    return handleManufacturingApiError(error)
  }
}
