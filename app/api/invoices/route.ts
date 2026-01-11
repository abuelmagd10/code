/**
 * 🔒 API الفواتير مع الحوكمة الإلزامية
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getActiveCompanyId } from "@/lib/company"
import { getRoleAccessLevel } from "@/lib/validation"

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    
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
    
    let query = supabase
      .from("invoices")
      .select("*")
      .eq("company_id", companyId)

    // للموظفين: فلتر بـ created_by_user_id إذا موجود، وإلا فلتر بـ branch_id
    if (accessLevel === 'own') {
      if (member.branch_id) {
        query = query.eq("branch_id", member.branch_id)
        // إضافة فلتر إضافي بـ created_by_user_id إذا موجود
        query = query.or(`created_by_user_id.eq.${user.id},created_by_user_id.is.null`)
      } else {
        query = query.eq("created_by_user_id", user.id)
      }
    } else if (accessLevel === 'branch' && member.branch_id) {
      query = query.eq("branch_id", member.branch_id)
    }

    query = query.order("created_at", { ascending: false })

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
