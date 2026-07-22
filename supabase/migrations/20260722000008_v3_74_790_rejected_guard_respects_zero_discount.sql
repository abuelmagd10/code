-- ============================================================================
-- v3.74.790c — حارس «الخصم المرفوض» يحترم التصفير (مبيعات + مشتريات)
--
-- The rejected-SO/PO guard blocked invoice/bill creation UNCONDITIONALLY
-- whenever the last approval was 'rejected' — even after the employee
-- followed the rejection hint and REMOVED the discount (aggregate = 0).
-- A zero-discount document does not carry the rejected discount; blocking
-- it made the dead end permanent (create_auto_invoice failed with
-- «لا يمكن حفظ فاتورة بنفس الخصم» although the discount was gone).
-- The guard now blocks only while the document still carries a discount
-- (v_total_disc > 0). Applied symmetrically to the purchases twin.
--
-- APPLIED to test + prod 2026-07-22 via MCP; this file is the repo record.
-- ============================================================================

DO $patch$
DECLARE
  d text; a text; r text; n int; fn text;
BEGIN
  fn := 'inv_evaluate_discount_approval';
  SELECT pg_get_functiondef(p.oid) INTO d
  FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
  WHERE ns.nspname='public' AND p.proname=fn LIMIT 1;

  a := $a$IF v_so_status='rejected' THEN$a$;
  r := $r$IF v_so_status='rejected' AND v_total_disc > 0 THEN -- v3.74.790: zero discount does not carry the rejected discount$r$;

  IF d LIKE '%v_so_status=''rejected'' AND v_total_disc > 0%' THEN
    RAISE NOTICE '% already patched', fn;
  ELSE
    n := (length(d) - length(replace(d, a, ''))) / length(a);
    IF n <> 1 THEN RAISE EXCEPTION '% anchor matched % times', fn, n; END IF;
    EXECUTE replace(d, a, r);
    RAISE NOTICE '% patched', fn;
  END IF;

  fn := 'bill_evaluate_discount_approval';
  SELECT pg_get_functiondef(p.oid) INTO d
  FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
  WHERE ns.nspname='public' AND p.proname=fn LIMIT 1;

  a := $a$IF v_po_status='rejected' THEN$a$;
  r := $r$IF v_po_status='rejected' AND v_total_disc > 0 THEN -- v3.74.790: zero discount does not carry the rejected discount$r$;

  IF d LIKE '%v_po_status=''rejected'' AND v_total_disc > 0%' THEN
    RAISE NOTICE '% already patched', fn;
  ELSE
    n := (length(d) - length(replace(d, a, ''))) / length(a);
    IF n <> 1 THEN RAISE EXCEPTION '% anchor matched % times', fn, n; END IF;
    EXECUTE replace(d, a, r);
    RAISE NOTICE '% patched', fn;
  END IF;
END $patch$;
