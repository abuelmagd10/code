-- ============================================================================
-- v3.74.797 — §3.8c: إحكام دورة حياة عهدة الحجز (ثلاث رقع)
--
-- The comprehensive review of the booking⇄invoice gap found the designed
-- protocol SOUND: custody-out stock is returned at completion so consumption
-- deducts exactly once; cancellation REQUESTS custody returns through the
-- return-approval flow; sold-product edits (extras/bundles) already resync
-- onto the draft invoice with accountant + leadership notifications.
--
-- The real holes — the BKG-2026-00006 story verbatim:
--   1. complete_booking_atomic left still-PENDING withdrawal requests alive.
--   2. cancel_booking_atomic did too.
--   3. decide_booking_stock_withdrawal had no booking-state guard — so a
--      stale request approved AFTER completion moved stock into a custody
--      nothing would ever consume or return, and the invoice "did not read
--      it" because there was rightly nothing left to read into.
--
-- Fixes: fn_void_pending_booking_withdrawals (auto-reject with explanation
-- + requester notification), called by completion AND cancellation; and an
-- approve-guard in decide (rejecting a stale request stays allowed).
--
-- Rehearsed on the test copy (after aligning its legacy accrual triggers to
-- prod's disabled state): completion voids the pending request AND still
-- births the invoice; a stale approve is blocked with the Arabic message
-- while a stale reject succeeds; cancellation voids the pending request.
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
        'booking_withdrawal_voided:' || v_w.id::text,
        'info', 'inventory');
    EXCEPTION WHEN OTHERS THEN NULL; END;
  END LOOP;

  RETURN v_count;
END;
$function$;

DO $patch$
DECLARE
  d text;
  a text := $a$  PERFORM public.fn_post_booking_custody_return(id, 'إرجاع تلقائي عند التنفيذ')
    FROM public.booking_stock_withdrawals
   WHERE booking_id = p_booking_id AND custody_status = 'out';$a$;
  r text;
  n int;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO d
  FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
  WHERE ns.nspname='public' AND p.proname='complete_booking_atomic' LIMIT 1;

  IF d LIKE '%fn_void_pending_booking_withdrawals%' THEN
    RAISE NOTICE 'complete_booking_atomic already patched — skipping';
  ELSE
    n := (length(d) - length(replace(d, a, ''))) / length(a);
    IF n <> 1 THEN RAISE EXCEPTION 'completion anchor matched % times', n; END IF;
    r := a || chr(10) ||
         $r$  -- v3.74.797 — a pending withdrawal that outlives completion becomes a
  -- stale trap: approving it later moves stock into a custody nothing will
  -- ever consume or return. Void them here, with notice to the requester.
  PERFORM public.fn_void_pending_booking_withdrawals(p_booking_id, 'اكتمل الحجز وسُجّل استهلاكه');$r$;
    EXECUTE replace(d, a, r);
    RAISE NOTICE 'complete_booking_atomic patched';
  END IF;
END $patch$;

CREATE OR REPLACE FUNCTION public.cancel_booking_atomic(p_company_id uuid, p_booking_id uuid, p_cancelled_by uuid, p_cancellation_reason text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_booking public.bookings;
BEGIN
  -- v3.74.730 — reject a caller acting on another company's data.
  PERFORM public.assert_company_access(p_company_id);
  SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id AND company_id = p_company_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Booking not found. booking_id=%', p_booking_id USING ERRCODE='P0001'; END IF;
  IF public.bkg_is_terminal_status(v_booking.status) THEN RAISE EXCEPTION 'Cannot cancel a % booking. booking_id=%', v_booking.status, p_booking_id USING ERRCODE='P0001'; END IF;
  PERFORM public.fn_request_booking_custody_return(id, 'إلغاء الحجز')
    FROM public.booking_stock_withdrawals
   WHERE booking_id = p_booking_id AND custody_status = 'out';
  -- v3.74.797 — pending withdrawal requests die with the booking; leaving
  -- them alive made late approvals strand stock in custody (§3.8c family).
  PERFORM public.fn_void_pending_booking_withdrawals(p_booking_id, 'أُلغى الحجز');
  UPDATE public.bookings SET status='cancelled', cancellation_reason=p_cancellation_reason, cancelled_by=p_cancelled_by, cancelled_at=NOW(), updated_by=p_cancelled_by WHERE id=p_booking_id;
  RETURN jsonb_build_object('success',true,'booking_id',p_booking_id,'status','cancelled');
END; $function$;

DO $patch2$
DECLARE
  d text;
  a text := $a$  IF v_w.status <> 'pending' THEN$a$;
  r text;
  n int;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO d
  FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
  WHERE ns.nspname='public' AND p.proname='decide_booking_stock_withdrawal' LIMIT 1;

  IF d LIKE '%WITHDRAWAL_BOOKING_FINISHED%' THEN
    RAISE NOTICE 'decide_booking_stock_withdrawal already patched — skipping';
  ELSE
    n := (length(d) - length(replace(d, a, ''))) / length(a);
    IF n <> 1 THEN RAISE EXCEPTION 'decide anchor matched % times', n; END IF;
    r := $r$  -- v3.74.797 — approving a withdrawal for a finished booking moves stock
  -- into a custody nothing will ever consume or return (§3.8c). Rejecting
  -- a stale request stays allowed; approving it does not.
  IF p_approve THEN
    PERFORM 1 FROM public.bookings b
     WHERE b.id = v_w.booking_id
       AND b.status IN ('draft','confirmed','in_progress');
    IF NOT FOUND THEN
      RAISE EXCEPTION 'WITHDRAWAL_BOOKING_FINISHED: الحجز لم يعد قيد التنفيذ — استهلاكه سُجّل (أو أُلغى). الطلب أصبح لاغياً: ارفضه بدلاً من اعتماده.'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  IF v_w.status <> 'pending' THEN$r$;
    EXECUTE replace(d, a, r);
    RAISE NOTICE 'decide_booking_stock_withdrawal patched';
  END IF;
END $patch2$;
