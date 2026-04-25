import { NextRequest, NextResponse } from "next/server"
import {
  getManufacturingApiContext,
  handleManufacturingApiError,
  jsonError,
  assertMrpRunAccessible,
  MRP_RESULTS_SECTION_VALUES,
} from "@/lib/manufacturing/mrp-run-api"

type Section = (typeof MRP_RESULTS_SECTION_VALUES)[number]

const SECTION_TABLE: Record<Section, string> = {
  demand: "mrp_demand_rows",
  supply: "mrp_supply_rows",
  net: "mrp_net_rows",
  suggestions: "mrp_suggestions",
}

// GET /api/manufacturing/mrp/runs/[id]/results
// Query params:
//   section = demand | supply | net | suggestions  (default: net)
//   page    = 1-based page number                  (default: 1)
//   per_page = rows per page                       (default: 50, max: 200)
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { supabase, companyId } = await getManufacturingApiContext(request, "read")
    const run = await assertMrpRunAccessible(supabase, companyId, params.id)

    const { searchParams } = new URL(request.url)
    const rawSection = (searchParams.get("section") ?? "net") as Section

    if (!MRP_RESULTS_SECTION_VALUES.includes(rawSection)) {
      return jsonError(400, `section must be one of: ${MRP_RESULTS_SECTION_VALUES.join(", ")}`)
    }

    const page = Math.max(1, Number(searchParams.get("page") || "1"))
    const perPage = Math.min(200, Math.max(1, Number(searchParams.get("per_page") || "50")))
    const offset = (page - 1) * perPage

    const tableName = SECTION_TABLE[rawSection]

    const { data: rows, error, count } = await supabase
      .from(tableName)
      .select("*", { count: "exact" })
      .eq("run_id", run.id)
      .eq("company_id", companyId)
      .range(offset, offset + perPage - 1)

    if (error) throw error

    const summary = {
      demand_row_count: run.demand_row_count ?? 0,
      supply_row_count: run.supply_row_count ?? 0,
      net_row_count: run.net_row_count ?? 0,
      suggestion_count: run.suggestion_count ?? 0,
    }

    return NextResponse.json({
      success: true,
      summary,
      section: rawSection,
      data: rows || [],
      meta: {
        total: count ?? 0,
        page,
        per_page: perPage,
      },
    })
  } catch (error) {
    return handleManufacturingApiError(error)
  }
}
