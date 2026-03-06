import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { secureApiRequest } from "@/lib/api-security-enhanced"
import { serverError, badRequestError } from "@/lib/api-security-enhanced"

// PUT - Update existing product
export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { user, companyId, branchId, costCenterId, warehouseId, member, error } = await secureApiRequest(req, {
      requireAuth: true,
      requireCompany: true,
      requireBranch: false,
      requirePermission: { resource: "products", action: "write" }
    })

    if (error) return error
    if (!companyId) return badRequestError("معرف الشركة مطلوب")
    if (!member) return badRequestError("بيانات العضوية غير متوفرة")
    if (!params.id) return badRequestError("معرف المنتج مطلوب")

    const body = await req.json()
    const supabase = await createClient()

    // 🔐 Enterprise-Level Backend Validation
    const upperRoles = ["owner", "admin", "accountant", "manager"]
    const isUpperRole = upperRoles.includes(member.role)
    const isNormalRole = !isUpperRole && member.role !== ""

    // 🔐 فرض القيود على الأدوار العادية
    let finalBranchId = body.branch_id || null
    let finalCostCenterId = body.cost_center_id || null
    let finalWarehouseId = body.item_type === 'service' ? null : (body.warehouse_id || null)

    if (isNormalRole) {
      // للأدوار العادية: فرض القيم من بيانات المستخدم
      finalBranchId = member.branch_id || null
      finalCostCenterId = member.cost_center_id || null
      finalWarehouseId = body.item_type === 'product' ? (member.warehouse_id || null) : null

      // 🔐 التحقق من أن المستخدم لم يحاول تجاوز القيود
      if (body.branch_id && body.branch_id !== member.branch_id) {
        return NextResponse.json(
          { 
            success: false, 
            error: "تعيين فرع غير صالح - لا يمكنك تعيين فرع غير مرتبط بدورك",
            error_en: "Invalid branch assignment - You cannot assign a branch not associated with your role"
          },
          { status: 403 }
        )
      }
      if (body.cost_center_id && body.cost_center_id !== member.cost_center_id) {
        return NextResponse.json(
          { 
            success: false, 
            error: "تعيين مركز تكلفة غير صالح - لا يمكنك تعيين مركز تكلفة غير مرتبط بدورك",
            error_en: "Invalid cost center assignment - You cannot assign a cost center not associated with your role"
          },
          { status: 403 }
        )
      }
      if (body.item_type === 'product' && body.warehouse_id && body.warehouse_id !== member.warehouse_id) {
        return NextResponse.json(
          { 
            success: false, 
            error: "تعيين مستودع غير صالح - لا يمكنك تعيين مستودع غير مرتبط بدورك",
            error_en: "Invalid warehouse assignment - You cannot assign a warehouse not associated with your role"
          },
          { status: 403 }
        )
      }
    }

    // Prepare data with enforced values
    const productData = {
      ...body,
      branch_id: finalBranchId,
      cost_center_id: finalCostCenterId,
      warehouse_id: finalWarehouseId,
      // For services, ensure warehouse_id is null
      ...(body.item_type === 'service' && { warehouse_id: null }),
    }

    const { data, error: dbError } = await supabase
      .from("products")
      .update(productData)
      .eq("id", params.id)
      .eq("company_id", companyId)
      .select()
      .single()

    if (dbError) {
      console.error("Error updating product:", dbError)
      return serverError(`خطأ في تحديث المنتج: ${dbError.message}`)
    }

    if (!data) {
      return NextResponse.json(
        { 
          success: false, 
          error: "المنتج غير موجود أو لا تملك الصلاحية لتعديله",
          error_en: "Product not found or you don't have permission to update it"
        },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      data
    })
  } catch (e: any) {
    console.error("Error in products PUT API:", e)
    return serverError(`حدث خطأ أثناء تحديث المنتج: ${e?.message || "Unknown error"}`)
  }
}
