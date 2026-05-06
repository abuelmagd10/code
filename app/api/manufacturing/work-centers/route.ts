import { NextRequest, NextResponse } from "next/server"
import { getManufacturingApiContext, handleManufacturingApiError } from "@/lib/manufacturing/routing-api"

/**
 * GET /api/manufacturing/work-centers
 * Fetch all work centers for the active company (scoped to branch for normal roles)
 */
export async function GET(request: NextRequest) {
  try {
    const { supabase, companyId, member } = await getManufacturingApiContext(request, "read")

    let query = supabase
      .from("manufacturing_work_centers")
      .select("id, code, name, work_center_type, status, capacity_uom, nominal_capacity_per_hour")
      .eq("company_id", companyId)
      .order("code")

    // Normal roles only see their branch's work centers
    if (member.isNormalRole && member.branchId) {
      query = query.eq("branch_id", member.branchId)
    }

    const { data, error } = await query
    if (error) throw error

    return NextResponse.json({ success: true, data: data || [] })
  } catch (error: any) {
    return handleManufacturingApiError(error)
  }
}
