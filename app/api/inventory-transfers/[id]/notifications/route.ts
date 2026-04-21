import { NextRequest, NextResponse } from "next/server"

import { getActiveCompanyId } from "@/lib/company"
import { InventoryTransferNotificationService } from "@/lib/services/inventory-transfer-notification.service"
import { createClient } from "@/lib/supabase/server"

type InventoryTransferNotificationAction =
  | "approval_requested"
  | "approval_resubmitted"
  | "modified"
  | "approved"
  | "rejected"
  | "destination_request_created"
  | "destination_started"
  | "started"
  | "received"

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
    const action = String(body?.action || "") as InventoryTransferNotificationAction
    const appLang = body?.appLang === "en" ? "en" : "ar"
    const rejectionReason = body?.rejectionReason ? String(body.rejectionReason) : null

    if (
      ![
        "approval_requested",
        "approval_resubmitted",
        "modified",
        "approved",
        "rejected",
        "destination_request_created",
        "destination_started",
        "started",
        "received",
      ].includes(action)
    ) {
      return NextResponse.json({ success: false, error: "Unsupported notification action" }, { status: 400 })
    }

    const { data: transfer, error: transferError } = await supabase
      .from("inventory_transfers")
      .select(
        "id, transfer_number, status, source_branch_id, destination_branch_id, destination_warehouse_id, created_by"
      )
      .eq("id", id)
      .eq("company_id", companyId)
      .single()

    if (transferError || !transfer) {
      return NextResponse.json({ success: false, error: "Transfer not found" }, { status: 404 })
    }

    const notificationService = new InventoryTransferNotificationService(supabase)
    const actorDisplayName = await getActorDisplayName(supabase, user)

    if ((action === "approval_requested" || action === "approval_resubmitted") && transfer.status !== "pending_approval") {
      return NextResponse.json(
        { success: false, error: "Transfer must be pending approval before sending approval request notification" },
        { status: 400 }
      )
    }

    if (action === "approved" && transfer.status !== "pending") {
      return NextResponse.json(
        { success: false, error: "Transfer must be pending after approval before sending approval notification" },
        { status: 400 }
      )
    }

    if (action === "rejected" && transfer.status !== "draft") {
      return NextResponse.json(
        { success: false, error: "Transfer must return to draft before sending rejection notification" },
        { status: 400 }
      )
    }

    if (action === "destination_request_created" && transfer.status !== "pending") {
      return NextResponse.json(
        { success: false, error: "Transfer must be pending before sending destination request notification" },
        { status: 400 }
      )
    }

    if (action === "destination_started" && transfer.status !== "in_transit") {
      return NextResponse.json(
        { success: false, error: "Transfer must be in transit before sending destination-started notification" },
        { status: 400 }
      )
    }

    if (action === "started" && transfer.status !== "in_transit") {
      return NextResponse.json(
        { success: false, error: "Transfer must be in transit before sending started notification" },
        { status: 400 }
      )
    }

    if (action === "received" && transfer.status !== "received") {
      return NextResponse.json(
        { success: false, error: "Transfer must be received before sending receive notification" },
        { status: 400 }
      )
    }

    switch (action) {
      case "approval_requested":
      case "approval_resubmitted":
        await notificationService.notifyApprovalRequested({
          companyId,
          transferId: transfer.id,
          transferNumber: transfer.transfer_number,
          sourceBranchId: transfer.source_branch_id,
          destinationBranchId: transfer.destination_branch_id,
          destinationWarehouseId: transfer.destination_warehouse_id,
          createdBy: transfer.created_by || user.id,
          createdByName: actorDisplayName,
          appLang,
          isResubmission: action === "approval_resubmitted",
        })
        break

      case "modified":
        await notificationService.notifyModified({
          companyId,
          transferId: transfer.id,
          transferNumber: transfer.transfer_number,
          sourceBranchId: transfer.source_branch_id,
          destinationBranchId: transfer.destination_branch_id,
          destinationWarehouseId: transfer.destination_warehouse_id,
          modifiedBy: user.id,
          modifiedByName: actorDisplayName,
          appLang,
        })
        break

      case "approved":
        await notificationService.notifyApproved({
          companyId,
          transferId: transfer.id,
          transferNumber: transfer.transfer_number,
          sourceBranchId: transfer.source_branch_id,
          destinationBranchId: transfer.destination_branch_id,
          destinationWarehouseId: transfer.destination_warehouse_id,
          createdBy: transfer.created_by || user.id,
          approvedBy: user.id,
          approvedByName: actorDisplayName,
          appLang,
        })
        break

      case "rejected":
        await notificationService.notifyRejected({
          companyId,
          transferId: transfer.id,
          transferNumber: transfer.transfer_number,
          sourceBranchId: transfer.source_branch_id,
          destinationBranchId: transfer.destination_branch_id,
          destinationWarehouseId: transfer.destination_warehouse_id,
          createdBy: transfer.created_by || user.id,
          rejectedBy: user.id,
          rejectedByName: actorDisplayName,
          rejectionReason,
          appLang,
        })
        break

      case "destination_request_created":
        await notificationService.notifyDestinationRequestCreated({
          companyId,
          transferId: transfer.id,
          transferNumber: transfer.transfer_number,
          sourceBranchId: transfer.source_branch_id,
          destinationBranchId: transfer.destination_branch_id,
          destinationWarehouseId: transfer.destination_warehouse_id,
          createdBy: user.id,
          appLang,
        })
        break

      case "destination_started":
        await notificationService.notifyDestinationTransferStarted({
          companyId,
          transferId: transfer.id,
          transferNumber: transfer.transfer_number,
          sourceBranchId: transfer.source_branch_id,
          destinationBranchId: transfer.destination_branch_id,
          destinationWarehouseId: transfer.destination_warehouse_id,
          createdBy: user.id,
          appLang,
        })
        break

      case "started":
        await notificationService.notifyStarted({
          companyId,
          transferId: transfer.id,
          transferNumber: transfer.transfer_number,
          sourceBranchId: transfer.source_branch_id,
          destinationBranchId: transfer.destination_branch_id,
          destinationWarehouseId: transfer.destination_warehouse_id,
          createdBy: transfer.created_by || user.id,
          startedBy: user.id,
          startedByName: actorDisplayName,
          appLang,
        })
        break

      case "received":
        await notificationService.notifyReceived({
          companyId,
          transferId: transfer.id,
          transferNumber: transfer.transfer_number,
          sourceBranchId: transfer.source_branch_id,
          destinationBranchId: transfer.destination_branch_id,
          destinationWarehouseId: transfer.destination_warehouse_id,
          createdBy: transfer.created_by || user.id,
          receivedBy: user.id,
          receivedByName: actorDisplayName,
          appLang,
        })
        break
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("Error dispatching inventory transfer workflow notification:", error)
    return NextResponse.json(
      { success: false, error: error?.message || "Failed to dispatch inventory transfer workflow notification" },
      { status: 500 }
    )
  }
}
