-- ============================================================================
-- v3.74.806 — الاكتمال يوقّع اعتماده (رصده المالك: «تم بواسطة -»)
--
-- Booking completion set warehouse_status='approved' without recording WHO
-- approved or WHEN — the invoice's dispatch card showed dashes. The
-- completion IS the sanction: the custody gates (v3.74.802/803) guarantee
-- the store manager approved every required item's withdrawal BEFORE
-- execution could begin, so the completer's signature is truthful.
--
-- complete_booking_atomic's approved branch now also sets approval_status,
-- approved_by (= p_completed_by) and approval_date; a one-time heal signed
-- the existing booking-born invoices from their bookings' completed_by/at
-- (verified on prod: INV-2026-00002 now shows خالد عجلان with a date).
-- No UI change needed — the invoice page already resolves these fields.
--
-- APPLIED to test + prod 2026-07-23 via MCP; this file is the repo record.
-- ============================================================================

DO $patch$
DECLARE
  d text;
  a text;
  r text;
  n int;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO d
  FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
  WHERE ns.nspname='public' AND p.proname='complete_booking_atomic' LIMIT 1;

  IF d LIKE '%completion signs its approval%' THEN
    RAISE NOTICE 'already patched — skipping';
    RETURN;
  END IF;

  a := $a$SET status = CASE WHEN v_booking.paid_amount >= v_new_total THEN 'paid' ELSE 'sent' END,
           warehouse_status = 'approved'$a$;
  n := (length(d) - length(replace(d, a, ''))) / length(a);
  IF n <> 1 THEN RAISE EXCEPTION 'completion anchor matched % times', n; END IF;

  r := $r$SET status = CASE WHEN v_booking.paid_amount >= v_new_total THEN 'paid' ELSE 'sent' END,
           warehouse_status = 'approved',
           -- v3.74.806 — completion signs its approval: the custody gates
           -- guaranteed the custodian sanctioned every item before execution.
           approval_status = 'approved',
           approved_by = p_completed_by,
           approval_date = NOW()$r$;

  EXECUTE replace(d, a, r);
  RAISE NOTICE 'complete_booking_atomic signs its approval';
END $patch$;

UPDATE public.invoices i
   SET approval_status = 'approved',
       approved_by     = COALESCE(i.approved_by, b.completed_by),
       approval_date   = COALESCE(i.approval_date, b.completed_at)
  FROM public.bookings b
 WHERE b.invoice_id = i.id
   AND i.warehouse_status = 'approved'
   AND i.approved_by IS NULL;
