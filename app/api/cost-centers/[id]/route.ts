import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"
import { getActiveCompanyId } from "@/lib/company"

type RouteContext = { params: Promise<{ id: string }> }

/**
 * GET /api/cost-centers/[id]
 * جلب مركز تكلفة محدد
 */
export async function GET(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const { id } = await context.params
    const supabase = await createClient()
    const companyId = await getActiveCompanyId(supabase)

    if (!companyId) {
      return NextResponse.json({ error: "No company found" }, { status: 400 })
    }

    const { data, error } = await supabase
      .from("cost_centers")
      .select("*, branches!cost_centers_branch_id_fkey(id, name, code)")
      .eq("id", id)
      .eq("company_id", companyId)
      .single()

    if (error) throw error

    return NextResponse.json({ cost_center: data })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * PATCH /api/cost-centers/[id]
 * تحديث مركز تكلفة
 */
export async function PATCH(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const { id } = await context.params
    const supabase = await createClient()
    const companyId = await getActiveCompanyId(supabase)

    if (!companyId) {
      return NextResponse.json({ error: "No company found" }, { status: 400 })
    }

    const body = await request.json()
    const { cost_center_name, cost_center_code, branch_id, description, is_active } = body

    const updateData: Record<string, any> = { updated_at: new Date().toISOString() }
    if (cost_center_name !== undefined) updateData.cost_center_name = cost_center_name.trim()
    if (cost_center_code !== undefined) updateData.cost_center_code = cost_center_code.trim().toUpperCase()
    if (description !== undefined) updateData.description = description?.trim() || null
    if (is_active !== undefined) updateData.is_active = is_active

    // إذا تم تغيير الفرع، تحقق من صحته
    if (branch_id !== undefined) {
      const { data: branch } = await supabase
        .from("branches")
        .select("id")
        .eq("id", branch_id)
        .eq("company_id", companyId)
        .single()

      if (!branch) {
        return NextResponse.json({ error: "Invalid branch" }, { status: 400 })
      }
      updateData.branch_id = branch_id
    }

    const { data, error } = await supabase
      .from("cost_centers")
      .update(updateData)
      .eq("id", id)
      .eq("company_id", companyId)
      .select("*, branches!cost_centers_branch_id_fkey(id, name, code)")
      .single()

    if (error) throw error

    return NextResponse.json({ cost_center: data })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * DELETE /api/cost-centers/[id]
 * حذف مركز تكلفة
 */
export async function DELETE(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const { id } = await context.params
    const supabase = await createClient()
    const companyId = await getActiveCompanyId(supabase)

    if (!companyId) {
      return NextResponse.json({ error: "No company found" }, { status: 400 })
    }

    const { error } = await supabase
      .from("cost_centers")
      .delete()
      .eq("id", id)
      .eq("company_id", companyId)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

