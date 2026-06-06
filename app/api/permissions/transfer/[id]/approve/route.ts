/**
 * POST /api/permissions/transfer/[id]/approve
 *
 * Approves a pending permission_transfer and atomically rewrites the
 * customers/sales_orders ownership rows via the DB function
 * execute_permission_transfer().
 *
 * Two-eye principle (v3.73.0): the user calling Approve MUST be different
 * from the user who initiated the transfer (`transferred_by`). The check
 * is enforced both in this route and would be doubly enforced by future
 * DB-level RLS — keeping the route check primary so we get a clean Arabic
 * error message instead of a generic 403.
 *
 * Only owner / admin / general_manager can approve. (Manager removed in
 * v3.70.0 per the v3.67.0 read-only spec.)
 */
import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { archiveApprovalNotificationsForRecord } from "@/lib/notifications/archive-on-action"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// v3.74.67 — tightened: only Owner + General Manager can approve/reject
// permission transfers. Admin removed at the user's explicit request.
const ALLOWED_ROLES = ["owner", "general_manager"] as const

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: transferId } = await params
    if (!transferId) {
      return NextResponse.json({ error: "transfer id مفقود" }, { status: 400 })
    }

    // v3.73.2 — Mode: 'snapshot' (default, transfer the IDs captured at submit
    // time) or 'dynamic' (transfer everything the source user currently owns).
    const body = await request.json().catch(() => ({}))
    const mode: "snapshot" | "dynamic" =
      body?.mode === "dynamic" ? "dynamic" : "snapshot"

    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll() { return cookieStore.getAll() } } }
    )

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "غير مصرح" }, { status: 401 })

    // Pull the transfer
    const { data: transfer, error: tErr } = await supabase
      .from("permission_transfers")
      .select("id, company_id, transferred_by, from_user_id, to_user_id, resource_type, status")
      .eq("id", transferId)
      .single()

    if (tErr || !transfer) {
      return NextResponse.json({ error: "طَلَب النَّقل غير موجود" }, { status: 404 })
    }

    if (transfer.status !== "pending") {
      return NextResponse.json(
        { error: `لا يُمكن اعتماد طَلَب فى حالة "${transfer.status}"` },
        { status: 409 }
      )
    }

    // Role gate
    const { data: member } = await supabase
      .from("company_members")
      .select("role")
      .eq("company_id", transfer.company_id)
      .eq("user_id", user.id)
      .single()

    if (!member || !ALLOWED_ROLES.includes(member.role)) {
      return NextResponse.json({ error: "غير مصرح بالاعتماد" }, { status: 403 })
    }

    // Two-eye principle — with single-owner exemption (v3.74.67).
    // If the submitter is also the *only* senior in the company, blocking
    // them creates an unresolvable deadlock (nobody else has the right
    // role to act). In that case we let them self-approve but log it so
    // the audit trail makes the exemption visible.
    let singleOwnerExemption = false
    if (transfer.transferred_by === user.id) {
      const { count: seniorCount } = await supabase
        .from("company_members")
        .select("user_id", { count: "exact", head: true })
        .eq("company_id", transfer.company_id)
        .in("role", ALLOWED_ROLES)

      if ((seniorCount ?? 0) > 1) {
        return NextResponse.json(
          { error: "لا يُمكنك اعتماد طَلَب قَدّمته بنفسك. يَحتاج مُعتَمِد آخر." },
          { status: 403 }
        )
      }
      // Otherwise: single senior in the whole company — exemption applies.
      singleOwnerExemption = true
    }

    // Mark approved
    const { error: appErr } = await supabase
      .from("permission_transfers")
      .update({
        status: "approved",
        approved_by: user.id,
        approved_at: new Date().toISOString(),
      })
      .eq("id", transferId)
      .eq("status", "pending") // optimistic concurrency

    if (appErr) {
      return NextResponse.json({ error: appErr.message }, { status: 500 })
    }

    // v3.74.18 — Archive pending approval-category notifications for this
    // workflow record now that the action is committed. Runs BEFORE any
    // follow-up "result" notification we send to the creator below, so the
    // new one isn't archived too.
    await archiveApprovalNotificationsForRecord({
      supabase,
      companyId: transfer.company_id,
      referenceType: "permission_transfer",
      referenceId: transferId,
    })

    // Atomic execute — v3.73.2 passes the chosen mode
    const { data: execResult, error: execErr } = await supabase
      .rpc("execute_permission_transfer", {
        p_transfer_id: transferId,
        p_mode: mode,
      })

    if (execErr) {
      // Rollback approval flag
      await supabase
        .from("permission_transfers")
        .update({ status: "failed", approved_by: null, approved_at: null })
        .eq("id", transferId)

      return NextResponse.json({ error: execErr.message }, { status: 500 })
    }

    // Audit
    await supabase.from("audit_logs").insert({
      company_id: transfer.company_id,
      user_id: user.id,
      action_type: "permission_transfer_approved",
      resource_type: "permissions",
      resource_id: transferId,
      description: `اعتُمد نَقل ملكية (${transfer.resource_type}) بنَطاق "${mode === 'snapshot' ? 'مُسَجَّل' : 'حالى'}" — نُفِّذ ${(execResult as any)?.records_transferred || 0} سجل${singleOwnerExemption ? ' — اعتماد ذاتى (المالك الوَحيد)' : ''}`,
      new_data: { ...(execResult as any), single_owner_exemption: singleOwnerExemption },
    })

    // v3.74.23 — Notify the originator (the submitter who filed this
    // transfer request) that their request was approved and executed.
    // Without this the submitter would only learn the outcome by
    // refreshing the permission-transfers page. Failures swallowed —
    // the transfer is already committed; the notification is UX-only.
    try {
      await supabase.from("notifications").insert({
        company_id: transfer.company_id,
        reference_type: "permission_transfer",
        reference_id: transferId,
        title: "تم اعتماد طلب نقل الصلاحيات",
        message: `تم اعتماد وتنفيذ طلب نقل ملكية (${transfer.resource_type}). تم نقل ${(execResult as any)?.records_transferred || 0} سجل بنجاح.`,
        created_by: user.id,
        assigned_to_user: transfer.transferred_by,
        priority: "normal",
        severity: "info",
        category: "approvals",
        event_key: `permission_transfer:${transferId}:approved:user:${transfer.transferred_by}`,
        status: "unread",
      })
    } catch {
      // non-critical
    }

    return NextResponse.json({
      success: true,
      transfer_id: transferId,
      result: execResult,
    })
  } catch (e: any) {
    console.error("[permissions/transfer/approve]", e)
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 })
  }
}
