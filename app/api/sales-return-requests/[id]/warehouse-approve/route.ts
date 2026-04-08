import { NextRequest, NextResponse } from "next/server"
import { createClient as createServerClient } from "@/lib/supabase/server"
import { createClient } from "@supabase/supabase-js"
import { secureApiRequest, serverError, badRequestError } from "@/lib/api-security-enhanced"
import { asyncAuditLog } from "@/lib/core"
import { AccountingTransactionService } from "@/lib/accounting-transaction-service"
import { buildFinancialRequestHash, resolveFinancialIdempotencyKey } from "@/lib/financial-operation-utils"
import { emitEvent } from "@/lib/event-bus"
import { enterpriseFinanceFlags } from "@/lib/enterprise-finance-flags"
import {
  SALES_RETURN_WAREHOUSE_ROLES,
  buildSalesReturnItemsForExecution,
  isSalesReturnPendingWarehouse,
} from "@/lib/sales-return-requests"
import {
  notifySalesReturnCompleted,
  notifySalesReturnManagementCompleted,
} from "@/lib/sales-return-request-notifications"

/**
 * PATCH /api/sales-return-requests/[id]/warehouse-approve
 * اعتماد المخزن وتنفيذ المرتجع فعلياً بعد اكتمال الاعتماد الإداري
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
      return NextResponse.json({ error: "غير مصرح لك باعتماد المخزن" }, { status: 403 })
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
      return NextResponse.json({ error: "غير مصرح لك باعتماد طلبات مخزن آخر" }, { status: 403 })
    }
    if (!member.warehouse_id && member.branch_id && requestBranchId && member.branch_id !== requestBranchId) {
      return NextResponse.json({ error: "غير مصرح لك باعتماد طلبات فرع آخر" }, { status: 403 })
    }

    const executionItems = buildSalesReturnItemsForExecution(request.items)
    if (executionItems.length === 0) {
      return NextResponse.json({ error: "لا توجد بنود صالحة لتنفيذ المرتجع" }, { status: 400 })
    }

    const idempotencyKey = resolveFinancialIdempotencyKey(
      req.headers.get("Idempotency-Key"),
      ["sales-return-warehouse-approve", companyId, id]
    )
    const requestHash = buildFinancialRequestHash({
      requestId: id,
      companyId,
      invoiceId: request.invoice_id,
      returnType: request.return_type,
      totalReturnAmount: request.total_return_amount,
      itemCount: executionItems.length,
    })

    const accountingService = new AccountingTransactionService(supabase as any)
    const atomicResult = await accountingService.postSalesReturnAtomic({
      invoiceId: request.invoice_id,
      invoiceNumber: requestInvoice?.invoice_number || request.invoice_id,
      returnItems: executionItems,
      returnMode: request.return_type,
      companyId,
      userId: user?.id || "",
      lang: "ar",
    }, {
      idempotencyKey,
      requestHash,
      salesReturnRequestId: id,
      traceMetadata: {
        sales_return_request_id: id,
        approval_stage: "warehouse",
        total_return_amount: Number(request.total_return_amount || 0),
      },
    })

    if (!atomicResult.success) {
      return NextResponse.json({ error: atomicResult.error || "فشل تنفيذ المرتجع" }, { status: 400 })
    }

    if (enterpriseFinanceFlags.observabilityEvents) {
      await emitEvent(authSupabase as any, {
        companyId,
        eventName: "sales_return.approved",
        entityType: "invoice",
        entityId: request.invoice_id,
        actorId: user?.id || undefined,
        idempotencyKey: `sales_return.approved:${atomicResult.transactionId || idempotencyKey}`,
        payload: {
          transactionId: atomicResult.transactionId,
          sourceEntity: atomicResult.sourceEntity,
          sourceId: atomicResult.sourceId,
          eventType: atomicResult.eventType,
          requestHash,
          salesReturnRequestId: id,
        }
      })
    }

    try {
      if (request.requested_by) {
        await notifySalesReturnCompleted(supabase as any, {
          companyId,
          requestId: id,
          invoiceNumber: requestInvoice?.invoice_number || request.invoice_id,
          requesterUserId: request.requested_by,
          createdBy: user?.id || "",
          branchId: requestBranchId,
          warehouseId: requestWarehouseId,
        })
      }
      await notifySalesReturnManagementCompleted(supabase as any, {
        companyId,
        requestId: id,
        invoiceNumber: requestInvoice?.invoice_number || request.invoice_id,
        createdBy: user?.id || "",
        branchId: requestBranchId,
        warehouseId: requestWarehouseId,
      })
    } catch (notifErr: any) {
      console.error("⚠️ [SRR] Completion notification failed:", notifErr.message)
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
        status: "approved_completed",
        warehouse_reviewed_by: user?.id,
        transaction_id: atomicResult.transactionId || null,
        sales_return_id: atomicResult.returnIds?.[0] || null,
      },
      reason: "Sales return request warehouse-approved and executed"
    })

    return NextResponse.json({
      success: true,
      message: "تم اعتماد المرتجع من المخزن وتنفيذه بنجاح",
      transactionId: atomicResult.transactionId || null,
      salesReturnId: atomicResult.returnIds?.[0] || null,
    })

  } catch (error: any) {
    return serverError(`خطأ في اعتماد المخزن: ${error.message}`)
  }
}
