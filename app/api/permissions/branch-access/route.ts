/**
 * 🏢 API لإدارة فرع الموظف (Single Branch - Mandatory)
 * User Branch Access API
 *
 * 🎯 قرار معماري إلزامي: المستخدم الواحد يجب أن ينتمي إلى فرع واحد فقط
 * 
 * GET: جلب فرع الموظف
 * POST: تعيين فرع واحد للموظف (فرع واحد فقط - إلزامي)
 * PATCH: تحديث فرع الموظف
 * DELETE: إلغاء فرع الموظف
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
export async function POST(request: Request) {
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
      branch_ids, // مصفوفة من الفروع
      primary_branch_id, // الفرع الأساسي
      access_type,
      is_primary,
      can_view_customers,
      can_view_orders,
      can_view_invoices,
      can_view_inventory,
      can_view_prices,
      replace_existing // حذف الفروع القديمة واستبدالها بالجديدة
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

    // 🔐 السماح للأدوار الإدارية بإدارة وصول الفروع
    const allowedRoles = ["owner", "admin", "general_manager", "manager"]
    if (!member || !allowedRoles.includes(member.role)) {
      return NextResponse.json({ error: "غير مصرح بهذه العملية" }, { status: 403 })
    }

    // ✅ حذف جميع الفروع القديمة أولاً (ضمان فرع واحد فقط)
    await supabase
      .from("user_branch_access")
      .update({ is_active: false })
      .eq("company_id", company_id)
      .eq("user_id", user_id)

    // ✅ إنشاء سجل وصول واحد فقط (فرع واحد)
    const accessRecord = {
      company_id,
      user_id,
      branch_id: finalBranchId,
      access_type: access_type || "full",
      is_primary: true, // ✅ دائماً أساسي (لأنه الفرع الوحيد)
      can_view_customers: can_view_customers !== false,
      can_view_orders: can_view_orders !== false,
      can_view_invoices: can_view_invoices !== false,
      can_view_inventory: can_view_inventory !== false,
      can_view_prices: can_view_prices || false,
      is_active: true,
      created_by: user.id
    }

    const { data, error } = await supabase
      .from("user_branch_access")
      .upsert(accessRecord, { onConflict: "company_id,user_id,branch_id" })
      .select()

    if (error) throw error

    // ✅ تحديث company_members.branch_id (الفرع الواحد)
    await supabase
      .from("company_members")
      .update({ branch_id: finalBranchId })
      .eq("company_id", company_id)
      .eq("user_id", user_id)

    // تسجيل في Audit Log
    await supabase.from("audit_logs").insert({
      company_id,
      user_id: user.id,
      action_type: "update",
      resource_type: "user_branch_access",
      description: `تعيين فرع واحد للموظف ${user_id}`,
      new_data: { user_id, branch_id: finalBranchId }
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

