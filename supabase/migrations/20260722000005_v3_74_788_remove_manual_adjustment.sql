-- ============================================================================
-- v3.74.788 — إلغاء خانة التعديل اليدوى (قرار المالك 2026-07-22)
--
-- The owner asked what the "Adjustment" input on documents was for.
-- Review answer: its legitimate purpose is fils/piastre rounding, but in
-- THIS system it was an open governance hole — so_evaluate_discount_approval
-- ignores the column entirely, so a NEGATIVE adjustment was an unapproved
-- hidden discount bypassing the owner's single-approval rule (and since
-- v3.74.784 the journal builder books that gap to حساب خصم المبيعات —
-- a disguised discount by name and by entry). A positive adjustment was
-- unsourced revenue.
--
-- Owner decision, verbatim: «ازالة الخانة نهائيا وكذلك اذا وجدت فى دورة
-- المشتريات ايضا وكذلك دورة الخدمات».
--
-- Removal: UI inputs stripped from all 7 forms (SO new/edit, invoice
-- new/edit, bill edit, PO new/edit, vendor-credit new); THIS guard blocks
-- any non-zero value at the database regardless of client. Historical
-- non-zero values stay readable (edit pages show them read-only) and
-- zeroing is always allowed.
--
-- APPLIED to test (bhvylzzscrnzusnnkaal) and prod (hfvsbsizokxontflgdyn)
-- on 2026-07-22 via MCP apply_migration; this file is the repo record.
-- Rehearsed on test: non-zero INSERT blocked, zero INSERT passes,
-- change-to-non-zero UPDATE blocked.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.block_manual_adjustment_trg()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_catalog'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF COALESCE(NEW.adjustment, 0) <> 0 THEN
      RAISE EXCEPTION
        'ADJUSTMENT_REMOVED: خانة التعديل أُلغيت بقرار المالك — عالج الفروق بتعديل البنود أو بالخصم المعتمد.';
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Zeroing is always allowed; setting/changing to a non-zero value is not.
    IF COALESCE(NEW.adjustment, 0) <> 0
       AND COALESCE(NEW.adjustment, 0) IS DISTINCT FROM COALESCE(OLD.adjustment, 0) THEN
      RAISE EXCEPTION
        'ADJUSTMENT_REMOVED: خانة التعديل أُلغيت بقرار المالك — عالج الفروق بتعديل البنود أو بالخصم المعتمد.';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

DO $mk$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['sales_orders','invoices','bills','purchase_orders','vendor_credits'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_block_manual_adjustment ON public.%I', t);
    EXECUTE format(
      'CREATE TRIGGER trg_block_manual_adjustment BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.block_manual_adjustment_trg()', t);
  END LOOP;
END $mk$;
