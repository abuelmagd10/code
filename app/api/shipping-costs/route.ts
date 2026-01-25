/**
 * 📊 Shipping Costs Report API - تقرير تكاليف الشحن
 * 
 * ⚠️ OPERATIONAL REPORT (NOT ACCOUNTING REPORT)
 * 
 * ✅ هذا تقرير تشغيلي - يمكنه القراءة من shipments مباشرة
 * ✅ ليس تقرير محاسبي رسمي (التقارير المحاسبية تعتمد على journal_entries فقط)
 * 
 * ✅ القواعد:
 * 1. مصدر البيانات: shipments (تشغيلي)
 * 2. التجميع: حسب مزود الشحن، الحالة، الفترة
 * 3. الفلترة: حسب التاريخ، الحالة، مزود الشحن
 * 4. الفروع: دعم كامل للفروع ومراكز التكلفة
 * 
 * ⚠️ ملاحظة مهمة:
 * - هذا التقرير تشغيلي وليس محاسبي رسمي
 * - التقارير المحاسبية الرسمية تعتمد على journal_entries فقط
 * - هذا التقرير يستخدم shipments لتوضيح تشغيلي
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
      supabase: authSupabase
    })

    if (error) return error
    if (!companyId) return badRequestError("معرف الشركة مطلوب")
    if (!branchId) return badRequestError("معرف الفرع مطلوب")

    const supabase = await createServerClient()
    const { searchParams } = new URL(req.url)
    const from = String(searchParams.get("from") || "0001-01-01")
    const to = String(searchParams.get("to") || "9999-12-31")
    const statusFilter = String(searchParams.get("status") || "all")
    const providerId = searchParams.get("provider_id") || ""
    const groupBy = String(searchParams.get("group_by") || "provider") // provider, status, period
    const period = String(searchParams.get("period") || "month") // day, week, month
    const branchFilter = buildBranchFilter(branchId!, member.role)

    // ✅ جلب الشحنات (تقرير تشغيلي - من shipments مباشرة)
    // ⚠️ ملاحظة: هذا تقرير تشغيلي وليس محاسبي رسمي
    let shipmentsQuery = supabase
      .from("shipments")
      .select(`
        id,
        shipping_cost,
        status,
        created_at,
        shipping_provider_id,
        shipping_providers(provider_name)
      `)
      .eq("company_id", companyId)
      .match(branchFilter)
      .or("is_deleted.is.null,is_deleted.eq.false") // ✅ استثناء الشحنات المحذوفة
      .gte("created_at", from)
      .lte("created_at", to + "T23:59:59")

    // تطبيق فلتر الحالة
    if (statusFilter !== "all") {
      shipmentsQuery = shipmentsQuery.eq("status", statusFilter)
    }

    // تطبيق فلتر مزود الشحن
    if (providerId) {
      shipmentsQuery = shipmentsQuery.eq("shipping_provider_id", providerId)
    }

    const { data: shipments, error: shipmentsError } = await shipmentsQuery

    if (shipmentsError) {
      return serverError(`خطأ في جلب الشحنات: ${shipmentsError.message}`)
    }

    if (!shipments || shipments.length === 0) {
      return NextResponse.json({
        success: true,
        data: [],
        summary: {
          total_cost: 0,
          shipment_count: 0,
          avg_cost: 0
        }
      })
    }

    // تجميع البيانات حسب المعيار المحدد
    const groupedMap = new Map<string, {
      key: string
      label: string
      total_cost: number
      shipment_count: number
      avg_cost: number
    }>()

    for (const shipment of shipments) {
      const cost = Number((shipment as any).shipping_cost || 0)
      const status = (shipment as any).status || "unknown"
      const provider = (shipment as any).shipping_providers as any
      const providerName = provider?.provider_name || "غير محدد"
      const providerId = (shipment as any).shipping_provider_id || "unknown"
      const createdAt = new Date((shipment as any).created_at)

      let key = ""
      let label = ""

      if (groupBy === "provider") {
        key = providerId
        label = providerName
      } else if (groupBy === "status") {
        key = status
        label = status
      } else if (groupBy === "period") {
        if (period === "month") {
          key = `${createdAt.getFullYear()}-${String(createdAt.getMonth() + 1).padStart(2, '0')}`
          label = key
        } else if (period === "week") {
          const weekStart = new Date(createdAt)
          weekStart.setDate(createdAt.getDate() - createdAt.getDay())
          key = `${weekStart.getFullYear()}-W${String(Math.ceil((weekStart.getDate() + 6) / 7)).padStart(2, '0')}`
          label = key
        } else {
          key = createdAt.toISOString().split('T')[0]
          label = key
        }
      }

      const existing = groupedMap.get(key) || {
        key,
        label,
        total_cost: 0,
        shipment_count: 0,
        avg_cost: 0
      }

      existing.total_cost += cost
      existing.shipment_count += 1
      existing.avg_cost = existing.total_cost / existing.shipment_count

      groupedMap.set(key, existing)
    }

    const result = Array.from(groupedMap.values())
      .sort((a, b) => b.total_cost - a.total_cost)

    const summary = {
      total_cost: result.reduce((sum, r) => sum + r.total_cost, 0),
      shipment_count: result.reduce((sum, r) => sum + r.shipment_count, 0),
      avg_cost: result.length > 0 ? result.reduce((sum, r) => sum + r.avg_cost, 0) / result.length : 0
    }

    return NextResponse.json({
      success: true,
      data: result,
      summary
    })
  } catch (e: any) {
    return serverError(`حدث خطأ أثناء جلب تقرير تكاليف الشحن: ${e?.message || "unknown_error"}`)
  }
}
