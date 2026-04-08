import { NextRequest, NextResponse } from "next/server"
import { createClient as createServerClient } from "@/lib/supabase/server"
import { createClient } from "@supabase/supabase-js"
import { secureApiRequest, serverError, badRequestError } from "@/lib/api-security-enhanced"
import { asyncAuditLog } from "@/lib/core"
import {
  SALES_RETURN_ACTIVE_REQUEST_STATUSES,
  SALES_RETURN_LEVEL1_APPROVER_ROLES,
  SALES_RETURN_REQUEST_STATUSES,
  SALES_RETURN_WAREHOUSE_ROLES,
  buildSalesReturnItemsForExecution,
} from "@/lib/sales-return-requests"
import { notifySalesReturnLevel1Requested } from "@/lib/sales-return-request-notifications"

function getEffectiveDeliveryApprovalStatus(invoice?: { approval_status?: string | null; warehouse_status?: string | null }) {
  const explicitStatus = String(invoice?.approval_status || "").toLowerCase()
  const warehouseStatus = String(invoice?.warehouse_status || "").toLowerCase()

  if (explicitStatus === "approved" || warehouseStatus === "approved") return "approved"
  if (explicitStatus === "rejected" || warehouseStatus === "rejected") return "rejected"
  if (explicitStatus === "pending" || warehouseStatus === "pending") return "pending"

  return explicitStatus || warehouseStatus || "pending"
}

function calculateReturnTotal(items: ReturnType<typeof buildSalesReturnItemsForExecution>) {
  return items.reduce((sum, item) => {
    const gross = item.qtyToReturn * item.unit_price
    const net = gross - (gross * (item.discount_percent || 0)) / 100
    const tax = (net * (item.tax_rate || 0)) / 100
    return sum + net + tax
  }, 0)
}

/**
 * POST /api/sales-return-requests
 * إنشاء طلب مرتجع جديد بدون أي تأثير مخزني/محاسبي
 */
export async function POST(req: NextRequest) {
  try {
    const authSupabase = await createServerClient()
    const { user, companyId, member, error: authErr } = await secureApiRequest(req, {
      requireAuth: true,
      requireCompany: true,
      requirePermission: { resource: "invoices", action: "write" },
      supabase: authSupabase
    })
    if (authErr) return authErr
    if (!companyId) return badRequestError("معرف الشركة مطلوب")

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const body = await req.json()
    const { invoice_id, return_type, items, notes, total_return_amount } = body

    if (!invoice_id) return badRequestError("معرف الفاتورة مطلوب")
    if (!return_type || !["partial", "full"].includes(return_type)) {
      return badRequestError("نوع المرتجع يجب أن يكون partial أو full")
    }

    const normalizedItems = buildSalesReturnItemsForExecution(items)
    if (normalizedItems.length === 0) {
      return badRequestError("بنود المرتجع المطابقة مطلوبة")
    }

    const { data: invoice, error: invErr } = await supabase
      .from("invoices")
      .select(`
        id,
        invoice_number,
        customer_id,
        sales_order_id,
        branch_id,
        warehouse_id,
        company_id,
        status,
        warehouse_status,
        approval_status
      `)
      .eq("id", invoice_id)
      .eq("company_id", companyId)
      .maybeSingle()

    if (invErr || !invoice) {
      return NextResponse.json({ error: "الفاتورة غير موجودة" }, { status: 404 })
    }

    if (!["sent", "partially_paid", "paid", "confirmed"].includes(invoice.status)) {
      return NextResponse.json({ error: "لا يمكن إنشاء مرتجع لفاتورة في هذه الحالة" }, { status: 400 })
    }

    if (getEffectiveDeliveryApprovalStatus(invoice) !== "approved") {
      return NextResponse.json({ error: "لا يمكن إنشاء طلب مرتجع قبل اعتماد تسليم المخزون من مسؤول المخزن" }, { status: 400 })
    }

    if (!invoice.warehouse_id) {
      return NextResponse.json({ error: "الفاتورة لا تحتوي على مخزن مرتبط لاعتماد المرتجع" }, { status: 400 })
    }

    const { data: existingRequest } = await supabase
      .from("sales_return_requests")
      .select("id, status")
      .eq("invoice_id", invoice_id)
      .eq("company_id", companyId)
      .in("status", SALES_RETURN_ACTIVE_REQUEST_STATUSES)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (existingRequest) {
      return NextResponse.json({ error: "يوجد بالفعل طلب مرتجع نشط لهذه الفاتورة" }, { status: 409 })
    }

    const totalReturnAmount = Number(total_return_amount || 0) > 0
      ? Number(total_return_amount || 0)
      : calculateReturnTotal(normalizedItems)

    const { data: newRequest, error: insertErr } = await supabase
      .from("sales_return_requests")
      .insert({
        company_id: companyId,
        branch_id: invoice.branch_id || member?.branch_id || null,
        warehouse_id: invoice.warehouse_id,
        invoice_id,
        sales_order_id: invoice.sales_order_id || null,
        customer_id: invoice.customer_id || null,
        requested_by: user?.id,
        status: SALES_RETURN_REQUEST_STATUSES.pendingLevel1,
        return_type,
        items: normalizedItems,
        total_return_amount: totalReturnAmount,
        notes: notes || null,
      })
      .select()
      .single()

    if (insertErr || !newRequest) {
      return serverError(`فشل في إنشاء طلب المرتجع: ${insertErr?.message}`)
    }

    try {
      await notifySalesReturnLevel1Requested(supabase as any, {
        companyId,
        requestId: newRequest.id,
        invoiceNumber: invoice.invoice_number,
        returnType: return_type,
        createdBy: user?.id || "",
        branchId: invoice.branch_id || member?.branch_id || null,
        warehouseId: invoice.warehouse_id
      })
    } catch (notifErr: any) {
      console.error("⚠️ [SRR] Level 1 notification failed:", notifErr.message)
    }

    asyncAuditLog({
      companyId,
      userId: user?.id || "",
      userEmail: user?.email,
      action: "CREATE",
      table: "sales_return_requests",
      recordId: newRequest.id,
      recordIdentifier: invoice.invoice_number,
      newData: {
        status: SALES_RETURN_REQUEST_STATUSES.pendingLevel1,
        return_type,
        warehouse_id: invoice.warehouse_id,
        total_return_amount: totalReturnAmount,
        items_count: normalizedItems.length,
      },
      reason: "Sales return request created pending level 1 approval"
    })

    return NextResponse.json({ success: true, data: newRequest }, { status: 201 })

  } catch (error: any) {
    return serverError(`خطأ في إنشاء طلب المرتجع: ${error.message}`)
  }
}

