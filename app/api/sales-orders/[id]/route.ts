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
  console.log("🚀 [DELETE /api/sales-orders/[id]] Handler called for order:", params.id)

  try {
    console.log("🔐 [DELETE] Enforcing governance...")
    const governance = await enforceGovernance(request)
    console.log("✅ [DELETE] Governance enforced:", { companyId: governance.companyId, role: governance.role })

    const supabase = await createClient()
    console.log("✅ [DELETE] Supabase client created")

    console.log("🗑️ [DELETE /api/sales-orders/[id]] Starting deletion for order:", params.id)

    // 1️⃣ التحقق من وجود أمر البيع
    let findQuery = supabase.from("sales_orders").select("id, invoice_id").eq("id", params.id)
    findQuery = applyGovernanceFilters(findQuery, governance)
    const { data: existing, error: findError } = await findQuery.maybeSingle()

    if (findError) {
      console.error("❌ [DELETE] Error finding sales order:", findError)
      return NextResponse.json(
        { error: findError.message, error_ar: "تعذر جلب أمر البيع" },
        { status: 500 }
      )
    }

    if (!existing) {
      console.warn("⚠️ [DELETE] Sales order not found or no access:", params.id)
      return NextResponse.json(
        { error: "Not found", error_ar: "أمر البيع غير موجود أو لا تملك صلاحية الوصول" },
        { status: 404 }
      )
    }

    // 2️⃣ التحقق من عدم وجود فاتورة مرتبطة
    if (existing.invoice_id) {
      console.warn("⚠️ [DELETE] Cannot delete - sales order has linked invoice:", existing.invoice_id)
      return NextResponse.json(
        {
          error: "Cannot delete sales order with linked invoice",
          error_ar: "لا يمكن حذف أمر البيع المرتبط بفاتورة. احذف الفاتورة أولاً"
        },
        { status: 400 }
      )
    }

    console.log("✅ [DELETE] Sales order found and can be deleted")

    // 3️⃣ حذف بنود أمر البيع أولاً (Foreign Key Constraint)
    console.log("🗑️ [DELETE] Deleting sales order items...")
    const { data: deletedItems, error: itemsError, count: itemsCount } = await supabase
      .from("sales_order_items")
      .delete({ count: 'exact' })
      .eq("sales_order_id", params.id)

    if (itemsError) {
      console.error("❌ [DELETE] Error deleting sales order items:", {
        message: itemsError.message,
        details: itemsError.details,
        hint: itemsError.hint,
        code: itemsError.code
      })
      return NextResponse.json(
        {
          error: itemsError.message,
          error_ar: `فشل في حذف بنود أمر البيع: ${itemsError.message}`,
          details: itemsError.details,
          hint: itemsError.hint
        },
        { status: 500 }
      )
    }

    console.log(`✅ [DELETE] Sales order items deleted successfully. Count: ${itemsCount}`)

    // 4️⃣ حذف أمر البيع
    console.log("🗑️ [DELETE] Deleting sales order...")
    const { data: deletedOrder, error: delError, count: orderCount } = await supabase
      .from("sales_orders")
      .delete({ count: 'exact' })
      .eq("id", params.id)
      .eq("company_id", governance.companyId)

    if (delError) {
      console.error("❌ [DELETE] Error deleting sales order:", {
        message: delError.message,
        details: delError.details,
        hint: delError.hint,
        code: delError.code
      })
      return NextResponse.json(
        {
          error: delError.message,
          error_ar: `فشل في حذف أمر البيع: ${delError.message}`,
          details: delError.details,
          hint: delError.hint
        },
        { status: 500 }
      )
    }

    if (orderCount === 0) {
      console.warn("⚠️ [DELETE] No sales order was deleted. Possible RLS restriction.")
      return NextResponse.json(
        {
          error: "Sales order not deleted",
          error_ar: "لم يتم حذف أمر البيع. قد تكون هناك قيود على الصلاحيات"
        },
        { status: 403 }
      )
    }

    console.log("✅ [DELETE] Sales order deleted successfully:", params.id)

    return NextResponse.json({
      success: true,
      message: "Sales order deleted successfully",
      message_ar: "تم حذف أمر البيع بنجاح",
    })
  } catch (error: any) {
    console.error("❌ [DELETE] Unexpected error:", error)
    return NextResponse.json(
      { error: error.message, error_ar: "حدث خطأ غير متوقع" },
      { status: error.message.includes("Violation") ? 403 : 500 }
    )
  }
}

