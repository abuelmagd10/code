import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { apiGuard } from '@/lib/core'
import { handleBookingApiError, BookingApiError } from '@/lib/services/booking-api'

interface RouteParams {
  params: Promise<{ id: string }>
}

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