/**
 * GET /api/sales-return-requests
 * جلب طلبات المرتجعات بحسب مرحلة الاعتماد
 */
export async function GET(req: NextRequest) {
  try {
    const authSupabase = await createServerClient()
    const { companyId, member, error: authErr } = await secureApiRequest(req, {
      requireAuth: true,
      requireCompany: true,
      requirePermission: { resource: "invoices", action: "read" },
      supabase: authSupabase
    })
    if (authErr) return authErr
    if (!companyId) return badRequestError("معرف الشركة مطلوب")

    const level1ApproverRoles = [...SALES_RETURN_LEVEL1_APPROVER_ROLES]
    const warehouseRoles = [...SALES_RETURN_WAREHOUSE_ROLES]
    const allowedRoles = new Set<string>([...level1ApproverRoles, ...warehouseRoles])

    if (!member || !allowedRoles.has(member.role)) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 403 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const { searchParams } = new URL(req.url)
    const status = searchParams.get("status") || "all"

    let query = supabase
      .from("sales_return_requests")
      .select(`
        *,
        invoices:invoice_id (
          invoice_number,
          total_amount,
          status,
          customer_id,
          branch_id,
          warehouse_id
        ),
        customers:customer_id (name, phone)
      `)
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })

    if (status !== "all") query = query.eq("status", status)

    const role = String(member.role || "")
    if (warehouseRoles.includes(role as (typeof SALES_RETURN_WAREHOUSE_ROLES)[number])) {
      if (member.warehouse_id) {
        query = query.eq("warehouse_id", member.warehouse_id)
      } else if (member.branch_id) {
        query = query.eq("branch_id", member.branch_id)
      }
    } else if ((role === "manager" || role === "accountant") && member.branch_id) {
      query = query.eq("branch_id", member.branch_id)
    }

    const { data, error } = await query
    if (error) return serverError(error.message)

    return NextResponse.json({ success: true, data: data || [] })

  } catch (error: any) {
    return serverError(`خطأ في جلب طلبات المرتجعات: ${error.message}`)
  }
}
