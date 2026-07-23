-- ============================================================================
-- v3.74.802 — اعتماد سحب الإلزامى شرطُ تنفيذ (قاعدة المالك 2026-07-23)
--
-- Owner: «زر تنفيذ الخدمة يجب أن يظهر بعد اعتماد مسئول المخزن للمنتجات
-- المرتبطة الإلزامية». The system's own mandatory-rejection text already
-- promised «لا يمكن تنفيذ الحجز بدونه» — this release makes the promise
-- enforceable. Optional bundle items never gate execution (by design the
-- service may proceed without them).
--
-- One shared STABLE function `booking_mandatory_custody_gate(booking_id)`
-- returns {ready, missing[]} and serves BOTH:
--   - the DB guard inside activate_booking_atomic (real enforcement — the
--     activation refuses with an Arabic message naming the missing items);
--   - the UI (BookingActions locks the تنفيذ الخدمة button with a hint
--     listing the same names; fail-open on read errors since the server
--     guard is the real gate).
--
-- APPLIED to test + prod 2026-07-23 via MCP; this file is the repo record.
-- Rehearsed on test: gate names the missing mandatory product; activate
-- refuses; an approved withdrawal opens the gate ({ready:true}).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.booking_mandatory_custody_gate(p_booking_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH bkg AS (
    SELECT b.id, b.company_id, s.product_catalog_id
    FROM public.bookings b
    JOIN public.services s ON s.id = b.service_id
    WHERE b.id = p_booking_id
  ),
  mandatory AS (
    SELECT pbi.id AS bundle_item_id, p.name AS product_name
    FROM bkg
    JOIN public.product_bundle_items pbi
      ON pbi.parent_product_id = bkg.product_catalog_id
     AND pbi.company_id = bkg.company_id
    JOIN public.products p ON p.id = pbi.child_product_id
    WHERE COALESCE(pbi.is_optional, false) = false
  ),
  missing AS (
    SELECT m.product_name
    FROM mandatory m
    WHERE NOT EXISTS (
      SELECT 1 FROM public.booking_stock_withdrawals w
      WHERE w.booking_id = p_booking_id
        AND w.bundle_item_id = m.bundle_item_id
        AND w.status = 'approved'
    )
  )
  SELECT jsonb_build_object(
    'ready',   NOT EXISTS (SELECT 1 FROM missing),
    'missing', COALESCE((SELECT jsonb_agg(product_name) FROM missing), '[]'::jsonb)
  );
$function$;

GRANT EXECUTE ON FUNCTION public.booking_mandatory_custody_gate(uuid) TO authenticated;

DO $patch$
DECLARE
  d text;
  a text := $a$  IF v_status IN ('completed', 'cancelled', 'no_show') THEN$a$;
  r text;
  n int;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO d
  FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
  WHERE ns.nspname='public' AND p.proname='activate_booking_atomic' LIMIT 1;

  IF d LIKE '%booking_mandatory_custody_gate%' THEN
    RAISE NOTICE 'activate_booking_atomic already patched — skipping';
  ELSE
    n := (length(d) - length(replace(d, a, ''))) / length(a);
    IF n <> 1 THEN RAISE EXCEPTION 'activate anchor matched % times', n; END IF;
    r := $r$  -- v3.74.802 — owner rule: execution requires the store manager's
  -- approval of every MANDATORY bundle item's withdrawal. The system's own
  -- rejection text promises «لا يمكن تنفيذ الحجز بدونه» — this makes the
  -- promise enforceable. Optional items never gate.
  DECLARE v_gate jsonb;
  BEGIN
    v_gate := public.booking_mandatory_custody_gate(p_booking_id);
    IF NOT COALESCE((v_gate->>'ready')::boolean, true) THEN
      RAISE EXCEPTION 'EXECUTION_REQUIRES_MANDATORY_CUSTODY: لا يمكن تنفيذ الخدمة قبل اعتماد مسؤول المخزن سحب الأصناف الإلزامية: %',
        (SELECT string_agg(x.v, '، ') FROM jsonb_array_elements_text(v_gate->'missing') x(v))
        USING ERRCODE = 'P0001';
    END IF;
  END;

  IF v_status IN ('completed', 'cancelled', 'no_show') THEN$r$;
    EXECUTE replace(d, a, r);
    RAISE NOTICE 'activate_booking_atomic patched';
  END IF;
END $patch$;
