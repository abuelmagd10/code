import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data: warehouse, error } = await supabase
      .from("warehouses")
      .select("*, branches(id, name, branch_name), cost_centers(id, cost_center_name)")
      .eq("id", params.id)
      .single()

    if (error) throw error
    return NextResponse.json(warehouse)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const body = await request.json()

    // Check permissions
    const { data: member } = await supabase
      .from("company_members")
      .select("role")
      .eq("user_id", user.id)
      .single()

    if (!member || !["owner", "admin"].includes(member.role)) {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 })
    }

    // Check if trying to edit main warehouse name
    const { data: existing } = await supabase
      .from("warehouses")
      .select("is_main")
      .eq("id", params.id)
      .single()

    if (existing?.is_main && body.name && body.name !== "المخزن الرئيسي") {
      return NextResponse.json({ error: "Cannot rename main warehouse" }, { status: 400 })
    }

    const { data: warehouse, error } = await supabase
      .from("warehouses")
      .update({
        name: body.name,
        code: body.code || null,
        branch_id: body.branch_id || null,
        cost_center_id: body.cost_center_id || null,
        address: body.address || null,
        city: body.city || null,
        phone: body.phone || null,
        manager_name: body.manager_name || null,
        is_active: body.is_active,
        notes: body.notes || null,
        updated_at: new Date().toISOString()
      })
      .eq("id", params.id)
      .select()
      .single()

    if (error) throw error
    return NextResponse.json(warehouse)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    // Check permissions
    const { data: member } = await supabase
      .from("company_members")
      .select("role")
      .eq("user_id", user.id)
      .single()

    if (!member || member.role !== "owner") {
      return NextResponse.json({ error: "Only owner can delete warehouses" }, { status: 403 })
    }

    // Check if main warehouse
    const { data: warehouse } = await supabase
      .from("warehouses")
      .select("is_main")
      .eq("id", params.id)
      .single()

    if (warehouse?.is_main) {
      return NextResponse.json({ error: "Cannot delete main warehouse" }, { status: 400 })
    }

    const { error } = await supabase
      .from("warehouses")
      .delete()
      .eq("id", params.id)

    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

