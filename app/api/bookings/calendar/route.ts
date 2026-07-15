import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { apiGuard } from '@/lib/core'
import { handleBookingApiError, BookingApiError } from '@/lib/services/booking-api'

/**
 * GET /api/bookings/calendar
 * Calendar view: bookings within a date range, grouped by date.
 * Suitable for rendering a weekly/monthly calendar grid.
 *
 * Query params:
 *   date_from  YYYY-MM-DD (required)
 *   date_to    YYYY-MM-DD (required)
 *   branch_id  optional
 *   service_id optional
 *   staff_user_id optional
 */
export async function GET(req: NextRequest) {
  try {
    const { context, errorResponse } = await apiGuard(req, { requireAuth: true, requireCompany: true })
    if (errorResponse) return errorResponse

    const { companyId, member } = context!
    const sp = req.nextUrl.searchParams

    const dateFrom = sp.get('date_from')
    const dateTo   = sp.get('date_to')

    if (!dateFrom || !dateTo) {
      throw new BookingApiError(400, 'date_from و date_to مطلوبان (YYYY-MM-DD)')
    }

    // Limit range to 90 days to prevent abuse
    const daysDiff =
      (new Date(dateTo).getTime() - new Date(dateFrom).getTime()) / (1000 * 60 * 60 * 24)
    if (daysDiff > 90) {
      throw new BookingApiError(400, 'نطاق التاريخ يجب أن لا يتجاوز 90 يوماً')
    }

    const supabase = await createClient()

    let query = supabase
      .from('v_bookings_full')
      .select(
        'id,booking_no,status,booking_date,start_time,end_time,duration_minutes,' +
        'service_id,service_name,service_color,' +
        'customer_id,customer_name,customer_phone,' +
        'staff_user_id,staff_email,staff_name,' +
        'branch_id,branch_name,' +
        'total_amount,payment_status,paid_amount'
      )
      .eq('company_id', companyId)
      .gte('booking_date', dateFrom)
      .lte('booking_date', dateTo)
      // v3.74.651 — show every status (incl. cancelled/no_show) so the calendar
      // matches the table; the event card colour-codes the status.
      .order('booking_date')
      .order('start_time')

    // v3.74.651 — role-aware branch scoping (mirror /api/bookings): company-wide
    // roles (owner/admin/general_manager) see every branch; only a non-company-wide
    // member WITH a branch_id is locked to their branch. Fixes the calendar being
    // empty for an owner whose membership carries a branch_id.
    const memberRole = String((member as any)?.role ?? '')
    const isCompanyWide = ['owner', 'admin', 'general_manager'].includes(memberRole)
    const isBranchScoped = !isCompanyWide && !!member?.branch_id
    if (isBranchScoped) {
      query = query.eq('branch_id', member.branch_id)
    } else {
      const branchId = sp.get('branch_id')
      if (branchId) query = query.eq('branch_id', branchId)
    }

    const serviceId   = sp.get('service_id')
    const staffUserId = sp.get('staff_user_id')

    if (serviceId)   query = query.eq('service_id', serviceId)
    if (staffUserId) query = query.eq('staff_user_id', staffUserId)

    const { data, error } = await query
    if (error) throw error

    // v_bookings_full may not be in generated Supabase types yet — cast to any[]
    const rows = (data ?? []) as any[]

    // Group by date for calendar rendering
    const byDate: Record<string, any[]> = {}
    for (const booking of rows) {
      const key: string = booking.booking_date
      if (!byDate[key]) byDate[key] = []
      byDate[key].push(booking)
    }

    return NextResponse.json({
      success:   true,
      date_from: dateFrom,
      date_to:   dateTo,
      total:     rows.length,
      calendar:  byDate,
    })
  } catch (error) {
    return handleBookingApiError(error)
  }
}
