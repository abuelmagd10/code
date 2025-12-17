import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import { getActiveCompanyId } from "@/lib/company"

/**
 * GET /api/branches
 * جلب جميع الفروع للشركة الحالية
 */
export async function GET() {
  try {
    const supabase = await createClient()
    const companyId = await getActiveCompanyId(supabase)
    
    if (!companyId) {
      return NextResponse.json({ error: "No company found" }, { status: 400 })
    }

    const { data, error } = await supabase
      .from("branches")
      .select("*")
      .eq("company_id", companyId)
      .order("is_main", { ascending: false })
      .order("name")

    if (error) throw error

    return NextResponse.json({ branches: data })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * POST /api/branches
 * إنشاء فرع جديد
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const companyId = await getActiveCompanyId(supabase)
    
    if (!companyId) {
      return NextResponse.json({ error: "No company found" }, { status: 400 })
    }

    const body = await request.json()
    const { name, code, address, city, phone, email, manager_name, is_active } = body

    if (!name || !code) {
      return NextResponse.json({ error: "Name and code are required" }, { status: 400 })
    }

    const { data, error } = await supabase
      .from("branches")
      .insert({
        company_id: companyId,
        name: name.trim(),
        branch_name: name.trim(),
        code: code.trim().toUpperCase(),
        branch_code: code.trim().toUpperCase(),
        address: address?.trim() || null,
        city: city?.trim() || null,
        phone: phone?.trim() || null,
        email: email?.trim() || null,
        manager_name: manager_name?.trim() || null,
        is_active: is_active ?? true,
        is_main: false,
        is_head_office: false
      })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ branch: data })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

