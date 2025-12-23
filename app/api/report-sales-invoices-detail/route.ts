import { createClient as createServerClient } from "@/lib/supabase/server"
import { createClient } from "@supabase/supabase-js"
import { secureApiRequest, serverError, badRequestError } from "@/lib/api-security-enhanced"
import { buildBranchFilter } from "@/lib/branch-access-control"
import { NextRequest } from "next/server"

export async function GET(req: NextRequest) {
  try {
    // ✅ إنشاء supabase client للمصادقة
    const authSupabase = await createServerClient()

    // ✅ تحصين موحد لتفاصيل فواتير المبيعات
    const { companyId, error } = await secureApiRequest(req, {
      requireAuth: true,
      requireCompany: true,
      requirePermission: { resource: "reports", action: "read" },
      supabase: authSupabase // ✅ تمرير supabase client
    })

    if (error) return error
    if (!companyId) return badRequestError("معرف الشركة مطلوب")

    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ""
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
    if (!url || !serviceKey) {
      return serverError(`خطأ في إعدادات الخادم: ${"Server configuration error"}`)
    }

    const admin = createClient(url, serviceKey, { global: { headers: { apikey: serviceKey } } })

    const { searchParams } = new URL(req.url)
    const from = String(searchParams.get("from") || "0001-01-01")
    const to = String(searchParams.get("to") || "9999-12-31")
    const status = String(searchParams.get("status") || "paid")
    const customerId = searchParams.get("customer_id") || ""

    let q = admin
      .from('invoices')
      .select('id, invoice_number, customer_id, invoice_date, status, subtotal, tax_amount, total_amount, paid_amount, customers(name)')
      .eq('company_id', companyId)
      .or("is_deleted.is.null,is_deleted.eq.false")
      .gte('invoice_date', from)
      .lte('invoice_date', to)
      .order('invoice_date', { ascending: true })
    if (status === 'all') q = q.in('status', ['sent','partially_paid','paid'])
    else q = q.eq('status', status)
    if (customerId) q = q.eq('customer_id', customerId)
    const { data, error: invoicesError } = await q
    if (invoicesError) {
      return serverError(`خطأ في جلب الفواتير: ${invoicesError.message}`)
    }

    const rows = (data || []).map((d: any) => ({
      id: String(d.id),
      invoice_number: String(d.invoice_number || ''),
      customer_id: String(d.customer_id || ''),
      customer_name: String(((d.customers || {})?.name) || ''),
      invoice_date: String(d.invoice_date || ''),
      status: String(d.status || ''),
      subtotal: Number(d.subtotal || 0),
      tax_amount: Number(d.tax_amount || 0),
      total_amount: Number(d.total_amount || 0),
      paid_amount: Number(d.paid_amount || 0)
    }))

    return NextResponse.json({
      success: true,
      data: rows
    })
  } catch (e: any) {
    return serverError(`حدث خطأ أثناء جلب تفاصيل فواتير المبيعات: ${e?.message || "unknown_error"}`)
  }
}
