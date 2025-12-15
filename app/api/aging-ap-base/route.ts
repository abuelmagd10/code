import { NextRequest } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { secureApiRequest } from "@/lib/api-security"
import { apiError, apiSuccess, HTTP_STATUS, internalError } from "@/lib/api-error-handler"

export async function GET(req: NextRequest) {
  try {
    // ✅ تحصين موحد لتقرير الذمم الدائنة (AP Aging)
    const { companyId, error } = await secureApiRequest(req, {
      requireAuth: true,
      requireCompany: true,
      requirePermission: { resource: "reports", action: "read" }
    })

    if (error) return error
    if (!companyId) {
      return apiError(
        HTTP_STATUS.NOT_FOUND,
        "لم يتم العثور على الشركة",
        "Company not found"
      )
    }

    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ""
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
    if (!url || !serviceKey) {
      return internalError("خطأ في إعدادات الخادم", "Server configuration error")
    }

    const admin = createClient(url, serviceKey, { global: { headers: { apikey: serviceKey } } })
    const { searchParams } = new URL(req.url)
    const endDate = String(searchParams.get("endDate") || new Date().toISOString().slice(0,10))

    // Use 'received' and 'partially_paid' for bills (not 'sent' which is for invoices)
    const { data: bills, error: billsError } = await admin
      .from("bills")
      .select("id, bill_number, bill_date, due_date, total_amount, status, suppliers(id, name)")
      .eq("company_id", companyId)
      .in("status", ["received", "partially_paid"])

    if (billsError) {
      return internalError("خطأ في جلب الفواتير", billsError.message)
    }

    const { data: pays, error: paysError } = await admin
      .from("payments")
      .select("bill_id, amount, payment_date")
      .eq("company_id", companyId)
      .lte("payment_date", endDate)

    if (paysError) {
      return internalError("خطأ في جلب المدفوعات", paysError.message)
    }
    const paidMap: Record<string, number> = {}
    for (const p of (pays || [])) {
      const billId = String((p as any).bill_id || '')
      if (!billId) continue
      paidMap[billId] = (paidMap[billId] || 0) + Number((p as any).amount || 0)
    }

    return apiSuccess({ bills: bills || [], paidMap })
  } catch (e: any) {
    return internalError("حدث خطأ أثناء جلب تقرير الذمم الدائنة", e?.message || "unknown_error")
  }
}