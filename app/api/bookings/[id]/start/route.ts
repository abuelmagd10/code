import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { apiGuard, asyncAuditLog } from '@/lib/core'
import { handleBookingApiError } from '@/lib/services/booking-api'
import { BookingNotificationService } from '@/lib/services/booking-notification.service'

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * POST /api/bookings/[id]/start
 * Transition booking: confirmed → in_progress
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { context, errorResponse } = await apiGuard(req, { requireAuth: true, requireCompany: true })
    if (errorResponse) return errorResponse

    const { user, companyId } = context!
    const { id } = await params

    const supabase = await createClient()

    const { data: result, error } = await supabase.rpc('start_booking_atomic', {
      p_company_id: companyId,
      p_booking_id: id,
      p_started_by: user.id,
    })

    if (error) throw error

    asyncAuditLog({
      companyId,
      userId:    user.id,
      userEmail: user.email,
      action:    'UPDATE',
      table:     'bookings',
      recordId:  id,
      reason:    'Service started',
    })

    try {
      const notifySvc = new BookingNotificationService(supabase)
      await notifySvc.notifyBookingStarted({ bookingId: id, companyId, actorUserId: user.id })
    } catch (err) {
      console.error('[bookings/start] notification failed (non-blocking):', err)
    }

    return NextResponse.json({ success: true, booking: result })
  } catch (error) {
    return handleBookingApiError(error)
  }
}
