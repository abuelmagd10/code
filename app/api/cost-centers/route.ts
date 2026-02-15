import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import { getActiveCompanyId } from "@/lib/company"

/**
 * GET /api/cost-centers
 * جلب جميع مراكز التكلفة للشركة الحالية
 */
export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const companyId = await getActiveCompanyId(supabase)
    
    if (!companyId) {
      return NextResponse.json({ error: "No company found" }, { status: 400 })
    }

    const { searchParams } = new URL(request.url)
    const branchId = searchParams.get("branch_id")

    let query = supabase
      .from("cost_centers")
      .select("*, branches!cost_centers_branch_id_fkey(id, name, code)")
      .eq("company_id", companyId)
      .order("cost_center_name")

    if (branchId) {
      query = query.eq("branch_id", branchId)
    }

    const { data, error } = await query

    if (error) throw error

    return NextResponse.json({ cost_centers: data })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * POST /api/cost-centers
 * إنشاء مركز تكلفة جديد
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const companyId = await getActiveCompanyId(supabase)
    
    if (!companyId) {
      return NextResponse.json({ error: "No company found" }, { status: 400 })
    }

    const body = await request.json()
    const { cost_center_name, cost_center_code, branch_id, description, is_active } = body

    if (!cost_center_name || !cost_center_code || !branch_id) {
      return NextResponse.json({ error: "Name, code and branch_id are required" }, { status: 400 })
    }

    // التحقق من أن الفرع ينتمي للشركة
    const { data: branch } = await supabase
      .from("branches")
      .select("id")
      .eq("id", branch_id)
      .eq("company_id", companyId)
      .single()

    if (!branch) {
      return NextResponse.json({ error: "Invalid branch" }, { status: 400 })
    }

    const { data, error } = await supabase
      .from("cost_centers")
      .insert({
        company_id: companyId,
        branch_id,
        cost_center_name: cost_center_name.trim(),
        cost_center_code: cost_center_code.trim().toUpperCase(),
        description: description?.trim() || null,
        is_active: is_active ?? true
      })
      .select("*, branches!cost_centers_branch_id_fkey(id, name, code)")
      .single()

    if (error) throw error

    return NextResponse.json({ cost_center: data })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

