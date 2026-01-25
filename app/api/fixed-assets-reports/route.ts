/**
 * 📊 Fixed Assets Reports API - تقارير الأصول الثابتة
 * 
 * ⚠️ OPERATIONAL REPORT (NOT ACCOUNTING REPORT)
 * 
 * ✅ هذا تقرير تشغيلي - يمكنه القراءة من fixed_assets و depreciation_schedules مباشرة
 * ✅ ليس تقرير محاسبي رسمي (التقارير المحاسبية تعتمد على journal_entries فقط)
 * 
 * ✅ القواعد:
 * 1. مصدر البيانات: fixed_assets, depreciation_schedules (تشغيلي)
 * 2. التقارير المتاحة:
 *    - Monthly Depreciation %: نسبة الإهلاك الشهري لكل أصل
 *    - Asset Value Before/After: قيمة الأصل قبل وبعد الإهلاك
 *    - Remaining Useful Life: العمر المتبقي لكل أصل
 *    - Assets Revaluation: الزيادة والنقصان في قيمة الأصول
 *    - Annual Depreciation Schedule: جدول الإهلاك السنوي
 * 
 * ⚠️ ملاحظة مهمة:
 * - هذا التقرير تشغيلي وليس محاسبي رسمي
 * - التقارير المحاسبية الرسمية تعتمد على journal_entries فقط
 * - هذا التقرير يستخدم fixed_assets لتوضيح تشغيلي
 * 
 * راجع: docs/OPERATIONAL_REPORTS_GUIDE.md
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient as createServerClient } from "@/lib/supabase/server"
import { createClient } from "@supabase/supabase-js"
import { secureApiRequest, serverError, badRequestError } from "@/lib/api-security-enhanced"
import { buildBranchFilter } from "@/lib/branch-access-control"

async function getAdmin() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ""
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
  return url && serviceKey ? createClient(url, serviceKey, { global: { headers: { apikey: serviceKey } } }) : null
}

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

    const admin = await getAdmin()
    if (!admin) {
      return serverError(`خطأ في إعدادات الخادم: ${"Server configuration error"}`)
    }

    const { searchParams } = new URL(req.url)
    const reportType = String(searchParams.get("type") || "monthly_depreciation")
    const year = searchParams.get("year") || new Date().getFullYear().toString()
    const assetId = searchParams.get("asset_id") || ""

    const branchFilter = buildBranchFilter(branchId, member.role)

    // ✅ جلب الأصول الثابتة (تقرير تشغيلي - من fixed_assets مباشرة)
    let assetsQuery = admin
      .from("fixed_assets")
      .select(`
        id,
        asset_code,
        name,
        purchase_date,
        depreciation_start_date,
        purchase_cost,
        salvage_value,
        accumulated_depreciation,
        book_value,
        useful_life_months,
        depreciation_method,
        status,
        asset_categories(name),
        branches(name, branch_name),
        cost_centers(cost_center_name)
      `)
      .eq("company_id", companyId)
      .match(branchFilter)

    if (assetId) {
      assetsQuery = assetsQuery.eq("id", assetId)
    }

    const { data: assets } = await assetsQuery

    if (!assets || assets.length === 0) {
      return NextResponse.json({
        success: true,
        data: []
      })
    }

    // ✅ جلب جداول الإهلاك (تقرير تشغيلي - من depreciation_schedules مباشرة)
    const assetIds = assets.map((a: any) => a.id)
    const { data: depreciationSchedules } = await admin
      .from("depreciation_schedules")
      .select("asset_id, period_number, period_date, depreciation_amount, accumulated_depreciation, book_value, status")
      .in("asset_id", assetIds)
      .order("period_date")

    const schedulesByAsset = new Map<string, any[]>()
    for (const schedule of depreciationSchedules || []) {
      const assetId = String(schedule.asset_id)
      if (!schedulesByAsset.has(assetId)) {
        schedulesByAsset.set(assetId, [])
      }
      schedulesByAsset.get(assetId)!.push(schedule)
    }

    // معالجة حسب نوع التقرير
    let result: any[] = []

    switch (reportType) {
      case "monthly_depreciation": {
        // نسبة الإهلاك الشهري لكل أصل
        result = assets.map((asset: any) => {
          const schedules = schedulesByAsset.get(asset.id) || []
          const monthlyDepreciation = asset.useful_life_months > 0
            ? (asset.purchase_cost - asset.salvage_value) / asset.useful_life_months
            : 0
          const depreciationPercentage = asset.purchase_cost > 0
            ? (monthlyDepreciation / asset.purchase_cost) * 100
            : 0

          return {
            asset_id: asset.id,
            asset_code: asset.asset_code,
            asset_name: asset.name,
            category_name: asset.asset_categories?.name || "",
            purchase_cost: Number(asset.purchase_cost || 0),
            salvage_value: Number(asset.salvage_value || 0),
            useful_life_months: asset.useful_life_months,
            monthly_depreciation: monthlyDepreciation,
            depreciation_percentage: depreciationPercentage,
            accumulated_depreciation: Number(asset.accumulated_depreciation || 0),
            book_value: Number(asset.book_value || 0),
            status: asset.status
          }
        })
        break
      }

      case "asset_value_before_after": {
        // قيمة الأصل قبل وبعد الإهلاك
        result = assets.map((asset: any) => {
          const schedules = schedulesByAsset.get(asset.id) || []
          const firstSchedule = schedules[0]
          const lastSchedule = schedules[schedules.length - 1]

          return {
            asset_id: asset.id,
            asset_code: asset.asset_code,
            asset_name: asset.name,
            category_name: asset.asset_categories?.name || "",
            purchase_cost: Number(asset.purchase_cost || 0),
            value_before_depreciation: Number(asset.purchase_cost || 0),
            value_after_depreciation: Number(asset.book_value || 0),
            accumulated_depreciation: Number(asset.accumulated_depreciation || 0),
            depreciation_percentage: asset.purchase_cost > 0
              ? (Number(asset.accumulated_depreciation || 0) / Number(asset.purchase_cost || 0)) * 100
              : 0,
            status: asset.status
          }
        })
        break
      }

      case "remaining_useful_life": {
        // العمر المتبقي لكل أصل
        result = assets.map((asset: any) => {
          const schedules = schedulesByAsset.get(asset.id) || []
          const elapsedMonths = schedules.filter((s: any) => s.status === 'posted').length
          const remainingMonths = Math.max(0, asset.useful_life_months - elapsedMonths)
          const remainingPercentage = asset.useful_life_months > 0
            ? (remainingMonths / asset.useful_life_months) * 100
            : 0

          return {
            asset_id: asset.id,
            asset_code: asset.asset_code,
            asset_name: asset.name,
            category_name: asset.asset_categories?.name || "",
            purchase_date: asset.purchase_date,
            depreciation_start_date: asset.depreciation_start_date,
            useful_life_months: asset.useful_life_months,
            elapsed_months: elapsedMonths,
            remaining_months: remainingMonths,
            remaining_percentage: remainingPercentage,
            book_value: Number(asset.book_value || 0),
            status: asset.status
          }
        })
        break
      }

      case "assets_revaluation": {
        // الزيادة والنقصان في قيمة الأصول
        result = assets.map((asset: any) => {
          const schedules = schedulesByAsset.get(asset.id) || []
          const firstSchedule = schedules[0]
          const lastSchedule = schedules[schedules.length - 1]
          const initialValue = Number(asset.purchase_cost || 0)
          const currentValue = Number(asset.book_value || 0)
          const change = currentValue - initialValue
          const changePercentage = initialValue > 0 ? (change / initialValue) * 100 : 0

          return {
            asset_id: asset.id,
            asset_code: asset.asset_code,
            asset_name: asset.name,
            category_name: asset.asset_categories?.name || "",
            initial_value: initialValue,
            current_value: currentValue,
            change_amount: change,
            change_percentage: changePercentage,
            accumulated_depreciation: Number(asset.accumulated_depreciation || 0),
            status: asset.status
          }
        })
        break
      }

      case "annual_depreciation_schedule": {
        // جدول الإهلاك السنوي
        const yearNum = parseInt(year)
        result = assets.map((asset: any) => {
          const schedules = schedulesByAsset.get(asset.id) || []
          const yearSchedules = schedules.filter((s: any) => {
            const scheduleYear = new Date(s.period_date).getFullYear()
            return scheduleYear === yearNum
          })

          const totalDepreciation = yearSchedules.reduce((sum: number, s: any) => 
            sum + Number(s.depreciation_amount || 0), 0
          )

          return {
            asset_id: asset.id,
            asset_code: asset.asset_code,
            asset_name: asset.name,
            category_name: asset.asset_categories?.name || "",
            year: yearNum,
            periods_count: yearSchedules.length,
            total_depreciation: totalDepreciation,
            monthly_average: yearSchedules.length > 0 ? totalDepreciation / yearSchedules.length : 0,
            schedules: yearSchedules.map((s: any) => ({
              period_number: s.period_number,
              period_date: s.period_date,
              depreciation_amount: Number(s.depreciation_amount || 0),
              accumulated_depreciation: Number(s.accumulated_depreciation || 0),
              book_value: Number(s.book_value || 0),
              status: s.status
            }))
          }
        })
        break
      }

      default:
        return badRequestError("نوع التقرير غير صحيح")
    }

    return NextResponse.json({
      success: true,
      data: result
    })
  } catch (e: any) {
    return serverError(`حدث خطأ أثناء جلب تقرير الأصول الثابتة: ${e?.message || "unknown_error"}`)
  }
}
