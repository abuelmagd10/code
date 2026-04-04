import { NextRequest, NextResponse } from "next/server"
import { createClient as createServerClient } from "@/lib/supabase/server"
import { createClient } from "@supabase/supabase-js"
import { secureApiRequest, serverError, badRequestError } from "@/lib/api-security-enhanced"
import { asyncAuditLog } from "@/lib/core"

/**
 * PATCH /api/sales-return-requests/[id]/approve
 * اعتماد طلب المرتجع + تنفيذ العملية ذرياً
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

    const APPROVER_ROLES = ["owner", "admin", "general_manager", "manager"]
    if (!member || !APPROVER_ROLES.includes(member.role)) {
      return NextResponse.json({ error: "غير مصرح لك بالاعتماد" }, { status: 403 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // جلب الطلب
    const { data: request, error: reqErr } = await supabase
      .from("sales_return_requests")
      .select("*, invoices:invoice_id(invoice_number, returned_amount, total_amount, paid_amount, customer_id, warehouse_id, branch_id, cost_center_id)")
      .eq("id", id)
      .eq("company_id", companyId)
      .maybeSingle()

    if (reqErr || !request) {
      return NextResponse.json({ error: "الطلب غير موجود" }, { status: 404 })
    }
    if (request.status !== "pending") {
      return NextResponse.json({ error: "الطلب تمت معالجته مسبقاً" }, { status: 409 })
    }
    if (member.role === "manager" && member.branch_id && request.branch_id !== member.branch_id) {
      return NextResponse.json({ error: "غير مصرح لك باعتماد طلبات فروع أخرى" }, { status: 403 })
    }

    // 1. تحديث third_party_inventory
    try {
      await supabase.rpc("process_invoice_return_in_tpi", {
        p_invoice_id: request.invoice_id,
        p_return_items: request.items,
        p_return_type: request.return_type
      })
    } catch (tpiErr: any) {
      console.warn("⚠️ TPI update failed:", tpiErr.message)
    }

    // 2. إرجاع المخزون (stock_in لكل بند)
    const inv = request.invoices
    for (const item of (request.items as any[])) {
      if (!item.product_id || !Number(item.quantity)) continue
      await supabase.from("inventory_transactions").insert({
        company_id: companyId,
        product_id: item.product_id,
        transaction_type: "return",
        quantity_change: Number(item.quantity), // موجب = إرجاع للمخزن
        reference_id: request.invoice_id,
        reference_type: "sales_return",
        notes: `مرتجع مبيعات معتمد - طلب ${id.slice(0, 8)}`,
        branch_id: inv?.branch_id || null,
        cost_center_id: inv?.cost_center_id || null,
        warehouse_id: inv?.warehouse_id || null,
        unit_cost: Number(item.unit_price || 0),
        total_cost: Number(item.unit_price || 0) * Number(item.quantity),
        from_location_type: "customer",
        to_location_type: "warehouse",
        to_location_id: inv?.warehouse_id || null
      })
    }

    // 3. تحديث الفاتورة
    const totalReturnAmount = Number(request.total_return_amount || 0)
    const invoice = request.invoices
    if (invoice) {
      const newReturnedAmount = Number(invoice.returned_amount || 0) + totalReturnAmount
      const isFullReturn = request.return_type === "full" || newReturnedAmount >= Number(invoice.total_amount)
      await supabase
        .from("invoices")
        .update({
          returned_amount: newReturnedAmount,
          return_status: isFullReturn ? "full" : "partial",
          status: isFullReturn ? "fully_returned" : "partially_returned",
          updated_at: new Date().toISOString()
        })
        .eq("id", request.invoice_id)
    }

    // 4. تحديث الطلب → approved
    await supabase
      .from("sales_return_requests")
      .update({ status: "approved", reviewed_by: user?.id, reviewed_at: new Date().toISOString() })
      .eq("id", id)

    // 5️⃣ المرحلة الثانية: إنشاء قيد GL عكسي (Sales Return GL Reversal)
    try {
      const { data: glResult, error: glErr } = await supabase.rpc(
        'create_sales_return_gl_reversal',
        {
          p_company_id: companyId,
          p_invoice_id: request.invoice_id,
          p_return_amount: totalReturnAmount,
          p_return_request_id: id,
          p_user_id: user?.id || null
        }
      )
      if (glErr) console.warn('⚠️ [SRR] GL Reversal RPC error:', glErr.message)
      else if (!glResult?.success) console.warn('⚠️ [SRR] GL Reversal failed:', glResult?.error)
      else console.log('✅ [SRR] GL Reversal created:', glResult?.journal_entry_id)
    } catch (glEx: any) {
      console.warn('⚠️ [SRR] GL Reversal exception (non-fatal):', glEx.message)
    }

    // 6️⃣ المرحلة الثالثة: إدراج رصيد دائن في customer_credit_ledger (للفواتير المدفوعة)
    try {
      const invoice = request.invoices
      const invoicePaidAmount = Number(invoice?.paid_amount || 0)
      const customerId = request.customer_id || invoice?.customer_id

      if (invoicePaidAmount > 0 && totalReturnAmount > 0 && customerId) {
        const creditAmount = Math.min(totalReturnAmount, invoicePaidAmount)
        const { error: creditErr } = await supabase
          .from('customer_credit_ledger')
          .insert({
            company_id: companyId,
            customer_id: customerId,
            source_type: 'sales_return',
            source_id: id,
            amount: creditAmount,
            description: `رصيد دائن من مرتجع الفاتورة ${invoice?.invoice_number || request.invoice_id}`,
            created_by: user?.id || null
          })
        if (creditErr) console.warn('⚠️ [SRR] Credit Ledger insert error:', creditErr.message)
        else console.log('✅ [SRR] Customer Credit Ledger entry created:', creditAmount)
      }
    } catch (creditEx: any) {
      console.warn('⚠️ [SRR] Credit Ledger exception (non-fatal):', creditEx.message)
    }

    asyncAuditLog({
      companyId, userId: user?.id || "", userEmail: user?.email,
      action: "UPDATE", table: "sales_return_requests",
      recordId: id, recordIdentifier: request.invoice_id,
      newData: { status: "approved", return_type: request.return_type },
      reason: "Sales return request approved"
    })

    return NextResponse.json({ success: true, message: "تم اعتماد المرتجع بنجاح" })

  } catch (error: any) {
    return serverError(`خطأ في اعتماد المرتجع: ${error.message}`)
  }
}
