/**
 * 📊 Aging AP Base API - تقرير الذمم الدائنة (الأساسي)
 * 
 * ⚠️ OPERATIONAL REPORT (NOT ACCOUNTING REPORT)
 * 
 * ✅ هذا تقرير تشغيلي - يمكنه القراءة من bills و payments مباشرة
 * ✅ ليس تقرير محاسبي رسمي (التقارير المحاسبية تعتمد على journal_entries فقط)
 * 
 * ✅ القواعد:
 * 1. مصدر البيانات: bills و payments (تشغيلي)
 * 2. الحساب: المتبقي = total_amount - paid_amount
 * 3. التصنيف: حسب الأيام المتأخرة (0-30, 31-60, 61-90, 90+)
 * 
 * ⚠️ ملاحظة مهمة:
 * - هذا التقرير تشغيلي وليس محاسبي رسمي
 * - التقارير المحاسبية الرسمية تعتمد على journal_entries فقط
 * - هذا التقرير يستخدم bills لتوضيح تشغيلي
 * 
 * راجع: docs/OPERATIONAL_REPORTS_GUIDE.md
 */

import { createClient as createServerClient } from "@/lib/supabase/server"
import { createClient } from "@supabase/supabase-js"
import { secureApiRequest, serverError, badRequestError } from "@/lib/api-security-enhanced"
import { buildBranchFilter } from "@/lib/branch-access-control"
import { NextRequest, NextResponse } from "next/server"

export async function GET(req: NextRequest) {
  try {
    // ✅ إنشاء supabase client للمصادقة
    const authSupabase = await createServerClient()

    // ✅ تحصين موحد لتقرير الذمم الدائنة (AP Aging)
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
    const endDate = String(searchParams.get("endDate") || new Date().toISOString().slice(0,10))

    // ✅ جلب الفواتير (تقرير تشغيلي - من bills مباشرة)
    // ⚠️ ملاحظة: هذا تقرير تشغيلي وليس محاسبي رسمي
    // ✅ Use 'received' and 'partially_paid' for bills (not 'sent' which is for invoices)
    const { data: bills, error: billsError } = await admin
      .from("bills")
      .select("id, bill_number, bill_date, due_date, total_amount, status, suppliers(id, name)")
      .eq("company_id", companyId)
      .or("is_deleted.is.null,is_deleted.eq.false") // ✅ استثناء الفواتير المحذوفة
      .in("status", ["received", "partially_paid"])

    if (billsError) {
      return serverError(`خطأ في جلب الفواتير: ${billsError.message}`)
    }

    const { data: pays, error: paysError } = await admin
      .from("payments")
      .select("bill_id, amount, payment_date")
      .eq("company_id", companyId)
      .lte("payment_date", endDate)

    if (paysError) {
      return serverError(`خطأ في جلب المدفوعات: ${paysError.message}`)
    }
    const paidMap: Record<string, number> = {}
    for (const p of (pays || [])) {
      const billId = String((p as any).bill_id || '')
      if (!billId) continue
      paidMap[billId] = (paidMap[billId] || 0) + Number((p as any).amount || 0)
    }

    return NextResponse.json({
      success: true,
      data: { bills: bills || [], paidMap }
    })
  } catch (e: any) {
    return serverError(`حدث خطأ أثناء جلب تقرير الذمم الدائنة: ${e?.message || "unknown_error"}`)
  }
}