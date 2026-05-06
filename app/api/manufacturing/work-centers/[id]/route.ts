import { NextRequest, NextResponse } from "next/server"
import {
  getManufacturingApiContext,
  handleManufacturingApiError,
  jsonError,
} from "@/lib/manufacturing/routing-api"

type RouteContext = { params: Promise<{ id: string }> }

const WORK_CENTER_TYPES = ["machine", "production_line", "labor_group"] as const
const WORK_CENTER_STATUSES = ["active", "inactive", "blocked"] as const

/**
 * PATCH /api/manufacturing/work-centers/[id]
 * Update a work center
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params
    const { supabase, user, companyId } = await getManufacturingApiContext(request, "update")
    const body = await request.json()
    const { code, name, work_center_type, status, description, capacity_uom, nominal_capacity_per_hour, available_hours_per_day, efficiency_percent } = body

    if (!code?.trim()) return jsonError(400, "كود مركز العمل مطلوب")
    if (!name?.trim()) return jsonError(400, "اسم مركز العمل مطلوب")

    if (work_center_type && !WORK_CENTER_TYPES.includes(work_center_type)) {
      return jsonError(400, "نوع مركز العمل غير صالح")
    }

    // Verify ownership
    const { data: existing } = await supabase
      .from("manufacturing_work_centers")
      .select("id")
      .eq("id", id)
      .eq("company_id", companyId)
      .single()

    if (!existing) return jsonError(404, "مركز العمل غير موجود")

    const { data, error } = await supabase
      .from("manufacturing_work_centers")
      .update({
        code: code.trim().toUpperCase(),
        name: name.trim(),
        work_center_type: work_center_type || "machine",
        status: WORK_CENTER_STATUSES.includes(status) ? status : "active",
        description: description?.trim() || null,
        capacity_uom: capacity_uom?.trim() || null,
        nominal_capacity_per_hour: nominal_capacity_per_hour ? Number(nominal_capacity_per_hour) : null,
        available_hours_per_day: available_hours_per_day ? Number(available_hours_per_day) : null,
        efficiency_percent: efficiency_percent ? Number(efficiency_percent) : 100,
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("company_id", companyId)
      .select("id, code, name, work_center_type, status, branch_id, description, capacity_uom, nominal_capacity_per_hour, available_hours_per_day, efficiency_percent")
      .single()

    if (error) throw error

    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    return handleManufacturingApiError(error)
  }
}

/**
 * DELETE /api/manufacturing/work-centers/[id]
 * Delete a work center
 */
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params
    const { supabase, companyId } = await getManufacturingApiContext(request, "delete")

    const { error } = await supabase
      .from("manufacturing_work_centers")
      .delete()
      .eq("id", id)
      .eq("company_id", companyId)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error: any) {
    return handleManufacturingApiError(error)
  }
}
