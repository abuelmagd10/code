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
 * POST /api/bookings/[id]/complete
 * Transition booking: in_progress → completed + creates invoice (Cash Basis).
 *
 * Safety checks performed here (pre-RPC):
 *  - Booking must exist and be in_progress
 *  - service.revenue_account_id recommended (warning if missing, not blocking)
 *
 * The atomic RPC handles invoice creation, payment linkage, and GL entry.
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

    // Pre-check: warn if service has no revenue_account_id (non-blocking)
    const { data: booking } = await supabase
      .from('bookings')
      .select('status, service_id')
      .eq('id', id)
      .eq('company_id', companyId)
      .maybeSingle()

    if (!booking) throw new BookingApiError(404, 'الحجز غير موجود')
    if (booking.status !== 'in_progress') {
      throw new BookingApiError(
        409,
        `لا يمكن إتمام الحجز — الحالة الحالية: ${booking.status} (مطلوب: in_progress)`
      )
    }

    const { data: service } = await supabase
      .from('services')
      .select('revenue_account_id, service_name')
      .eq('id', booking.service_id)
      .maybeSingle()

    const warnings: string[] = []
    if (!service?.revenue_account_id) {
      warnings.push(
        'الخدمة لا تحتوي على حساب إيرادات — سيتم إنشاء الفاتورة دون ربط محاسبي'
      )
    }

    // v3.74.634 — Withdrawal-approval gate. Block completion if a SELECTED
    // attached (consumed) item whose product requires withdrawal approval has
    // not been approved by the branch warehouse manager yet. Only products
    // flagged requires_withdrawal_approval can block; all others pass through.
    const { data: blocked, error: gateErr } = await supabase.rpc('booking_blocking_withdrawals_exist', {
      p_company_id: companyId,
      p_booking_id: id,
    })
    if (gateErr) throw gateErr
    if (blocked === true) {
      throw new BookingApiError(
        409,
        'يوجد صنف مرفق يتطلب اعتماد سحب من المخزن قبل تنفيذ الحجز. اطلب الاعتماد من مسؤول المخزن، أو ألغِ تحديد الصنف وأكمل بدونه.',
      )
    }

    // Execute atomic completion
    const { data: result, error } = await supabase.rpc('complete_booking_atomic', {
      p_company_id:   companyId,
      p_booking_id:   id,
      p_completed_by: user.id,
      p_invoice_date: body.invoice_date ?? null,
      p_due_date:     body.due_date ?? null,
      p_notes:        body.notes ?? null,
    })

    if (error) throw error

    asyncAuditLog({
      companyId,
      userId:    user.id,
      userEmail: user.email,
      action:    'UPDATE',
      table:     'bookings',
      recordId:  id,
      recordIdentifier: result?.invoice_no,
      reason:    'Booking completed — invoice created',
      newData:   { invoice_id: result?.invoice_id, invoice_no: result?.invoice_no },
    })

    try {
      const notifySvc = new BookingNotificationService(supabase)
      await notifySvc.notifyBookingCompleted({
        bookingId: id,
        companyId,
        actorUserId: user.id,
        invoiceId:  result?.invoice_id ?? null,
        invoiceNo:  result?.invoice_no ?? null,
      })
    } catch (err) {
      console.error('[bookings/complete] notification failed (non-blocking):', err)
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
