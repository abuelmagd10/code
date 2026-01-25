/**
 * 📊 Top Products Report API - تقرير الأصناف الأكثر مبيعًا
 * 
 * ⚠️ OPERATIONAL REPORT (NOT ACCOUNTING REPORT)
 * 
 * ✅ هذا تقرير تشغيلي - يمكنه القراءة من invoices و invoice_items مباشرة
 * ✅ ليس تقرير محاسبي رسمي (التقارير المحاسبية تعتمد على journal_entries فقط)
 * 
 * ✅ القواعد:
 * 1. مصدر البيانات: invoices و invoice_items (تشغيلي)
 * 2. التجميع: حسب المنتج مع ترتيب حسب الإيرادات/الكمية
 * 3. الفلترة: حسب التاريخ، الحالة، نوع العنصر
 * 4. الفروع: دعم كامل للفروع ومراكز التكلفة
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
      supabase: authSupabase
    })

    if (error) return error
    if (!companyId) return badRequestError("معرف الشركة مطلوب")
    if (!branchId) return badRequestError("معرف الفرع مطلوب")

    const supabase = await createServerClient()
    const { searchParams } = new URL(req.url)
    const from = String(searchParams.get("from") || "0001-01-01")
    const to = String(searchParams.get("to") || "9999-12-31")
    const itemType = String(searchParams.get("item_type") || "all")
    const statusFilter = String(searchParams.get("status") || "all")
    const sortBy = String(searchParams.get("sort_by") || "revenue") // revenue or quantity
    const limit = parseInt(searchParams.get("limit") || "10")
    const branchFilter = buildBranchFilter(branchId!, member.role)

    // ✅ جلب الفواتير (تقرير تشغيلي - من invoices مباشرة)
    // ⚠️ ملاحظة: هذا تقرير تشغيلي وليس محاسبي رسمي
    let invoicesQuery = supabase
      .from("invoices")
      .select("id")
      .eq("company_id", companyId)
      .match(branchFilter)
      .or("is_deleted.is.null,is_deleted.eq.false") // ✅ استثناء الفواتير المحذوفة
      .gte("invoice_date", from)
      .lte("invoice_date", to)

    // تطبيق فلتر الحالة
    if (statusFilter === "all") {
      invoicesQuery = invoicesQuery.in("status", ["sent", "partially_paid", "paid"])
    } else {
      invoicesQuery = invoicesQuery.eq("status", statusFilter)
    }

    const { data: invoices, error: invoicesError } = await invoicesQuery

    if (invoicesError) {
      return serverError(`خطأ في جلب الفواتير: ${invoicesError.message}`)
    }

    if (!invoices || invoices.length === 0) {
      return NextResponse.json({
        success: true,
        data: []
      })
    }

    const invoiceIds = invoices.map((inv: any) => inv.id)

    // ✅ جلب عناصر الفواتير مع معلومات المنتج (تقرير تشغيلي)
    let itemsQuery = supabase
      .from("invoice_items")
      .select("quantity, line_total, product_id, description, products(id, name, sku, item_type)")
      .in("invoice_id", invoiceIds)

    const { data: invoiceItems, error: itemsError } = await itemsQuery

    if (itemsError) {
      return serverError(`خطأ في جلب عناصر الفواتير: ${itemsError.message}`)
    }

    // تجميع البيانات حسب المنتج
    const productMap = new Map<string, {
      product_id: string
      product_name: string
      product_sku: string
      item_type: string
      total_quantity: number
      total_revenue: number
    }>()

    for (const item of invoiceItems || []) {
      const prod = (item as any).products
      const itemType = prod?.item_type || 'product'
      
      // تطبيق فلتر نوع العنصر
      if (itemType !== 'all') {
        if (itemType === 'product' && itemType !== 'product') {
          continue
        } else if (itemType === 'service' && itemType !== 'service') {
          continue
        }
      }

      const pid = (item as any).product_id || `manual-${(item as any).description || 'item'}`
      const pname = prod?.name || (item as any).description || 'بند يدوي'
      const psku = prod?.sku || ''
      const qty = Number((item as any).quantity || 0)
      const revenue = Number((item as any).line_total || 0)

      if (revenue <= 0) continue

      const existing = productMap.get(pid) || {
        product_id: pid,
        product_name: pname,
        product_sku: psku,
        item_type: itemType,
        total_quantity: 0,
        total_revenue: 0
      }

      existing.total_quantity += qty
      existing.total_revenue += revenue

      productMap.set(pid, existing)
    }

    // تحويل إلى مصفوفة وترتيب حسب المعيار المحدد
    const result = Array.from(productMap.values())
      .sort((a, b) => {
        if (sortBy === "quantity") {
          return b.total_quantity - a.total_quantity
        } else {
          return b.total_revenue - a.total_revenue
        }
      })
      .slice(0, limit)

    return NextResponse.json({
      success: true,
      data: result
    })
  } catch (e: any) {
    return serverError(`حدث خطأ أثناء جلب تقرير الأصناف الأكثر مبيعًا: ${e?.message || "unknown_error"}`)
  }
}
