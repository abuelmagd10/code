import { NextRequest, NextResponse } from "next/server"
import { createClient as createServerClient } from "@/lib/supabase/server"
import { createClient } from "@supabase/supabase-js"
import { secureApiRequest, serverError, badRequestError } from "@/lib/api-security-enhanced"
import { asyncAuditLog } from "@/lib/core"
import {
  SALES_RETURN_REQUEST_STATUSES,
  SALES_RETURN_WAREHOUSE_ROLES,
  isSalesReturnPendingWarehouse,
} from "@/lib/sales-return-requests"
import {
  notifySalesReturnManagementRejectedByWarehouse,
  notifySalesReturnRequesterRejected,
} from "@/lib/sales-return-request-notifications"

/**
 * PATCH /api/sales-return-requests/[id]/warehouse-reject
 * رفض مسؤول المخزن لاستلام المرتجع مع سبب إلزامي
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

    if (!member || !SALES_RETURN_WAREHOUSE_ROLES.includes(member.role as any)) {
      return NextResponse.json({ error: "غير مصرح لك برفض اعتماد المخزن" }, { status: 403 })
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
        *,
        invoices:invoice_id (
          invoice_number,
          branch_id,
          warehouse_id
        )
      `)
      .eq("id", id)
      .eq("company_id", companyId)
      .maybeSingle()

    if (reqErr || !request) {
      return NextResponse.json({ error: "الطلب غير موجود" }, { status: 404 })
    }

    if (!isSalesReturnPendingWarehouse(request.status)) {
      return NextResponse.json({ error: "الطلب ليس بمرحلة اعتماد المخزن" }, { status: 409 })
    }

    const requestInvoice = Array.isArray(request.invoices) ? request.invoices[0] : request.invoices
    const requestWarehouseId = request.warehouse_id || requestInvoice?.warehouse_id || null
    const requestBranchId = request.branch_id || requestInvoice?.branch_id || null

    if (requestWarehouseId && member.warehouse_id && member.warehouse_id !== requestWarehouseId) {
      return NextResponse.json({ error: "غير مصرح لك برفض طلبات مخزن آخر" }, { status: 403 })
    }
    if (!member.warehouse_id && member.branch_id && requestBranchId && member.branch_id !== requestBranchId) {
      return NextResponse.json({ error: "غير مصرح لك برفض طلبات فرع آخر" }, { status: 403 })
    }

    const reviewedAt = new Date().toISOString()
    const { error: updateErr } = await supabase
      .from("sales_return_requests")
      .update({
        status: SALES_RETURN_REQUEST_STATUSES.rejectedWarehouse,
        warehouse_reviewed_by: user?.id,
        warehouse_reviewed_at: reviewedAt,
        warehouse_rejection_reason: rejectionReason,
      })
      .eq("id", id)
      .eq("company_id", companyId)

    if (updateErr) {
      return serverError(`فشل في تحديث الطلب: ${updateErr.message}`)
    }

    try {
      if (request.requested_by) {
        await notifySalesReturnRequesterRejected(supabase as any, {
          companyId,
          requestId: id,
          invoiceNumber: requestInvoice?.invoice_number || request.invoice_id,
          requesterUserId: request.requested_by,
          createdBy: user?.id || "",
          branchId: requestBranchId,
          warehouseId: requestWarehouseId,
          reason: rejectionReason,
          stage: "warehouse",
        })
      }
      await notifySalesReturnManagementRejectedByWarehouse(supabase as any, {
        companyId,
        requestId: id,
        invoiceNumber: requestInvoice?.invoice_number || request.invoice_id,
        createdBy: user?.id || "",
        branchId: requestBranchId,
        warehouseId: requestWarehouseId,
        reason: rejectionReason,
      })
    } catch (notifErr: any) {
      console.error("⚠️ [SRR] Warehouse rejection notifications failed:", notifErr.message)
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
        status: SALES_RETURN_REQUEST_STATUSES.rejectedWarehouse,
        warehouse_rejection_reason: rejectionReason,
        warehouse_reviewed_by: user?.id,
      },
      reason: "Sales return request rejected by warehouse"
    })

    return NextResponse.json({ success: true, message: "تم رفض الطلب من المخزن" })

  } catch (error: any) {
    return serverError(`خطأ في رفض الطلب من المخزن: ${error.message}`)
  }
}
