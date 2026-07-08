/**
 * 📊 Product Expiry Report API - تقرير صلاحيات المنتجات
 *
 * ⚠️ OPERATIONAL REPORT (NOT ACCOUNTING REPORT)
 *
 * ✅ هذا تقرير تشغيلي - يمكنه القراءة من fifo_cost_lots و inventory_write_off_items مباشرة
 * ✅ ليس تقرير محاسبي رسمي (التقارير المحاسبية تعتمد على journal_entries فقط)
 *
 * ✅ القواعد:
 * 1. مصدر البيانات: fifo_cost_lots (المخزون الحى), inventory_write_off_items (تاريخ الإهلاك)
 * 2. التصنيف: حسب تاريخ انتهاء الصلاحية
 * 3. الفلترة: حسب المنتج، الفرع، المخزن، الفترة
 *
 * ⚠️ ملاحظة مهمة:
 * - هذا التقرير تشغيلي وليس محاسبي رسمي
 * - التقارير المحاسبية الرسمية تعتمد على journal_entries فقط
 * - هذا التقرير يستخدم fifo_cost_lots لتوضيح تشغيلي
 *
 * 🆕 v3.74.580:
 * - data أصبحت المخزون الحى من fifo_cost_lots (expiry_date غير فارغ + remaining_quantity > 0)
 *   لكل دفعة: days_until_expiry + status (expired < 0 | expiring_soon ≤ 30 | valid)
 * - أسماء المنتج/الفرع/المخزن تُجلب على دفعة ثانية (لا يوجد FK مباشر من fifo_cost_lots)
 * - تجميع الإهلاك القديم انتقل إلى writeoff_history (قائمة ثانوية)
 * - summary: { total_lots, expired_count, expiring_soon_count, valid_count, total_quantity, total_cost }
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

type ExpiryStatus = "expired" | "expiring_soon" | "valid"

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

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const computeStatus = (expiry: string): { days: number; status: ExpiryStatus } => {
      const expiryDate = new Date(expiry)
      expiryDate.setHours(0, 0, 0, 0)
      const days = Math.ceil((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
      let s: ExpiryStatus = "valid"
      if (days < 0) s = "expired"
      else if (days <= 30) s = "expiring_soon"
      return { days, status: s }
    }

    // ═══════════════════════════════════════════════════════════════
    // 1️⃣ المخزون الحى — دفعات FIFO التى لها تاريخ صلاحية وكمية متبقية
    //    (v3.74.580 — المصدر الرئيسي للتقرير)
    // ═══════════════════════════════════════════════════════════════
    let lotsQuery = admin
      .from("fifo_cost_lots")
      .select("id, product_id, branch_id, warehouse_id, lot_date, expiry_date, remaining_quantity, unit_cost")
      .eq("company_id", companyId)
      .not("expiry_date", "is", null)
      .gt("remaining_quantity", 0)

    // تطبيق فلتر الفرع
    if (branchFilter.branch_id) {
      lotsQuery = lotsQuery.eq("branch_id", branchFilter.branch_id)
    }

    if (productId) {
      lotsQuery = lotsQuery.eq("product_id", productId)
    }

    if (from) {
      lotsQuery = lotsQuery.gte("expiry_date", from)
    }

    if (to) {
      lotsQuery = lotsQuery.lte("expiry_date", to)
    }

    const { data: lots, error: lotsError } = await lotsQuery
    if (lotsError) {
      return serverError(`حدث خطأ أثناء جلب دفعات المخزون: ${lotsError.message}`)
    }

    // ✅ جلب الأسماء على دفعة ثانية (لا يوجد FK من fifo_cost_lots إلى هذه الجداول)
    const productIds = Array.from(new Set((lots || []).map(l => String(l.product_id)).filter(Boolean))) as string[]
    const branchIds = Array.from(new Set((lots || []).map(l => l.branch_id ? String(l.branch_id) : "").filter(Boolean))) as string[]
    const warehouseIds = Array.from(new Set((lots || []).map(l => l.warehouse_id ? String(l.warehouse_id) : "").filter(Boolean))) as string[]

    const [productsRes, branchesRes, warehousesRes] = await Promise.all([
      productIds.length > 0
        ? admin.from("products").select("id, name, sku").in("id", productIds)
        : Promise.resolve({ data: [] as any[] }),
      branchIds.length > 0
        ? admin.from("branches").select("id, name, branch_name").in("id", branchIds)
        : Promise.resolve({ data: [] as any[] }),
      warehouseIds.length > 0
        ? admin.from("warehouses").select("id, name").in("id", warehouseIds)
        : Promise.resolve({ data: [] as any[] }),
    ])

    const productMap = new Map<string, { name: string; sku: string }>()
    for (const p of productsRes.data || []) {
      productMap.set(String(p.id), { name: p.name || "Unknown", sku: p.sku || "" })
    }
    const branchMap = new Map<string, string>()
    for (const b of branchesRes.data || []) {
      branchMap.set(String(b.id), b.branch_name || b.name || "")
    }
    const warehouseMap = new Map<string, string>()
    for (const w of warehousesRes.data || []) {
      warehouseMap.set(String(w.id), w.name || "")
    }

    const liveLots = (lots || [])
      .map(lot => {
        const { days, status: lotStatus } = computeStatus(String(lot.expiry_date))
        const product = productMap.get(String(lot.product_id))
        const qty = Number(lot.remaining_quantity || 0)
        const unitCost = Number(lot.unit_cost || 0)
        return {
          id: String(lot.id),
          product_id: String(lot.product_id),
          product_name: product?.name || "Unknown",
          product_sku: product?.sku || "",
          branch_id: lot.branch_id ? String(lot.branch_id) : null,
          branch_name: lot.branch_id ? (branchMap.get(String(lot.branch_id)) || "") : "",
          warehouse_id: lot.warehouse_id ? String(lot.warehouse_id) : null,
          warehouse_name: lot.warehouse_id ? (warehouseMap.get(String(lot.warehouse_id)) || "") : "",
          lot_date: lot.lot_date,
          expiry_date: lot.expiry_date,
          remaining_quantity: qty,
          unit_cost: unitCost,
          total_cost: qty * unitCost,
          days_until_expiry: days,
          status: lotStatus,
        }
      })
      .filter(lot => status === "all" || lot.status === status)
      .sort((a, b) => {
        // ترتيب حسب تاريخ الصلاحية (الأقرب أولاً)
        if (a.days_until_expiry !== b.days_until_expiry) {
          return a.days_until_expiry - b.days_until_expiry
        }
        return a.product_name.localeCompare(b.product_name)
      })

    // حساب الإجماليات (من المخزون الحى)
    const summary = {
      total_lots: liveLots.length,
      expired_count: liveLots.filter(r => r.status === "expired").length,
      expiring_soon_count: liveLots.filter(r => r.status === "expiring_soon").length,
      valid_count: liveLots.filter(r => r.status === "valid").length,
      total_quantity: liveLots.reduce((sum, r) => sum + r.remaining_quantity, 0),
      total_cost: liveLots.reduce((sum, r) => sum + r.total_cost, 0)
    }

    // ═══════════════════════════════════════════════════════════════
    // 2️⃣ تاريخ الإهلاك — عناصر الإهلاك التى تحتوى على expiry_date
    //    (v3.74.580 — أصبحت قائمة ثانوية writeoff_history)
    // ═══════════════════════════════════════════════════════════════
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
      status: ExpiryStatus
      branch_name?: string
      warehouse_name?: string
    }>()

    // معالجة عناصر الإهلاك التي تحتوي على expiry_date
    for (const item of writeOffItems || []) {
      const writeOff = item.inventory_write_offs as any
      const product = item.products as any
      const { days: daysUntilExpiry, status: itemStatus } = computeStatus(String(item.expiry_date))

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

    const writeoffHistory = Array.from(expiryMap.values())
      .sort((a, b) => {
        // ترتيب حسب تاريخ الصلاحية (الأقرب أولاً)
        if (a.days_until_expiry !== b.days_until_expiry) {
          return a.days_until_expiry - b.days_until_expiry
        }
        return a.product_name.localeCompare(b.product_name)
      })

    return NextResponse.json({
      success: true,
      data: liveLots,
      writeoff_history: writeoffHistory,
      summary
    })
  } catch (e: any) {
    return serverError(`حدث خطأ أثناء جلب تقرير صلاحيات المنتجات: ${e?.message || "unknown_error"}`)
  }
}
