import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { secureApiRequest } from "@/lib/api-security"
import { apiError, apiSuccess, HTTP_STATUS, internalError } from "@/lib/api-error-handler"

export async function GET(req: NextRequest) {
  try {
    // === تحصين أمني: استخدام secureApiRequest ===
    const { user, companyId, member, error } = await secureApiRequest(req, {
      requireAuth: true,
      requireCompany: true,
      requirePermission: { resource: "reports", action: "read" }
    })

    if (error) return error
    if (!companyId) return apiError(HTTP_STATUS.NOT_FOUND, "لم يتم العثور على الشركة", "Company not found")
    // === نهاية التحصين الأمني ===

    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ""
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
    if (!url || !serviceKey) {
      return apiError(HTTP_STATUS.INTERNAL_ERROR, "خطأ في إعدادات الخادم", "Server configuration error")
    }

    const admin = createClient(url, serviceKey, { global: { headers: { apikey: serviceKey } } })
    const { searchParams } = new URL(req.url)
    const endDate = String(searchParams.get("endDate") || new Date().toISOString().slice(0,10))

    // جلب الفواتير مع المرتجعات
    const { data: invs } = await admin
      .from("invoices")
      .select("id, customer_id, due_date, total_amount, returned_amount")
      .eq("company_id", companyId)
      .in("status", ["sent", "partially_paid"]) // open invoices

    const { data: pays } = await admin
      .from("payments")
      .select("invoice_id, amount, payment_date")
      .eq("company_id", companyId)
      .lte("payment_date", endDate)

    const paidMap: Record<string, number> = {}
    for (const p of pays || []) {
      const iid = String((p as any).invoice_id || "")
      if (!iid) continue
      paidMap[iid] = (paidMap[iid] || 0) + Number((p as any).amount || 0)
    }

    const end = new Date(endDate)
    const bucketsByCustomer: Record<string, { not_due: number; d0_30: number; d31_60: number; d61_90: number; d91_plus: number; total: number }> = {}
    for (const inv of invs || []) {
      const id = String((inv as any).id)
      const custId = String((inv as any).customer_id)
      const total = Number((inv as any).total_amount || 0)
      const paid = Number(paidMap[id] || 0)
      const returned = Number((inv as any).returned_amount || 0)
      // صافي المتبقي = الإجمالي - المدفوع - المرتجعات
      const outstanding = Math.max(total - paid - returned, 0)
      if (outstanding <= 0) continue
      const dueDateStr = String((inv as any).due_date || "")
      const due = dueDateStr ? new Date(dueDateStr) : null
      const daysPast = due ? Math.floor((end.getTime() - due.getTime()) / (1000 * 60 * 60 * 24)) : 0
      const agg = bucketsByCustomer[custId] || { not_due: 0, d0_30: 0, d31_60: 0, d61_90: 0, d91_plus: 0, total: 0 }
      if (due && daysPast < 0) agg.not_due += outstanding
      else if (daysPast <= 30) agg.d0_30 += outstanding
      else if (daysPast <= 60) agg.d31_60 += outstanding
      else if (daysPast <= 90) agg.d61_90 += outstanding
      else agg.d91_plus += outstanding
      agg.total += outstanding
      bucketsByCustomer[custId] = agg
    }

    const { data: customers } = await admin.from("customers").select("id,name").eq("company_id", companyId)
    const custMap = new Map((customers || []).map((c: any) => [String(c.id), String(c.name || '')]))

    const rows = Object.entries(bucketsByCustomer).map(([customer_id, b]) => ({ customer_id, customer_name: custMap.get(customer_id) || customer_id, ...b }))
    return apiSuccess(rows)
  } catch (e: any) {
    return internalError("حدث خطأ أثناء جلب تقرير الذمم المدينة", e?.message)
  }
}