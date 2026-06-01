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

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const ALLOWED_ROLES = ["owner", "admin", "general_manager"] as const

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: transferId } = await params
    if (!transferId) {
      return NextResponse.json({ error: "transfer id مفقود" }, { status: 400 })
    }

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

    // Two-eye principle
    if (transfer.transferred_by === user.id) {
      return NextResponse.json(
        { error: "لا يُمكنك اعتماد طَلَب قَدّمته بنفسك. يَحتاج مُعتَمِد آخر." },
        { status: 403 }
      )
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

    // Atomic execute
    const { data: execResult, error: execErr } = await supabase
      .rpc("execute_permission_transfer", { p_transfer_id: transferId })

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
      description: `اعتُمد نَقل ملكية (${transfer.resource_type}) وتُنفّذ ${(execResult as any)?.records_transferred || 0} سجل`,
      new_data: execResult,
    })

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
