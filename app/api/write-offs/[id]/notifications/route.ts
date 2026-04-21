import { NextRequest, NextResponse } from "next/server"

import { getActiveCompanyId } from "@/lib/company"
import { WriteOffNotificationService } from "@/lib/services/write-off-notification.service"
import { createClient } from "@/lib/supabase/server"

type WriteOffNotificationAction = "approval_requested" | "modified" | "rejected" | "cancelled"

async function getActorDisplayName(supabase: any, user: any) {
  try {
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("display_name, username")
      .eq("user_id", user.id)
      .maybeSingle()

    return profile?.display_name || profile?.username || user.email?.split("@")[0] || null
  } catch {
    return user.email?.split("@")[0] || null
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const companyId = await getActiveCompanyId(supabase)

    if (!companyId) {
      return NextResponse.json({ success: false, error: "Company not found" }, { status: 400 })
    }

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const action = String(body?.action || "") as WriteOffNotificationAction
    const appLang = body?.appLang === "en" ? "en" : "ar"
    const rejectionReason = body?.rejectionReason ? String(body.rejectionReason) : null
    const cancellationReason = body?.cancellationReason ? String(body.cancellationReason) : null

    if (!["approval_requested", "modified", "rejected", "cancelled"].includes(action)) {
      return NextResponse.json({ success: false, error: "Unsupported notification action" }, { status: 400 })
    }

    const { data: writeOff, error: writeOffError } = await supabase
      .from("inventory_write_offs")
      .select("id, write_off_number, status, branch_id, warehouse_id, cost_center_id, created_by")
      .eq("id", id)
      .eq("company_id", companyId)
      .single()

    if (writeOffError || !writeOff) {
      return NextResponse.json({ success: false, error: "Write-off not found" }, { status: 404 })
    }

    const notificationService = new WriteOffNotificationService(supabase)
    const actorDisplayName = await getActorDisplayName(supabase, user)

    if ((action === "approval_requested" || action === "modified") && writeOff.status !== "pending") {
      return NextResponse.json(
        { success: false, error: "Write-off must be pending for approval workflow notifications" },
        { status: 400 }
      )
    }

    if (action === "rejected" && writeOff.status !== "rejected") {
      return NextResponse.json(
        { success: false, error: "Write-off must be rejected before sending rejection notification" },
        { status: 400 }
      )
    }

    if (action === "cancelled" && writeOff.status !== "cancelled") {
      return NextResponse.json(
        { success: false, error: "Write-off must be cancelled before sending cancellation notification" },
        { status: 400 }
      )
    }

    switch (action) {
      case "approval_requested":
        await notificationService.notifyApprovalRequested({
          companyId,
          writeOffId: writeOff.id,
          writeOffNumber: writeOff.write_off_number,
          createdBy: user.id,
          branchId: writeOff.branch_id,
          warehouseId: writeOff.warehouse_id,
          costCenterId: writeOff.cost_center_id,
          appLang,
        })
        break

      case "modified":
        await notificationService.notifyModified({
          companyId,
          writeOffId: writeOff.id,
          writeOffNumber: writeOff.write_off_number,
          modifiedBy: user.id,
          branchId: writeOff.branch_id,
          warehouseId: writeOff.warehouse_id,
          costCenterId: writeOff.cost_center_id,
          appLang,
        })
        break

      case "rejected":
        await notificationService.notifyRejected({
          companyId,
          writeOffId: writeOff.id,
          writeOffNumber: writeOff.write_off_number,
          createdBy: writeOff.created_by || user.id,
          rejectedBy: user.id,
          rejectedByName: actorDisplayName,
          rejectionReason,
          branchId: writeOff.branch_id,
          warehouseId: writeOff.warehouse_id,
          costCenterId: writeOff.cost_center_id,
          appLang,
        })
        await notificationService.archiveApprovalNotifications({
          companyId,
          writeOffId: writeOff.id,
          branchId: writeOff.branch_id,
          warehouseId: writeOff.warehouse_id,
          costCenterId: writeOff.cost_center_id,
        })
        break

      case "cancelled":
        await notificationService.notifyCancelled({
          companyId,
          writeOffId: writeOff.id,
          writeOffNumber: writeOff.write_off_number,
          createdBy: writeOff.created_by || user.id,
          cancelledBy: user.id,
          cancelledByName: actorDisplayName,
          cancellationReason,
          branchId: writeOff.branch_id,
          warehouseId: writeOff.warehouse_id,
          costCenterId: writeOff.cost_center_id,
          appLang,
        })
        await notificationService.archiveApprovalNotifications({
          companyId,
          writeOffId: writeOff.id,
          branchId: writeOff.branch_id,
          warehouseId: writeOff.warehouse_id,
          costCenterId: writeOff.cost_center_id,
        })
        break
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("Error dispatching write-off workflow notification:", error)
    return NextResponse.json(
      { success: false, error: error?.message || "Failed to dispatch write-off workflow notification" },
      { status: 500 }
    )
  }
}
