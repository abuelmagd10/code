import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { apiGuard } from '@/lib/core'
import { asyncAuditLog } from '@/lib/core'
import {
  createServiceSchema,
  parseJsonBody,
  parsePagination,
  handleBookingApiError,
} from '@/lib/services/booking-api'

/**
 * GET /api/services
 * List services with optional filters.
 * Query params: branch_id, service_type, category, is_active, is_bookable, search, page, limit
 */
export async function GET(req: NextRequest) {
  try {
    const { context, errorResponse } = await apiGuard(req, { requireAuth: true, requireCompany: true })
    if (errorResponse) return errorResponse

    const { companyId, member } = context!
    const sp = req.nextUrl.searchParams
    const { from, to, page, limit } = parsePagination(sp)

    const supabase = await createClient()

    let query = supabase
      .from('services')
      .select('*', { count: 'exact' })
      .eq('company_id', companyId)
      .order('service_name')
      .range(from, to)

    // v3.74.323 — shared services were rolled back; every service is
    // tied to one branch. booking_officer goes back to a simple .eq().
    if (member?.branch_id && String(member.role || '') === 'booking_officer') {
      query = query.eq('branch_id', member.branch_id)
    }

    const branchId     = sp.get('branch_id')
    const serviceType  = sp.get('service_type')
    const category     = sp.get('category')
    const isActive     = sp.get('is_active')
    const isBookable   = sp.get('is_bookable')
    const search       = sp.get('search')

    if (branchId)    query = query.eq('branch_id', branchId)
    if (serviceType) query = query.eq('service_type', serviceType)
    if (category)    query = query.eq('category', category)
    if (isActive   !== null) query = query.eq('is_active',   isActive   === 'true')
    if (isBookable !== null) query = query.eq('is_bookable', isBookable === 'true')
    if (search)      query = query.ilike('service_name', `%${search}%`)

    const { data, error, count } = await query
    if (error) throw error

    return NextResponse.json({
      success: true,
      services: data,
      pagination: { page, limit, total: count ?? 0 },
    })
  } catch (error) {
    return handleBookingApiError(error)
  }
}

/**
 * POST /api/services
 * Create a new service via create_service_atomic RPC.
 * Roles: owner, admin, manager
 */
export async function POST(req: NextRequest) {
  try {
    const { context, errorResponse } = await apiGuard(req, { requireAuth: true, requireCompany: true })
    if (errorResponse) return errorResponse

    const { user, companyId, member } = context!

    const body = await parseJsonBody(req, createServiceSchema)

    // v3.74.323 — every service must belong to one branch (the shared-
    // service path was rolled back). If the caller didn't specify a
    // branch_id, fall back to their own. If they have neither — refuse.
    const resolvedBranchId = body.branch_id ?? member.branch_id ?? null
    if (!resolvedBranchId) {
      return NextResponse.json(
        { success: false, error: 'branch_id مطلوب لإنشاء الخدمة.' },
        { status: 400 }
      )
    }

    const supabase = await createClient()

    // v3.74.334 — defense-in-depth: refuse to link a product from a
    // different branch. The form already filters the dropdown, but a
    // direct API call or stale client state could still try to pass
    // a foreign product_catalog_id. NULL branch_id on the product is
    // OK (company-level / shared product, available everywhere).
    if (body.product_catalog_id) {
      const { data: catalogProduct, error: catalogErr } = await supabase
        .from('products')
        .select('id, branch_id, item_type, is_active')
        .eq('id', body.product_catalog_id)
        .eq('company_id', companyId)
        .maybeSingle()
      if (catalogErr) throw catalogErr
      if (!catalogProduct) {
        return NextResponse.json(
          { success: false, error: 'صنف الخدمة المختار غير موجود.' },
          { status: 400 }
        )
      }
      if (catalogProduct.is_active === false) {
        return NextResponse.json(
          { success: false, error: 'صنف الخدمة المختار موقوف.' },
          { status: 400 }
        )
      }
      if (catalogProduct.item_type !== 'service') {
        return NextResponse.json(
          { success: false, error: 'صنف الـ catalog المختار ليس من نوع "خدمة".' },
          { status: 400 }
        )
      }
      if (catalogProduct.branch_id && catalogProduct.branch_id !== resolvedBranchId) {
        return NextResponse.json(
          { success: false, error: 'صنف الخدمة المختار يخص فرعاً آخر.' },
          { status: 400 }
        )
      }
    }

    const { data: result, error } = await supabase.rpc('create_service_atomic', {
      p_company_id:          companyId,
      p_branch_id:           resolvedBranchId,
      p_created_by:          user.id,
      p_product_catalog_id:  body.product_catalog_id,
      p_service_type:        body.service_type,
      p_duration_minutes:    body.duration_minutes,
      p_description:         body.description ?? null,
      p_category:            body.category ?? null,
      p_tax_rate:            body.tax_rate ?? 0,
      p_commission_rate:     body.commission_rate ?? 0,
      p_capacity:            body.capacity ?? 1,
      p_buffer_minutes:      body.buffer_minutes ?? 0,
      p_advance_booking_days: body.advance_booking_days ?? 30,
      p_min_advance_hours:   body.min_advance_hours ?? 1,
      p_cancel_before_hours: body.cancel_before_hours ?? 24,
      p_cost_center_id:      body.cost_center_id ?? null,
      p_image_url:           body.image_url ?? null,
      p_color_code:          body.color_code ?? null,
      p_currency_code:       body.currency_code ?? 'EGP',
      p_is_bookable:         body.is_bookable ?? true,
      p_requires_approval:   body.requires_approval ?? false,
      p_notes:               body.notes ?? null,
    })

    if (error) throw error

    asyncAuditLog({
      companyId,
      userId:   user.id,
      userEmail: user.email,
      action:   'CREATE',
      table:    'services',
      recordId: result.service_id,
      recordIdentifier: result.service_code,
      newData:  { product_catalog_id: body.product_catalog_id, service_type: body.service_type },
    })

    return NextResponse.json({ success: true, service: result }, { status: 201 })
  } catch (error) {
    return handleBookingApiError(error)
  }
}
