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
 *
 * ═══ v3.74.938 — صفوفُ شاشة أوامر الشراء تأتى من هنا، لا من المتصفح ═══
 *
 * شاشةُ القائمة لا تسأل الجدولَ بنفسها: تنادى هذا الـ route. فلو حُوِّلت
 * الشاشةُ وحدها لبقى المالُ يعبر السلكَ كاملاً من هنا — وهو ما وقع فعلاً فى
 * فواتير الشراء (936) وأُصلح فى نفس هذا الإصدار.
 *
 * ويعمل هذا الـ route **بجلسة المستخدم** (`createClient()` بمفتاح anon) لا
 * بمفتاح الخدمة، فالنافذةُ `security_invoker` تُطبَّق عليه كما على المتصفح.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { enforceGovernance } from '@/lib/governance-middleware'
import { arabicReason } from "@/lib/error-messages"

// الحد الأقصى المسموح به لـ pageSize لمنع طلبات ضخمة
const MAX_PAGE_SIZE = 100
const DEFAULT_PAGE_SIZE = 20

/**
 * الـ select المستخدم في جلب أوامر الشراء (مع العلاقات الأساسية فقط)
 * تم تقليل الـ select لجلب البيانات الضرورية فقط (Performance Optimization)
 */
// v3.74.905 — حقول الشحن (shipping / shipping_provider_id / shipping_method)
// أُضيفت لأن شاشة القائمة تعرض عمود «الشحن» منها ولم تكن تُرسل إطلاقاً، فكان
// العمود «-» فى كل سطر ولو كان للأمر شركة شحنٍ وتكلفة (ملاحظة المالك 30/7).
// تنبيه: لا تُكتب تعليقات داخل نص select — PostgREST يقرؤها أسماء أعمدة.
// v3.74.940 — لا تضمينَ فوق النافذة، حتى حيث تبدو العلاقةُ واضحة.
//
// أُسقطت التلميحاتُ فى 938 بقياسٍ ناقص (اتجاهٌ واحدٌ من المفاتيح)، فانكسرت
// قائمةُ فواتير الشراء لأن `bills ↔ goods_receipts` علاقتان لا واحدة.
// وهنا العلاقتان مفردتان بالقياس، **لكن الاعتمادَ على استنتاج المخطَّط
// نفسِه هو ما كسر**: يتغيّر بمفتاحٍ يُضاف غداً بلا أن يلمس أحدٌ هذا الملف.
// فتُقرأ الرؤوسُ وحدها، وتُدمج الأسماءُ باستعلامٍ ثانٍ بنفس شكل الاستجابة.
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
  shipping,
  shipping_provider_id,
  shipping_method,
  status,
  notes,
  currency,
  bill_id,
  branch_id,
  cost_center_id,
  warehouse_id,
  created_by_user_id
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

    // v3.74.938 — المنفذُ المقنَّع لا الجدول.
    let query = supabase
      .from('purchase_orders_masked')
      .select(PO_SELECT, { count: 'exact' }) // ← count: 'exact' يُعيد العدد الكامل
      .eq('company_id', governance.companyId)

    // ─── 4. فلترة الفروع (Governance) ──────────────────────────────────
    if (isPrivileged && branchId) {
      // المدير العام اختار فرعاً معيناً من الـ dropdown
      query = query.eq('branch_id', branchId)
    } else if (!isPrivileged) {
      // الأدوار العادية → فروعهم المصرّح بها فقط. v3.74.689 — fail closed:
      // لو لا يوجد نطاق فروع لا يرى شيئاً (بدلاً من رؤية كل الفروع).
      if (governance.branchIds.length > 0) {
        query = query.in('branch_id', governance.branchIds)
      } else {
        query = query.eq('branch_id', '00000000-0000-0000-0000-000000000000')
      }
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
        { success: false, error: error.message, error_ar: arabicReason(error, 'خطأ في جلب أوامر الشراء') },
        { status: 500 }
      )
    }

    const totalCount = count ?? 0
    const totalPages = Math.ceil(totalCount / pageSize) || 1

    // ─── 6b. Enrich with latest discount_approval status (v3.74.449) ──
    // The list needs to show a "discount rejected" badge without opening
    // the document. Batch the discount_approvals fetch and stamp a
    // discount_approval_status field on each PO row.
    let enrichedOrders: any[] = orders || []

    // v3.74.940 — الأسماءُ تُدمج بدل أن تُضمَّن (نفسُ مفاتيح الاستجابة).
    if (enrichedOrders.length > 0) {
      const uniq = (xs: any[]) => [...new Set(xs.filter(Boolean))]
      const [sup, br] = await Promise.all([
        (async () => {
          const ids = uniq(enrichedOrders.map((o: any) => o.supplier_id))
          if (ids.length === 0) return {}
          const { data } = await supabase.from('suppliers').select('id, name, phone').in('id', ids)
          return Object.fromEntries((data || []).map((x: any) => [x.id, { id: x.id, name: x.name, phone: x.phone }]))
        })(),
        (async () => {
          const ids = uniq(enrichedOrders.map((o: any) => o.branch_id))
          if (ids.length === 0) return {}
          const { data } = await supabase.from('branches').select('id, name').in('id', ids)
          return Object.fromEntries((data || []).map((x: any) => [x.id, { name: x.name }]))
        })(),
      ])
      for (const o of enrichedOrders) {
        o.suppliers = o.supplier_id ? (sup as any)[o.supplier_id] ?? null : null
        o.branches = o.branch_id ? (br as any)[o.branch_id] ?? null : null
      }
    }

    if (enrichedOrders.length > 0) {
      const poIds = enrichedOrders.map((o: any) => o.id)
      const { data: discountRows } = await supabase
        .from('discount_approvals')
        .select('document_id, status, requested_at')
        .eq('document_type', 'purchase_order')
        .in('document_id', poIds)
        .order('requested_at', { ascending: false })
      const latestByDoc: Record<string, string> = {}
      for (const r of (discountRows || []) as any[]) {
        if (!(r.document_id in latestByDoc)) {
          latestByDoc[r.document_id] = r.status
        }
      }
      enrichedOrders = enrichedOrders.map((o: any) => ({
        ...o,
        discount_approval_status: latestByDoc[o.id] ?? null,
      }))
    }

    // ─── 7. Response ────────────────────────────────────────────────────
    return NextResponse.json({
      success: true,
      data: enrichedOrders,
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
        error_ar: arabicReason(error, 'حدث خطأ غير متوقع')
      },
      { status: error.message?.includes('Unauthorized') ? 401 : 500 }
    )
  }
}
