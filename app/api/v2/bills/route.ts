/**
 * ⚡ API v2 — الفواتير مع Server-Side Pagination & DB-Level Filtering
 *
 * GET /api/v2/bills
 *
 * Query Params:
 *   page        — رقم الصفحة (افتراضي: 1)
 *   pageSize    — عدد السجلات (افتراضي: 20، الحد الأقصى: 100)
 *   search      — بحث في: bill_number, supplier_name  → ilike
 *   status      — فلتر الحالة (يمكن تمرير قيم متعددة: status=approved&status=pending)
 *   supplier    — فلتر المورد (IDs متعددة)
 *   dateFrom    — تاريخ البداية → gte bill_date
 *   dateTo      — تاريخ النهاية → lte bill_date
 *   branchId    — فلتر الفرع (للأدوار المميزة فقط)
 *
 * Response (Standardized PaginatedResponse<Bill>):
 * {
 *   success: true,
 *   data: Bill[],             ← 20 سجل فقط
 *   meta: {
 *     totalCount: number,     ← العدد الإجمالي لكل الصفحات
 *     page, pageSize, totalPages, from, to, role, isPrivileged
 *   }
 * }
 *
 * ملاحظة: هذا route جديد ولا يؤثر على أي route موجود.
 * الـ route القديم /api/bills يبقى كما هو.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { enforceGovernance } from '@/lib/governance-middleware'

const MAX_PAGE_SIZE = 100
const DEFAULT_PAGE_SIZE = 20

/**
 * الـ select المستخدم — الحقول الضرورية فقط (Performance Optimization)
 */
const BILL_SELECT = `
  id,
  supplier_id,
  bill_number,
  bill_date,
  total_amount,
  paid_amount,
  returned_amount,
  return_status,
  status,
  receipt_status,
  receipt_rejection_reason,
  currency_code,
  display_currency,
  display_total,
  original_currency,
  original_total,
  branch_id,
  cost_center_id,
  purchase_order_id,
  goods_receipt_id,
  suppliers!bills_supplier_id_fkey (name, phone),
  branches!bills_branch_id_fkey (name),
  goods_receipts!goods_receipt_id (id, grn_number)
`

export async function GET(request: NextRequest) {
  try {
    // ─── 1. الحوكمة (RBAC) ────────────────────────────────────────────────
    const governance = await enforceGovernance()
    const supabase = await createClient()

    // ─── 2. استخراج Query Params ──────────────────────────────────────────
    const { searchParams } = new URL(request.url)

    // Pagination
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10))
    const rawPageSize = parseInt(searchParams.get('pageSize') || String(DEFAULT_PAGE_SIZE), 10)
    const pageSize = Math.min(Math.max(1, rawPageSize), MAX_PAGE_SIZE)
    const from = (page - 1) * pageSize
    const to = from + pageSize - 1

    // Filters
    const search = searchParams.get('search')?.trim() || ''
    const statuses = searchParams.getAll('status').filter(Boolean)
    const suppliers = searchParams.getAll('supplier').filter(Boolean)
    const dateFrom = searchParams.get('dateFrom') || ''
    const dateTo = searchParams.get('dateTo') || ''
    const branchId = searchParams.get('branchId') || ''

    // ─── 3. بناء الاستعلام ──────────────────────────────────────────────
    const role = governance.role?.trim().toLowerCase().replace(/\s+/g, '_') || ''
    const isPrivileged = ['owner', 'admin', 'general_manager', 'gm', 'superadmin', 'super_admin'].includes(role)

    let query = supabase
      .from('bills')
      .select(BILL_SELECT, { count: 'exact' })
      .eq('company_id', governance.companyId)
      .neq('status', 'voided') // استثناء الفواتير الملغاة دائماً

    // ─── 4. فلترة الفروع (Governance) ──────────────────────────────────
    if (isPrivileged && branchId) {
      query = query.eq('branch_id', branchId)
    } else if (!isPrivileged && governance.branchIds.length > 0) {
      query = query.in('branch_id', governance.branchIds)
    }

    // ─── 5. فلاتر قاعدة البيانات (DB-Level) ────────────────────────────

    // البحث النصي في bill_number
    if (search) {
      query = query.ilike('bill_number', `%${search}%`)
    }

    // فلتر الحالة
    if (statuses.length === 1) {
      query = query.eq('status', statuses[0])
    } else if (statuses.length > 1) {
      query = query.in('status', statuses)
    }

    // فلتر الموردين
    if (suppliers.length === 1) {
      query = query.eq('supplier_id', suppliers[0])
    } else if (suppliers.length > 1) {
      query = query.in('supplier_id', suppliers)
    }

    // فلتر التاريخ
    if (dateFrom) {
      query = query.gte('bill_date', dateFrom)
    }
    if (dateTo) {
      query = query.lte('bill_date', dateTo)
    }

    // ─── 6. الترتيب + Pagination ────────────────────────────────────────
    query = query
      .order('bill_date', { ascending: false })
      .range(from, to) // ← جلب pageSize سجل فقط من السيرفر

    const { data: bills, count, error } = await query

    if (error) {
      console.error('[API v2 /bills] Query error:', error)
      return NextResponse.json(
        { success: false, error: error.message, error_ar: 'خطأ في جلب الفواتير' },
        { status: 500 }
      )
    }

    const totalCount = count ?? 0
    const totalPages = Math.ceil(totalCount / pageSize) || 1

    // ─── 7. Response (Standardized PaginatedResponse<Bill>) ─────────────
    return NextResponse.json({
      success: true,
      data: bills || [],
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
    console.error('[API v2 /bills] Unexpected error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error.message,
        error_ar: 'حدث خطأ غير متوقع'
      },
      { status: error.message?.includes('Unauthorized') ? 401 : 500 }
    )
  }
}
