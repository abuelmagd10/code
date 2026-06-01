/**
 * POST /api/permissions/transfer/[id]/reject
 * Body: { reason: string }
 *
 * Rejects a pending permission_transfer. No customers/sales_orders rows
 * are touched. Records rejected_by, rejected_at, and rejected_reason
 * for the audit trail. Same two-eye principle as approve — initiator
 * cannot reject their own request (since rejecting your own is just
 * deleting/cancelling, which is fine, but for governance symmetry we
 * require a second pair of eyes; if you want to cancel your own, we
 * can add a separate /cancel endpoint later).
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

    const body = await request.json().catch(() => ({}))
    const reason = String(body?.reason || "").trim()
    if (!reason) {
      return NextResponse.json(
        { error: "سَبَب الرفض مَطلوب" },
        { status: 400 }
      )
    }

    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll() { return cookieStore.getAll() } } }
    )

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "غير مصرح" }, { status: 401 })

    const { data: transfer, error: tErr } = await supabase
      .from("permission_transfers")
      .select("id, company_id, transferred_by, status, resource_type")
      .eq("id", transferId)
      .single()

    if (tErr || !transfer) {
      return NextResponse.json({ error: "طَلَب النَّقل غير موجود" }, { status: 404 })
    }

    if (transfer.status !== "pending") {
      return NextResponse.json(
        { error: `لا يُمكن رفض طَلَب فى حالة "${transfer.status}"` },
        { status: 409 }
      )
    }

    const { data: member } = await supabase
      .from("company_members")
      .select("role")
      .eq("company_id", transfer.company_id)
      .eq("user_id", user.id)
      .single()

    if (!member || !ALLOWED_ROLES.includes(member.role)) {
      return NextResponse.json({ error: "غير مصرح بالرفض" }, { status: 403 })
    }

    if (transfer.transferred_by === user.id) {
      return NextResponse.json(
        { error: "لا يُمكنك رفض طَلَب قَدّمته بنفسك" },
        { status: 403 }
      )
    }

    const { error: updErr } = await supabase
      .from("permission_transfers")
      .update({
        status: "rejected",
        rejected_by: user.id,
        rejected_at: new Date().toISOString(),
        rejected_reason: reason,
      })
      .eq("id", transferId)
      .eq("status", "pending")

    if (updErr) {
      return NextResponse.json({ error: updErr.message }, { status: 500 })
    }

    await supabase.from("audit_logs").insert({
      company_id: transfer.company_id,
      user_id: user.id,
      action_type: "permission_transfer_rejected",
      resource_type: "permissions",
      resource_id: transferId,
      description: `رُفض نَقل ملكية (${transfer.resource_type}) — السَّبَب: ${reason}`,
      new_data: { reason },
    })

    return NextResponse.json({ success: true, transfer_id: transferId })
  } catch (e: any) {
    console.error("[permissions/transfer/reject]", e)
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 })
  }
}
