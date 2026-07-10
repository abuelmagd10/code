import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { apiGuard, asyncAuditLog } from '@/lib/core'
import {
  handleBookingApiError,
  BookingApiError,
  parseJsonBody,
} from '@/lib/services/booking-api'

interface RouteParams {
  params: Promise<{ id: string }>
}

// v3.74.358 — schema for PATCH /api/bookings/[id]. Only fields the
// owner asked to be editable on the draft booking. Status / payment /
// invoice columns are intentionally NOT here — they have their own
// dedicated endpoints (confirm, cancel, execute).
const patchBookingSchema = z.object({
  customer_id:     z.string().uuid().optional(),
  service_id:      z.string().uuid().optional(),
  staff_user_id:   z.string().uuid().nullable().optional(),
  // v3.74.361 — multi-staff edit. Sending staff_user_ids REPLACES the
  // entire assignments set (owner-confirmed rule: "remove ahmed, add
  // khaled + samy"). Sending an empty array means "open queue".
  staff_user_ids:  z.array(z.string().uuid()).nullable().optional(),
  booking_date:    z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  start_time:      z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).optional(),
  end_time:        z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).optional(),
  quantity:        z.coerce.number().positive().optional(),
  discount_amount: z.coerce.number().min(0).optional(),
  notes:           z.string().nullable().optional(),
})

