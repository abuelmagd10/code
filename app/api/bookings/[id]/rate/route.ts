import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { apiGuard, asyncAuditLog } from '@/lib/core'
import {
  rateBookingSchema,
  parseJsonBody,
  handleBookingApiError,
} from '@/lib/services/booking-api'
import { BookingNotificationService } from '@/lib/services/booking-notification.service'

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * POST /api/bookings/[id]/rate
 * Submit a customer rating for a completed booking (1–5 stars).
 * Body: { rating, feedback? }
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { context, errorResponse } = await apiGuard(req, { requireAuth: true, requireCompany: true })
    if (errorResponse) return errorResponse

    const { user, companyId } = context!
    const { id } = await params

    const body = await parseJsonBody(req, rateBookingSchema)

    const supabase = await createClient()

    const { data: result, error } = await supabase.rpc('rate_booking_atomic', {
      p_company_id: companyId,
      p_booking_id: id,
      p_updated_by: user.id,
      p_rating:     body.rating,
      p_feedback:   body.feedback ?? null,
    })

    if (error) throw error

    asyncAuditLog({
      companyId,
      userId:    user.id,
      userEmail: user.email,
      action:    'UPDATE',
      table:     'bookings',
      recordId:  id,
      newData:   { rating: body.rating, feedback: body.feedback },
      reason:    'Customer rating submitted',
    })

    // Only alert on low ratings (< 3 stars)
    if (body.rating < 3) {
      try {
        const notifySvc = new BookingNotificationService(supabase)
        await notifySvc.notifyLowRating({ bookingId: id, companyId, actorUserId: user.id, rating: body.rating })
      } catch (err) {
        console.error('[bookings/rate] notification failed (non-blocking):', err)
      }
    }

    return NextResponse.json({ success: true, booking: result })
  } catch (error) {
    return handleBookingApiError(error)
  }
}
