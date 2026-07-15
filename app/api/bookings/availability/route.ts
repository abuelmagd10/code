import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { apiGuard } from '@/lib/core'
import { handleBookingApiError, BookingApiError } from '@/lib/services/booking-api'
import type { AvailableSlot } from '@/types/bookings'

/**
 * GET /api/bookings/availability
 * Calculate available time slots for a service on a given date.
 *
 * Algorithm:
 *  1. Load service (duration, capacity, buffer_minutes, min_advance_hours)
 *  2. Load service_schedules for the day of week
 *  3. Generate all possible slots at duration+buffer intervals
 *  4. For each slot, count active bookings (capacity check)
 *  5. If staff_user_id provided: also check staff double-booking
 *  6. Filter out slots that violate min_advance_hours
 *
 * Query params:
 *   service_id     (required)
 *   date           YYYY-MM-DD (required)
 *   branch_id      (required) — v3.74.322: see note below
 *   staff_user_id  optional
 *
 * v3.74.322 — Branch-aware capacity check
 *   When a service is shared across all branches (services.branch_id IS
 *   NULL), the same service is bookable in every physical location. If
 *   we counted conflicts across ALL branches, a service with capacity 2
 *   would block its second slot the moment any branch booked one — even
 *   if the other booking is 200 km away. We now require branch_id on
 *   the query so the conflict check scopes to that branch only.
 */
