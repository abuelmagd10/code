import { NextRequest, NextResponse } from "next/server"
import { createClient as createServerClient } from "@/lib/supabase/server"
import { createClient } from "@supabase/supabase-js"
import { secureApiRequest, serverError, badRequestError } from "@/lib/api-security-enhanced"
import { asyncAuditLog } from "@/lib/core"

/**
 * POST /api/sales-return-requests
 * إنشاء طلب مرتجع جديد + إشعار للأدوار العليا
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
    if (!items || !Array.isArray(items) || items.length === 0) {
      return badRequestError("بنود المرتجع مطلوبة")
    }

    // جلب بيانات الفاتورة
    const { data: invoice, error: invErr } = await supabase
      .from("invoices")
      .select("id, invoice_number, customer_id, sales_order_id, branch_id, company_id, status")
      .eq("id", invoice_id)
      .eq("company_id", companyId)
      .maybeSingle()

    if (invErr || !invoice) {
      return NextResponse.json({ error: "الفاتورة غير موجودة" }, { status: 404 })
    }

    if (!["sent", "partially_paid", "paid", "confirmed"].includes(invoice.status)) {
      return NextResponse.json({ error: "لا يمكن إنشاء مرتجع لفاتورة في هذه الحالة" }, { status: 400 })
    }

    // التحقق من عدم وجود طلب معلق بالفعل
    const { data: existingRequest } = await supabase
      .from("sales_return_requests")
      .select("id")
      .eq("invoice_id", invoice_id)
      .eq("status", "pending")
      .maybeSingle()

    if (existingRequest) {
      return NextResponse.json({ error: "يوجد طلب مرتجع معلق بالفعل لهذه الفاتورة" }, { status: 409 })
    }

    // إنشاء الطلب
    const { data: newRequest, error: insertErr } = await supabase
      .from("sales_return_requests")
      .insert({
        company_id: companyId,
        branch_id: invoice.branch_id || member?.branch_id || null,
        invoice_id,
        sales_order_id: invoice.sales_order_id || null,
        customer_id: invoice.customer_id || null,
        requested_by: user?.id,
        status: "pending",
        return_type,
        items,
        total_return_amount: total_return_amount || 0,
        notes: notes || null,
      })
      .select()
      .single()

    if (insertErr || !newRequest) {
      return serverError(`فشل في إنشاء طلب المرتجع: ${insertErr?.message}`)
    }

    // إشعار للأدوار العليا
    try {
      const { createNotification } = await import("@/lib/governance-layer")
      const msg = `طلب مرتجع ${return_type === "full" ? "كامل" : "جزئي"} للفاتورة ${invoice.invoice_number} — بانتظار الاعتماد`

      for (const role of ["owner", "admin", "general_manager", "manager"]) {
        await createNotification({
          companyId,
          referenceType: "sales_return_request",
          referenceId: newRequest.id,
          title: "طلب مرتجع مبيعات جديد",
          message: msg,
          createdBy: user?.id || "",
          branchId: invoice.branch_id || member?.branch_id || undefined,
          assignedToRole: role,
          priority: "high",
          eventKey: `srr:${newRequest.id}:created:${role}`,
          severity: "warning",
          category: "sales"
        })
      }
    } catch (notifErr: any) {
      console.error("⚠️ [SRR] Notification failed:", notifErr.message)
    }

    asyncAuditLog({
      companyId,
      userId: user?.id || "",
      userEmail: user?.email,
      action: "CREATE",
      table: "sales_return_requests",
      recordId: newRequest.id,
      recordIdentifier: invoice.invoice_number,
      newData: { return_type, items, total_return_amount },
      reason: "Sales return request created"
    })

    return NextResponse.json({ success: true, data: newRequest }, { status: 201 })

  } catch (error: any) {
    return serverError(`خطأ في إنشاء طلب المرتجع: ${error.message}`)
  }
}

/**
 * GET /api/sales-return-requests
 * جلب طلبات المرتجعات (للأدوار المخولة فقط)
 */
export async function GET(req: NextRequest) {
  try {
    const authSupabase = await createServerClient()
    const { user, companyId, member, error: authErr } = await secureApiRequest(req, {
      requireAuth: true,
      requireCompany: true,
      requirePermission: { resource: "invoices", action: "read" },
      supabase: authSupabase
    })
    if (authErr) return authErr
    if (!companyId) return badRequestError("معرف الشركة مطلوب")

    const PRIVILEGED_ROLES = ["owner", "admin", "general_manager", "manager"]
    if (!member || !PRIVILEGED_ROLES.includes(member.role)) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 403 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const { searchParams } = new URL(req.url)
    const status = searchParams.get("status") || "pending"

    let query = supabase
      .from("sales_return_requests")
      .select(`
        *,
        invoices:invoice_id (invoice_number, total_amount, status, customer_id),
        customers:customer_id (name, phone)
      `)
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })

    if (status !== "all") query = query.eq("status", status)
    if (member.role === "manager" && member.branch_id) {
      query = query.eq("branch_id", member.branch_id)
    }

    const { data, error } = await query
    if (error) return serverError(error.message)

    return NextResponse.json({ success: true, data: data || [] })

  } catch (error: any) {
    return serverError(`خطأ في جلب طلبات المرتجعات: ${error.message}`)
  }
}
