import { createClient } from "@/lib/supabase/server"
import { secureApiRequest, serverError, badRequestError } from "@/lib/api-security-enhanced"
import { buildBranchFilter } from "@/lib/branch-access-control"
import { NextRequest, NextResponse } from "next/server"




export async function GET(req: NextRequest) {
  try {
    // === تحصين أمني: استخدام secureApiRequest ===
    const { user, companyId, branchId, member, error } = await secureApiRequest(req, {
      requireAuth: true,
      requireCompany: true,
      requireBranch: true,
      requirePermission: { resource: "reports", action: "read" }
    })

    if (error) return error
    if (!companyId) return badRequestError("معرف الشركة مطلوب")
    if (!branchId) return badRequestError("معرف الفرع مطلوب")
    // === نهاية التحصين الأمني ===

    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ""
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
    if (!url || !serviceKey) {
      return serverError(`خطأ في إعدادات الخادم: ${"Server configuration error"}`)
    }

    const admin = createClient(url, serviceKey, { global: { headers: { apikey: serviceKey } } })
    const { searchParams } = new URL(req.url)
    const endDate = String(searchParams.get("endDate") || new Date().toISOString().slice(0,10))

    // جلب الفواتير مع المرتجعات
    const { data: bills } = await admin
      .from("bills")
      .select("id, supplier_id, bill_number, bill_date, due_date, total_amount, returned_amount, status, suppliers(name)")
      .eq("company_id", companyId)
      .in("status", ["received", "partially_paid"]) // open bills - استخدام received وليس sent

    const { data: pays } = await admin
      .from("payments")
      .select("bill_id, amount, payment_date")
      .eq("company_id", companyId)
      .lte("payment_date", endDate)

    const paidMap: Record<string, number> = {}
    for (const p of pays || []) {
      const bid = String((p as any).bill_id || "")
      if (!bid) continue
      paidMap[bid] = (paidMap[bid] || 0) + Number((p as any).amount || 0)
    }

    const end = new Date(endDate)
    const rows = (bills || []).map((b: any) => {
      const returned = Number(b.returned_amount || 0)
      // صافي المتبقي = الإجمالي - المدفوع - المرتجعات
      const outstanding = Math.max(Number(b.total_amount || 0) - Number(paidMap[String(b.id)] || 0) - returned, 0)
      const due = b.due_date ? new Date(String(b.due_date)) : new Date(String(b.bill_date))
      const diffDays = Math.floor((end.getTime() - due.getTime()) / (1000 * 60 * 60 * 24))
      const buckets = { notDue: 0, d0_30: 0, d31_60: 0, d61_90: 0, d91_plus: 0 }
      if (outstanding > 0) {
        if (diffDays <= 0) buckets.notDue = outstanding
        else if (diffDays <= 30) buckets.d0_30 = outstanding
        else if (diffDays <= 60) buckets.d31_60 = outstanding
        else if (diffDays <= 90) buckets.d61_90 = outstanding
        else buckets.d91_plus = outstanding
      }
      return {
        id: String(b.id),
        supplier_id: String(b.supplier_id || ''),
        supplier_name: String(((b.suppliers||{}).name)||''),
        bill_number: String(b.bill_number || ''),
        bill_date: String(b.bill_date || ''),
        due_date: String(b.due_date || ''),
        outstanding,
        ...buckets,
      }
    })
    return NextResponse.json({
      success: true,
      data: rows
    })
  } catch (e: any) {
    return serverError(`حدث خطأ أثناء جلب تقرير الذمم الدائنة: ${e?.message}`)
  }
}