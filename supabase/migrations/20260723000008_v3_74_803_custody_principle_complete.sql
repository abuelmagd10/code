-- ============================================================================
-- v3.74.803 — مبدأ العهدة مكتملاً (قرارا المالك 2026-07-23)
--
-- The owner's live-test question exposed a trap: with the mandatory item
-- approved and the OPTIONAL one rejected, completion would still consume
-- the rejected optional (its selection survived the rejection; the system
-- merely ADVISED the employee «ألغِ تحديد الصنف وأكمل بدونه»). And a
-- selected optional with NO withdrawal at all was consumed with no
-- custodian involvement.
--
-- Owner decisions:
--   1. Every SELECTED item — mandatory or optional — needs an APPROVED
--      withdrawal before execution («لا تخرج بضاعة إلا بإذن حارسها»).
--   2. Rejecting an optional withdrawal auto-deselects the item
--      (automating the system's own instruction), so completion consumes
--      only what the custodian sanctioned and the gate unblocks naturally.
--
-- Rehearsed on the test copy: selected optional without approved
-- withdrawal blocks the gate NAMING it (booto); rejection deletes the
-- selection, notifies «أكمل الخدمة بدونه», and the gate opens.
-- APPLIED to test + prod 2026-07-23 via MCP; this file is the repo record.
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
  required_items AS (
    SELECT pbi.id AS bundle_item_id, p.name AS product_name
    FROM bkg
    JOIN public.product_bundle_items pbi
      ON pbi.parent_product_id = bkg.product_catalog_id
     AND pbi.company_id = bkg.company_id
    JOIN public.products p ON p.id = pbi.child_product_id
    WHERE COALESCE(pbi.is_optional, false) = false
    UNION
    SELECT pbi.id, p.name
    FROM bkg
    JOIN public.booking_bundle_selections bbs ON bbs.booking_id = bkg.id
    JOIN public.product_bundle_items pbi ON pbi.id = bbs.bundle_item_id
    JOIN public.products p ON p.id = pbi.child_product_id
  ),
  missing AS (
    SELECT m.product_name
    FROM required_items m
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

DO $patch$
DECLARE
  d text;
  a text := $a$'. ألغِ تحديد الصنف وأكمل بدونه.';$a$;
  r text;
  n int;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO d
  FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
  WHERE ns.nspname='public' AND p.proname='decide_booking_stock_withdrawal' LIMIT 1;

  IF d LIKE '%تم إلغاء تحديد الصنف تلقائياً%' THEN
    RAISE NOTICE 'decide already patched — skipping';
  ELSE
    n := (length(d) - length(replace(d, a, ''))) / length(a);
    IF n <> 1 THEN RAISE EXCEPTION 'decide anchor matched % times', n; END IF;
    r := $r$'. تم إلغاء تحديد الصنف تلقائياً — أكمل الخدمة بدونه.';
    -- v3.74.803 — automate the old instruction: the rejected OPTIONAL item
    -- is deselected so completion will not consume it. Only while the
    -- booking is still pre-execution (a completed booking's invoice must
    -- not be desynced by a late reject).
    IF v_booking.status IN ('draft','confirmed','in_progress') THEN
      DELETE FROM public.booking_bundle_selections
       WHERE booking_id = v_w.booking_id
         AND bundle_item_id = v_w.bundle_item_id;
    END IF;$r$;
    EXECUTE replace(d, a, r);
    RAISE NOTICE 'decide patched';
  END IF;
END $patch$;

DO $patch2$
DECLARE
  d text;
  a text := $a$سحب الأصناف الإلزامية: %'$a$;
  r text := $r$سحب الأصناف المطلوبة (الإلزامية والاختيارية المحددة): %'$r$;
  n int;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO d
  FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
  WHERE ns.nspname='public' AND p.proname='activate_booking_atomic' LIMIT 1;

  IF d LIKE '%الاختيارية المحددة%' THEN
    RAISE NOTICE 'activate message already updated — skipping';
  ELSE
    n := (length(d) - length(replace(d, a, ''))) / length(a);
    IF n <> 1 THEN RAISE EXCEPTION 'activate message anchor matched % times', n; END IF;
    EXECUTE replace(d, a, r);
    RAISE NOTICE 'activate message updated';
  END IF;
END $patch2$;
