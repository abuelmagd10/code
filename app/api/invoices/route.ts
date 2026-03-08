import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getActiveCompanyId } from "@/lib/company"
import { getRoleAccessLevel } from "@/lib/validation"
import { apiGuard, asyncAuditLog, ErrorHandler, ERPError } from "@/lib/core"

// 🔐 الأدوار المميزة التي يمكنها فلترة الفروع
const PRIVILEGED_ROLES = ['owner', 'admin', 'general_manager']

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    // 🔐 قراءة branch_id من query parameters (للأدوار المميزة فقط)
    const { searchParams } = new URL(request.url)
    const requestedBranchId = searchParams.get('branch_id')

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const companyId = await getActiveCompanyId(supabase)
    if (!companyId) {
      return NextResponse.json({ error: "No company found" }, { status: 400 })
    }

    const { data: member } = await supabase
      .from("company_members")
      .select("role, branch_id, cost_center_id, warehouse_id")
      .eq("company_id", companyId)
      .eq("user_id", user.id)
      .single()

    if (!member) {
      return NextResponse.json({ error: "User not found in company" }, { status: 403 })
    }

    const accessLevel = getRoleAccessLevel(member.role)
    const canFilterByBranch = PRIVILEGED_ROLES.includes(member.role.toLowerCase())

    let query = supabase
      .from("invoices")
      .select("*, customers(name, phone), branches(name)")
      .eq("company_id", companyId)

    // 🔐 تطبيق فلترة الفروع حسب الصلاحيات
    if (canFilterByBranch && requestedBranchId) {
      // المستخدم المميز اختار فرعاً معيناً
      query = query.eq("branch_id", requestedBranchId)
    } else if (accessLevel === 'own') {
      if (member.branch_id) {
        query = query.eq("branch_id", member.branch_id)
        query = query.or(`created_by_user_id.eq.${user.id},created_by_user_id.is.null`)
      } else {
        query = query.eq("created_by_user_id", user.id)
      }
    } else if (accessLevel === 'branch' && member.branch_id) {
      query = query.eq("branch_id", member.branch_id)
    }
    // else: المستخدم المميز بدون فلتر = جميع الفروع

    query = query.order("invoice_date", { ascending: false })

    const { data: invoices, error: dbError } = await query

    if (dbError) {
      return NextResponse.json({ error: dbError.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      data: invoices || [],
      meta: {
        total: (invoices || []).length,
        role: member.role,
        accessLevel: accessLevel
      }
    })

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const { context, errorResponse } = await apiGuard(req, {
      requireAuth: true,
      requireCompany: true,
      resource: "invoices",
      action: "write"
    })

    if (errorResponse) return errorResponse

    const { user, companyId, member } = context!
    const body = await req.json()
    const supabase = await createClient()

    // 1️⃣ Permissions Scope Evaluation
    const isCompanyLevelAdmin = ["owner", "admin", "manager"].includes(member.role)
    const isNormalRole = !isCompanyLevelAdmin

    // 2️⃣ Enforce role constraints
    let finalBranchId = body.branch_id || null
    let finalCostCenterId = body.cost_center_id || null
    let finalWarehouseId = body.warehouse_id || null

    if (isNormalRole) {
      finalBranchId = member.branch_id || finalBranchId
      finalCostCenterId = member.cost_center_id || finalCostCenterId
      finalWarehouseId = member.warehouse_id || finalWarehouseId
    }

    // Prepare invoice data and items for the RPC
    const invoiceData = {
      ...body,
      company_id: companyId,
      branch_id: finalBranchId,
      cost_center_id: finalCostCenterId,
      warehouse_id: finalWarehouseId,
      created_by_user_id: user.id
    }

    // Remove items from invoiceData so it can be passed as p_invoice_data cleanly
    const invoiceItems = invoiceData.items || []
    delete invoiceData.items

    // 3️⃣ Call Atomic RPC (handles creation and synchronous accounting engine)
    const { data: rpcResult, error: rpcError } = await supabase.rpc('create_sales_invoice_atomic', {
      p_invoice_data: invoiceData,
      p_invoice_items: invoiceItems
    })

    if (rpcError || !rpcResult?.success) {
      console.error("RPC Error:", rpcError)
      return ErrorHandler.handle(new ERPError('ERR_SYSTEM', 'فشل في إنشاء الفاتورة', 500, rpcError?.message || 'Unknown RPC error'))
    }

    // 4️⃣ Async Audit Logging (Fire and Forget)
    asyncAuditLog({
      companyId,
      userId: user.id,
      userEmail: user.email,
      action: 'CREATE',
      table: 'invoices',
      recordId: rpcResult.invoice_id,
      recordIdentifier: 'Invoice Created via Atomic API',
      newData: {
        total_amount: body.total_amount,
        status: body.status,
        branch_id: finalBranchId,
        cost_center_id: finalCostCenterId,
        warehouse_id: finalWarehouseId
      },
      reason: 'Created sales invoice via atomic RPC'
    })

    return NextResponse.json({
      success: true,
      data: {
        id: rpcResult.invoice_id,
        ...invoiceData,
        items: invoiceItems
      }
    })

  } catch (error: any) {
    return ErrorHandler.handle(error)
  }
}
