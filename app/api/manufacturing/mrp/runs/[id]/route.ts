import { NextRequest, NextResponse } from "next/server"
import {
  getManufacturingApiContext,
  handleManufacturingApiError,
  assertMrpRunAccessible,
} from "@/lib/manufacturing/mrp-run-api"

// GET /api/manufacturing/mrp/runs/[id]
// Returns: run header + counts summary
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { supabase, companyId } = await getManufacturingApiContext(request, "read")
    const run = await assertMrpRunAccessible(supabase, companyId, params.id)

    return NextResponse.json({
      success: true,
      data: {
        ...run,
        summary: {
          demand_row_count: run.demand_row_count ?? 0,
          supply_row_count: run.supply_row_count ?? 0,
          net_row_count: run.net_row_count ?? 0,
          suggestion_count: run.suggestion_count ?? 0,
        },
      },
    })
  } catch (error) {
    return handleManufacturingApiError(error)
  }
}
