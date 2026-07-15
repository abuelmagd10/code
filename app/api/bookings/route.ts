import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { apiGuard, asyncAuditLog } from '@/lib/core'
import {
  createBookingSchema,
  parseJsonBody,
  parsePagination,
  handleBookingApiError,
  BookingApiError,
} from '@/lib/services/booking-api'
import { BookingNotificationService } from '@/lib/services/booking-notification.service'
import { findForeignCompanyIds } from '@/lib/company-scope-guard'

/**
 * GET /api/bookings
 * List bookings with filters from v_bookings_full view.
 * Query: branch_id, service_id, customer_id, staff_user_id,
 *        status, payment_status, date_from, date_to, search, page, limit
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
      .from('v_bookings_full')
      .select('*', { count: 'exact' })
      .eq('company_id', companyId)
      .order('booking_date', { ascending: false })
      .order('start_time', { ascending: false })
      .range(from, to)

    // v3.74.360 — Branch scoping only applies to branch-scoped roles.
    // Owner / admin / general_manager are company-wide: they must see
    // bookings across every branch even when their own company_members
    // row happens to carry a branch_id (a common case when the owner
    // is also the day-to-day manager of one branch). The previous
    // unconditional filter hid bookings created in other branches —
    // including every "أمر حجز" a floating booking_officer creates in
    // a branch the owner doesn't sit in.
    const memberRole = String((member as any)?.role ?? '')
    const isCompanyWide = ['owner', 'admin', 'general_manager'].includes(memberRole)
    // v3.74.648 — a user is locked to a single branch only when NOT company-wide
    // AND their membership carries a branch_id. An unassigned booking officer
    // (no branch_id) can browse/filter across every branch.
    const isBranchScoped = !isCompanyWide && !!member?.branch_id
    if (isBranchScoped) {
      query = query.eq('branch_id', member.branch_id)
    }

    const branchId      = sp.get('branch_id')
    const serviceId     = sp.get('service_id')
    const customerId    = sp.get('customer_id')
    const staffUserId   = sp.get('staff_user_id')
    const status        = sp.get('status')
    const paymentStatus = sp.get('payment_status')
    const dateFrom      = sp.get('date_from')
    const dateTo        = sp.get('date_to')
    const search        = sp.get('search')

    // v3.74.648 — honor the branch filter for anyone NOT locked to a branch
    // (company-wide roles, or an unassigned booking officer). Branch-scoped
    // users are already restricted to their own branch above.
    if (branchId && !isBranchScoped)  query = query.eq('branch_id', branchId)
    if (serviceId)    query = query.eq('service_id', serviceId)
    if (customerId)   query = query.eq('customer_id', customerId)
    if (staffUserId)  query = query.eq('staff_user_id', staffUserId)
    if (status)       query = query.eq('status', status)
    if (paymentStatus) query = query.eq('payment_status', paymentStatus)
    if (dateFrom)     query = query.gte('booking_date', dateFrom)
    if (dateTo)       query = query.lte('booking_date', dateTo)
    if (search)       query = query.or(`booking_no.ilike.%${search}%,customer_name.ilike.%${search}%`)

    const { data, error, count } = await query
    if (error) throw error

    return NextResponse.json({
      success: true,
      bookings: data,
      pagination: { page, limit, total: count ?? 0 },
    })
  } catch (error) {
    return handleBookingApiError(error)
  }
}

/**
 * POST /api/bookings
 * Create a new booking (draft) via create_booking_atomic RPC.
 */
export async function POST(req: NextRequest) {
  try {
    const { context, errorResponse } = await apiGuard(req, { requireAuth: true, requireCompany: true })
    if (errorResponse) return errorResponse

    const { user, companyId, member } = context!

    const body = await parseJsonBody(req, createBookingSchema)

    // Resolve branch
    const resolvedBranchId = body.branch_id ?? member?.branch_id
    if (!resolvedBranchId) {
      throw new BookingApiError(400, 'branch_id مطلوب')
    }

    const supabase = await createClient()

    // v3.74.655 — multi-company safety: service/customer must belong to this company
    const foreignRefs = await findForeignCompanyIds(supabase, companyId, {
      services:  [body.service_id],
      customers: [body.customer_id],
    })
    if (foreignRefs.length) {
      throw new BookingApiError(400, 'الخدمة أو العميل المُختار لا يخص الشركة الحالية. حدّث الاختيار ثم أعد المحاولة.')
    }

    // v3.74.361 — multi-staff: prefer staff_user_ids[] when provided.
    // Falls back to the legacy single staff_user_id so older clients
    // keep working during the rollout.
    const rawIds = (body as any).staff_user_ids as string[] | null | undefined
    const staffIds = Array.isArray(rawIds)
      ? rawIds.filter((s): s is string => typeof s === 'string' && s.length > 0)
      : null
    const effectiveIds = (staffIds && staffIds.length > 0)
      ? staffIds
      : (body.staff_user_id ? [body.staff_user_id] : null)

    // v3.74.662 — discount governance: a discount is the assigned executor's call
    // (or management), NOT the booking officer's. Enforce on the server so it
    // cannot be bypassed via the API even if the UI hid the field.
    const bkgDiscount = Number((body as any).discount_amount) || 0
    if (bkgDiscount > 0) {
      const memberRole = String((member as any)?.role ?? '')
      const isUpper = ['owner', 'admin', 'general_manager'].includes(memberRole)
      const isExecutor = !!(effectiveIds && effectiveIds.includes(user.id))
      if (!isUpper && !isExecutor) {
        throw new BookingApiError(403, 'الخصم من اختصاص الموظف المنوط بتنفيذ الحجز أو الإدارة، وليس مسؤول الحجز.')
      }
    }

    const { data: result, error } = await supabase.rpc('create_booking_atomic', {
      p_company_id:          companyId,
      p_branch_id:           resolvedBranchId,
      p_service_id:          body.service_id,
      p_customer_id:         body.customer_id,
      p_created_by:          user.id,
      p_booking_date:        body.booking_date,
      p_start_time:          body.start_time,
      p_quantity:            body.quantity ?? 1,
      p_staff_user_id:       effectiveIds ? effectiveIds[0] : null,
      p_discount_amount:     body.discount_amount ?? 0,
      p_booking_source:      body.booking_source ?? 'manual',
      p_notes:               body.notes ?? null,
      p_cost_center_id:      body.cost_center_id ?? null,
      p_skip_schedule_check: body.skip_schedule_check ?? false,
      p_staff_user_ids:      effectiveIds,
    })

    if (error) throw error

    asyncAuditLog({
      companyId,
      userId:    user.id,
      userEmail: user.email,
      action:    'CREATE',
      table:     'bookings',
      recordId:  result.booking_id,
      recordIdentifier: result.booking_no,
      newData:   { service_id: body.service_id, customer_id: body.customer_id, booking_date: body.booking_date },
    })

    try {
      const notifySvc = new BookingNotificationService(supabase)
      await notifySvc.notifyBookingCreated({ bookingId: result.booking_id, companyId, actorUserId: user.id })
    } catch (err) {
      console.error('[bookings/create] notification failed (non-blocking):', err)
    }

    return NextResponse.json({ success: true, booking: result }, { status: 201 })
  } catch (error) {
    return handleBookingApiError(error)
  }
}
