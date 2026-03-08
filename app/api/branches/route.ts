import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import { apiGuard, requireRole, asyncAuditLog } from "@/lib/core"
import { internalError, badRequestError } from "@/lib/api-error-handler"

/**
 * GET /api/branches
 * جلب جميع الفروع للشركة الحالية
 */
export async function GET(req: Request) {
  try {
    const { context, errorResponse } = await apiGuard(req, { requireAuth: true, requireCompany: true })
    if (errorResponse) return errorResponse

    const supabase = await createClient()

    const { data, error } = await supabase
      .from("branches")
      .select("*")
      .eq("company_id", context!.companyId)
      .order("is_main", { ascending: false })
      .order("name")

    if (error) throw error

    return NextResponse.json({ branches: data })
  } catch (error: any) {
    return internalError('خطأ في جلب الفروع', error.message)
  }
}

/**
 * POST /api/branches
 * إنشاء فرع جديد (Atomic Transaction) + Security Guard + Async Audit
 */
export async function POST(req: Request) {
  try {
    const { context, errorResponse } = await apiGuard(req, { requireAuth: true, requireCompany: true })
    if (errorResponse) return errorResponse

    const { user, companyId } = context!

    // 🔒 حظر إنشاء فروع إلا للأدوار العليا
    requireRole(context!, ['owner', 'admin', 'manager'])

    const body = await req.json()
    const { name, code, address, city, phone, email, manager_name, is_active } = body
    const finalCode = code?.trim().toUpperCase()

    if (!name || !finalCode) {
      return badRequestError('اسم الفرع والكود مطلوبان', ['name', 'code'])
    }

    const supabase = await createClient()

    // 🏗️ استخدام الـ RPC الاوتوماتيكي الذري
    const { data: rpcResult, error: rpcError } = await supabase.rpc('create_branch_atomic', {
      p_company_id: companyId,
      p_name: name.trim(),
      p_code: finalCode,
      p_address: address?.trim() || null,
      p_city: city?.trim() || null,
      p_phone: phone?.trim() || null,
      p_email: email?.trim() || null,
      p_manager_name: manager_name?.trim() || null,
      p_is_active: is_active ?? true
    })

    if (rpcError || !rpcResult?.success) {
      return internalError('خطأ في بناء البنية التحتية للفرع', rpcError?.message || 'Unknown RPC error')
    }

    // 🛡️ توثيق الحدث بشكل غير حظري (Fire and Forget)
    asyncAuditLog({
      companyId: companyId,
      userId: user.id,
      userEmail: user.email,
      action: 'CREATE',
      table: 'branches',
      recordId: rpcResult.branch_id,
      recordIdentifier: finalCode,
      newData: {
        branch_id: rpcResult.branch_id,
        cost_center_id: rpcResult.cost_center_id,
        warehouse_id: rpcResult.warehouse_id,
        branch_name: rpcResult.branch_name,
      },
      reason: 'Automated Branch Infrastructure Creation'
    })

    return NextResponse.json({
      branch: {
        id: rpcResult.branch_id,
        name: rpcResult.branch_name,
        default_cost_center_id: rpcResult.cost_center_id,
        default_warehouse_id: rpcResult.warehouse_id
      }
    })

  } catch (error: any) {
    if (error.error?.status) { // if ERPError wrapped inside a Response
      return NextResponse.json({ error: error.error.message }, { status: error.error.status })
    }
    return internalError('خطأ داخلي في الخادم', error.message)
  }
}


