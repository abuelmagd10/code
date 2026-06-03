import { NextRequest, NextResponse } from "next/server"
import { createClient as createServerClient } from "@/lib/supabase/server"
import { createClient } from "@supabase/supabase-js"
import { secureApiRequest, serverError, badRequestError } from "@/lib/api-security-enhanced"
import { asyncAuditLog } from "@/lib/core"
import {
  SALES_RETURN_LEVEL1_APPROVER_ROLES,
  SALES_RETURN_REQUEST_STATUSES,
  isSalesReturnPendingLevel1,
} from "@/lib/sales-return-requests"
import { notifySalesReturnRequesterRejected } from "@/lib/sales-return-request-notifications"
import { archiveApprovalNotificationsForRecord } from "@/lib/notifications/archive-on-action"

/**
 * PATCH /api/sales-return-requests/[id]/reject
 * رفض الإدارة/المالية لطلب المرتجع مع سبب إلزامي
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const authSupabase = await createServerClient()
    const { user, companyId, member, error: authErr } = await secureApiRequest(req, {
      requireAuth: true,
      requireCompany: true,
      requirePermission: { resource: "invoices", action: "write" },
      supabase: authSupabase
    })
    if (authErr) return authErr
    if (!companyId) return badRequestError("معرف الشركة مطلوب")

    if (!member || !SALES_RETURN_LEVEL1_APPROVER_ROLES.includes(member.role as any)) {
      return NextResponse.json({ error: "غير مصرح لك بالرفض الإداري" }, { status: 403 })
    }

    const body = await req.json()
    const rejectionReason = String(body?.rejection_reason || "").trim()
    if (rejectionReason.length < 5) {
      return badRequestError("سبب الرفض إلزامي ويجب أن يكون على الأقل 5 أحرف")
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const { data: request, error: reqErr } = await supabase
      .from("sales_return_requests")
      .select(`
        id,
        status,
        invoice_id,
        company_id,
        branch_id,
        requested_by,
        invoices:invoice_id (invoice_number, branch_id)
      `)
      .eq("id", id)
      .eq("company_id", companyId)
      .maybeSingle()

    if (reqErr || !request) {
      return NextResponse.json({ error: "الطلب غير موجود" }, { status: 404 })
    }

    if (!isSalesReturnPendingLevel1(request.status)) {
      return NextResponse.json({ error: "الطلب ليس بمرحلة اعتماد الإدارة" }, { status: 409 })
    }

    const requestInvoice = Array.isArray(request.invoices) ? request.invoices[0] : request.invoices
    const requestBranchId = request.branch_id || requestInvoice?.branch_id || null
    if ((member.role === "manager" || member.role === "accountant") && member.branch_id && requestBranchId && member.branch_id !== requestBranchId) {
      return NextResponse.json({ error: "غير مصرح لك برفض طلبات فروع أخرى" }, { status: 403 })
    }

    const reviewedAt = new Date().toISOString()

    const { error: updateErr } = await supabase
      .from("sales_return_requests")
      .update({
        status: SALES_RETURN_REQUEST_STATUSES.rejectedLevel1,
        rejection_reason: rejectionReason,
        reviewed_by: user?.id,
        reviewed_at: reviewedAt,
        level_1_reviewed_by: user?.id,
        level_1_reviewed_at: reviewedAt,
        level_1_rejection_reason: rejectionReason,
      })
      .eq("id", id)
      .eq("company_id", companyId)

    if (updateErr) {
      return serverError(`فشل في تحديث الطلب: ${updateErr.message}`)
    }

    // v3.74.18 — Archive pending approval-category notifications for this
    // workflow record now that the action is committed. Runs BEFORE any
    // follow-up "result" notification we send to the creator below, so the
    // new one isn't archived too.
    await archiveApprovalNotificationsForRecord({
      supabase,
      companyId,
      referenceType: "sales_return_request",
      referenceId: id,
    })

    if (request.requested_by) {
      try {
        await notifySalesReturnRequesterRejected(supabase as any, {
          companyId,
          requestId: id,
          invoiceNumber: requestInvoice?.invoice_number || request.invoice_id,
          requesterUserId: request.requested_by,
          createdBy: user?.id || "",
          branchId: requestBranchId,
          reason: rejectionReason,
          stage: "level_1",
        })
      } catch (notifErr: any) {
        console.error("⚠️ [SRR] Requester rejection notification failed:", notifErr.message)
      }
    }

    asyncAuditLog({
      companyId,
      userId: user?.id || "",
      userEmail: user?.email,
      action: "UPDATE",
      table: "sales_return_requests",
      recordId: id,
      recordIdentifier: requestInvoice?.invoice_number || request.invoice_id,
      oldData: { status: request.status },
      newData: {
        status: SALES_RETURN_REQUEST_STATUSES.rejectedLevel1,
        level_1_rejection_reason: rejectionReason,
      },
      reason: "Sales return request rejected at level 1"
    })

    return NextResponse.json({ success: true, message: "تم رفض الطلب إدارياً" })

  } catch (error: any) {
    return serverError(`خطأ في رفض الطلب: ${error.message}`)
  }
}
