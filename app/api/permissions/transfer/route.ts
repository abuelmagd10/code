/**
 * 🔄 API لنقل الصلاحيات بين الموظفين
 * Permission Transfer API
 *
 * POST: نقل ملكية العملاء/الأوامر من موظف لآخر
 */

import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"

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
      from_user_id,
      to_user_ids, // مصفوفة للدعم المتعدد
      resource_type, // "customers" | "sales_orders" | "all"
      branch_id, // اختياري: نقل عملاء/أوامر هذا الفرع فقط (للموظف المنقول عنه)
      reason,
      notes
    } = body

    if (!company_id || !from_user_id || !to_user_ids?.length || !resource_type) {
      return NextResponse.json({ error: "البيانات المطلوبة ناقصة" }, { status: 400 })
    }

    // التحقق من صلاحية المستخدم
    const { data: member } = await supabase
      .from("company_members")
      .select("role")
      .eq("company_id", company_id)
      .eq("user_id", user.id)
      .single()

    // 🔐 السماح للأدوار الإدارية بنقل الصلاحيات
    const allowedRoles = ["owner", "admin", "general_manager", "manager"]
    if (!member || !allowedRoles.includes(member.role)) {
      return NextResponse.json({ error: "غير مصرح بهذه العملية" }, { status: 403 })
    }

    const results: any[] = []
    let totalTransferred = 0

    // نقل لكل مستخدم هدف
    for (const toUserId of to_user_ids) {
      // إنشاء سجل النقل
      const { data: transfer, error: transferError } = await supabase
        .from("permission_transfers")
        .insert({
          company_id,
          from_user_id,
          to_user_id: toUserId,
          resource_type,
          transferred_by: user.id,
          status: "pending",
          reason,
          notes
        })
        .select()
        .single()

      if (transferError) {
        results.push({ to_user_id: toUserId, error: transferError.message })
        continue
      }

      let recordsTransferred = 0
      const transferredIds: string[] = []

      // نقل العملاء (اختيارياً حسب الفرع: عملاء الفرع المنقول عنه فقط)
      if (resource_type === "customers" || resource_type === "all") {
        let customerQuery = supabase
          .from("customers")
          .select("id")
          .eq("company_id", company_id)
          .eq("created_by_user_id", from_user_id)
        if (branch_id) {
          customerQuery = customerQuery.eq("branch_id", branch_id)
        }
        const { data: customerIds } = await customerQuery

        if (customerIds?.length) {
          transferredIds.push(...customerIds.map((c: { id: string }) => c.id))

          let updateQuery = supabase
            .from("customers")
            .update({ created_by_user_id: toUserId })
            .eq("company_id", company_id)
            .eq("created_by_user_id", from_user_id)
          if (branch_id) {
            updateQuery = updateQuery.eq("branch_id", branch_id)
          }
          const { error: updateError } = await updateQuery

          if (!updateError) {
            recordsTransferred += customerIds.length
          }
        }
      }

      // نقل أوامر البيع (اختيارياً حسب الفرع)
      if (resource_type === "sales_orders" || resource_type === "all") {
        let orderQuery = supabase
          .from("sales_orders")
          .select("id")
          .eq("company_id", company_id)
          .eq("created_by_user_id", from_user_id)
        if (branch_id) {
          orderQuery = orderQuery.eq("branch_id", branch_id)
        }
        const { data: orderIds } = await orderQuery

        if (orderIds?.length) {
          transferredIds.push(...orderIds.map((o: { id: string }) => o.id))

          let updateOrderQuery = supabase
            .from("sales_orders")
            .update({ created_by_user_id: toUserId })
            .eq("company_id", company_id)
            .eq("created_by_user_id", from_user_id)
          if (branch_id) {
            updateOrderQuery = updateOrderQuery.eq("branch_id", branch_id)
          }
          const { error: updateError } = await updateOrderQuery

          if (!updateError) {
            recordsTransferred += orderIds.length
          }
        }
      }

      // تحديث سجل النقل
      await supabase
        .from("permission_transfers")
        .update({
          status: "completed",
          records_transferred: recordsTransferred,
          transfer_data: { record_ids: transferredIds }
        })
        .eq("id", transfer.id)

      // تسجيل في Audit Log
      await supabase.from("audit_logs").insert({
        company_id,
        user_id: user.id,
        action_type: "permission_transfer",
        resource_type: "permissions",
        resource_id: transfer.id,
        description: `نقل ${recordsTransferred} سجل من ${from_user_id} إلى ${toUserId}`,
        new_data: { from_user_id, to_user_id: toUserId, resource_type, records_transferred: recordsTransferred }
      })

      results.push({
        to_user_id: toUserId,
        transfer_id: transfer.id,
        records_transferred: recordsTransferred
      })
      totalTransferred += recordsTransferred
    }

    return NextResponse.json({
      success: true,
      total_transferred: totalTransferred,
      results
    })
  } catch (error: any) {
    console.error("Error transferring permissions:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

