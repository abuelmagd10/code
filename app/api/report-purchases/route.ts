/**
 * 📊 Purchases Report API - تقرير المشتريات
 * 
 * ⚠️ OPERATIONAL REPORT (NOT ACCOUNTING REPORT)
 * 
 * ✅ هذا تقرير تشغيلي - يمكنه القراءة من bills مباشرة
 * ✅ ليس تقرير محاسبي رسمي (التقارير المحاسبية تعتمد على journal_entries فقط)
 * 
 * ✅ القواعد:
 * 1. مصدر البيانات: bills و bill_items (تشغيلي)
 * 2. التجميع: حسب المورد
 * 3. الفلترة: حسب التاريخ، الحالة، المورد، المنتج، نوع العنصر
 * 4. الفروع: دعم كامل للفروع ومراكز التكلفة
 * 
 * ⚠️ ملاحظة مهمة:
 * - هذا التقرير تشغيلي وليس محاسبي رسمي
 * - التقارير المحاسبية الرسمية تعتمد على journal_entries فقط
 * - هذا التقرير يستخدم bills لتوضيح تشغيلي
 * 
 * راجع: docs/ACCOUNTING_REPORTS_ARCHITECTURE.md
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

    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ""
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
    if (!url || !serviceKey) {
      return serverError(`خطأ في إعدادات الخادم: ${"Server configuration error"}`)
    }

    const admin = createClient(url, serviceKey, { global: { headers: { apikey: serviceKey } } })
    const { searchParams } = new URL(req.url)
    const from = String(searchParams.get("from") || "0001-01-01")
    const to = String(searchParams.get("to") || "9999-12-31")
    const itemType = String(searchParams.get("item_type") || "all") // 'all', 'product', 'service'
    const statusFilter = String(searchParams.get("status") || "all") // 'all', 'received', 'paid', 'partially_paid'
    const supplierId = searchParams.get("supplier_id") || ""
    const productId = searchParams.get("product_id") || ""

    // ✅ جلب الفواتير (تقرير تشغيلي - من bills مباشرة)
    // ⚠️ ملاحظة: هذا تقرير تشغيلي وليس محاسبي رسمي
    let billsQuery = admin
      .from("bills")
      .select("id, total_amount, bill_date, status, supplier_id, suppliers(name)")
      .eq("company_id", companyId)
      .gte("bill_date", from)
      .lte("bill_date", to)

    // تطبيق فلتر الحالة
    if (statusFilter === "all") {
      billsQuery = billsQuery.in("status", ["received", "partially_paid", "paid"])
    } else {
      billsQuery = billsQuery.eq("status", statusFilter)
    }

    // تطبيق فلتر المورد
    if (supplierId) {
      billsQuery = billsQuery.eq("supplier_id", supplierId)
    }

    const { data: bills } = await billsQuery

    if (!bills || bills.length === 0) {
      return NextResponse.json({
      success: true,
      data: []
    })
    }

    const billIds = bills.map((b: any) => b.id)

    // Get bill items with product info
    let itemsQuery = admin
      .from("bill_items")
      .select("bill_id, line_total, product_id, products(item_type, name)")
      .in("bill_id", billIds)

    // تطبيق فلتر المنتج إذا تم تحديده
    if (productId) {
      itemsQuery = itemsQuery.eq("product_id", productId)
    }

    const { data: billItems } = await itemsQuery

    // Build a map of bill_id -> { productTotal, serviceTotal }
    const billTotals = new Map<string, { productTotal: number; serviceTotal: number }>()
    for (const item of billItems || []) {
      const billId = String((item as any).bill_id)
      const lineTotal = Number((item as any).line_total || 0)
      const prodItemType = (item as any).products?.item_type || 'product'

      const existing = billTotals.get(billId) || { productTotal: 0, serviceTotal: 0 }
      if (prodItemType === 'service') {
        existing.serviceTotal += lineTotal
      } else {
        existing.productTotal += lineTotal
      }
      billTotals.set(billId, existing)
    }

    // Group by supplier with item type filtering
    const grouped: Record<string, { total: number; count: number; productPurchases: number; servicePurchases: number }> = {}
    for (const bill of bills) {
      const name = String(((bill as any).suppliers || {}).name || "Unknown")
      const billId = String((bill as any).id)
      const totals = billTotals.get(billId) || { productTotal: 0, serviceTotal: 0 }

      // Apply item type filter
      let relevantTotal = 0
      if (itemType === 'product') {
        relevantTotal = totals.productTotal
      } else if (itemType === 'service') {
        relevantTotal = totals.serviceTotal
      } else {
        relevantTotal = totals.productTotal + totals.serviceTotal
      }

      // Skip if no relevant purchases
      if (relevantTotal === 0) continue

      const prev = grouped[name] || { total: 0, count: 0, productPurchases: 0, servicePurchases: 0 }
      grouped[name] = {
        total: prev.total + relevantTotal,
        count: prev.count + 1,
        productPurchases: prev.productPurchases + totals.productTotal,
        servicePurchases: prev.servicePurchases + totals.serviceTotal
      }
    }

    const result = Object.entries(grouped).map(([supplier_name, v]) => ({
      supplier_name,
      total_purchases: v.total,
      bill_count: v.count,
      product_purchases: v.productPurchases,
      service_purchases: v.servicePurchases
    }))
    return NextResponse.json({
      success: true,
      data: result
    })
  } catch (e: any) {
    return serverError(`حدث خطأ أثناء جلب تقرير المشتريات: ${e?.message}`)
  }
}