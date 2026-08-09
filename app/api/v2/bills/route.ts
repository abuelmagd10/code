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
 *
 * ═══ v3.74.938 — ثغرةٌ شُحنت فى 936 وأُغلقت هنا ═══
 *
 * حُوِّلت شاشةُ `app/bills/page.tsx` فى 936 لتقرأ من `bills_masked`، **لكن
 * صفوفَ القائمة لا تأتى منها أصلاً**: تأتى من هنا. فكان الرأسُ مقنَّعاً فى
 * ملفٍ لا يُستدعى، والمبالغُ الحقيقيةُ تعبر السلكَ من هذا الـ route.
 *
 * والدرسُ أعمُّ من الملف: **الشاشةُ المحوَّلة قد تأخذ مالَها من مصدرٍ آخر.**
 * فصار الحارسُ يتتبّع كلَّ `/api/...` تناديه شاشةٌ محوَّلة ويقرأ دالةَ `GET`
 * فيه — ومن قرأ عمودَ مالٍ من جدولٍ خام رُفض. ولا يكفى تحويلُ هذا الملف.
 *
 * وهذا الـ route يعمل **بجلسة المستخدم** (`createClient()` بمفتاح anon)، لا
 * بمفتاح الخدمة — فالنافذةُ `security_invoker` تُطبَّق عليه كما تُطبَّق على
 * المتصفح، ولا حاجةَ لأى تحقّقٍ إضافى هنا.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { enforceGovernance } from '@/lib/governance-middleware'
import { arabicReason } from "@/lib/error-messages"

const MAX_PAGE_SIZE = 100
const DEFAULT_PAGE_SIZE = 20

/**
 * الـ select المستخدم — الحقول الضرورية فقط (Performance Optimization)
 */
// v3.74.940 — ⚠️ **وهنا وقع عطبٌ حىٌّ فى 938، وسببُه قياسٌ ناقص.**
//
// أُسقطت تلميحاتُ التضمين فى 938 بحجّة أن «كلَّ علاقةٍ واحدةٌ لا غير»،
// **وكان القياسُ على اتجاهٍ واحدٍ فقط**: مفاتيحُ `bills` الخارجة. ولم
// يُسأل عن الاتجاه المعاكس. والحقيقةُ المقيسة:
//
//   bills.goods_receipt_id  →  goods_receipts     (bills_goods_receipt_id_fkey)
//   goods_receipts.bill_id  →  bills              (goods_receipts_bill_id_fkey)
//
// **علاقتان بين نفس الجدولين فى اتجاهين**، فالتضمينُ بلا تلميحٍ ملتبس،
// فيرفض PostgREST بـ`PGRST201`، فيردّ هذا المسارُ 500، **فتظهر قائمةُ
// الفواتير فارغةً «لا توجد فواتير حتى الآن»**. وهذا نفسُ درس رقم ١١:
// **السؤالُ والقياسُ يجب أن يقعا على نفس النطاق.**
//
// والعلاجُ هنا **لا يعتمد على استنتاجٍ أصلاً**: لا تضمينَ فوق النافذة.
// تُقرأ الرؤوسُ وحدها، ثم تُجلب أسماءُ المورد والفرع وإذن الاستلام
// باستعلامٍ ثانٍ وتُدمج بنفس شكل الاستجابة — فلا مفتاحَ يتغيّر عند القارئ،
// ولا شىءَ يتوقف على ذاكرةِ مخطَّطٍ لا نراها.
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
  goods_receipt_id
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
    const isPrivileged = ['owner', 'admin', 'gm', 'superadmin', 'super_admin'].includes(role)

    // v3.74.938 — المنفذُ المقنَّع لا الجدول: من ليس من جمهور التكلفة يقرأ
    // `null` فى أعمدة المال ويعرضها المتصفحُ «—».
    let query = supabase
      .from('bills_masked')
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
        { success: false, error: error.message, error_ar: arabicReason(error, 'خطأ في جلب الفواتير') },
        { status: 500 }
      )
    }

    // ─── 6b. الأسماءُ تُدمج بدل أن تُضمَّن (v3.74.940) ──────────────────
    // نفسُ شكل الاستجابة الذى يقرؤه العميل: `suppliers` · `branches` ·
    // `goods_receipts` — لكنها تُبنى هنا لا فى PostgREST.
    const rows: any[] = bills || []
    const uniq = (xs: any[]) => [...new Set(xs.filter(Boolean))]
    const [sup, br, gr] = await Promise.all([
      (async () => {
        const ids = uniq(rows.map((r) => r.supplier_id))
        if (ids.length === 0) return {}
        const { data } = await supabase.from('suppliers').select('id, name, phone').in('id', ids)
        return Object.fromEntries((data || []).map((x: any) => [x.id, { name: x.name, phone: x.phone }]))
      })(),
      (async () => {
        const ids = uniq(rows.map((r) => r.branch_id))
        if (ids.length === 0) return {}
        const { data } = await supabase.from('branches').select('id, name').in('id', ids)
        return Object.fromEntries((data || []).map((x: any) => [x.id, { name: x.name }]))
      })(),
      (async () => {
        const ids = uniq(rows.map((r) => r.goods_receipt_id))
        if (ids.length === 0) return {}
        const { data } = await supabase.from('goods_receipts').select('id, grn_number').in('id', ids)
        return Object.fromEntries((data || []).map((x: any) => [x.id, { id: x.id, grn_number: x.grn_number }]))
      })(),
    ])
    for (const r of rows) {
      r.suppliers = r.supplier_id ? (sup as any)[r.supplier_id] ?? null : null
      r.branches = r.branch_id ? (br as any)[r.branch_id] ?? null : null
      r.goods_receipts = r.goods_receipt_id ? (gr as any)[r.goods_receipt_id] ?? null : null
    }

    const totalCount = count ?? 0
    const totalPages = Math.ceil(totalCount / pageSize) || 1

    // ─── 7. Response (Standardized PaginatedResponse<Bill>) ─────────────
    return NextResponse.json({
      success: true,
      data: rows,
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
        error_ar: arabicReason(error, 'حدث خطأ غير متوقع')
      },
      { status: error.message?.includes('Unauthorized') ? 401 : 500 }
    )
  }
}
