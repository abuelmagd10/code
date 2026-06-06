/**
 * 🏢 API لإدارة وصول الفروع للموظفين
 * User Branch Access API
 *
 * GET: جلب وصول الفروع
 * POST: إضافة وصول فرع جديد
 * PATCH: تحديث وصول فرع
 */

import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"

// GET: جلب وصول الفروع
export async function GET(request: Request) {
  try {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
        },
      }
    )
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const companyId = searchParams.get("company_id")
    const userId = searchParams.get("user_id")

    if (!companyId) {
      return NextResponse.json({ error: "company_id مطلوب" }, { status: 400 })
    }

    let query = supabase
      .from("user_branch_access")
      .select(`
        *,
        branch:branch_id(id, name, code)
      `)
      .eq("company_id", companyId)
      .eq("is_active", true)

    if (userId) {
      query = query.eq("user_id", userId)
    }

    const { data, error } = await query.order("is_primary", { ascending: false })

    if (error) throw error

    return NextResponse.json({ data })
  } catch (error: any) {
    console.error("Error fetching branch access:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// POST: إضافة وصول فرع جديد
// v3.74.68 — temporarily disabled. Data-filtering layer still uses
// company_members.branch_id (single), not allowed_branches[], so
// granting extra branches looks effective in UI but doesn't change
// what the user actually sees. Re-enable in v3.75.0 after unifying
// the filter layer and auditing 155 branch_id-aware RLS policies.
export async function POST(_request: Request) {
  return NextResponse.json(
    {
      error: "ميزَة 'وُصول الفُروع المُتَعَدِّدَة' قَيد التَّطوير وَمُعَطَّلَة مُؤَقَّتاً (v3.74.68). يَتم تَوحيد طَبَقَة الفَلتَرَة فى v3.75.0.",
      disabled: true,
    },
    { status: 503 }
  )
}

// Legacy implementation kept as private so its scope variables don't
// leak into the module. Will be restored or replaced in v3.75.0.
async function _legacyPOST(request: Request) {
  try {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
        },
      }
    )
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 401 })
    }

    const body = await request.json()
    const {
      company_id,
      user_id,
      branch_ids,
      primary_branch_id,
      access_type,
      is_primary,
      can_view_customers,
      can_view_orders,
      can_view_invoices,
      can_view_inventory,
      can_view_prices,
      replace_existing
    } = body

    if (!company_id || !user_id || !branch_ids?.length) {
      return NextResponse.json({ error: "البيانات المطلوبة ناقصة" }, { status: 400 })
    }

    // التحقق من صلاحية المستخدم
    const { data: member } = await supabase
      .from("company_members")
      .select("role")
      .eq("company_id", company_id)
      .eq("user_id", user.id)
      .single()

    const allowedRoles = ["owner", "admin", "general_manager", "manager"]
    if (!member || !allowedRoles.includes(member.role)) {
      return NextResponse.json({ error: "غير مصرح بهذه العملية" }, { status: 403 })
    }

    if (replace_existing) {
      await supabase
        .from("user_branch_access")
        .update({ is_active: false })
        .eq("company_id", company_id)
        .eq("user_id", user_id)
    }

    const accessRecords = branch_ids.map((branchId: string) => ({
      company_id,
      user_id,
      branch_id: branchId,
      access_type: access_type || "full",
      is_primary: primary_branch_id ? branchId === primary_branch_id : (is_primary && branch_ids[0] === branchId),
      can_view_customers: can_view_customers !== false,
      can_view_orders: can_view_orders !== false,
      can_view_invoices: can_view_invoices !== false,
      can_view_inventory: can_view_inventory !== false,
      can_view_prices: can_view_prices || false,
      is_active: true,
      created_by: user.id
    }))

    const { data, error } = await supabase
      .from("user_branch_access")
      .upsert(accessRecords, { onConflict: "company_id,user_id,branch_id" })
      .select()

    if (error) throw error

    await supabase.from("audit_logs").insert({
      company_id,
      user_id: user.id,
      action_type: replace_existing ? "update" : "create",
      resource_type: "user_branch_access",
      description: `${replace_existing ? 'تحديث' : 'إضافة'} وصول ${branch_ids.length} فرع للموظف ${user_id}`,
      new_data: { user_id, branch_ids, primary_branch_id }
    })

    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    console.error("Error adding branch access:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// PATCH: تحديث وصول فرع
export async function PATCH(request: Request) {
  try {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
        },
      }
    )
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 401 })
    }

    const body = await request.json()
    const { id, ...updates } = body

    if (!id) {
      return NextResponse.json({ error: "id مطلوب" }, { status: 400 })
    }

    const { data, error } = await supabase
      .from("user_branch_access")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    console.error("Error updating branch access:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
