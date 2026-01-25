/**
 * 📊 Product Expiry Report API - تقرير صلاحيات المنتجات
 * 
 * ⚠️ OPERATIONAL REPORT (NOT ACCOUNTING REPORT)
 * 
 * ✅ هذا تقرير تشغيلي - يمكنه القراءة من fifo_cost_lots و inventory_write_off_items مباشرة
 * ✅ ليس تقرير محاسبي رسمي (التقارير المحاسبية تعتمد على journal_entries فقط)
 * 
 * ✅ القواعد:
 * 1. مصدر البيانات: fifo_cost_lots, inventory_write_off_items (تشغيلي)
 * 2. التصنيف: حسب تاريخ انتهاء الصلاحية
 * 3. الفلترة: حسب المنتج، الفرع، المخزن، الفترة
 * 
 * ⚠️ ملاحظة مهمة:
 * - هذا التقرير تشغيلي وليس محاسبي رسمي
 * - التقارير المحاسبية الرسمية تعتمد على journal_entries فقط
 * - هذا التقرير يستخدم fifo_cost_lots لتوضيح تشغيلي
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
    const status = String(searchParams.get("status") || "all") // all, expired, expiring_soon, valid

    const branchFilter = buildBranchFilter(branchId, member.role)

    // ✅ جلب عناصر الإهلاك التي تحتوي على expiry_date (تقرير تشغيلي)
    // ⚠️ ملاحظة: هذا تقرير تشغيلي وليس محاسبي رسمي
    // ملاحظة: expiry_date موجود في inventory_write_off_items فقط حالياً
    let writeOffItemsQuery = admin
      .from("inventory_write_off_items")
      .select(`
        id,
        product_id,
        expiry_date,
        quantity,
        unit_cost,
        products(name, sku),
        inventory_write_offs!inner(write_off_date, branch_id, warehouse_id, company_id, branches(name, branch_name), warehouses(name))
      `)
      .eq("inventory_write_offs.company_id", companyId)
      .not("expiry_date", "is", null)

    // تطبيق فلتر الفرع
    if (branchFilter.branch_id) {
      writeOffItemsQuery = writeOffItemsQuery.eq("inventory_write_offs.branch_id", branchFilter.branch_id)
    }

    if (productId) {
      writeOffItemsQuery = writeOffItemsQuery.eq("product_id", productId)
    }

    if (from) {
      writeOffItemsQuery = writeOffItemsQuery.gte("expiry_date", from)
    }

    if (to) {
      writeOffItemsQuery = writeOffItemsQuery.lte("expiry_date", to)
    }

    const { data: writeOffItems } = await writeOffItemsQuery

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    // تجميع البيانات حسب المنتج وتاريخ الصلاحية
    const expiryMap = new Map<string, {
      product_id: string
      product_name: string
      product_sku: string
      expiry_date: string
      quantity: number
      unit_cost: number
      total_cost: number
      days_until_expiry: number
      status: "expired" | "expiring_soon" | "valid"
      branch_name?: string
      warehouse_name?: string
    }>()

    // معالجة عناصر الإهلاك التي تحتوي على expiry_date
    for (const item of writeOffItems || []) {
      const writeOff = item.inventory_write_offs as any
      const product = item.products as any
      const expiryDate = new Date(item.expiry_date)
      expiryDate.setHours(0, 0, 0, 0)

      const daysUntilExpiry = Math.ceil((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
      let itemStatus: "expired" | "expiring_soon" | "valid" = "valid"
      
      if (daysUntilExpiry < 0) {
        itemStatus = "expired"
      } else if (daysUntilExpiry <= 30) {
        itemStatus = "expiring_soon"
      }

      // فلتر حسب الحالة
      if (status !== "all" && status !== itemStatus) {
        continue
      }

      const key = `${item.product_id}_${item.expiry_date}`
      const existing = expiryMap.get(key)

      if (existing) {
        existing.quantity += Number(item.quantity || 0)
        existing.total_cost += Number(item.quantity || 0) * Number(item.unit_cost || 0)
      } else {
        expiryMap.set(key, {
          product_id: String(item.product_id),
          product_name: product?.name || "Unknown",
          product_sku: product?.sku || "",
          expiry_date: item.expiry_date,
          quantity: Number(item.quantity || 0),
          unit_cost: Number(item.unit_cost || 0),
          total_cost: Number(item.quantity || 0) * Number(item.unit_cost || 0),
          days_until_expiry: daysUntilExpiry,
          status: itemStatus,
          branch_name: writeOff?.branches?.branch_name || writeOff?.branches?.name || "",
          warehouse_name: writeOff?.warehouses?.name || ""
        })
      }
    }

    // ملاحظة: حالياً expiry_date موجود فقط في inventory_write_off_items
    // يمكن إضافة دعم expiry_date في fifo_cost_lots لاحقاً

    const result = Array.from(expiryMap.values())
      .sort((a, b) => {
        // ترتيب حسب تاريخ الصلاحية (الأقرب أولاً)
        if (a.days_until_expiry !== b.days_until_expiry) {
          return a.days_until_expiry - b.days_until_expiry
        }
        return a.product_name.localeCompare(b.product_name)
      })

    // حساب الإجماليات
    const summary = {
      total_items: result.length,
      expired_count: result.filter(r => r.status === "expired").length,
      expiring_soon_count: result.filter(r => r.status === "expiring_soon").length,
      valid_count: result.filter(r => r.status === "valid").length,
      total_quantity: result.reduce((sum, r) => sum + r.quantity, 0),
      total_cost: result.reduce((sum, r) => sum + r.total_cost, 0)
    }

    return NextResponse.json({
      success: true,
      data: result,
      summary
    })
  } catch (e: any) {
    return serverError(`حدث خطأ أثناء جلب تقرير صلاحيات المنتجات: ${e?.message || "unknown_error"}`)
  }
}
