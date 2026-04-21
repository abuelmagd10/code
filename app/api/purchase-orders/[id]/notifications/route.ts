import { NextRequest, NextResponse } from "next/server"

import { getActiveCompanyId } from "@/lib/company"
import { PurchaseOrderNotificationService } from "@/lib/services/purchase-order-notification.service"
import { createClient } from "@/lib/supabase/server"

type PurchaseOrderNotificationAction =
  | "approval_requested"
  | "approval_resubmitted"
  | "approved"
  | "rejected"

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
    const action = String(body?.action || "") as PurchaseOrderNotificationAction
    const appLang = body?.appLang === "en" ? "en" : "ar"
    const rejectionReason = body?.rejectionReason ? String(body.rejectionReason) : ""
    const linkedBillId = body?.linkedBillId ? String(body.linkedBillId) : null

    if (!["approval_requested", "approval_resubmitted", "approved", "rejected"].includes(action)) {
      return NextResponse.json({ success: false, error: "Unsupported notification action" }, { status: 400 })
    }

    const { data: po, error: poError } = await supabase
      .from("purchase_orders")
      .select("id, po_number, supplier_id, total_amount, currency, branch_id, cost_center_id, created_by_user_id, status, bill_id")
      .eq("id", id)
      .eq("company_id", companyId)
      .single()

    if (poError || !po) {
      return NextResponse.json({ success: false, error: "Purchase order not found" }, { status: 404 })
    }

    const { data: supplier } = await supabase
      .from("suppliers")
      .select("name")
      .eq("id", po.supplier_id)
      .maybeSingle()

    const supplierName = supplier?.name || "Unknown Supplier"
    const notificationService = new PurchaseOrderNotificationService(supabase)

    if ((action === "approval_requested" || action === "approval_resubmitted") && po.status !== "pending_approval") {
      return NextResponse.json(
        { success: false, error: "Purchase order must be pending approval before sending approval workflow notification" },
        { status: 400 }
      )
    }

    if (action === "approved" && po.status !== "approved") {
      return NextResponse.json(
        { success: false, error: "Purchase order must be approved before sending approval notification" },
        { status: 400 }
      )
    }

    if (action === "rejected" && po.status !== "rejected") {
      return NextResponse.json(
        { success: false, error: "Purchase order must be rejected before sending rejection notification" },
        { status: 400 }
      )
    }

    switch (action) {
      case "approval_requested":
      case "approval_resubmitted":
        await notificationService.notifyApprovalRequested({
          companyId,
          poId: po.id,
          poNumber: po.po_number,
          supplierName,
          amount: Number(po.total_amount || 0),
          currency: po.currency || "EGP",
          branchId: po.branch_id,
          costCenterId: po.cost_center_id,
          createdBy: po.created_by_user_id || user.id,
          appLang,
          isResubmission: action === "approval_resubmitted",
        })
        break

      case "approved":
        await notificationService.notifyApprovedWorkflow({
          companyId,
          poId: po.id,
          poNumber: po.po_number,
          supplierName,
          amount: Number(po.total_amount || 0),
          currency: po.currency || "EGP",
          branchId: po.branch_id,
          costCenterId: po.cost_center_id,
          createdBy: po.created_by_user_id || user.id,
          approvedBy: user.id,
          linkedBillId: linkedBillId || po.bill_id || null,
          appLang,
        })
        await notificationService.archiveApprovalRequestNotifications({
          companyId,
          poId: po.id,
          branchId: po.branch_id,
          costCenterId: po.cost_center_id,
        })
        break

      case "rejected":
        await notificationService.notifyRejected({
          companyId,
          poId: po.id,
          poNumber: po.po_number,
          supplierName,
          amount: Number(po.total_amount || 0),
          currency: po.currency || "EGP",
          branchId: po.branch_id,
          costCenterId: po.cost_center_id,
          createdBy: po.created_by_user_id || user.id,
          rejectedBy: user.id,
          reason: rejectionReason,
          appLang,
        })
        await notificationService.archiveApprovalRequestNotifications({
          companyId,
          poId: po.id,
          branchId: po.branch_id,
          costCenterId: po.cost_center_id,
        })
        break
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("Error dispatching purchase order workflow notification:", error)
    return NextResponse.json(
      { success: false, error: error?.message || "Failed to dispatch purchase order workflow notification" },
      { status: 500 }
    )
  }
}
