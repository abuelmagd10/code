-- v3.74.731 — the last four, each missed for a specific reason.
--
-- The batch patchers anchored on E'\nBEGIN'. These three store their entire
-- body on a SINGLE LINE — no line break before BEGIN at all — so the anchor
-- never matched and they were quietly skipped. No error was raised; they simply
-- stayed unguarded while everything around them was fixed.
--
-- That is precisely why the release added a counter instead of trusting the
-- migration to have worked: the count stopping at 4 is what surfaced them.
--
-- Anchor here is the first literal BEGIN after the $function$ delimiter, which
-- works regardless of how the body is formatted. Verified afterwards by calling
-- the functions as an outsider rather than by re-reading the text.
--
-- increment_usage_metric was skipped for a different reason: LANGUAGE sql has
-- no statement list to prepend a guard to. Rewritten as plpgsql with the
-- identical INSERT ... ON CONFLICT body.
DO $last$
DECLARE
  r       RECORD;
  v_def   TEXT;
  v_new   TEXT;
  v_start INT;
  v_rel   INT;
  v_abs   INT;
  v_done  INT := 0;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname
    FROM pg_proc p
    JOIN pg_language l ON l.oid = p.prolang
    WHERE p.pronamespace = 'public'::regnamespace
      AND l.lanname = 'plpgsql'
      AND p.prosrc NOT ILIKE '%assert_company_access%'
      AND p.proname IN (
        'fix_wrong_return_account_entries',
        'remove_cancelled_invoice_sale_transactions',
        'sync_all_stock_quantities'
      )
  LOOP
    v_def := pg_get_functiondef(r.oid);

    v_start := position('$function$' in v_def);
    IF v_start = 0 THEN
      RAISE EXCEPTION 'no $function$ delimiter in %', r.proname;
    END IF;

    -- first BEGIN inside the body (length('$function$') = 10)
    v_rel := position('BEGIN' in substr(v_def, v_start + 10));
    IF v_rel = 0 THEN
      RAISE EXCEPTION 'no BEGIN found in %', r.proname;
    END IF;

    v_abs := v_start + 10 + v_rel - 1;

    v_new := substr(v_def, 1, v_abs + 4)
          || E'\n  -- v3.74.731 — reject a caller acting on another company''s data.'
          || E'\n  PERFORM public.assert_company_access(p_company_id);\n'
          || substr(v_def, v_abs + 5);

    EXECUTE v_new;
    v_done := v_done + 1;
  END LOOP;

  RAISE NOTICE 'v3.74.731: guarded % single-line-bodied functions', v_done;
END;
$last$;

-- LANGUAGE sql -> plpgsql, body unchanged.
CREATE OR REPLACE FUNCTION public.increment_usage_metric(
  p_company_id uuid, p_metric text, p_period text, p_amount numeric DEFAULT 1
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
BEGIN
  -- v3.74.731 — reject a caller acting on another company's data.
  PERFORM public.assert_company_access(p_company_id);

  INSERT INTO usage_metrics (company_id, metric, period, value, updated_at)
  VALUES (p_company_id, p_metric, p_period, p_amount, now())
  ON CONFLICT (company_id, metric, period)
  DO UPDATE SET
    value = usage_metrics.value + EXCLUDED.value,
    updated_at = now();
END;
$function$;
