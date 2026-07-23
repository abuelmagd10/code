-- ============================================================================
-- v3.74.800 — إشعار قرار السحب يوجّه المنفذ إلى حجزه
--
-- Live-caught by the owner: خالد clicked «تم اعتماد سحب المنتج» and landed
-- on the approvals inbox — a page whose actions belong to the STORE
-- MANAGER. The requester's next step lives on the BOOKING (start the
-- service), so the DECIDED/VOIDED notification must route there.
--
-- TS side (same release): notification-routing sends
-- booking_withdrawal_decided:<wid>:<status>:<bookingId> and
-- booking_withdrawal_voided:<wid>:<bookingId> to /bookings/<bookingId>;
-- the manager's REQUEST notification keeps the approvals inbox tab.
--
-- DB side (this file): fn_void_pending_booking_withdrawals appends the
-- booking id to its event key so voided notifications can route too.
-- APPLIED to test + prod 2026-07-23 via MCP; this file is the repo record.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_void_pending_booking_withdrawals(
  p_booking_id uuid, p_context text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_w record;
  v_count int := 0;
  v_booking_no text;
BEGIN
  SELECT booking_no INTO v_booking_no FROM public.bookings WHERE id = p_booking_id;

  FOR v_w IN
    SELECT * FROM public.booking_stock_withdrawals
     WHERE booking_id = p_booking_id AND status = 'pending'
     FOR UPDATE
  LOOP
    UPDATE public.booking_stock_withdrawals
       SET status = 'rejected',
           decided_by = COALESCE(auth.uid(), v_w.requested_by),
           decided_at = NOW(),
           decision_notes = 'أُلغى تلقائياً — ' || p_context ||
             '. استهلاك الحجز يُسجَّل عند التنفيذ؛ الطلب المعلق أصبح لاغياً.'
     WHERE id = v_w.id;
    v_count := v_count + 1;

    BEGIN
      PERFORM public.create_notification(
        v_w.company_id, 'booking_stock_withdrawal', v_w.id,
        'أُلغى طلب سحب المنتج تلقائياً',
        'طلب سحب المنتج للحجز ' || COALESCE(v_booking_no,'') ||
        ' أُلغى تلقائياً — ' || p_context || '.',
        COALESCE(auth.uid(), v_w.requested_by), v_w.branch_id, NULL, v_w.warehouse_id,
        NULL, v_w.requested_by, 'normal',
        -- v3.74.800 — booking id appended so the notification routes the
        -- requester back to HIS BOOKING, not the approvals inbox.
        'booking_withdrawal_voided:' || v_w.id::text || ':' || p_booking_id::text,
        'info', 'inventory');
    EXCEPTION WHEN OTHERS THEN NULL; END;
  END LOOP;

  RETURN v_count;
END;
$function$;
