import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getActiveCompanyId } from "@/lib/company"
import { getRoleAccessLevel } from "@/lib/validation"

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
