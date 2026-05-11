import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { apiGuard, asyncAuditLog } from '@/lib/core'
import { handleBookingApiError } from '@/lib/services/booking-api'
import { BookingNotificationService } from '@/lib/services/booking-notification.service'

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * POST /api/bookings/[id]/confirm
 * Transition booking: draft → confirmed
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { context, errorResponse } = await apiGuard(req, { requireAuth: true, requireCompany: true })
    if (errorResponse) return errorResponse

    const { user, companyId } = context!
    const { id } = await params

    const supabase = await createClient()

    const { data: result, error } = await supabase.rpc('confirm_booking_atomic', {
      p_company_id:   companyId,
      p_booking_id:   id,
      p_confirmed_by: user.id,
    })

    if (error) throw error

    asyncAuditLog({
      companyId,
      userId:    user.id,
      userEmail: user.email,
      action:    'UPDATE',
      table:     'bookings',
      recordId:  id,
      reason:    'Booking confirmed',
    })

    try {
      const notifySvc = new BookingNotificationService(supabase)
      await notifySvc.notifyBookingConfirmed({ bookingId: id, companyId, actorUserId: user.id })
    } catch (err) {
      console.error('[bookings/confirm] notification failed (non-blocking):', err)
    }

    return NextResponse.json({ success: true, booking: result })
  } catch (error) {
    return handleBookingApiError(error)
  }
}
