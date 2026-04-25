import { NextRequest, NextResponse } from "next/server"
import { asyncAuditLog } from "@/lib/core"
import {
  assertBomAccessible,
  getManufacturingApiContext,
  handleManufacturingApiError,
  parseJsonBody,
  updateBomSchema,
} from "@/lib/manufacturing/bom-api"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { supabase, companyId } = await getManufacturingApiContext(request, "read")
    const bom = await assertBomAccessible(supabase, companyId, id)

    const [{ data: versions, error: versionsError }, { data: product, error: productError }] = await Promise.all([
      supabase
        .from("manufacturing_bom_versions")
        .select("id, bom_id, version_no, status, is_default, effective_from, effective_to, base_output_qty, change_summary, notes, approval_request_id, submitted_at, approved_at, rejected_at, updated_at")
        .eq("bom_id", id)
        .eq("company_id", companyId)
        .order("version_no", { ascending: false }),
      supabase
        .from("products")
        .select("*")
        .eq("id", bom.product_id)
        .maybeSingle(),
    ])

    if (versionsError) throw versionsError
    if (productError) throw productError

    return NextResponse.json({
      success: true,
      data: {
        ...bom,
        product: product || null,
        versions: versions || [],
      },
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
    const payload = await parseJsonBody(request, updateBomSchema)
    const existing = await assertBomAccessible(supabase, companyId, id)

    const { data, error } = await supabase
      .from("manufacturing_boms")
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
      table: "manufacturing_boms",
      recordId: data.id,
      recordIdentifier: data.bom_code,
      oldData: {
        bom_code: existing.bom_code,
        bom_name: existing.bom_name,
        description: existing.description,
        is_active: existing.is_active,
      },
      newData: payload,
      reason: "Updated manufacturing BOM header",
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
    const existing = await assertBomAccessible(supabase, companyId, id)

    const { data, error } = await supabase
      .from("manufacturing_boms")
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
      table: "manufacturing_boms",
      recordId: existing.id,
      recordIdentifier: existing.bom_code,
      oldData: existing,
      reason: "Deleted manufacturing BOM header",
    })

    return NextResponse.json({ success: true, data })
  } catch (error) {
    return handleManufacturingApiError(error)
  }
}
