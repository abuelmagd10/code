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
  SALES_RETURN_REQUEST_STATUSES,
  SALES_RETURN_WAREHOUSE_ROLES,
  buildSalesReturnItemsForExecution,
  isSalesReturnPendingWarehouse,
} from "@/lib/sales-return-requests"
import {
  notifySalesReturnCompleted,
  notifySalesReturnManagementCompleted,
} from "@/lib/sales-return-request-notifications"
import { archiveApprovalNotificationsForRecord } from "@/lib/notifications/archive-on-action"

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
    // v3.74.13 — workflow endpoint; the SALES_RETURN_WAREHOUSE_ROLES allowlist
    // below is the correct authorization gate. The previous `invoices:write`
    // generic check 403'd store_manager (whose strict v3.69.0 spec has no
    // invoices resource), blocking the very role that's supposed to approve
    // warehouse returns.
    const { user, companyId, member, error: authErr } = await secureApiRequest(req, {
      requireAuth: true,
      requireCompany: true,
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

    // v3.74.34 — Persist the final workflow status. Earlier revisions of
    // this route relied on the atomic RPC's p_update_source path to flip
    // sales_return_requests.status to 'approved_completed', but the
    // process_sales_return_atomic_v2 function only updates the underlying
    // invoice/sales_order — not the workflow row. The result was a
    // consistent atomic posting (sales_return + items + JE + inventory
    // + customer credit) followed by a workflow record stuck at
    // 'pending_warehouse_approval'. Mirror the pattern from warehouse-reject:
    // a single UPDATE pinned to the (id, company_id) tuple, run with the
    // service-role client so the actor's row-level scope can't block it.
    const warehouseReviewedAt = new Date().toISOString()
    const { error: statusUpdateErr } = await supabase
      .from("sales_return_requests")
      .update({
        status: SALES_RETURN_REQUEST_STATUSES.approvedCompleted,
        warehouse_reviewed_by: user?.id,
        warehouse_reviewed_at: warehouseReviewedAt,
        warehouse_rejection_reason: null,
      })
      .eq("id", id)
      .eq("company_id", companyId)
    if (statusUpdateErr) {
      // The atomic accounting effect has already committed. Don't fail
      // the request here — log and let the caller see the success — but
      // surface a server-side breadcrumb so we can reconcile.
      console.error(
        "[warehouse-approve] Status update failed after successful atomic posting:",
        { requestId: id, error: statusUpdateErr.message }
      )
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

    // ===== v3.74.12 — Pro-rata bonus clawback =====
    // The sales return is now committed. The salesperson's bonus on the
    // original invoice must be proportionally reversed so it reflects the
    // net sale, not the gross one. We use the admin client so the actor's
    // role doesn't matter (a warehouse manager closing a return shouldn't
    // need bonuses:write). Failures are logged but never roll back the
    // return itself — the bonus can be reconciled later by an owner.
    try {
      const { data: originalInvoice } = await supabase
        .from("invoices")
        .select("total_amount, original_total")
        .eq("id", request.invoice_id)
        .maybeSingle()

      // Use original_total when present (the gross amount BEFORE any
      // earlier partial return reduced total_amount). Falls back to
      // total_amount for older invoices that don't track this separately.
      const originalGross = Number(
        (originalInvoice as any)?.original_total ??
        (originalInvoice as any)?.total_amount ??
        0
      )
      const returnedThisEvent = Number(request.total_return_amount || 0)

      if (originalGross > 0 && returnedThisEvent > 0) {
        const { reverseBonusForSalesReturn } = await import(
          "@/lib/services/bonus-reversal.service"
        )
        const reversalResult = await reverseBonusForSalesReturn({
          admin: supabase as any,
          invoiceId: request.invoice_id,
          companyId,
          returnedAmount: returnedThisEvent,
          originalInvoiceTotal: originalGross,
          salesReturnRequestId: id,
          actorUserId: user?.id || "",
          reason: request.return_type === 'full' ? 'مرتجع كامل' : 'مرتجع جزئى',
        })
        if (reversalResult.ok) {
          console.log(
            `[BonusReversal] invoice=${request.invoice_id} returnRatio=${reversalResult.returnRatio.toFixed(4)} ` +
            `adjustments=${reversalResult.adjustments.length} totalReversed=${reversalResult.totalReversed}`
          )
        } else if (reversalResult.skipped) {
          console.log(`[BonusReversal] skipped: ${reversalResult.reason}`)
        } else {
          console.warn(`[BonusReversal] failed: ${reversalResult.error}`)
        }
      }
    } catch (bonusErr: any) {
      // Non-fatal — the return is already committed; bonus is recoverable.
      console.error("[BonusReversal] Unexpected error after sales return:", {
        invoiceId: request.invoice_id,
        salesReturnRequestId: id,
        error: bonusErr?.message || bonusErr,
      })
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
