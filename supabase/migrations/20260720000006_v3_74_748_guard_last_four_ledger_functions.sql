-- v3.74.748 — the last four ledger-touching row-id functions, plus a refusal
-- the fixed-asset deleters were missing.
--
-- WHY THESE FOUR WERE HELD BACK IN v3.74.747: my extraction matched
-- "FROM <table> WHERE id = <param>" and these write "FROM purchase_returns pr
-- WHERE pr.id = ...". They use table ALIASES. Nothing exotic about how they
-- load their data — my pattern simply did not allow for an alias, and I
-- reported them as "loading differently" rather than as "my regex was narrow".
-- Reading them properly gives all four tables directly:
--
--   confirm_purchase_return_delivery        → purchase_returns          (pr)
--   delete_fixed_asset_completely           → fixed_assets              (fa)
--   execute_customer_refund                 → customer_refund_requests  (rr)
--   force_delete_all_depreciation_schedules → fixed_assets              (fa)
--
-- All three tables confirmed to carry company_id before writing anything.
--
-- SEPARATELY — a real defect in the two deleters. Both gather the journal
-- entries behind an asset's depreciation and DELETE them, lines first, then the
-- entries. force_delete_all_depreciation_schedules even counts the POSTED ones
-- into v_posted_count and then proceeds anyway; the count is collected and
-- never acted on.
--
-- Deleting a posted depreciation entry erases the fact that depreciation was
-- ever charged. The accounts then disagree with the asset register and nothing
-- explains why. Corrections to posted entries are made by reversing them.
--
-- The fix keeps the legitimate case — removing an asset created by mistake that
-- was never posted — and refuses the destructive one. The module currently
-- holds zero assets, so nothing existing is affected; this is about what
-- happens the first time it is used.
CREATE OR REPLACE FUNCTION public.assert_no_posted_depreciation(p_asset_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_posted INT;
BEGIN
  SELECT count(*) INTO v_posted
  FROM depreciation_schedules ds
  JOIN journal_entries je ON je.id = ds.journal_entry_id
  WHERE ds.asset_id = p_asset_id
    AND je.status = 'posted';

  IF v_posted > 0 THEN
    RAISE EXCEPTION
      'لا يمكن حذف إهلاك مُرحَّل (% قيد). القيود المُرحَّلة تُعكَس بقيد مضاد ولا تُحذف، وإلا اختفى أثر الإهلاك من الدفاتر.',
      v_posted
      USING ERRCODE = '57014';
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.assert_no_posted_depreciation(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assert_no_posted_depreciation(uuid) TO authenticated, service_role;

DO $patch$
DECLARE
  r        RECORD;
  v_def    TEXT;
  v_new    TEXT;
  v_start  INT;
  v_rel    INT;
  v_abs    INT;
  v_extra  TEXT;
  v_done   INT := 0;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('confirm_purchase_return_delivery',        'purchase_returns',         'p_purchase_return_id', false),
      ('execute_customer_refund',                 'customer_refund_requests', 'p_refund_request_id',  false),
      ('delete_fixed_asset_completely',           'fixed_assets',             'p_asset_id',           true),
      ('force_delete_all_depreciation_schedules', 'fixed_assets',             'p_asset_id',           true)
    ) AS v(fn, tbl, idparam, protect_posted)
  LOOP
    SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p
    WHERE p.pronamespace='public'::regnamespace AND p.proname = r.fn
    LIMIT 1;

    IF v_def IS NULL THEN RAISE EXCEPTION 'function % not found', r.fn; END IF;
    IF v_def ILIKE '%assert_company_access%' THEN CONTINUE; END IF;

    v_start := position('$function$' in v_def);
    IF v_start = 0 THEN RAISE EXCEPTION 'no $function$ delimiter in %', r.fn; END IF;
    v_rel := position('BEGIN' in substr(v_def, v_start + 10));
    IF v_rel = 0 THEN RAISE EXCEPTION 'no BEGIN found in %', r.fn; END IF;
    v_abs := v_start + 10 + v_rel - 1;

    v_extra := '';
    IF r.protect_posted THEN
      v_extra := format(E'\n  -- v3.74.748 — posted depreciation is reversed, never deleted.'
                     || E'\n  PERFORM public.assert_no_posted_depreciation(%s);', r.idparam);
    END IF;

    v_new := substr(v_def, 1, v_abs + 4)
          || E'\n  -- v3.74.748 — reject a caller acting on another company''s data.'
          || format(E'\n  PERFORM public.assert_company_access_by_row(%L, %s);',
                    r.tbl, r.idparam)
          || v_extra
          || E'\n'
          || substr(v_def, v_abs + 5);

    EXECUTE v_new;
    v_done := v_done + 1;
  END LOOP;

  RAISE NOTICE 'v3.74.748: guarded % functions', v_done;
END;
$patch$;
