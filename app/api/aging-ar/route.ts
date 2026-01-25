/**
 * 📊 Aging AR API - تقرير الذمم المدينة
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
 * 4. الفروع: دعم كامل للفروع
 * 
 * ⚠️ ملاحظة مهمة:
 * - هذا التقرير تشغيلي وليس محاسبي رسمي
 * - التقارير المحاسبية الرسمية تعتمد على journal_entries فقط
 * - هذا التقرير يستخدم invoices لتوضيح تشغيلي
 * 
 * راجع: docs/OPERATIONAL_REPORTS_GUIDE.md
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient as createServerClient } from "@/lib/supabase/server"
import { secureApiRequest, serverError, badRequestError } from "@/lib/api-security-enhanced"
import { buildBranchFilter } from "@/lib/branch-access-control"

export async function GET(req: NextRequest) {
  try {
    // ✅ إنشاء supabase client للمصادقة
    const authSupabase = await createServerClient()

    // ✅ التحقق من الأمان
    const { user, companyId, branchId, member, error } = await secureApiRequest(req, {
      requireAuth: true,
      requireCompany: true,
      requireBranch: true,
      requirePermission: { resource: "reports", action: "read" },
      supabase: authSupabase // ✅ تمرير supabase client
    })

    if (error) return error
    if (!companyId) return badRequestError("معرف الشركة مطلوب")
    if (!branchId) return badRequestError("معرف الفرع مطلوب")

    const supabase = await createServerClient()
    const { searchParams } = new URL(req.url)
    const endDate = String(searchParams.get("endDate") || new Date().toISOString().slice(0,10))
    const branchFilter = buildBranchFilter(branchId!, member.role)

    // ✅ جلب الفواتير (تقرير تشغيلي - من invoices مباشرة)
    // ⚠️ ملاحظة: هذا تقرير تشغيلي وليس محاسبي رسمي
    const { data: invs } = await supabase
      .from("invoices")
      .select("id, customer_id, due_date, total_amount, returned_amount")
      .eq("company_id", companyId)
      .match(branchFilter)
      .or("is_deleted.is.null,is_deleted.eq.false") // ✅ استثناء الفواتير المحذوفة
      .in("status", ["sent", "partially_paid"])

    const { data: pays } = await supabase
      .from("payments")
      .select("invoice_id, amount, payment_date")
      .eq("company_id", companyId)
      .match(branchFilter)
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

    const { data: customers } = await supabase
      .from("customers")
      .select("id,name")
      .eq("company_id", companyId)
      .match(branchFilter)
    const custMap = new Map((customers || []).map((c: any) => [String(c.id), String(c.name || '')]))

    const rows = Object.entries(bucketsByCustomer).map(([customer_id, b]) => ({ customer_id, customer_name: custMap.get(customer_id) || customer_id, ...b }))
    
    return NextResponse.json({
      success: true,
      data: rows
    })
  } catch (e: any) {
    return serverError(`حدث خطأ أثناء جلب تقرير الذمم المدينة: ${e?.message}`)
  }
}