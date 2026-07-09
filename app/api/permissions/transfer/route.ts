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
      // v3.74.63 — operator can hand-pick specific customer IDs to transfer.
      // When omitted/empty, we fall back to "all customers owned by the source"
      // (legacy behaviour). Only honoured when resource_type === "customers".
      customer_ids,
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

    // 🔐 v3.74.67 — Tightened: only Owner + General Manager can use the
    // permission transfer/share workflow. Admin removed at the user's
    // explicit request — keep this surface narrow.
    const allowedRoles = ["owner", "general_manager"]
    if (!member || !allowedRoles.includes(member.role)) {
      return NextResponse.json({ error: "غير مصرح بهذه العملية" }, { status: 403 })
    }

    // 🔐 v3.73.0 — Two-eye approval workflow.
    // POST no longer executes the ownership rewrite. It inserts the transfer
    // request as status='pending' and waits for a DIFFERENT owner/admin to
    // call /api/permissions/transfer/[id]/approve. That endpoint runs the
    // atomic execute_permission_transfer() DB function.
    // v3.73.2 — Capture snapshot of current owned IDs so the approver can
    // later choose between snapshot mode (only these IDs) and dynamic mode
    // (whatever the source user owns at approve time).
    let snapCustomerIds: string[] = []
    let snapSalesOrderIds: string[] = []

    if (resource_type === "customers" || resource_type === "all") {
      // v3.74.63 — if the operator hand-picked specific customer IDs, intersect
      // them with what the source ACTUALLY owns (server-side safety check —
      // never trust the client to send IDs the source doesn't own).
      const handPicked = Array.isArray(customer_ids)
        ? customer_ids.filter((id: any) => typeof id === "string" && id.length > 0)
        : []
      let q = supabase
        .from("customers")
        .select("id")
        .eq("company_id", company_id)
        .eq("created_by_user_id", from_user_id)
      if (branch_id) q = q.eq("branch_id", branch_id)
      if (handPicked.length > 0 && resource_type === "customers") {
        q = q.in("id", handPicked)
      }
      const { data } = await q
      snapCustomerIds = (data || []).map((r: { id: string }) => r.id)
    }

    if (resource_type === "sales_orders" || resource_type === "all") {
      let q = supabase
        .from("sales_orders")
        .select("id")
        .eq("company_id", company_id)
        .eq("created_by_user_id", from_user_id)
      if (branch_id) q = q.eq("branch_id", branch_id)
      const { data } = await q
      snapSalesOrderIds = (data || []).map((r: { id: string }) => r.id)
    }

    const transferData: Record<string, any> = {
      snapshot_customer_ids:     snapCustomerIds,
      snapshot_sales_order_ids:  snapSalesOrderIds,
      snapshot_taken_at:         new Date().toISOString(),
    }
    if (branch_id) transferData.branch_id = branch_id

    const results: any[] = []

    for (const toUserId of to_user_ids) {
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
          notes,
          transfer_data: transferData,
        })
        .select()
        .single()

      if (transferError) {
        results.push({ to_user_id: toUserId, error: transferError.message })
        continue
      }

      // Audit log — the REQUEST was filed (not yet executed)
      await supabase.from("audit_logs").insert({
        company_id,
        user_id: user.id,
        action_type: "permission_transfer_requested",
        resource_type: "permissions",
        resource_id: transfer.id,
        description: `طُلِب نَقل ملكية (${resource_type}) من ${from_user_id} إلى ${toUserId} — بانتظار اعتماد`,
        new_data: { from_user_id, to_user_id: toUserId, resource_type, branch_id: branch_id || null }
      })

      // v3.74.66 — Two-eye rule. Previously we inserted one notification
      // per *role* (assigned_to_role), which meant the submitter (if a
      // senior themselves) got back their own request. Now we look up
      // each individual approver from company_members, EXCLUDE the
      // submitter, and insert a per-user notification (assigned_to_user).
      const approverRoles = ["owner", "admin", "general_manager"]
      try {
        const { data: approvers } = await supabase
          .from("company_members")
          .select("user_id, role")
          .eq("company_id", company_id)
          .in("role", approverRoles)

        const approverIds = (approvers || [])
          .map((m: { user_id: string }) => m.user_id)
          .filter((uid: string) => uid && uid !== user.id)

        for (const approverId of approverIds) {
          try {
            await supabase.from("notifications").insert({
              company_id,
              reference_type: "permission_transfer",
              reference_id: transfer.id,
              title: "طلب نقل صلاحيات بانتظار الاعتماد",
              message: `يوجد طلب نقل ملكية (${resource_type}) بانتظار اعتمادك من مَسؤول آخر — قاعدة العَين الاثنتين.`,
              created_by: user.id,
              assigned_to_user: approverId,
              priority: "high",
              severity: "warning",
              category: "approvals",
              event_key: `permission_transfer:${transfer.id}:pending:user:${approverId}`,
              status: "unread",
              // v3.74.588 — طلب نقل صلاحيات بانتظار اعتماد مسؤول ثانٍ (مرحلة طلب)
              kind: "action",
            })
          } catch {
            // per-approver failure is non-critical; keep notifying others.
          }
        }
      } catch {
        // approver lookup failed entirely; transfer is still recorded.
      }

      results.push({
        to_user_id: toUserId,
        transfer_id: transfer.id,
        status: "pending",
      })
    }

    return NextResponse.json({
      success: true,
      pending: results.length,
      results,
      message: "تم تَسجيل طَلَب النَقل — بانتظار اعتماد من مَسؤول آخر (مَبدأ العَين الاثنتين)",
    })
  } catch (error: any) {
    console.error("Error transferring permissions:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

