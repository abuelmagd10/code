/**
 * 🔐 Atomic Invoice Payment API
 *
 * Enterprise-grade payment recording: calls process_invoice_payment_atomic RPC
 * which wraps payment INSERT + AR/Revenue journal + invoice UPDATE in ONE DB transaction.
 *
 * COGS is handled separately (complex FIFO calculation, non-atomic by design).
 *
 * ✅ Guarantees:
 *   - Zero partial-failure: if any step fails, the entire operation rolls back
 *   - Idempotent: duplicate payments are rejected at DB level
 *   - Race-condition safe: invoice row is locked (SELECT FOR UPDATE) during the transaction
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient as createServerClient } from "@/lib/supabase/server"
import { createClient } from "@supabase/supabase-js"
import { secureApiRequest, serverError, badRequestError } from "@/lib/api-security-enhanced"
import { checkPeriodLock } from "@/lib/accounting-period-lock"

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

    // ✅ Service role client (bypasses RLS – needed for atomic RPC)
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

    if (!amount || Number(amount) <= 0) {
      return badRequestError("مبلغ الدفعة يجب أن يكون أكبر من صفر")
    }
    if (!paymentDate) {
      return badRequestError("تاريخ الدفعة مطلوب")
    }
    if (!paymentMethod) {
      return badRequestError("طريقة الدفع مطلوبة")
    }

    // Prefer bodyCompanyId (the client knows exactly which company's invoice it's paying).
    // Fall back to the cookie-resolved companyId.
    // If they differ, we re-validate that the user is a member of bodyCompanyId.
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

    // ✅ Fetch invoice for customer_id + period lock check
    const { data: invoice, error: invErr } = await supabase
      .from("invoices")
      .select("id, customer_id, invoice_date, status, company_id, branch_id, cost_center_id, warehouse_id")
      .eq("id", invoiceId)
      .eq("company_id", resolvedCompanyId)
      .maybeSingle()

    if (invErr || !invoice) {
      return NextResponse.json({ success: false, error: "الفاتورة غير موجودة" }, { status: 404 })
    }

    // ✅ Period lock check
    const lockDate = paymentDate || invoice.invoice_date
    if (lockDate) {
      const lockResult = await checkPeriodLock(authSupabase, { companyId: resolvedCompanyId, date: lockDate })
      if (lockResult.isLocked) {
        return NextResponse.json({
          success: false,
          error: lockResult.error || `الفترة المحاسبية مقفلة: ${lockResult.periodName}`
        }, { status: 400 })
      }
    }

    // ✅ Call atomic RPC — all or nothing
    const { data: rpcResult, error: rpcError } = await supabase.rpc(
      "process_invoice_payment_atomic",
      {
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

    if (rpcError) {
      // Structured error codes from the RPC
      const msg = rpcError.message || ""
      if (msg.includes("DUPLICATE_PAYMENT")) {
        return NextResponse.json({ success: false, error: "توجد دفعة مشابهة مسجلة بالفعل لهذه الفاتورة" }, { status: 409 })
      }
      if (msg.includes("INVOICE_NOT_FOUND")) {
        return NextResponse.json({ success: false, error: "الفاتورة غير موجودة" }, { status: 404 })
      }
      if (msg.includes("NO_BRANCH")) {
        return NextResponse.json({ success: false, error: "لا يوجد فرع نشط للشركة. يرجى إنشاء فرع أولاً." }, { status: 400 })
      }
      return serverError(`فشل تسجيل الدفعة: ${msg}`)
    }

    const result = rpcResult as any
    if (!result?.success) {
      return NextResponse.json({
        success: false,
        error: result?.error || "فشل غير معروف في معالجة الدفعة"
      }, { status: 400 })
    }

    return NextResponse.json({
      success: true,
      paymentId: result.payment_id,
      newPaidAmount: result.new_paid_amount,
      newStatus: result.new_status,
      netInvoiceAmount: result.net_invoice_amount,
      remaining: result.remaining,
      invoiceJournalCreated: result.invoice_journal_created,
    })
  } catch (e: any) {
    return serverError(`خطأ غير متوقع في تسجيل الدفعة: ${e?.message || "unknown"}`)
  }
}