export async function GET(req: NextRequest) {
  try {
    const { context, errorResponse } = await apiGuard(req, { requireAuth: true, requireCompany: true })
    if (errorResponse) return errorResponse

    const { companyId, member } = context!
    const sp = req.nextUrl.searchParams

    const serviceId   = sp.get('service_id')
    const dateStr     = sp.get('date')
    const staffUserId = sp.get('staff_user_id') ?? null
    // v3.74.322 — accept branch_id from query, fall back to caller's
    // own branch (booking_officer / manager always have one).
    const branchId    = sp.get('branch_id') || member?.branch_id || null

    if (!serviceId) throw new BookingApiError(400, 'service_id مطلوب')
    if (!dateStr)   throw new BookingApiError(400, 'date مطلوب (YYYY-MM-DD)')
    if (!branchId)  throw new BookingApiError(400, 'branch_id مطلوب لحساب الإتاحة بشكل صحيح')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      throw new BookingApiError(400, 'date يجب أن يكون بصيغة YYYY-MM-DD')
    }

    const supabase = await createClient()

    // 1. Load service
    const { data: service, error: svcErr } = await supabase
      .from('services')
      .select('id, duration_minutes, capacity, buffer_minutes, min_advance_hours, is_bookable, is_active')
      .eq('id', serviceId)
      .eq('company_id', companyId)
      .maybeSingle()

    if (svcErr) throw svcErr
    if (!service) throw new BookingApiError(404, 'الخدمة غير موجودة')
    if (!service.is_active || !service.is_bookable) {
      return NextResponse.json({
        success: true,
        service_id: serviceId,
        date: dateStr,
        slots: [],
        reason: 'الخدمة غير متاحة للحجز',
      })
    }

    // 2. Load schedule for the day
    const dateObj    = new Date(dateStr + 'T00:00:00')
    const dayOfWeek  = dateObj.getDay()  // 0=Sunday…6=Saturday

    const { data: schedules, error: schErr } = await supabase
      .from('service_schedules')
      .select('start_time, end_time')
      .eq('service_id', serviceId)
      .eq('company_id', companyId)
      .eq('day_of_week', dayOfWeek)
      .eq('is_active', true)

    if (schErr) throw schErr

    if (!schedules || schedules.length === 0) {
      return NextResponse.json({
        success: true,
        service_id: serviceId,
        date: dateStr,
        slots: [],
        reason: 'لا توجد أوقات عمل محددة لهذا اليوم',
      })
    }

    const durationMin  = service.duration_minutes as number
    const bufferMin    = (service.buffer_minutes as number) ?? 0
    const capacity     = (service.capacity as number) ?? 1
    const slotStep     = durationMin + bufferMin     // minutes between slot starts
    const minAdvanceMs = ((service.min_advance_hours as number) ?? 0) * 60 * 60 * 1000
    // v3.74.660 — compare against the LOCAL wall-clock of the *user's* timezone,
    // not the server clock. The app is global; Vercel runs in UTC, so a plain
    // `new Date()` made past slots (e.g. 5:40 PM at 7:29 PM local) still look
    // "future" because slot times are parsed in the server-local frame too.
    // The client sends its IANA timezone (?tz=); express `now` as that zone's
    // wall-clock in the same frame so the past/advance check is correct anywhere.
    const tzParam = req.nextUrl.searchParams.get('tz') || 'UTC'
    let now: Date
    try {
      now = new Date(new Date().toLocaleString('en-US', { timeZone: tzParam }))
    } catch {
      now = new Date() // invalid/unknown timezone → fall back to server clock
    }

    // 3. Generate all possible slots across all schedule windows
    const allSlots: Array<{ start: string; end: string }> = []

    for (const sched of schedules) {
      const [sh, sm] = (sched.start_time as string).split(':').map(Number)
      const [eh, em] = (sched.end_time   as string).split(':').map(Number)

      let startMin = sh! * 60 + sm!
      // v3.74.354 — end_time "00:00" is the editor's encoding for
      // "midnight at the end of the day" (24:00). Map it to 1440
      // minutes so a 18:00 -> 00:00 schedule generates slots up to
      // midnight instead of immediately collapsing to zero slots
      // (00:00 lexicographically before 18:00 would otherwise skip
      // the entire while loop).
      const endMin =
        eh === 0 && em === 0 ? 24 * 60 : eh! * 60 + em!

      while (startMin + durationMin <= endMin) {
        const slotEndMin = startMin + durationMin
        allSlots.push({
          start: `${String(Math.floor(startMin / 60)).padStart(2, '0')}:${String(startMin % 60).padStart(2, '0')}`,
          end:   `${String(Math.floor(slotEndMin / 60)).padStart(2, '0')}:${String(slotEndMin % 60).padStart(2, '0')}`,
        })
        startMin += slotStep
      }
    }

    if (allSlots.length === 0) {
      return NextResponse.json({
        success: true,
        service_id: serviceId,
        date: dateStr,
        slots: [],
        reason: 'لا توجد فترات زمنية متاحة بناءً على مدة الخدمة',
      })
    }

    // 4. Fetch all active bookings for this service on this date AT THIS BRANCH
    //    v3.74.322 — scope the conflict check to the requested branch.
    //    See JSDoc above for the shared-service rationale.
    const { data: existingBookings, error: bErr } = await supabase
      .from('bookings')
      .select('start_time, end_time, staff_user_id')
      .eq('service_id', serviceId)
      .eq('company_id', companyId)
      .eq('branch_id', branchId)
      .eq('booking_date', dateStr)
      .not('status', 'in', '("cancelled","no_show")')

    if (bErr) throw bErr

    const bookings = existingBookings ?? []

    // Helper: time string HH:MM → minutes
    const toMin = (t: string) => {
      const [h, m] = t.split(':').map(Number)
      return h! * 60 + m!
    }

    // Helper: two time ranges overlap?
    const overlaps = (s1: number, e1: number, s2: number, e2: number) =>
      s1 < e2 && e1 > s2

    // 5. Check each slot
    const slots: AvailableSlot[] = allSlots.map((slot) => {
      const slotStartMin = toMin(slot.start)
      const slotEndMin   = toMin(slot.end)

      // Advance check: slot must be at least min_advance_hours from now
      const slotDateTime = new Date(`${dateStr}T${slot.start}:00`)
      const tooSoon = slotDateTime.getTime() - now.getTime() < minAdvanceMs

      // Count capacity conflicts
      const capacityConflicts = bookings.filter((b) =>
        overlaps(slotStartMin, slotEndMin, toMin(b.start_time as string), toMin(b.end_time as string))
      ).length

      // Staff conflict
      let staffConflict = false
      if (staffUserId) {
        staffConflict = bookings.some(
          (b) =>
            b.staff_user_id === staffUserId &&
            overlaps(slotStartMin, slotEndMin, toMin(b.start_time as string), toMin(b.end_time as string))
        )
      }

      const availableCapacity = Math.max(0, capacity - capacityConflicts)
      const isAvailable = !tooSoon && availableCapacity > 0 && !staffConflict

      return {
        start_time:         slot.start,
        end_time:           slot.end,
        is_available:       isAvailable,
        available_capacity: availableCapacity,
        staff_available:    !staffConflict,
      }
    })

    return NextResponse.json({
      success:    true,
      service_id: serviceId,
      date:       dateStr,
      day_of_week: dayOfWeek,
      total_slots: slots.length,
      available_slots: slots.filter((s) => s.is_available).length,
      slots,
    })
  } catch (error) {
    return handleBookingApiError(error)
  }
}