/**
 * GET /api/bookings/[id]
 * Fetch a single booking from v_bookings_full, with payments and status history.
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { context, errorResponse } = await apiGuard(req, { requireAuth: true, requireCompany: true })
    if (errorResponse) return errorResponse

    const { companyId } = context!
    const { id } = await params

    const supabase = await createClient()

    const [
      { data: booking, error: bErr },
      { data: payments, error: pErr },
      { data: history,  error: hErr },
    ] = await Promise.all([
      supabase
        .from('v_bookings_full')
        .select('*')
        .eq('id', id)
        .eq('company_id', companyId)
        .maybeSingle(),
      supabase
        .from('booking_payments')
        .select('*')
        .eq('booking_id', id)
        .eq('company_id', companyId)
        .order('created_at'),
      supabase
        .from('booking_status_history')
        .select('*')
        .eq('booking_id', id)
        .eq('company_id', companyId)
        // v3.74.218 — the column was renamed from created_at to
        // changed_at to match the BookingStatusHistory type and the
        // BookingStatusTimeline component. Before the rename the order
        // call hit PostgREST 42703 (undefined column) and the whole
        // GET /api/bookings/[id] returned 500.
        .order('changed_at'),
    ])

    if (bErr) throw bErr
    if (pErr) throw pErr
    if (hErr) throw hErr

    if (!booking) {
      throw new BookingApiError(404, 'الحجز غير موجود أو غير مصرح بالوصول إليه')
    }

    return NextResponse.json({
      success: true,
      booking: {
        ...booking,
        payments: payments ?? [],
        status_history: history ?? [],
      },
    })
  } catch (error) {
    return handleBookingApiError(error)
  }
}

/**
 * v3.74.358 — PATCH /api/bookings/[id]
 * Edit a draft booking before execution. Allowed while:
 *   - status = 'draft'
 *   - booking has not been executed (no invoice yet)
 *
 * Once "تنفيذ الخدمة" has fired, the booking moves to completed +
 * gets an invoice, and editing through this endpoint is rejected.
 */
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const { context, errorResponse } = await apiGuard(req, { requireAuth: true, requireCompany: true })
    if (errorResponse) return errorResponse

    const { user, companyId } = context!
    const { id } = await params

    const body = await parseJsonBody(req, patchBookingSchema)

    const supabase = await createClient()

    // Sanity: booking must be a still-editable draft.
    // v3.74.600 — exception: a discount-ONLY patch is also allowed while
    // status = 'confirmed' (mirrors the bkg_request_discount_approval_trg
    // window: draft/confirmed + no invoice). Everything else stays
    // draft-only.
    const { data: current, error: cErr } = await supabase
      .from('bookings')
      .select('id, status, invoice_id, service_id, unit_price, quantity')
      .eq('id', id)
      .eq('company_id', companyId)
      .maybeSingle()
    if (cErr) throw cErr
    if (!current) throw new BookingApiError(404, 'الحجز غير موجود')

    const sentKeys = Object.keys(body).filter((k) => (body as any)[k] !== undefined)
    const isDiscountOnlyPatch =
      sentKeys.length > 0 && sentKeys.every((k) => k === 'discount_amount')

    if (current.status !== 'draft' && !(current.status === 'confirmed' && isDiscountOnlyPatch)) {
      throw new BookingApiError(
        409,
        current.status === 'confirmed'
          ? 'الحجز مؤكد — المسموح تعديله فى هذه المرحلة هو الخصم فقط.'
          : 'لا يمكن تعديل الحجز فى الحالة الحالية. التعديل متاح فقط للحجوزات فى حالة مسودة.',
      )
    }
    if (current.invoice_id) {
      throw new BookingApiError(
        409,
        'لا يمكن تعديل الحجز بعد تنفيذ الخدمة وإصدار الفاتورة.',
      )
    }

    // v3.74.600 — amount discount must satisfy 0 ≤ discount < gross
    // (gross = unit_price × qty before discount). The zod schema already
    // enforces ≥ 0; here we cap the upper bound server-side.
    if (body.discount_amount !== undefined) {
      const effectiveQty = Number(body.quantity ?? current.quantity ?? 1)
      const gross = Number(current.unit_price || 0) * effectiveQty
      if (gross > 0 && Number(body.discount_amount) >= gross) {
        throw new BookingApiError(
          400,
          'قيمة الخصم يجب أن تكون أقل من إجمالى الخدمة قبل الخصم.',
        )
      }
    }

    // If the schedule (date / start_time / staff / service) is being
    // touched, recompute end_time and re-run the working-hours +
    // advance-booking validators. The simplest way is to fall back to
    // create_booking_atomic logic? No - we just update + let the
    // BEFORE INSERT/UPDATE trigger bkg_trg_validate_booking do the
    // working-hours check. The trigger already fires on UPDATE.
    //
    // For end_time recomputation when start_time changes but end_time
    // isn't sent, we look up the service duration_minutes.

    // v3.74.361 — staff_user_ids is handled separately (junction
    // table). Strip it from the column-level patch so it doesn't end
    // up in the bookings UPDATE.
    const sentIds = (body as any).staff_user_ids as string[] | null | undefined
    const idsArrayProvided = Array.isArray(sentIds)
    const { staff_user_ids: _drop, ...bodyForBookingRow } = body as any
    const patch: Record<string, any> = {
      ...bodyForBookingRow,
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    }
    // Keep the legacy mirror column in sync when an array is supplied.
    if (idsArrayProvided) {
      patch.staff_user_id = sentIds && sentIds.length > 0 ? sentIds[0] : null
    }

    const startChanged = !!body.start_time
    const endMissing   = !body.end_time
    if (startChanged && endMissing) {
      const svcId = body.service_id ?? current.service_id
      const { data: svc } = await supabase
        .from('services')
        .select('duration_minutes')
        .eq('id', svcId)
        .eq('company_id', companyId)
        .maybeSingle()
      if (svc?.duration_minutes) {
        const [h, m] = body.start_time!.split(':').map(Number)
        const startMin = h! * 60 + m!
        const endMin   = startMin + Number(svc.duration_minutes)
        const eh = Math.floor((endMin % (24 * 60)) / 60)
        const em = endMin % 60
        patch.end_time = `${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}`
        patch.duration_minutes = svc.duration_minutes
      }
    }

    const { data: updated, error: uErr } = await supabase
      .from('bookings')
      .update(patch)
      .eq('id', id)
      .eq('company_id', companyId)
      .select('*')
      .single()
    if (uErr) throw uErr

    // v3.74.361 — REPLACE the assignments set when staff_user_ids was
    // sent. Owner-confirmed rule (option A): a PATCH that names
    // "Khaled + Samy" removes Ahmed entirely.
    if (idsArrayProvided) {
      const { error: delErr } = await supabase
        .from('booking_staff_assignments')
        .delete()
        .eq('booking_id', id)
        .eq('company_id', companyId)
      if (delErr) throw delErr

      if (sentIds && sentIds.length > 0) {
        const rows = sentIds.map((uid) => ({
          booking_id: id,
          user_id:    uid,
          company_id: companyId,
          branch_id:  updated.branch_id,
        }))
        const { error: insErr } = await supabase
          .from('booking_staff_assignments')
          .insert(rows)
        if (insErr) throw insErr
      }
    }

    asyncAuditLog({
      companyId,
      userId:    user.id,
      userEmail: user.email,
      action:    'UPDATE',
      table:     'bookings',
      recordId:  id,
      newData:   body,
    })

    return NextResponse.json({ success: true, booking: updated })
  } catch (error) {
    return handleBookingApiError(error)
  }
}
