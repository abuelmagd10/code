import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { secureApiRequest } from "@/lib/api-security-enhanced"
import { serverError, badRequestError } from "@/lib/api-security-enhanced"
import { logAuditEvent } from "@/lib/audit-log"

// POST - Create new product
export async function POST(req: NextRequest) {
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

    const body = await req.json()
    const supabase = await createClient()

    // 1️⃣ Permissions Scope Evaluation
    // (Actual permission 'products:write' was already checked above by secureApiRequest)
    // Here we define the scope for company-wide assignment vs restricted branch assignment
    const isCompanyLevelAdmin = ["owner", "admin", "manager"].includes(member.role)
    const isNormalRole = !isCompanyLevelAdmin && member.role !== ""

    // 🔐 فرض القيود على الأدوار العادية
    let finalBranchId = body.branch_id || null
    let finalCostCenterId = body.cost_center_id || null
    let finalWarehouseId = body.item_type === 'service' ? null : (body.warehouse_id || null)

    // 2️⃣ Prevent Data Conflict
    if (!finalBranchId && finalWarehouseId) {
      return badRequestError("تضارب بيانات: لا يمكن تعيين مستودع بدون تحديد فرع لمنتجات الشركة العامة")
    }

    // 3️⃣ & 4️⃣ Multi-Company Isolation & Entity Relationship Validation
    // Validate Branch
    if (finalBranchId) {
      const { data: bData } = await supabase.from('branches').select('company_id').eq('id', finalBranchId).single()
      if (!bData || bData.company_id !== companyId) return badRequestError("الفرع غير صالح أو لا يتبع لشركتك")
    }

    // Validate Warehouse -> Branch Relationship
    if (finalWarehouseId) {
      const { data: wData } = await supabase.from('warehouses').select('company_id, branch_id').eq('id', finalWarehouseId).single()
      if (!wData || wData.company_id !== companyId) return badRequestError("المستودع غير صالح أو لا يتبع لشركتك")
      if (finalBranchId && wData.branch_id !== finalBranchId) return badRequestError("المستودع المختار لا يتبع للفرع المحدد")
    }

    // Validate Cost Center
    if (finalCostCenterId) {
      const { data: ccData } = await supabase.from('cost_centers').select('company_id').eq('id', finalCostCenterId).single()
      if (!ccData || ccData.company_id !== companyId) return badRequestError("مركز التكلفة غير صالح أو لا يتبع لشركتك")
    }

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
      company_id: companyId,
      branch_id: finalBranchId,
      cost_center_id: finalCostCenterId,
      warehouse_id: finalWarehouseId,
      // For services, ensure warehouse_id is null
      ...(body.item_type === 'service' && { warehouse_id: null }),
    }

    const { data, error: dbError } = await supabase
      .from("products")
      .insert([productData])
      .select()
      .single()

    if (dbError) {
      console.error("Error creating product:", dbError)
      return serverError(`خطأ في إنشاء المنتج: ${dbError.message}`)
    }

    // 5️⃣ Audit Log
    try {
      await logAuditEvent(supabase, {
        company_id: companyId,
        user_id: user.id,
        user_email: user?.email,
        action: "create",
        target_table: "products",
        record_id: data.id,
        new_data: {
          name: productData.name,
          item_type: productData.item_type,
          branch_id: productData.branch_id,
          warehouse_id: productData.warehouse_id
        }
      })
    } catch (auditErr) {
      console.error("Failed to create audit log for product creation", auditErr)
      // We don't fail the request if audit fails, but we log it
    }

    return NextResponse.json({
      success: true,
      data
    })
  } catch (e: any) {
    console.error("Error in products POST API:", e)
    return serverError(`حدث خطأ أثناء إنشاء المنتج: ${e?.message || "Unknown error"}`)
  }
}
