/**
 * 🔐 Atomic Invoice Payment API — Enterprise ERP
 *
 * Upgraded to Core Infrastructure:
 * - requireOpenFinancialPeriod: Application-level Financial Lock Guard
 * - asyncAuditLog: Non-blocking audit from Core
 *
 * ✅ Guarantees:
 *   - Zero partial-failure: RPC wraps payment + journal + invoice update atomically
 *   - Idempotent: duplicate payments are rejected at DB level
 *   - Race-condition safe: SELECT FOR UPDATE inside RPC
 *   - Period Lock: double-checked at app + DB level
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient as createServerClient } from "@/lib/supabase/server"
import { createClient } from "@supabase/supabase-js"
import { secureApiRequest, serverError, badRequestError } from "@/lib/api-security-enhanced"
import { requireOpenFinancialPeriod } from "@/lib/core/security/financial-lock-guard"
import { asyncAuditLog } from "@/lib/core"
import { ERPError } from "@/lib/core/errors/erp-errors"
import { enterpriseFinanceFlags } from "@/lib/enterprise-finance-flags"
import { buildFinancialRequestHash, resolveFinancialIdempotencyKey } from "@/lib/financial-operation-utils"
import { emitEvent } from "@/lib/event-bus"

function buildKnownRpcErrorResponse(message: string) {
  const normalized = message.toLowerCase()

  if (message.includes("DUPLICATE_PAYMENT")) {
    return NextResponse.json({ success: false, error: "توجد دفعة مشابهة مسجلة بالفعل لهذه الفاتورة" }, { status: 409 })
  }

  if (message.includes("INVOICE_NOT_FOUND")) {
    return NextResponse.json({ success: false, error: "الفاتورة غير موجودة" }, { status: 404 })
  }

  if (message.includes("NO_BRANCH")) {
    return NextResponse.json({ success: false, error: "لا يوجد فرع نشط للشركة. يرجى إنشاء فرع أولاً." }, { status: 400 })
  }

  if (
    normalized.includes("warehouse_id")
    && normalized.includes("payments")
    && normalized.includes("column")
  ) {
    return serverError("قاعدة البيانات تحتاج تحديثًا قبل تسجيل الدفعات: عمود warehouse_id غير موجود في جدول payments")
  }

  return null
}

function isMissingPaymentV2Rpc(message: string) {
  const normalized = message.toLowerCase()
  return (
    normalized.includes("process_invoice_payment_atomic_v2")
    && (
      normalized.includes("schema cache")
      || normalized.includes("does not exist")
      || normalized.includes("could not find the function")
      || normalized.includes("pgrst")
    )
  )
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const authSupabase = await createServerClient()
    const invoiceId = id

    // ✅ Auth + company context
    const { user, companyId, error } = await secureApiRequest(req, {
      requireAuth: true,
      requireCompany: true,
      requirePermission: { resource: "invoices", action: "write" },
      supabase: authSupabase,
    })
    if (error) return error
    if (!companyId) return badRequestError("معرف الشركة مطلوب")

    // ✅ Service role client (bypasses RLS — needed for atomic RPC)
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // ✅ Parse and validate body
    const body = await req.json()
    const {
      amount,
      paymentDate,
      paymentMethod,
      referenceNumber,
      notes,
      accountId,
      branchId,
      costCenterId,
      warehouseId,
      companyId: bodyCompanyId,
    } = body

    const idempotencyKey = resolveFinancialIdempotencyKey(
      req.headers.get("Idempotency-Key"),
      [
        "invoice-payment",
        invoiceId,
        paymentDate,
        Number(amount || 0).toFixed(2),
        paymentMethod,
        referenceNumber || "none",
      ]
    )

    if (!amount || Number(amount) <= 0) return badRequestError("مبلغ الدفعة يجب أن يكون أكبر من صفر")
    if (!paymentDate) return badRequestError("تاريخ الدفعة مطلوب")
    if (!paymentMethod) return badRequestError("طريقة الدفع مطلوبة")

    // Multi-Company guard: validate membership if bodyCompanyId differs from cookie
    const resolvedCompanyId = bodyCompanyId || companyId
    if (!resolvedCompanyId) return badRequestError("معرف الشركة مطلوب")

    if (bodyCompanyId && bodyCompanyId !== companyId) {
      const { data: membership } = await authSupabase
        .from("company_members")
        .select("id")
        .eq("user_id", user?.id)
        .eq("company_id", bodyCompanyId)
        .maybeSingle()
      if (!membership) {
        return NextResponse.json({ success: false, error: "غير مسموح: المستخدم ليس عضواً في هذه الشركة" }, { status: 403 })
      }
    }

    // ✅ Fetch invoice
    const { data: invoice, error: invErr } = await supabase
      .from("invoices")
      .select("id, customer_id, invoice_date, status, company_id, branch_id, cost_center_id, warehouse_id, warehouse_status, approval_status")
      .eq("id", invoiceId)
      .eq("company_id", resolvedCompanyId)
      .maybeSingle()

    if (invErr || !invoice) {
      return NextResponse.json({ success: false, error: "الفاتورة غير موجودة" }, { status: 404 })
    }

    // ✅ Financial Lock Guard — Core Infrastructure (replaces old checkPeriodLock)
    const lockDate = paymentDate || invoice.invoice_date
    if (lockDate) {
      try {
        await requireOpenFinancialPeriod(resolvedCompanyId, lockDate)
      } catch (lockErr: any) {
        if (lockErr instanceof ERPError && lockErr.code === 'ERR_PERIOD_CLOSED') {
          return NextResponse.json({ success: false, error: lockErr.message }, { status: 400 })
        }
        throw lockErr
      }
    }

    // ✅ Call atomic RPC — all or nothing
    const requestHash = buildFinancialRequestHash({
      invoiceId,
      companyId: resolvedCompanyId,
      customerId: invoice.customer_id,
      amount: Number(amount),
      paymentDate,
      paymentMethod,
      referenceNumber: referenceNumber || null,
      accountId: accountId || null,
      branchId: branchId || invoice.branch_id || null,
      costCenterId: costCenterId || invoice.cost_center_id || null,
      warehouseId: warehouseId || invoice.warehouse_id || null,
    })

    const buildRpcParams = (useV2: boolean) => (
      useV2
        ? {
            p_invoice_id: invoiceId,
            p_company_id: resolvedCompanyId,
            p_customer_id: invoice.customer_id,
            p_amount: Number(amount),
            p_payment_date: paymentDate,
            p_payment_method: paymentMethod,
            p_reference_number: referenceNumber || null,
            p_notes: notes || null,
            p_account_id: accountId || null,
            p_branch_id: branchId || invoice.branch_id || null,
            p_cost_center_id: costCenterId || invoice.cost_center_id || null,
            p_warehouse_id: warehouseId || invoice.warehouse_id || null,
            p_user_id: user?.id || null,
            p_idempotency_key: idempotencyKey,
            p_request_hash: requestHash,
          }
        : {
            p_invoice_id: invoiceId,
            p_company_id: resolvedCompanyId,
            p_customer_id: invoice.customer_id,
            p_amount: Number(amount),
            p_payment_date: paymentDate,
            p_payment_method: paymentMethod,
            p_reference_number: referenceNumber || null,
            p_notes: notes || null,
            p_account_id: accountId || null,
            p_branch_id: branchId || invoice.branch_id || null,
            p_cost_center_id: costCenterId || invoice.cost_center_id || null,
            p_warehouse_id: warehouseId || invoice.warehouse_id || null,
            p_user_id: user?.id || null,
          }
    )

    const executePaymentRpc = async (useV2: boolean) => {
      const rpcName = useV2
        ? "process_invoice_payment_atomic_v2"
        : "process_invoice_payment_atomic"

      const { data, error } = await supabase.rpc(rpcName, buildRpcParams(useV2))
      return { data, error, rpcName }
    }

    // Invoices that already passed warehouse delivery should stay on the accrual-safe V2 path.
    const preferV2 = enterpriseFinanceFlags.paymentV2
      || invoice.warehouse_status === "approved"
      || invoice.approval_status === "approved"

    let { data: rpcResult, error: rpcError, rpcName } = await executePaymentRpc(preferV2)

    if (rpcError) {
      const primaryMessage = rpcError.message || ""
      const knownPrimaryError = buildKnownRpcErrorResponse(primaryMessage)
      if (knownPrimaryError) return knownPrimaryError

      const shouldFallback = preferV2
        ? isMissingPaymentV2Rpc(primaryMessage)
        : true

      if (shouldFallback) {
        const fallbackUseV2 = !preferV2
        const fallbackResult = await executePaymentRpc(fallbackUseV2)

        if (!fallbackResult.error) {
          console.warn(`[RECORD_PAYMENT] Primary RPC ${rpcName} failed; fallback ${fallbackResult.rpcName} succeeded:`, primaryMessage)
          rpcResult = fallbackResult.data
          rpcError = null
          rpcName = fallbackResult.rpcName
        } else {
          const fallbackMessage = fallbackResult.error.message || ""
          const knownFallbackError = buildKnownRpcErrorResponse(fallbackMessage)
          if (knownFallbackError) return knownFallbackError

          console.error(`[RECORD_PAYMENT] Both payment RPCs failed. Primary=${rpcName}, Fallback=${fallbackResult.rpcName}`, {
            primaryMessage,
            fallbackMessage,
            invoiceId,
            companyId: resolvedCompanyId,
          })

          return serverError(`فشل تسجيل الدفعة: ${fallbackMessage || primaryMessage}`)
        }
      } else {
        console.error(`[RECORD_PAYMENT] Payment RPC ${rpcName} failed without fallback`, {
          message: primaryMessage,
          invoiceId,
          companyId: resolvedCompanyId,
        })
        return serverError(`فشل تسجيل الدفعة: ${primaryMessage}`)
      }
    }

    const result = rpcResult as any
    if (!result?.success) {
      return NextResponse.json({ success: false, error: result?.error || "فشل غير معروف في معالجة الدفعة" }, { status: 400 })
    }

    if (enterpriseFinanceFlags.observabilityEvents) {
      await emitEvent(authSupabase, {
        companyId: resolvedCompanyId,
        eventName: "payment.recorded",
        entityType: "invoice",
        entityId: invoiceId,
        actorId: user?.id || undefined,
        idempotencyKey: `payment.recorded:${result.transaction_id || idempotencyKey}`,
        payload: {
          transactionId: result.transaction_id || null,
          paymentId: result.payment_id,
          sourceEntity: result.source_entity || "invoice",
          sourceId: result.source_id || invoiceId,
          eventType: result.event_type || "invoice_payment",
          requestHash,
        }
      })
    }

    // ✅ Non-Blocking Async Audit (Core Infrastructure)
    asyncAuditLog({
      companyId: resolvedCompanyId,
      userId: user?.id || '',
      userEmail: user?.email,
      action: 'CREATE',
      table: 'invoice_payments',
      recordId: result.payment_id || invoiceId,
      recordIdentifier: invoiceId,
      newData: {
        payment_id: result.payment_id,
        amount,
        paymentDate,
        paymentMethod,
        new_status: result.new_status
      },
      reason: 'Invoice Payment Recorded'
    })

    return NextResponse.json({
      success: true,
      paymentId: result.payment_id,
      newPaidAmount: result.new_paid_amount,
      newStatus: result.new_status,
      netInvoiceAmount: result.net_invoice_amount,
      remaining: result.remaining,
      invoiceJournalCreated: result.invoice_journal_created,
      transactionId: result.transaction_id || null,
      eventType: result.event_type || "invoice_payment",
    })

  } catch (e: any) {
    return serverError(`خطأ غير متوقع في تسجيل الدفعة: ${e?.message || "unknown"}`)
  }
}
