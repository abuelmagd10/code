import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { apiGuard, asyncAuditLog, ErrorHandler, ERPError } from "@/lib/core"

// PUT - Update existing product
export async function PUT(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { context, errorResponse } = await apiGuard(req, {
      requireAuth: true,
      requireCompany: true,
      resource: "products",
      action: "write"
    })

    if (errorResponse) return errorResponse

    const { user, companyId, member } = context!
    if (!params.id) {
      return ErrorHandler.handle(ErrorHandler.validation('معرف المنتج مطلوب'))
    }

    const body = await req.json()
    const supabase = await createClient()

    // 1️⃣ Permissions Scope Evaluation
    // (Actual permission 'products:write' was already checked above by apiGuard)
    // Here we define the scope for company-wide assignment vs restricted branch assignment
    const isCompanyLevelAdmin = ["owner", "admin", "manager"].includes(member.role)
    const isNormalRole = !isCompanyLevelAdmin

    // 🔐 فرض القيود على الأدوار العادية
    let finalBranchId = body.branch_id || null
    let finalCostCenterId = body.cost_center_id || null
    let finalWarehouseId = body.item_type === 'service' ? null : (body.warehouse_id || null)

    if (isNormalRole) {
      // 🔐 للأدوار العادية: لا يمكنهم اختيار فرع غير فرعهم
      finalBranchId = member.branch_id || finalBranchId

      // 🔐 بالنسبة للمستودع: 
      if (body.item_type === 'product') {
        finalWarehouseId = member.warehouse_id || finalWarehouseId
      } else {
        finalWarehouseId = null
      }

      // 🔐 بالنسبة لمركز التكلفة:
      finalCostCenterId = member.cost_center_id || finalCostCenterId
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
      return ErrorHandler.handle(new ERPError('ERR_SYSTEM', 'خطأ في تحديث المنتج', 500, dbError.message))
    }

    if (!data) {
      return ErrorHandler.handle(ErrorHandler.validation('المنتج غير موجود أو لا تملك الصلاحية لتعديله'))
    }

    // 5️⃣ Async Audit Logging (Fire and Forget)
    asyncAuditLog({
      companyId,
      userId: user.id,
      userEmail: user.email,
      action: 'UPDATE',
      table: 'products',
      recordId: data.id,
      recordIdentifier: data.sku,
      newData: {
        name: data.name,
        unit_price: data.unit_price,
        branch_id: data.branch_id,
        item_type: data.item_type
      },
      reason: 'Updated product/service details'
    })

    return NextResponse.json({
      success: true,
      data
    })
  } catch (error: any) {
    return ErrorHandler.handle(error)
  }
}
