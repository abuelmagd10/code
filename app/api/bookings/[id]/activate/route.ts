import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { apiGuard, asyncAuditLog } from '@/lib/core'
import {
  completeBookingSchema,
  parseOptionalJsonBody,
  handleBookingApiError,
  BookingApiError,
} from '@/lib/services/booking-api'
import { BookingNotificationService } from '@/lib/services/booking-notification.service'

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * POST /api/bookings/[id]/activate — v3.74.326
 *
 * One-click "تفعيل" for booking orders shown in the /sales-orders
 * "أوامر الحجز" tab. Fast-forwards any non-terminal booking
 * (draft / confirmed / in_progress) straight to completed, generates
 * the invoice via complete_booking_atomic, and stamps
 * current_responsible_user_id with the activator if it was still
 * unassigned.
 *
 * The booking lifecycle for users who navigate through the calendar
 * is unchanged — they still go through /confirm /start /complete
 * one at a time. This endpoint is purely a shortcut for the orders
 * inbox.
 *
 * Body (optional): { invoice_date, due_date, notes }
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { context, errorResponse } = await apiGuard(req, { requireAuth: true, requireCompany: true })
    if (errorResponse) return errorResponse

    const { user, companyId } = context!
    const { id } = await params

    const body = await parseOptionalJsonBody(req, completeBookingSchema)

    const supabase = await createClient()

    // Pre-check: load current status so we can give a useful 409 instead
    // of bubbling a raw P0001 from the RPC for the terminal states.
    const { data: booking } = await supabase
      .from('bookings')
      .select('status, customer_id, service_id')
      .eq('id', id)
      .eq('company_id', companyId)
      .maybeSingle()

    if (!booking) throw new BookingApiError(404, 'الحجز غير موجود')
    if (booking.status === 'completed') {
      throw new BookingApiError(409, 'أمر الحجز ده مفعّل بالفعل.')
    }
    if (booking.status === 'cancelled') {
      throw new BookingApiError(409, 'أمر الحجز ده ملغى ومش ينفع يتفعّل.')
    }
    if (booking.status === 'no_show') {
      throw new BookingApiError(409, 'أمر الحجز ده مسجّل كـ "لم يحضر" ومش ينفع يتفعّل.')
    }

    const { data, error } = await supabase.rpc('activate_booking_atomic', {
      p_company_id:   companyId,
      p_booking_id:   id,
      p_activated_by: user.id,
      p_invoice_date: body?.invoice_date ?? undefined,
      p_due_date:     body?.due_date     ?? undefined,
      p_notes:        body?.notes        ?? undefined,
    })

    if (error) throw error

    // Reuse the existing "booking completed" notification so the
    // accountant gets the same heads-up they'd get from /complete.
    try {
      const notifySvc = new BookingNotificationService(supabase)
      await notifySvc.notifyBookingCompleted({
        bookingId:   id,
        companyId,
        actorUserId: user.id,
        invoiceId:   (data as any)?.invoice_id ?? null,
        invoiceNo:   (data as any)?.invoice_no ?? null,
      })
    } catch (err) {
      // non-fatal — the activation itself already succeeded
      console.error('[bookings/activate] notification failed (non-blocking):', err)
    }

    // v3.74.342 — Service commission hook for the "paid on activation"
    // case. complete_booking_atomic stamps the invoice as 'paid'
    // directly when the booking's paid_amount already covers the
    // total, skipping the sales-invoice-payment service where the
    // commission hook normally lives. We mirror the call here so the
    // executor still earns their commission. Idempotent: the unique
    // index on user_bonuses (company_id, booking_id) makes a second
    // call a no-op if the payment-side hook also fired.
    const newInvoiceId = (data as any)?.invoice_id as string | undefined
    if (newInvoiceId) {
      try {
        const { data: invoiceCheck } = await supabase
          .from('invoices')
          .select('status')
          .eq('id', newInvoiceId)
          .eq('company_id', companyId)
          .maybeSingle()
        if (invoiceCheck?.status === 'paid') {
          const { recordServiceCommissionForInvoice } = await import('@/lib/services/service-commission-calculator.service')
          const commissionResult = await recordServiceCommissionForInvoice(supabase, {
            companyId,
            invoiceId: newInvoiceId,
            createdBy: user.id,
          })
          if (commissionResult.recorded) {
            console.log(`[ServiceCommission] Recorded on activation -> bonus ${commissionResult.bonus_id} amount ${commissionResult.amount}`)
          } else if (commissionResult.reason && !['already_recorded','no_booking_for_invoice','zero_rate','no_responsible_user'].includes(commissionResult.reason)) {
            console.log(`[ServiceCommission] Skipped on activation: ${commissionResult.reason}`)
          }
        }
      } catch (err: any) {
        console.error('[ServiceCommission] Activation hook error (non-fatal):', err?.message || err)
      }
    }

    asyncAuditLog({
      companyId,
      userId:   user.id,
      userEmail: user.email,
      action:   'UPDATE',
      table:    'bookings',
      recordId: id,
      newData:  { status: 'completed', activated_by: user.id, invoice_id: (data as any)?.invoice_id ?? null },
    })

    return NextResponse.json({ success: true, ...(data as any) })
  } catch (error) {
    return handleBookingApiError(error)
  }
}
