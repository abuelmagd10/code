/**
 * 📊 Inventory Count Report API - تقرير جرد المخزون
 * 
 * ⚠️ OPERATIONAL REPORT (NOT ACCOUNTING REPORT)
 * 
 * ✅ هذا تقرير تشغيلي - يمكنه القراءة من products و inventory_transactions مباشرة
 * ✅ ليس تقرير محاسبي رسمي (التقارير المحاسبية تعتمد على journal_entries فقط)
 * 
 * ✅ القواعد:
 * 1. مصدر البيانات: products, inventory_transactions (تشغيلي)
 * 2. المقارنة: الكمية في النظام (quantity_on_hand) vs الكمية المحسوبة من الحركات
 * 3. الفلترة: حسب المنتج، الفرع، المخزن
 * 
 * ⚠️ ملاحظة مهمة:
 * - هذا التقرير تشغيلي وليس محاسبي رسمي
 * - التقارير المحاسبية الرسمية تعتمد على journal_entries فقط
 * - هذا التقرير يستخدم products و inventory_transactions لتوضيح تشغيلي
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
    const productId = searchParams.get("product_id") || ""
    const warehouseId = searchParams.get("warehouse_id") || ""
    const showDiscrepanciesOnly = searchParams.get("discrepancies_only") === "true"

    const branchFilter = buildBranchFilter(branchId, member.role)

    // ✅ جلب المنتجات (تقرير تشغيلي - من products مباشرة)
    // ⚠️ ملاحظة: هذا تقرير تشغيلي وليس محاسبي رسمي
    let productsQuery = admin
      .from("products")
      .select("id, sku, name, quantity_on_hand, item_type")
      .eq("company_id", companyId)
      .or("item_type.is.null,item_type.eq.product")

    if (productId) {
      productsQuery = productsQuery.eq("id", productId)
    }

    const { data: products } = await productsQuery

    if (!products || products.length === 0) {
      return NextResponse.json({
        success: true,
        data: [],
        summary: {
          total_products: 0,
          matched_count: 0,
          discrepancies_count: 0
        }
      })
    }

    const productIds = products.map((p: any) => p.id)

    // ✅ جلب حركات المخزون (تقرير تشغيلي - من inventory_transactions مباشرة)
    let transactionsQuery = admin
      .from("inventory_transactions")
      .select("product_id, quantity_change, branch_id, warehouse_id")
      .eq("company_id", companyId)
      .in("product_id", productIds)
      .or("is_deleted.is.null,is_deleted.eq.false") // ✅ استثناء الحركات المحذوفة

    if (warehouseId) {
      transactionsQuery = transactionsQuery.eq("warehouse_id", warehouseId)
    }

    // تطبيق فلتر الفرع
    if (branchFilter.branch_id) {
      transactionsQuery = transactionsQuery.eq("branch_id", branchFilter.branch_id)
    }

    const { data: transactions } = await transactionsQuery

    // حساب الكميات المحسوبة من الحركات
    const calculatedQuantities = new Map<string, number>()
    for (const tx of transactions || []) {
      const pid = String(tx.product_id)
      const current = calculatedQuantities.get(pid) || 0
      calculatedQuantities.set(pid, current + Number(tx.quantity_change || 0))
    }

    // مقارنة الكميات
    const result = products.map((product: any) => {
      const systemQty = Number(product.quantity_on_hand || 0)
      const calculatedQty = calculatedQuantities.get(product.id) || 0
      const difference = calculatedQty - systemQty
      const hasDiscrepancy = Math.abs(difference) > 0.01

      return {
        product_id: product.id,
        product_sku: product.sku,
        product_name: product.name,
        system_quantity: systemQty,
        calculated_quantity: calculatedQty,
        difference: difference,
        has_discrepancy: hasDiscrepancy,
        status: hasDiscrepancy ? (difference > 0 ? "over" : "under") : "matched"
      }
    })

    // فلتر الاختلافات فقط
    const filteredResult = showDiscrepanciesOnly
      ? result.filter(r => r.has_discrepancy)
      : result

    // حساب الإجماليات
    const summary = {
      total_products: result.length,
      matched_count: result.filter(r => !r.has_discrepancy).length,
      discrepancies_count: result.filter(r => r.has_discrepancy).length,
      over_count: result.filter(r => r.status === "over").length,
      under_count: result.filter(r => r.status === "under").length,
      total_difference: result.reduce((sum, r) => sum + Math.abs(r.difference), 0)
    }

    return NextResponse.json({
      success: true,
      data: filteredResult.sort((a, b) => Math.abs(b.difference) - Math.abs(a.difference)),
      summary
    })
  } catch (e: any) {
    return serverError(`حدث خطأ أثناء جلب تقرير جرد المخزون: ${e?.message || "unknown_error"}`)
  }
}
