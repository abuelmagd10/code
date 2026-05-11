import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { BookingNotificationService } from '@/lib/services/booking-notification.service'

/**
 * GET /api/cron/booking-reminders
 *
 * Sends reminder notifications for upcoming bookings.
 * Runs every 15 minutes via Vercel Cron (see vercel.json).
 *
 * Logic:
 *  - Finds all confirmed bookings where reminder_sent = false
 *    and service start is within the next 24 hours.
 *  - Calls BookingNotificationService.notifyBookingReminder() per booking.
 *  - Marks reminder_sent = true on success.
 *
 * Auth: expects Authorization header: Bearer <CRON_SECRET>
 */
export async function GET(req: NextRequest) {
  // ── Auth ────────────────────────────────────────────────────────────────────
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    console.error('[cron/booking-reminders] CRON_SECRET not set')
    return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 })
  }

  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // ── Setup ───────────────────────────────────────────────────────────────────
  const supabase    = createServiceClient()                  // service role — bypasses RLS
  const notifySvc   = new BookingNotificationService(supabase)

  const now         = new Date()
  const windowEnd   = new Date(now.getTime() + 24 * 60 * 60 * 1000)  // now + 24 h

  // We query a 2-day window on booking_date to keep the index range small,
  // then filter the exact timestamp in JS after combining booking_date + start_time.
  const todayStr    = now.toISOString().slice(0, 10)
  const tomorrowStr = windowEnd.toISOString().slice(0, 10)

  // ── Fetch candidates ────────────────────────────────────────────────────────
  const { data: bookings, error: fetchErr } = await supabase
    .from('bookings')
    .select('id, company_id, staff_user_id, booking_date, start_time')
    .eq('status', 'confirmed')
    .eq('reminder_sent', false)
    .gte('booking_date', todayStr)
    .lte('booking_date', tomorrowStr)

  if (fetchErr) {
    console.error('[cron/booking-reminders] fetch error:', fetchErr)
    return NextResponse.json({ error: fetchErr.message }, { status: 500 })
  }

  if (!bookings || bookings.length === 0) {
    return NextResponse.json({ processed: 0, sent: 0, failed: 0 })
  }

  // ── Filter to bookings whose service datetime falls in [now, now+24h] ───────
  const candidates = bookings.filter((b) => {
    if (!b.start_time) return false
    const serviceAt = new Date(`${b.booking_date}T${b.start_time}`)
    return serviceAt >= now && serviceAt <= windowEnd
  })

  let sent   = 0
  let failed = 0

  for (const booking of candidates) {
    const hoursUntil = Math.round(
      (new Date(`${booking.booking_date}T${booking.start_time}`).getTime() - now.getTime()) / 3_600_000
    )

    try {
      await notifySvc.notifyBookingReminder({
        bookingId:          booking.id,
        companyId:          booking.company_id,
        actorUserId:        booking.staff_user_id ?? booking.company_id,  // system actor fallback
        hoursBeforeService: hoursUntil,
      })

      // Mark reminder as sent
      const { error: updateErr } = await supabase
        .from('bookings')
        .update({ reminder_sent: true })
        .eq('id', booking.id)

      if (updateErr) {
        console.error(`[cron/booking-reminders] update failed for ${booking.id}:`, updateErr)
        failed++
      } else {
        sent++
      }
    } catch (err) {
      console.error(`[cron/booking-reminders] notification failed for ${booking.id}:`, err)
      failed++
    }
  }

  console.log(`[cron/booking-reminders] done — processed: ${candidates.length}, sent: ${sent}, failed: ${failed}`)

  return NextResponse.json({
    processed: candidates.length,
    sent,
    failed,
  })
}
