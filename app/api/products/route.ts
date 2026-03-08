import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { secureApiRequest } from "@/lib/api-security-enhanced"
import { serverError, badRequestError, forbiddenError } from "@/lib/api-security-enhanced"
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

    // Validate Cost Center -> Branch Relationship
    if (finalCostCenterId) {
      const { data: ccData } = await supabase.from('cost_centers').select('company_id, branch_id').eq('id', finalCostCenterId).single()
      if (!ccData || ccData.company_id !== companyId) return badRequestError("مركز التكلفة غير صالح أو لا يتبع لشركتك")
      if (finalBranchId && ccData.branch_id && ccData.branch_id !== finalBranchId) return badRequestError("مركز التكلفة المختار لا يتبع للفرع المحدد")
    }

    if (isNormalRole) {
      // 🔐 للأدوار العادية: لا يمكنهم اختيار فرع غير فرعهم
      finalBranchId = member.branch_id || finalBranchId

      if (!member.branch_id) {
        return forbiddenError("لا يمكنك إضافة منتجات، لم يتم تعيين فرع لحسابك")
      }
      if (body.branch_id && body.branch_id !== member.branch_id) {
        return forbiddenError("لا يمكنك تعيين فرع غير مرتبط بدورك")
      }

      // 🔐 بالنسبة للمستودع: 
      if (body.item_type === 'product') {
        if (member.warehouse_id) {
          if (body.warehouse_id && body.warehouse_id !== member.warehouse_id) {
            return forbiddenError("لا يمكنك تعيين مستودع غير مرتبط بدورك")
          }
          finalWarehouseId = member.warehouse_id
        } else {
          finalWarehouseId = body.warehouse_id || null
        }
      } else {
        finalWarehouseId = null
      }

      // 🔐 بالنسبة لمركز التكلفة:
      if (member.cost_center_id) {
        if (body.cost_center_id && body.cost_center_id !== member.cost_center_id) {
          return forbiddenError("لا يمكنك تعيين مركز تكلفة غير مرتبط بدورك")
        }
        finalCostCenterId = member.cost_center_id
      } else {
        finalCostCenterId = body.cost_center_id || null
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
