-- =====================================================================
-- v3.74.595 — Booking-page direct payment recording DISABLED
-- (applied to production via Supabase MCP on 2026-07-10; mirrored here)
--
-- Owner governance decision: the booking cycle is
--   execute → linked sales invoice → the BRANCH ACCOUNTANT completes
--   all money handling from the invoice (payments module with its
--   approval/FX/SoD gates).
-- Direct payment recording on the booking page let any bookings-write
-- role (booking officer, staff) take real money (payment row + JE +
-- treasury hit) outside the accountant's cycle — a SoD breach.
--
-- add_booking_payment_atomic now raises a clear business error.
-- Historical booking_payments rows are untouched; invoice payments
-- still sync back to the booking display via the existing
-- sync_booking_from_invoice trigger.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.add_booking_payment_atomic(
  p_company_id uuid, p_booking_id uuid, p_created_by uuid,
  p_amount numeric, p_payment_method text DEFAULT 'cash',
  p_payment_date date DEFAULT NULL, p_reference_no text DEFAULT NULL,
  p_notes text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RAISE EXCEPTION 'BOOKING_PAYMENTS_DISABLED: الدفعات لا تُسجل من صفحة الحجز — بعد تنفيذ أمر الحجز تُنشأ فاتورة بيع مرتبطة ويستكمل محاسب الفرع التحصيل منها عبر دورة المدفوعات'
    USING ERRCODE = 'P0001';
END;
$$;
