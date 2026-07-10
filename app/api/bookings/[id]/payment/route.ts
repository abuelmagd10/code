import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { apiGuard, asyncAuditLog } from '@/lib/core'
import {
  addPaymentSchema,
  parseJsonBody,
  handleBookingApiError,
} from '@/lib/services/booking-api'
import { BookingNotificationService } from '@/lib/services/booking-notification.service'

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * POST /api/bookings/[id]/payment
 * Record a deposit/partial payment via add_booking_payment_atomic RPC.
 * Body: { amount, payment_method?, payment_date?, reference_no?, notes? }
 *
 * The trigger auto-syncs paid_amount and payment_status on the booking.
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { context, errorResponse } = await apiGuard(req, { requireAuth: true, requireCompany: true })
    if (errorResponse) return errorResponse

    const { user, companyId } = context!
    const { id } = await params

    // v3.74.595 — قرار حوكمة: الدفعات لا تُسجل من صفحة الحجز.
    // الدورة: تنفيذ ← فاتورة بيع مرتبطة ← محاسب الفرع يحصّل من الفاتورة
    // عبر دورة المدفوعات. الـRPC فى القاعدة معطلة أيضاً (دفاع مزدوج).
    return NextResponse.json(
      {
        success: false,
        error:
          "الدفعات لا تُسجل من صفحة الحجز — بعد تنفيذ أمر الحجز تُنشأ فاتورة بيع مرتبطة ويستكمل محاسب الفرع التحصيل منها عبر دورة المدفوعات",
      },
      { status: 410 },
    )

    // eslint-disable-next-line no-unreachable
    const body = await parseJsonBody(req, addPaymentSchema)

    const supabase = await createClient()

    const { data: result, error } = await supabase.rpc('add_booking_payment_atomic', {
      p_company_id:     companyId,
      p_booking_id:     id,
      p_created_by:     user.id,
      p_amount:         body.amount,
      p_payment_method: body.payment_method ?? 'cash',
      p_payment_date:   body.payment_date ?? null,
      p_reference_no:   body.reference_no ?? null,
      p_notes:          body.notes ?? null,
    })

    if (error) throw error

    asyncAuditLog({
      companyId,
      userId:    user.id,
      userEmail: user.email,
      action:    'CREATE',
      table:     'booking_payments',
      recordId:  id,
      newData:   { amount: body.amount, payment_method: body.payment_method },
      reason:    'Deposit/partial payment recorded',
    })

    try {
      const notifySvc = new BookingNotificationService(supabase)
      await notifySvc.notifyBookingPaymentAdded({
        bookingId:     id,
        companyId,
        actorUserId:   user.id,
        amount:        body.amount,
        paymentMethod: body.payment_method ?? 'cash',
      })
    } catch (err) {
      console.error('[bookings/payment] notification failed (non-blocking):', err)
    }

    return NextResponse.json({ success: true, payment: result }, { status: 201 })
  } catch (error) {
    return handleBookingApiError(error)
  }
}

/**
 * GET /api/bookings/[id]/payment
 * List all payments for a booking.
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { context, errorResponse } = await apiGuard(req, { requireAuth: true, requireCompany: true })
    if (errorResponse) return errorResponse

    const { companyId } = context!
    const { id } = await params

    const supabase = await createClient()

    const { data, error } = await supabase
      .from('booking_payments')
      .select('*')
      .eq('booking_id', id)
      .eq('company_id', companyId)
      .order('created_at')

    if (error) throw error

    return NextResponse.json({ success: true, payments: data })
  } catch (error) {
    return handleBookingApiError(error)
  }
}
