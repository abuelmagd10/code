import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { apiGuard, asyncAuditLog } from '@/lib/core'
import {
  cancelBookingSchema,
  parseOptionalJsonBody,
  handleBookingApiError,
  BookingApiError,
} from '@/lib/services/booking-api'
import { BookingNotificationService } from '@/lib/services/booking-notification.service'

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * POST /api/bookings/[id]/cancel
 * Cancel a booking (draft | confirmed → cancelled).
 *
 * Pre-cancel checks:
 *  - cancel_before_hours: warns or blocks if too close to booking time
 *  - existing payments: warns if deposits exist (refund is manual)
 *
 * Body (optional): { cancellation_reason }
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { context, errorResponse } = await apiGuard(req, { requireAuth: true, requireCompany: true })
    if (errorResponse) return errorResponse

    const { user, companyId } = context!
    const { id } = await params

    const body = await parseOptionalJsonBody(req, cancelBookingSchema)

    const supabase = await createClient()

    // Load booking + service for pre-flight checks
    const { data: booking, error: bErr } = await supabase
      .from('bookings')
      .select('id, status, booking_date, start_time, paid_amount, service_id')
      .eq('id', id)
      .eq('company_id', companyId)
      .maybeSingle()

    if (bErr) throw bErr
    if (!booking) throw new BookingApiError(404, 'الحجز غير موجود')

    if (['completed', 'cancelled', 'no_show'].includes(booking.status)) {
      throw new BookingApiError(
        409,
        `لا يمكن إلغاء حجز في حالة نهائية: ${booking.status}`
      )
    }

    // Check cancel_before_hours
    const { data: service } = await supabase
      .from('services')
      .select('cancel_before_hours')
      .eq('id', booking.service_id)
      .maybeSingle()

    const warnings: string[] = []

    if (service?.cancel_before_hours) {
      const bookingDateTime = new Date(
        `${booking.booking_date}T${booking.start_time}`
      )
      const cutoff = new Date(
        bookingDateTime.getTime() - service.cancel_before_hours * 60 * 60 * 1000
      )
      if (new Date() > cutoff) {
        warnings.push(
          `الإلغاء بعد فترة السماح (${service.cancel_before_hours} ساعة قبل الموعد) — قد تُطبق رسوم إلغاء`
        )
      }
    }

    // Warn about existing deposits
    if (booking.paid_amount > 0) {
      warnings.push(
        `يوجد مبلغ مدفوع مسبقاً: ${booking.paid_amount} — يجب معالجة الاسترداد يدوياً`
      )
    }

    // Execute cancellation
    const { data: result, error } = await supabase.rpc('cancel_booking_atomic', {
      p_company_id:          companyId,
      p_booking_id:          id,
      p_cancelled_by:        user.id,
      p_cancellation_reason: body.cancellation_reason ?? null,
    })

    if (error) throw error

    asyncAuditLog({
      companyId,
      userId:    user.id,
      userEmail: user.email,
      action:    'UPDATE',
      table:     'bookings',
      recordId:  id,
      reason:    `Booking cancelled: ${body.cancellation_reason ?? 'no reason'}`,
    })

    try {
      const notifySvc = new BookingNotificationService(supabase)
      await notifySvc.notifyBookingCancelled({
        bookingId:          id,
        companyId,
        actorUserId:        user.id,
        cancellationReason: body.cancellation_reason ?? null,
      })
    } catch (err) {
      console.error('[bookings/cancel] notification failed (non-blocking):', err)
    }

    return NextResponse.json({
      success: true,
      booking: result,
      ...(warnings.length > 0 ? { warnings } : {}),
    })
  } catch (error) {
    return handleBookingApiError(error)
  }
}
