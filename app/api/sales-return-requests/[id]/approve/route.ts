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
import { notifySalesReturnWarehouseRequested } from "@/lib/sales-return-request-notifications"

/**
 * PATCH /api/sales-return-requests/[id]/approve
 * اعتماد الإدارة/المالية فقط ونقل الطلب إلى اعتماد المخزن
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
      return NextResponse.json({ error: "غير مصرح لك بالاعتماد الإداري" }, { status: 403 })
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

    if (!isSalesReturnPendingLevel1(request.status)) {
      return NextResponse.json({ error: "الطلب ليس بمرحلة اعتماد الإدارة" }, { status: 409 })
    }

    const requestInvoice = Array.isArray(request.invoices) ? request.invoices[0] : request.invoices
    const requestBranchId = request.branch_id || requestInvoice?.branch_id || null
    if ((member.role === "manager" || member.role === "accountant") && member.branch_id && requestBranchId && member.branch_id !== requestBranchId) {
      return NextResponse.json({ error: "غير مصرح لك باعتماد طلبات فروع أخرى" }, { status: 403 })
    }

    const requestWarehouseId = request.warehouse_id || requestInvoice?.warehouse_id || null
    if (!requestWarehouseId) {
      return NextResponse.json({ error: "لا يوجد مخزن محدد لهذا الطلب" }, { status: 400 })
    }

    const reviewedAt = new Date().toISOString()

    const { error: updateErr } = await supabase
      .from("sales_return_requests")
      .update({
        status: SALES_RETURN_REQUEST_STATUSES.pendingWarehouse,
        reviewed_by: user?.id,
        reviewed_at: reviewedAt,
        level_1_reviewed_by: user?.id,
        level_1_reviewed_at: reviewedAt,
        level_1_rejection_reason: null,
        rejection_reason: null,
      })
      .eq("id", id)
      .eq("company_id", companyId)

    if (updateErr) {
      return serverError(`فشل في تحديث الطلب: ${updateErr.message}`)
    }

    try {
      await notifySalesReturnWarehouseRequested(supabase as any, {
        companyId,
        requestId: id,
        invoiceNumber: requestInvoice?.invoice_number || request.invoice_id,
        createdBy: user?.id || "",
        branchId: requestBranchId,
        warehouseId: requestWarehouseId,
      })
    } catch (notifErr: any) {
      console.error("⚠️ [SRR] Warehouse notification failed:", notifErr.message)
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
        status: SALES_RETURN_REQUEST_STATUSES.pendingWarehouse,
        level_1_reviewed_by: user?.id,
        level_1_reviewed_at: reviewedAt,
      },
      reason: "Sales return request level 1 approved"
    })

    return NextResponse.json({
      success: true,
      message: "تم اعتماد الطلب إدارياً وتحويله إلى مسؤول المخزن"
    })

  } catch (error: any) {
    return serverError(`خطأ في اعتماد الطلب: ${error.message}`)
  }
}
