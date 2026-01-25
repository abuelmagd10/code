/**
 * 📊 Supplier Price Comparison API - مقارنة أسعار المنتجات بين الموردين
 * 
 * ⚠️ OPERATIONAL REPORT (NOT ACCOUNTING REPORT)
 * 
 * ✅ هذا تقرير تشغيلي - يمكنه القراءة من bills و bill_items مباشرة
 * ✅ ليس تقرير محاسبي رسمي (التقارير المحاسبية تعتمد على journal_entries فقط)
 * 
 * ✅ القواعد:
 * 1. مصدر البيانات: bills و bill_items (تشغيلي)
 * 2. التجميع: حسب المنتج والمورد
 * 3. الحساب: متوسط سعر الشراء لكل منتج من كل مورد
 * 4. المقارنة: عرض جميع الموردين مع أسعارهم لكل منتج
 * 
 * ⚠️ ملاحظة مهمة:
 * - هذا التقرير تشغيلي وليس محاسبي رسمي
 * - التقارير المحاسبية الرسمية تعتمد على journal_entries فقط
 * - هذا التقرير يستخدم bills لتوضيح تشغيلي لمقارنة الأسعار
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
    const from = String(searchParams.get("from") || "")
    const to = String(searchParams.get("to") || "")
    const productId = searchParams.get("product_id") || ""

    if (!from || !to) {
      return badRequestError("من تاريخ وإلى تاريخ مطلوبان")
    }

    const branchFilter = buildBranchFilter(branchId, member.role)

    // ✅ جلب فواتير الشراء (تقرير تشغيلي - من bills مباشرة)
    // ⚠️ ملاحظة: هذا تقرير تشغيلي وليس محاسبي رسمي
    let billsQuery = admin
      .from("bills")
      .select("id, supplier_id, suppliers(name)")
      .eq("company_id", companyId)
      .match(branchFilter)
      .or("is_deleted.is.null,is_deleted.eq.false") // ✅ استثناء الفواتير المحذوفة
      .gte("bill_date", from)
      .lte("bill_date", to)
      .in("status", ["received", "partially_paid", "paid"])

    const { data: bills } = await billsQuery

    if (!bills || bills.length === 0) {
      return NextResponse.json({
        success: true,
        data: []
      })
    }

    const billIds = bills.map((b: any) => b.id)

    // ✅ جلب بنود فواتير الشراء (تقرير تشغيلي - من bill_items مباشرة)
    // ⚠️ ملاحظة: هذا تقرير تشغيلي وليس محاسبي رسمي
    let itemsQuery = admin
      .from("bill_items")
      .select("bill_id, product_id, unit_price, quantity, bills!inner(supplier_id, suppliers(name), is_deleted), products(name, sku)")
      .in("bill_id", billIds)
      .or("bills.is_deleted.is.null,bills.is_deleted.eq.false") // ✅ استثناء بنود الفواتير المحذوفة

    if (productId) {
      itemsQuery = itemsQuery.eq("product_id", productId)
    }

    const { data: billItems } = await itemsQuery

    // تجميع حسب المنتج والمورد
    const priceMap = new Map<string, {
      product_id: string
      product_name: string
      product_sku: string
      supplier_id: string
      supplier_name: string
      avg_price: number
      min_price: number
      max_price: number
      total_quantity: number
      total_price: number
      bill_count: number
    }>()

    for (const item of billItems || []) {
      const bill = (item as any).bills
      const product = (item as any).products
      const supplier = bill.suppliers || {}
      const unitPrice = Number(item.unit_price || 0)
      const quantity = Number(item.quantity || 0)

      const productId = String(item.product_id)
      const supplierId = String(bill.supplier_id)
      const key = `${productId}_${supplierId}`

      const existing = priceMap.get(key)
      if (existing) {
        existing.min_price = Math.min(existing.min_price, unitPrice)
        existing.max_price = Math.max(existing.max_price, unitPrice)
        existing.total_quantity += quantity
        existing.total_price += (unitPrice * quantity)
        existing.bill_count += 1
      } else {
        priceMap.set(key, {
          product_id: productId,
          product_name: product?.name || "Unknown",
          product_sku: product?.sku || "",
          supplier_id: supplierId,
          supplier_name: supplier?.name || "Unknown",
          avg_price: 0,
          min_price: unitPrice,
          max_price: unitPrice,
          total_quantity: quantity,
          total_price: unitPrice * quantity,
          bill_count: 1
        })
      }
    }

    // حساب المتوسطات وتجميع حسب المنتج
    const productMap = new Map<string, {
      product_id: string
      product_name: string
      product_sku: string
      suppliers: Array<{
        supplier_id: string
        supplier_name: string
        avg_price: number
        min_price: number
        max_price: number
        total_quantity: number
        bill_count: number
      }>
    }>()

    for (const item of Array.from(priceMap.values())) {
      const existing = productMap.get(item.product_id) || {
        product_id: item.product_id,
        product_name: item.product_name,
        product_sku: item.product_sku,
        suppliers: []
      }

      existing.suppliers.push({
        supplier_id: item.supplier_id,
        supplier_name: item.supplier_name,
        avg_price: item.total_quantity > 0 ? item.total_price / item.total_quantity : 0,
        min_price: item.min_price,
        max_price: item.max_price,
        total_quantity: item.total_quantity,
        bill_count: item.bill_count
      })

      // ترتيب الموردين حسب السعر (الأقل أولاً)
      existing.suppliers.sort((a, b) => a.avg_price - b.avg_price)

      productMap.set(item.product_id, existing)
    }

    const result = Array.from(productMap.values()).sort((a, b) => 
      a.product_name.localeCompare(b.product_name)
    )

    return NextResponse.json({
      success: true,
      data: result
    })
  } catch (e: any) {
    return serverError(`حدث خطأ أثناء جلب تقرير مقارنة الأسعار: ${e?.message || "unknown_error"}`)
  }
}
