import { NextRequest, NextResponse } from "next/server"
import {
  getManufacturingApiContext,
  handleManufacturingApiError,
  jsonError,
} from "@/lib/manufacturing/routing-api"

type RouteContext = { params: Promise<{ id: string }> }

const WORK_CENTER_TYPES = ["machine", "production_line", "labor_group"] as const
const WORK_CENTER_STATUSES = ["active", "inactive", "blocked"] as const
const COST_RATE_UOMS = ["per_hour", "per_minute", "per_unit"] as const

// Standard SELECT projection — includes cost rates added in v3.7.0
const WORK_CENTER_SELECT = [
  "id, code, name, work_center_type, status, branch_id, description",
  "capacity_uom, nominal_capacity_per_hour, available_hours_per_day, efficiency_percent",
  "labor_cost_rate, machine_cost_rate, variable_overhead_rate, fixed_overhead_rate",
  "cost_rate_uom, cost_rates_effective_from, cost_center_id",
  // v3.74.845 — أساس تحميل الأعباء وطبيعة العمالة
  "overhead_absorption_base, labour_staffing_model",
].join(", ")

const OVERHEAD_BASES = ["machine_hours", "labour_hours"] as const
const STAFFING_MODELS = ["casual", "salaried", "mixed"] as const

/**
 * PATCH /api/manufacturing/work-centers/[id]
 * Update a work center
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params
    const { supabase, user, companyId } = await getManufacturingApiContext(request, "update")
    const body = await request.json()
    const {
      code, name, work_center_type, status, description,
      capacity_uom, nominal_capacity_per_hour, available_hours_per_day, efficiency_percent,
      // v3.7.0: cost rates
      labor_cost_rate, machine_cost_rate, variable_overhead_rate, fixed_overhead_rate,
      cost_rate_uom,
      // v3.74.843 — مركز التكلفة، وبدونه يرفض حارس القاعدة تفعيل المركز
      cost_center_id,
      // v3.74.845 — على أى ساعات تُحمَّل الأعباء، وطبيعة العمالة بالمركز
      overhead_absorption_base, labour_staffing_model,
    } = body

    if (!code?.trim()) return jsonError(400, "كود مركز العمل مطلوب")
    if (!name?.trim()) return jsonError(400, "اسم مركز العمل مطلوب")

    if (work_center_type && !WORK_CENTER_TYPES.includes(work_center_type)) {
      return jsonError(400, "نوع مركز العمل غير صالح")
    }

    // v3.74.827 — وحدة القياس والطاقة/ساعة **زوج**: حارس القاعدة يرفض أن
    // يُملأ أحدهما دون الآخر، لكن المسار كان يُطبّع كلاً منهما على حدة فيمر
    // النصف ويصطدم بالحارس — فيرى المستخدم رسالة إنجليزية خام من قاعدة
    // البيانات لا يفهمها ولا تدله على الحقل. يُفحص الزوج هنا برسالة عربية
    // تسمّى الحقلين، بدل إسقاط ما كتبه المستخدم صامتين.
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

    // Verify ownership AND check whether cost rates are changing (for cost_rates_effective_from)
    const { data: existing } = await supabase
      .from("manufacturing_work_centers")
      .select("id, labor_cost_rate, machine_cost_rate, variable_overhead_rate, fixed_overhead_rate")
      .eq("id", id)
      .eq("company_id", companyId)
      .single()

    if (!existing) return jsonError(404, "مركز العمل غير موجود")

    const normalizedCostUom = (cost_rate_uom && COST_RATE_UOMS.includes(cost_rate_uom)) ? cost_rate_uom : "per_hour"
    const newLabor = labor_cost_rate != null ? Number(labor_cost_rate) : Number(existing.labor_cost_rate || 0)
    const newMachine = machine_cost_rate != null ? Number(machine_cost_rate) : Number(existing.machine_cost_rate || 0)
    const newVarOh = variable_overhead_rate != null ? Number(variable_overhead_rate) : Number(existing.variable_overhead_rate || 0)
    const newFixOh = fixed_overhead_rate != null ? Number(fixed_overhead_rate) : Number(existing.fixed_overhead_rate || 0)

    // Track when rates change (for future cost-rate history report)
    const costRatesChanged =
      newLabor !== Number(existing.labor_cost_rate || 0) ||
      newMachine !== Number(existing.machine_cost_rate || 0) ||
      newVarOh !== Number(existing.variable_overhead_rate || 0) ||
      newFixOh !== Number(existing.fixed_overhead_rate || 0)

    const updateData: any = {
      code: code.trim().toUpperCase(),
      name: name.trim(),
      work_center_type: work_center_type || "machine",
      status: WORK_CENTER_STATUSES.includes(status) ? status : "active",
      description: description?.trim() || null,
      capacity_uom: capUom,
      nominal_capacity_per_hour: capPerHour,
      available_hours_per_day: available_hours_per_day ? Number(available_hours_per_day) : null,
      efficiency_percent: efficiency_percent ? Number(efficiency_percent) : 100,
      labor_cost_rate: newLabor,
      machine_cost_rate: newMachine,
      variable_overhead_rate: newVarOh,
      fixed_overhead_rate: newFixOh,
      cost_rate_uom: normalizedCostUom,
      cost_center_id: cost_center_id || null,
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    }
    // v3.74.845 — تُكتب فقط إذا أرسلتها الشاشة، فلا يُصفَّر إعداد قائم
    // من مسار قديم لا يعرف الحقلين.
    if (OVERHEAD_BASES.includes(overhead_absorption_base)) {
      updateData.overhead_absorption_base = overhead_absorption_base
    }
    if (STAFFING_MODELS.includes(labour_staffing_model)) {
      updateData.labour_staffing_model = labour_staffing_model
    }
    if (costRatesChanged) {
      updateData.cost_rates_effective_from = new Date().toISOString()
    }

    const { data, error } = await supabase
      .from("manufacturing_work_centers")
      .update(updateData)
      .eq("id", id)
      .eq("company_id", companyId)
      .select(WORK_CENTER_SELECT)
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
