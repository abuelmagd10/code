/**
 * ⚡ API v2 — حركات المخزون مع Server-Side Pagination & DB-Level Filtering
 *
 * GET /api/v2/inventory
 *
 * Query Params:
 *   page          — رقم الصفحة (افتراضي: 1)
 *   pageSize      — عدد السجلات (افتراضي: 50، الحد الأقصى: 200)
 *   warehouseId   — فلتر المخزن (إجباري عملياً لأن المخزون مرتبط بمخزن)
 *   branchId      — فلتر الفرع
 *   costCenterId  — فلتر مركز التكلفة
 *   type          — فلتر نوع الحركة (purchase, sale, transfer_in, أو جميعها)
 *   productId     — فلتر منتج معين
 *   dateFrom      — تاريخ البداية → gte created_at
 *   dateTo        — تاريخ النهاية → lte created_at
 *
 * Response:
 * {
 *   success: true,
 *   data: InventoryTransaction[],   ← 50 سجل فقط
 *   meta: {
 *     totalCount: number,
 *     page, pageSize, totalPages, from, to
 *   }
 * }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { enforceGovernance } from '@/lib/governance-middleware'

const MAX_PAGE_SIZE = 200
const DEFAULT_PAGE_SIZE = 50

const TRANSACTION_SELECT = `
  id,
  company_id,
  product_id,
  transaction_type,
  quantity_change,
  notes,
  created_at,
  reference_id,
  warehouse_id,
  branch_id,
  cost_center_id,
  is_deleted,
  products!inventory_transactions_product_id_fkey (name, sku)
`

export async function GET(request: NextRequest) {
  try {
    // ─── 1. الحوكمة ────────────────────────────────────────────────────
    const governance = await enforceGovernance()
    const supabase = await createClient()

    const { searchParams } = new URL(request.url)

    // ─── 2. Pagination Params ───────────────────────────────────────────
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10))
    const rawPageSize = parseInt(searchParams.get('pageSize') || String(DEFAULT_PAGE_SIZE), 10)
    const pageSize = Math.min(Math.max(1, rawPageSize), MAX_PAGE_SIZE)
    const from = (page - 1) * pageSize
    const to = from + pageSize - 1

    // ─── 3. Filter Params ───────────────────────────────────────────────
    const warehouseId = searchParams.get('warehouseId') || ''
    const branchId = searchParams.get('branchId') || ''
    const costCenterId = searchParams.get('costCenterId') || ''
    const transactionType = searchParams.get('type') || ''
    const productId = searchParams.get('productId') || ''
    const dateFrom = searchParams.get('dateFrom') || ''
    const dateTo = searchParams.get('dateTo') || ''

    const role = governance.role?.trim().toLowerCase().replace(/\s+/g, '_') || ''
    const isPrivileged = ['owner', 'admin', 'general_manager', 'gm', 'superadmin', 'super_admin'].includes(role)

    // ─── 4. بناء الاستعلام ──────────────────────────────────────────────
    let query = supabase
      .from('inventory_transactions')
      .select(TRANSACTION_SELECT, { count: 'exact' })
      .eq('company_id', governance.companyId)
      .or('is_deleted.is.null,is_deleted.eq.false') // استبعاد المحذوفة

    // ─── 5. فلتر الحوكمة ────────────────────────────────────────────────
    if (isPrivileged) {
      // المدير يختار يدوياً
      if (branchId) query = query.eq('branch_id', branchId)
      if (warehouseId) query = query.eq('warehouse_id', warehouseId)
    } else {
      // فلتر إجباري حسب الصلاحيات
      if (governance.branchIds.length > 0) {
        query = query.in('branch_id', governance.branchIds)
      }
      if (warehouseId) {
        // التحقق من أن المخزن ضمن مخازن المستخدم
        if (governance.warehouseIds.length > 0 && !governance.warehouseIds.includes(warehouseId)) {
          return NextResponse.json(
            { success: false, error: 'Governance: Unauthorized warehouse access', error_ar: 'لا صلاحية للوصول لهذا المخزن' },
            { status: 403 }
          )
        }
        query = query.eq('warehouse_id', warehouseId)
      } else if (governance.warehouseIds.length > 0) {
        query = query.in('warehouse_id', governance.warehouseIds)
      }
    }

    // ─── 6. DB-Level Filters ────────────────────────────────────────────
    if (costCenterId) {
      // نأخذ حركات cost_center المحدد + transfer_in/transfer_out الخاصة بالمخزن
      query = query.or(`cost_center_id.eq.${costCenterId},transaction_type.eq.transfer_in,transaction_type.eq.transfer_out`)
    }

    if (transactionType && transactionType !== 'all') {
      query = query.eq('transaction_type', transactionType)
    }

    if (productId) {
      query = query.eq('product_id', productId)
    }

    if (dateFrom) {
      query = query.gte('created_at', dateFrom)
    }
    if (dateTo) {
      // نضيف يوم واحد لتشمل نهاية اليوم
      query = query.lte('created_at', dateTo + 'T23:59:59.999Z')
    }

    // ─── 7. الترتيب + Pagination ────────────────────────────────────────
    query = query
      .order('created_at', { ascending: false })
      .range(from, to)

    const { data: transactions, count, error } = await query

    if (error) {
      console.error('[API v2 /inventory] Query error:', error)
      return NextResponse.json(
        { success: false, error: error.message, error_ar: 'خطأ في جلب حركات المخزون' },
        { status: 500 }
      )
    }

    const totalCount = count ?? 0
    const totalPages = Math.ceil(totalCount / pageSize) || 1

    // ─── 8. Response ────────────────────────────────────────────────────
    return NextResponse.json({
      success: true,
      data: transactions || [],
      meta: {
        totalCount,
        page,
        pageSize,
        totalPages,
        from: from + 1,
        to: Math.min(to + 1, totalCount),
        role,
        isPrivileged,
      }
    })

  } catch (error: any) {
    console.error('[API v2 /inventory] Unexpected error:', error)
    return NextResponse.json(
      { success: false, error: error.message, error_ar: 'حدث خطأ غير متوقع' },
      { status: error.message?.includes('Unauthorized') ? 401 : 500 }
    )
  }
}
