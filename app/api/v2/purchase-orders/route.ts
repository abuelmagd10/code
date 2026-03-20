/**
 * ⚡ API v2 — أوامر الشراء مع Server-Side Pagination & DB-Level Filtering
 *
 * GET /api/v2/purchase-orders
 *
 * Query Params:
 *   page        — رقم الصفحة (افتراضي: 1)
 *   pageSize    — عدد السجلات (افتراضي: 20، الحد الأقصى: 100)
 *   search      — بحث في: po_number, supplier_name  → ilike
 *   status      — فلتر الحالة (يمكن تمرير قيم متعددة: status=approved&status=pending)
 *   supplier    — فلتر المورد (IDs متعددة)
 *   dateFrom    — تاريخ البداية → gte po_date
 *   dateTo      — تاريخ النهاية → lte po_date
 *   branchId    — فلتر الفرع (للأدوار المميزة فقط)
 *
 * Response:
 * {
 *   success: true,
 *   data: PurchaseOrder[],          ← 20 سجل فقط
 *   meta: {
 *     totalCount: number,            ← العدد الإجمالي لكل الصفحات
 *     page: number,
 *     pageSize: number,
 *     totalPages: number,
 *     from: number,
 *     to: number
 *   }
 * }
 *
 * ملاحظة: هذا route جديد ولا يؤثر على أي route موجود.
 * الـ route القديم /api/purchase-orders/* يبقى كما هو.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { enforceGovernance } from '@/lib/governance-middleware'

// الحد الأقصى المسموح به لـ pageSize لمنع طلبات ضخمة
const MAX_PAGE_SIZE = 100
const DEFAULT_PAGE_SIZE = 20

/**
 * الـ select المستخدم في جلب أوامر الشراء (مع العلاقات الأساسية فقط)
 * تم تقليل الـ select لجلب البيانات الضرورية فقط (Performance Optimization)
 */
const PO_SELECT = `
  id,
  company_id,
  supplier_id,
  po_number,
  po_date,
  due_date,
  subtotal,
  tax_amount,
  total_amount,
  total,
  status,
  notes,
  currency,
  bill_id,
  branch_id,
  cost_center_id,
  warehouse_id,
  created_by_user_id,
  suppliers!purchase_orders_supplier_id_fkey (id, name, phone),
  branches!purchase_orders_branch_id_fkey (name)
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
      .from('purchase_orders')
      .select(PO_SELECT, { count: 'exact' }) // ← count: 'exact' يُعيد العدد الكامل
      .eq('company_id', governance.companyId)

    // ─── 4. فلترة الفروع (Governance) ──────────────────────────────────
    if (isPrivileged && branchId) {
      // المدير العام اختار فرعاً معيناً من الـ dropdown
      query = query.eq('branch_id', branchId)
    } else if (!isPrivileged && governance.branchIds.length > 0) {
      // الأدوار العادية → فرعهم فقط
      query = query.in('branch_id', governance.branchIds)
    }
    // المدير العام بدون اختيار فرع → يرى كل الفروع (لا فلتر)

    // ─── 5. فلاتر قاعدة البيانات (DB-Level) ────────────────────────────

    // البحث النصي → ilike في po_number (البحث في الاسم يحتاج JOIN، سنبحث في po_number)
    if (search) {
      query = query.ilike('po_number', `%${search}%`)
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
      query = query.gte('po_date', dateFrom)
    }
    if (dateTo) {
      query = query.lte('po_date', dateTo)
    }

    // ─── 6. الترتيب + Pagination ────────────────────────────────────────
    query = query
      .order('created_at', { ascending: false })
      .range(from, to) // ← جلب 20 سجل فقط من السيرفر

    const { data: orders, count, error } = await query

    if (error) {
      console.error('[API v2 /purchase-orders] Query error:', error)
      return NextResponse.json(
        { success: false, error: error.message, error_ar: 'خطأ في جلب أوامر الشراء' },
        { status: 500 }
      )
    }

    const totalCount = count ?? 0
    const totalPages = Math.ceil(totalCount / pageSize) || 1

    // ─── 7. Response ────────────────────────────────────────────────────
    return NextResponse.json({
      success: true,
      data: orders || [],
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
    console.error('[API v2 /purchase-orders] Unexpected error:', error)
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
