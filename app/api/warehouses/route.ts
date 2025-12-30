import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    // Get user's company
    const { data: member } = await supabase
      .from("company_members")
      .select("company_id")
      .eq("user_id", user.id)
      .single()

    if (!member) return NextResponse.json({ error: "No company found" }, { status: 404 })

    const { data: warehouses, error } = await supabase
      .from("warehouses")
      .select("*, branches(id, name, branch_name), cost_centers(id, cost_center_name)")
      .eq("company_id", member.company_id)
      .order("is_main", { ascending: false })
      .order("name")

    if (error) throw error
    return NextResponse.json(warehouses)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const body = await request.json()

    // Get user's company
    const { data: member } = await supabase
      .from("company_members")
      .select("company_id, role")
      .eq("user_id", user.id)
      .single()

    if (!member) return NextResponse.json({ error: "No company found" }, { status: 404 })
    if (!["owner", "admin"].includes(member.role)) {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 })
    }

    const { data: warehouse, error } = await supabase
      .from("warehouses")
      .insert({
        company_id: member.company_id,
        name: body.name,
        code: body.code || null,
        branch_id: body.branch_id || null,
        cost_center_id: body.cost_center_id || null,
        address: body.address || null,
        city: body.city || null,
        phone: body.phone || null,
        manager_name: body.manager_name || null,
        is_main: false,
        is_active: body.is_active !== false,
        notes: body.notes || null
      })
      .select()
      .single()

    if (error) throw error
    return NextResponse.json(warehouse)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

