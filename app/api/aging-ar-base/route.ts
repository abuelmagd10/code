/**
 * 📊 Aging AR Base API - تقرير الذمم المدينة (الأساسي)
 * 
 * ⚠️ OPERATIONAL REPORT (NOT ACCOUNTING REPORT)
 * 
 * ✅ هذا تقرير تشغيلي - يمكنه القراءة من invoices و payments مباشرة
 * ✅ ليس تقرير محاسبي رسمي (التقارير المحاسبية تعتمد على journal_entries فقط)
 * 
 * ✅ القواعد:
 * 1. مصدر البيانات: invoices و payments (تشغيلي)
 * 2. الحساب: المتبقي = total_amount - paid_amount - returned_amount
 * 3. التصنيف: حسب الأيام المتأخرة (0-30, 31-60, 61-90, 90+)
 * 
 * ⚠️ ملاحظة مهمة:
 * - هذا التقرير تشغيلي وليس محاسبي رسمي
 * - التقارير المحاسبية الرسمية تعتمد على journal_entries فقط
 * - هذا التقرير يستخدم invoices لتوضيح تشغيلي
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

    // ✅ تحصين موحد لتقرير الذمم المدينة (AR Aging)
    const { companyId, error } = await secureApiRequest(req, {
      requireAuth: true,
      requireCompany: true,
      requirePermission: { resource: "financial_reports", action: "read" },
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

    // ✅ جلب الفواتير (تقرير تشغيلي - من invoices مباشرة)
    // ⚠️ ملاحظة: هذا تقرير تشغيلي وليس محاسبي رسمي
    const { data: invs } = await admin
      .from("invoices")
      // v3.74.536 — include paid_amount so paidMap can be built from
      // the already-correct column instead of summing raw payments.
      .select("id, customer_id, due_date, total_amount, paid_amount")
      .eq("company_id", companyId)
      .or("is_deleted.is.null,is_deleted.eq.false") // ✅ استثناء الفواتير المحذوفة
      .in("status", ["sent", "partially_paid"])

    const customerIds = Array.from(new Set((invs || []).map((i: any) => i.customer_id).filter(Boolean)))
    let customers: Record<string, { id: string; name: string }> = {}
    if (customerIds.length) {
      const { data: custs } = await admin
        .from("customers")
        .select("id, name")
        .eq("company_id", companyId)
        .in("id", customerIds)
      for (const c of (custs || [])) { customers[String((c as any).id)] = { id: String((c as any).id), name: String((c as any).name || '') } }
    }

    // v3.74.536 — build paidMap from invoices.paid_amount instead of
    // summing raw payments.amount (which ignored FX + status). Use
    // aging-ar-gl for historical as-of-date accuracy.
    const paidMap: Record<string, number> = {}
    for (const inv of (invs || [])) {
      paidMap[String((inv as any).id)] = Number((inv as any).paid_amount || 0)
    }

    return NextResponse.json({
      success: true,
      data: { invoices: invs || [], customers, paidMap }
    })
  } catch (e: any) {
    return serverError(`حدث خطأ أثناء جلب تقرير الذمم المدينة: ${e?.message || "unknown_error"}`)
  }
}