import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"
import { getActiveCompanyId } from "@/lib/company"

type RouteContext = { params: Promise<{ id: string }> }

/**
 * GET /api/branches/[id]
 * جلب فرع محدد
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
      .from("branches")
      .select("*")
      .eq("id", id)
      .eq("company_id", companyId)
      .single()

    if (error) throw error

    return NextResponse.json({ branch: data })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * PATCH /api/branches/[id]
 * تحديث فرع
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
    const { name, code, address, city, phone, email, manager_name, is_active } = body

    const updateData: Record<string, any> = { updated_at: new Date().toISOString() }
    if (name !== undefined) {
      updateData.name = name.trim()
      updateData.branch_name = name.trim()
    }
    if (code !== undefined) {
      updateData.code = code.trim().toUpperCase()
      updateData.branch_code = code.trim().toUpperCase()
    }
    if (address !== undefined) updateData.address = address?.trim() || null
    if (city !== undefined) updateData.city = city?.trim() || null
    if (phone !== undefined) updateData.phone = phone?.trim() || null
    if (email !== undefined) updateData.email = email?.trim() || null
    if (manager_name !== undefined) updateData.manager_name = manager_name?.trim() || null
    if (is_active !== undefined) updateData.is_active = is_active

    const { data, error } = await supabase
      .from("branches")
      .update(updateData)
      .eq("id", id)
      .eq("company_id", companyId)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ branch: data })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * DELETE /api/branches/[id]
 * حذف فرع (لا يمكن حذف الفرع الرئيسي)
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

    // التحقق من أن الفرع ليس الفرع الرئيسي
    const { data: branch } = await supabase
      .from("branches")
      .select("is_main")
      .eq("id", id)
      .eq("company_id", companyId)
      .single()

    if (branch?.is_main) {
      return NextResponse.json({ error: "Cannot delete main branch" }, { status: 400 })
    }

    const { error } = await supabase
      .from("branches")
      .delete()
      .eq("id", id)
      .eq("company_id", companyId)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

