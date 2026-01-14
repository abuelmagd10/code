/**
 * 🔒 API أوامر البيع (تعديل/حذف) مع الحوكمة الإلزامية
 *
 * PATCH /api/sales-orders/[id] - تحديث أمر بيع مع الحوكمة
 * DELETE /api/sales-orders/[id] - حذف أمر بيع مع الحوكمة
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { enforceGovernance, applyGovernanceFilters } from "@/lib/governance-middleware"

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const governance = await enforceGovernance(request)
    const supabase = await createClient()
    const body = await request.json()

    let findQuery = supabase.from("sales_orders").select("*").eq("id", params.id)
    findQuery = applyGovernanceFilters(findQuery, governance)
    const { data: existing, error: findError } = await findQuery.maybeSingle()

    if (findError) {
      return NextResponse.json(
        { error: findError.message, error_ar: "تعذر جلب أمر البيع" },
        { status: 500 }
      )
    }

    if (!existing) {
      return NextResponse.json(
        { error: "Not found", error_ar: "أمر البيع غير موجود أو لا تملك صلاحية الوصول" },
        { status: 404 }
      )
    }

    const { enforceBranchDefaults, validateBranchDefaults, buildSalesOrderData } =
      await import("@/lib/governance-branch-defaults")

    const enhancedContext = await enforceBranchDefaults(governance, body, supabase)
    const finalData = buildSalesOrderData(body, enhancedContext)
    validateBranchDefaults(finalData, enhancedContext)

    delete finalData.id
    delete finalData.created_at

    const { data: updated, error: updateError } = await supabase
      .from("sales_orders")
      .update(finalData)
      .eq("id", params.id)
      .eq("company_id", enhancedContext.companyId)
      .select()
      .single()

    if (updateError) {
      return NextResponse.json(
        { error: updateError.message, error_ar: "فشل في تحديث أمر البيع" },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data: updated,
      message: "Sales order updated successfully",
      message_ar: "تم تحديث أمر البيع بنجاح",
      governance: {
        enforced: true,
        companyId: enhancedContext.companyId,
        branchId: enhancedContext.branchId,
        warehouseId: enhancedContext.warehouseId,
        costCenterId: enhancedContext.costCenterId,
        role: enhancedContext.role,
        isAdmin: enhancedContext.isAdmin,
      },
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message, error_ar: "حدث خطأ غير متوقع" },
      { status: error.message.includes("Violation") ? 403 : 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const governance = await enforceGovernance(request)
    const supabase = await createClient()

    let findQuery = supabase.from("sales_orders").select("id").eq("id", params.id)
    findQuery = applyGovernanceFilters(findQuery, governance)
    const { data: existing, error: findError } = await findQuery.maybeSingle()

    if (findError) {
      return NextResponse.json(
        { error: findError.message, error_ar: "تعذر جلب أمر البيع" },
        { status: 500 }
      )
    }

    if (!existing) {
      return NextResponse.json(
        { error: "Not found", error_ar: "أمر البيع غير موجود أو لا تملك صلاحية الوصول" },
        { status: 404 }
      )
    }

    const { error: delError } = await supabase
      .from("sales_orders")
      .delete()
      .eq("id", params.id)
      .eq("company_id", governance.companyId)

    if (delError) {
      return NextResponse.json(
        { error: delError.message, error_ar: "فشل في حذف أمر البيع" },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: "Sales order deleted successfully",
      message_ar: "تم حذف أمر البيع بنجاح",
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message, error_ar: "حدث خطأ غير متوقع" },
      { status: error.message.includes("Unauthorized") ? 401 : 403 }
    )
  }
}

