-- v3.74.679 — Route booking-stock-withdrawal notifications to the booking page
-- ------------------------------------------------------------------
-- Bug: the store manager's "طلب سحب منتج من المخزن" notification
-- (reference_type='booking_stock_withdrawal') had no route, so "فتح المرجع"
-- showed "لا يمكن التنقل إلى هذا الإشعار". The withdrawal is approved from the
-- booking's add-ons panel, so the notification must open the BOOKING page.
--
-- The notification's reference_id is the withdrawal id (not the booking), and
-- the router is a synchronous client function (no DB lookup). So we embed the
-- booking id in the event_key (the pattern already used for material-issue
-- notifications) and the router parses it:
--   booking_withdrawal_request:{withdrawalId}:{bookingId}
--   booking_withdrawal_decided:{withdrawalId}:{status}:{bookingId}
--
-- This migration: (1) appends the booking id to the event_key produced by the
-- request/decide RPCs, and (2) backfills existing rows. Patched by fetching the
-- live definition and editing only the event_key expression (no hand-
-- transcription); idempotent. Applied live via MCP; captured in
-- supabase/schema/functions.sql by the dump.
-- ------------------------------------------------------------------

DO $mig$
DECLARE d text; q text := chr(39); s text; r text;
BEGIN
  d := pg_get_functiondef('public.request_booking_stock_withdrawal'::regproc);
  s := q||'booking_withdrawal_request:'||q||' || v_id::text';
  r := q||'booking_withdrawal_request:'||q||' || v_id::text || '||q||':'||q||' || p_booking_id::text';
  IF position(r IN d) = 0 THEN
    IF position(s IN d) = 0 THEN RAISE EXCEPTION 'request anchor not found'; END IF;
    EXECUTE replace(d, s, r);
  END IF;

  d := pg_get_functiondef('public.decide_booking_stock_withdrawal'::regproc);
  s := q||'booking_withdrawal_decided:'||q||' || v_w.id::text || '||q||':'||q||' || v_new';
  r := q||'booking_withdrawal_decided:'||q||' || v_w.id::text || '||q||':'||q||' || v_new || '||q||':'||q||' || v_w.booking_id::text';
  IF position(r IN d) = 0 THEN
    IF position(s IN d) = 0 THEN RAISE EXCEPTION 'decide anchor not found'; END IF;
    EXECUTE replace(d, s, r);
  END IF;
END $mig$;

-- Backfill existing notifications with the old event_key formats.
UPDATE public.notifications n SET event_key = n.event_key || ':' || w.booking_id::text
FROM public.booking_stock_withdrawals w
WHERE n.reference_type='booking_stock_withdrawal' AND n.reference_id=w.id
  AND n.event_key LIKE 'booking_withdrawal_request:%'
  AND (length(n.event_key) - length(replace(n.event_key, ':', ''))) = 1;

UPDATE public.notifications n SET event_key = n.event_key || ':' || w.booking_id::text
FROM public.booking_stock_withdrawals w
WHERE n.reference_type='booking_stock_withdrawal' AND n.reference_id=w.id
  AND n.event_key LIKE 'booking_withdrawal_decided:%'
  AND (length(n.event_key) - length(replace(n.event_key, ':', ''))) = 2;
