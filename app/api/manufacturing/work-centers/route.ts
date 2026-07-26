import { NextRequest, NextResponse } from "next/server"
import {
  getManufacturingApiContext,
  handleManufacturingApiError,
  jsonError,
  resolveScopedBranchId,
} from "@/lib/manufacturing/routing-api"

const WORK_CENTER_TYPES = ["machine", "production_line", "labor_group"] as const
const WORK_CENTER_STATUSES = ["active", "inactive", "blocked"] as const
const COST_RATE_UOMS = ["per_hour", "per_minute", "per_unit"] as const

// Standard SELECT projection — includes cost rates added in v3.7.0
const WORK_CENTER_SELECT = [
  "id, code, name, work_center_type, status, branch_id, description",
  "capacity_uom, nominal_capacity_per_hour, available_hours_per_day, efficiency_percent",
  "labor_cost_rate, machine_cost_rate, variable_overhead_rate, fixed_overhead_rate",
  "cost_rate_uom, cost_rates_effective_from, cost_center_id",
].join(", ")

/**
 * GET /api/manufacturing/work-centers
 * Fetch all work centers for the active company
 */
export async function GET(request: NextRequest) {
  try {
    const { supabase, companyId, member } = await getManufacturingApiContext(request, "read")

    let query = supabase
      .from("manufacturing_work_centers")
      .select(WORK_CENTER_SELECT)
      .eq("company_id", companyId)
      .order("code")

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

/**
 * POST /api/manufacturing/work-centers
 * Create a new work center
 */
export async function POST(request: NextRequest) {
  try {
    const { supabase, user, companyId, member } = await getManufacturingApiContext(request, "write")
    const body = await request.json()
    const {
      code, name, branch_id, work_center_type, status, description,
      capacity_uom, nominal_capacity_per_hour, available_hours_per_day, efficiency_percent,
      // v3.7.0: cost rates for 3-element costing (Material + Labor + Overhead)
      labor_cost_rate, machine_cost_rate, variable_overhead_rate, fixed_overhead_rate,
      cost_rate_uom,
      // v3.74.843 — مركز التكلفة: بدونه لا جهة تُحمَّل عليها أجور المركز
      // وأعباؤه، ويرفض حارس القاعدة تفعيله. كان الحقل غائباً عن المسار
      // والشاشة معاً، فكان المنع بلا طريق للامتثال.
      cost_center_id,
    } = body

    if (!code?.trim()) return jsonError(400, "كود مركز العمل مطلوب")
    if (!name?.trim()) return jsonError(400, "اسم مركز العمل مطلوب")

    const finalBranchId = resolveScopedBranchId(member, branch_id || null)
    if (!finalBranchId) return jsonError(400, "يجب تحديد الفرع")

    if (work_center_type && !WORK_CENTER_TYPES.includes(work_center_type)) {
      return jsonError(400, "نوع مركز العمل غير صالح")
    }

    // v3.74.827 — نفس زوج الطاقة كما فى مسار التعديل: يُفحص هنا برسالة عربية
    // بدل تركه يصطدم بحارس القاعدة برسالة إنجليزية خام.
    const capUom = capacity_uom?.trim() || null
    const capPerHour = nominal_capacity_per_hour !== "" && nominal_capacity_per_hour != null
      ? Number(nominal_capacity_per_hour) : null
    if ((capUom === null) !== (capPerHour === null)) {
      return jsonError(400,
        "وحدة القياس والطاقة فى الساعة يجب إدخالهما معاً أو تركهما فارغين معاً — أكمل الناقص أو امسح الاثنين.")
    }
    if (capPerHour !== null && !(capPerHour > 0)) {
      return jsonError(400, "الطاقة فى الساعة يجب أن تكون أكبر من صفر")
    }

    const normalizedCostUom = (cost_rate_uom && COST_RATE_UOMS.includes(cost_rate_uom)) ? cost_rate_uom : "per_hour"
    const hasCostRates = [labor_cost_rate, machine_cost_rate, variable_overhead_rate, fixed_overhead_rate].some(v => v != null && Number(v) > 0)

    const { data, error } = await supabase
      .from("manufacturing_work_centers")
      .insert({
        company_id: companyId,
        branch_id: finalBranchId,
        code: code.trim().toUpperCase(),
        name: name.trim(),
        work_center_type: work_center_type || "machine",
        status: WORK_CENTER_STATUSES.includes(status) ? status : "active",
        description: description?.trim() || null,
        capacity_uom: capUom,
        nominal_capacity_per_hour: capPerHour,
        available_hours_per_day: available_hours_per_day ? Number(available_hours_per_day) : null,
        efficiency_percent: efficiency_percent ? Number(efficiency_percent) : 100,
        labor_cost_rate: labor_cost_rate != null ? Number(labor_cost_rate) : 0,
        machine_cost_rate: machine_cost_rate != null ? Number(machine_cost_rate) : 0,
        variable_overhead_rate: variable_overhead_rate != null ? Number(variable_overhead_rate) : 0,
        fixed_overhead_rate: fixed_overhead_rate != null ? Number(fixed_overhead_rate) : 0,
        cost_rate_uom: normalizedCostUom,
        cost_rates_effective_from: hasCostRates ? new Date().toISOString() : null,
        cost_center_id: cost_center_id || null,
        created_by: user.id,
        updated_by: user.id,
      })
      .select(WORK_CENTER_SELECT)
      .single()

    if (error) throw error

    return NextResponse.json({ success: true, data }, { status: 201 })
  } catch (error: any) {
    return handleManufacturingApiError(error)
  }
}
