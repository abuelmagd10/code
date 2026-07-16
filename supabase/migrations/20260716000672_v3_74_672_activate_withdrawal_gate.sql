-- v3.74.672 — Enforce the stock-withdrawal-approval gate on the EXECUTE path
-- ------------------------------------------------------------------
-- Gap: the "تنفيذ الخدمة" (Execute Service) button calls /activate ->
-- activate_booking_atomic, which enforced the discount gate and the stock
-- availability gate, but NOT the withdrawal-approval gate. That gate
-- (booking_blocking_withdrawals_exist) lived only in the separate /complete
-- route. So an attached item whose product is flagged
-- requires_withdrawal_approval could be executed (invoiced + stock consumed)
-- WITHOUT the branch store manager's approval whenever stock happened to be
-- available.
--
-- Fix: add the SAME gate to activate_booking_atomic, right before the inventory
-- gate. It only blocks items whose product has requires_withdrawal_approval =
-- true and no approved withdrawal yet — items flagged "no approval" are
-- untouched. Patched by fetching the live definition and injecting the check
-- (no hand-transcription of the large body); idempotent.
-- Applied live via MCP; captured in supabase/schema/functions.sql by the dump.
-- ------------------------------------------------------------------

DO $mig$
DECLARE d text; q text := chr(39); nl text := chr(10);
BEGIN
  d := pg_get_functiondef('public.activate_booking_atomic'::regproc);
  IF position('booking_blocking_withdrawals_exist' IN d) > 0 THEN
    RETURN; -- already patched
  END IF;
  IF position('-- v3.74.387 inventory gate' IN d) = 0 THEN
    RAISE EXCEPTION 'anchor not found in activate_booking_atomic';
  END IF;
  d := replace(
    d,
    '-- v3.74.387 inventory gate',
    '-- v3.74.672 withdrawal-approval gate (parity with the /complete route):'||nl||
    '  -- block execution while a selected attached item whose product requires'||nl||
    '  -- withdrawal approval has no APPROVED withdrawal from the branch store manager.'||nl||
    '  IF public.booking_blocking_withdrawals_exist(p_company_id, p_booking_id) THEN'||nl||
    '    RAISE EXCEPTION '||q||'يوجد صنف مرفق يتطلب اعتماد سحب من المخزن قبل تنفيذ الحجز. اطلب الاعتماد من مسؤول المخزن، أو ألغِ تحديد الصنف وأكمل بدونه.'||q||nl||
    '      USING ERRCODE = '||q||'P0001'||q||';'||nl||
    '  END IF;'||nl||nl||
    '  -- v3.74.387 inventory gate'
  );
  EXECUTE d;
END $mig$;
