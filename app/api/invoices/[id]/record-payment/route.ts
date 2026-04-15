/**
 * 🔐 Atomic Invoice Payment API — Enterprise ERP
 *
 * X1.3 hardening: this route is now a thin controller. Financial orchestration
 * lives in SalesInvoicePaymentCommandService.
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient as createServerClient } from "@/lib/supabase/server"
import { createClient } from "@supabase/supabase-js"
import { secureApiRequest, serverError, badRequestError } from "@/lib/api-security-enhanced"
import {
  SalesInvoicePaymentCommandError,
  SalesInvoicePaymentCommandService,
  type RecordInvoicePaymentCommand,
} from "@/lib/services/sales-invoice-payment-command.service"

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: invoiceId } = await params
    const authSupabase = await createServerClient()

    const { user, companyId, error } = await secureApiRequest(req, {
      requireAuth: true,
      requireCompany: true,
      requirePermission: { resource: "invoices", action: "write" },
      supabase: authSupabase,
    })
    if (error) return error
    if (!companyId) return badRequestError("معرف الشركة مطلوب")
    if (!user?.id) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })

    const body = await req.json()
    const command: RecordInvoicePaymentCommand = {
      invoiceId,
      amount: Number(body?.amount || 0),
      paymentDate: String(body?.paymentDate || "").trim(),
      paymentMethod: String(body?.paymentMethod || "").trim(),
      referenceNumber: body?.referenceNumber || null,
      notes: body?.notes || null,
      accountId: body?.accountId || null,
      branchId: body?.branchId || null,
      costCenterId: body?.costCenterId || null,
      warehouseId: body?.warehouseId || null,
      bodyCompanyId: body?.companyId || null,
      idempotencyKey: req.headers.get("Idempotency-Key"),
    }

    const adminSupabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const service = new SalesInvoicePaymentCommandService(authSupabase, adminSupabase)
    const result = await service.recordPayment(
      {
        companyId,
        userId: user.id,
        userEmail: user.email || null,
      },
      command
    )

    return NextResponse.json(result)
  } catch (error: any) {
    if (error instanceof SalesInvoicePaymentCommandError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status })
    }
    return serverError(`خطأ غير متوقع في تسجيل الدفعة: ${error?.message || "unknown"}`)
  }
}
