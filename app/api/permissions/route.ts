/**
 * 🔐 API لإدارة الصلاحيات بين الموظفين
 * Permission Management API
 *
 * GET: جلب الصلاحيات المشتركة والمنقولة
 * POST: إنشاء مشاركة صلاحيات جديدة
 */

import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"

// GET: جلب الصلاحيات المشتركة
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
    const type = searchParams.get("type") || "sharing" // sharing | transfers | branch_access

    if (!companyId) {
      return NextResponse.json({ error: "company_id مطلوب" }, { status: 400 })
    }

    // التحقق من صلاحية المستخدم
    const { data: member } = await supabase
      .from("company_members")
      .select("role")
      .eq("company_id", companyId)
      .eq("user_id", user.id)
      .single()

    // 🔐 السماح للأدوار الإدارية بالوصول
    const allowedRoles = ["owner", "admin", "general_manager", "manager", "accountant"]
    if (!member || !allowedRoles.includes(member.role)) {
      return NextResponse.json({ error: "غير مصرح بالوصول" }, { status: 403 })
    }

    let data: any = null

    if (type === "sharing") {
      // جلب الصلاحيات المشتركة (النشطة فقط)
      const { data: sharing, error } = await supabase
        .from("permission_sharing")
        .select("*")
        .eq("company_id", companyId)
        .eq("is_active", true)
        .order("created_at", { ascending: false })

      if (error) {
        console.error("Error fetching permission_sharing:", error)
        throw error
      }
      console.log("Permission sharing data:", sharing?.length || 0, "records")
      data = sharing
    } else if (type === "transfers") {
      // جلب سجل النقل
      const { data: transfers, error } = await supabase
        .from("permission_transfers")
        .select("*")
        .eq("company_id", companyId)
        .order("transferred_at", { ascending: false })

      if (error) throw error
      data = transfers
    } else if (type === "branch_access") {
      // جلب وصول الفروع المتعددة
      const { data: access, error } = await supabase
        .from("user_branch_access")
        .select(`
          *,
          user:user_id(id, email, raw_user_meta_data),
          branch:branch_id(id, name)
        `)
        .eq("company_id", companyId)
        .eq("is_active", true)
        .order("created_at", { ascending: false })

      if (error) throw error
      data = access
    }

    return NextResponse.json({ data })
  } catch (error: any) {
    console.error("Error fetching permissions:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// POST: إنشاء مشاركة صلاحيات جديدة
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
      action, // "share" | "transfer" | "add_branch_access"
      grantor_user_id,
      grantee_user_ids, // مصفوفة للدعم المتعدد
      resource_type,
      scope,
      branch_id,
      can_view,
      can_edit,
      can_delete,
      expires_at,
      notes,
      reason
    } = body

    if (!company_id || !action) {
      return NextResponse.json({ error: "البيانات المطلوبة ناقصة" }, { status: 400 })
    }

    // التحقق من صلاحية المستخدم
    const { data: member } = await supabase
      .from("company_members")
      .select("role")
      .eq("company_id", company_id)
      .eq("user_id", user.id)
      .single()

    // 🔐 v3.70.0 — Manager removed per v3.67.0 read-only spec.
    // Only Owner/Admin/General Manager can grant/share permissions.
    const allowedRoles = ["owner", "admin", "general_manager"]
    if (!member || !allowedRoles.includes(member.role)) {
      return NextResponse.json({ error: "غير مصرح بهذه العملية" }, { status: 403 })
    }

    let result: any = null

    if (action === "share") {
      // إنشاء مشاركة صلاحيات
      const sharingRecords = (grantee_user_ids || []).map((granteeId: string) => ({
        company_id,
        grantor_user_id,
        grantee_user_id: granteeId,
        resource_type: resource_type || "all",
        scope: scope || "user",
        branch_id: branch_id || null,
        can_view: can_view !== false,
        can_edit: can_edit || false,
        can_delete: can_delete || false,
        is_active: true,
        created_by: user.id,
        expires_at: expires_at || null,
        notes: notes || null
      }))

      const { data, error } = await supabase
        .from("permission_sharing")
        .upsert(sharingRecords, { onConflict: "company_id,grantor_user_id,grantee_user_id,resource_type" })
        .select()

      if (error) throw error
      result = { action: "share", count: data?.length || 0, data }

      // تسجيل في Audit Log
      await supabase.from("audit_logs").insert({
        company_id,
        user_id: user.id,
        action_type: "permission_share",
        resource_type: "permissions",
        resource_id: data?.[0]?.id || null,
        description: `مشاركة صلاحيات ${resource_type || 'all'} من ${grantor_user_id} إلى ${grantee_user_ids?.length || 0} موظف`,
        new_data: { grantor_user_id, grantee_user_ids, resource_type, can_view, can_edit, can_delete }
      })
    }

    return NextResponse.json({ success: true, result })
  } catch (error: any) {
    console.error("Error managing permissions:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

