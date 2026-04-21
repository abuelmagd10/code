import { NextRequest, NextResponse } from "next/server"

import { getActiveCompanyId } from "@/lib/company"
import { FinancialDocumentNotificationService } from "@/lib/services/financial-document-notification.service"
import { createClient } from "@/lib/supabase/server"

type VendorRefundNotificationAction = "approved" | "rejected"

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

    const body = await request.json().catch(() => ({}))
    const action = String(body?.action || "") as VendorRefundNotificationAction
    const appLang = body?.appLang === "en" ? "en" : "ar"
    const rejectionReason = body?.rejectionReason ? String(body.rejectionReason) : null

    if (!["approved", "rejected"].includes(action)) {
      return NextResponse.json({ success: false, error: "Unsupported notification action" }, { status: 400 })
    }

    const { data: requestRow, error: requestError } = await supabase
      .from("vendor_refund_requests")
      .select("id, status, branch_id")
      .eq("company_id", companyId)
      .eq("id", id)
      .maybeSingle()

    if (requestError || !requestRow) {
      return NextResponse.json({ success: false, error: "Vendor refund request not found" }, { status: 404 })
    }

    if (action === "approved" && requestRow.status !== "approved") {
      return NextResponse.json(
        { success: false, error: "Vendor refund request must be approved before sending approval notification" },
        { status: 400 }
      )
    }

    if (action === "rejected" && requestRow.status !== "rejected") {
      return NextResponse.json(
        { success: false, error: "Vendor refund request must be rejected before sending rejection notification" },
        { status: 400 }
      )
    }

    const notificationService = new FinancialDocumentNotificationService(supabase)
    await notificationService.notifyVendorRefundDecision({
      companyId,
      actorUserId: user.id,
      requestId: id,
      action,
      rejectionReason,
      appLang,
    })

    await notificationService.archiveVendorRefundApprovalNotifications({
      companyId,
      requestId: id,
      branchId: requestRow.branch_id,
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("Error dispatching vendor-refund decision notification:", error)
    return NextResponse.json(
      { success: false, error: error?.message || "Failed to dispatch vendor-refund notification" },
      { status: 500 }
    )
  }
}
