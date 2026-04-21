import { NextRequest, NextResponse } from "next/server"
import { asyncAuditLog } from "@/lib/core"
import {
  assertBomVersionAccessible,
  getManufacturingApiContext,
  handleManufacturingApiError,
  loadBomVersionSnapshot,
  parseJsonBody,
  updateBomVersionSchema,
} from "@/lib/manufacturing/bom-api"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { supabase, companyId } = await getManufacturingApiContext(request, "read")
    const snapshot = await loadBomVersionSnapshot(supabase, companyId, id)

    return NextResponse.json({
      success: true,
      data: snapshot,
    })
  } catch (error) {
    return handleManufacturingApiError(error)
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { supabase, companyId, user } = await getManufacturingApiContext(request, "update")
    const payload = await parseJsonBody(request, updateBomVersionSchema)
    const existing = await assertBomVersionAccessible(supabase, companyId, id)

    const { data, error } = await supabase
      .from("manufacturing_bom_versions")
      .update({
        ...payload,
        updated_by: user.id,
      })
      .eq("id", id)
      .eq("company_id", companyId)
      .select("*")
      .single()

    if (error) throw error

    asyncAuditLog({
      companyId,
      userId: user.id,
      userEmail: user.email || undefined,
      action: "UPDATE",
      table: "manufacturing_bom_versions",
      recordId: data.id,
      recordIdentifier: `bom-version-${data.version_no}`,
      oldData: {
        effective_from: existing.effective_from,
        effective_to: existing.effective_to,
        base_output_qty: existing.base_output_qty,
        change_summary: existing.change_summary,
        notes: existing.notes,
      },
      newData: payload,
      reason: "Updated manufacturing BOM version header",
    })

    return NextResponse.json({ success: true, data })
  } catch (error) {
    return handleManufacturingApiError(error)
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { supabase, companyId, user } = await getManufacturingApiContext(request, "delete")
    const existing = await assertBomVersionAccessible(supabase, companyId, id)

    const { data, error } = await supabase
      .from("manufacturing_bom_versions")
      .delete()
      .eq("id", id)
      .eq("company_id", companyId)
      .select("*")
      .single()

    if (error) throw error

    asyncAuditLog({
      companyId,
      userId: user.id,
      userEmail: user.email || undefined,
      action: "DELETE",
      table: "manufacturing_bom_versions",
      recordId: existing.id,
      recordIdentifier: `bom-version-${existing.version_no}`,
      oldData: existing,
      reason: "Deleted manufacturing BOM version",
    })

    return NextResponse.json({ success: true, data })
  } catch (error) {
    return handleManufacturingApiError(error)
  }
}
