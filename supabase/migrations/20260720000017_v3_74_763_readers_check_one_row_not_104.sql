-- v3.74.763 — fixing damage done by v3.74.762, hours after shipping it.
--
-- ic_anon_reachable_readers returned ONE ROW PER FUNCTION: 104 rows. It reports
-- an infrastructure fact, identical for every company, so the nightly run
-- produced 104 rows for each of four companies — 416 rows a night, all the
-- same, none of them about anyone's data.
--
-- Worse, it was the only thing the dashboard showed:
--
--   SELECT check_code, count(*) FROM run_all_integrity_checks(<company>)
--   GROUP BY 1;
--   -> anon_reachable_readers | 104        (and nothing else)
--
-- Every accounting and inventory checker returned zero, correctly, and their
-- silence was invisible underneath. A real problem appearing tomorrow would
-- have been one row in 105.
--
-- This is the noise failure that the trigger-function exclusion avoided in
-- v3.74.759, walked into from the other direction two releases later. A checker
-- that shouts the same thing every night is not a checker; it is wallpaper, and
-- people stop reading wallpaper.
--
-- What caught it: four different companies returning the identical count 104.
-- Accounting data does not do that.
--
-- One summary row now, carrying the count and five examples. The full list is
-- available on demand from the query in the v3.74.762 migration.
CREATE OR REPLACE FUNCTION public.ic_anon_reachable_readers(p_company_id uuid)
RETURNS TABLE(severity text, detail jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count  int;
  v_sample text;
BEGIN
  WITH policy_text AS (
    SELECT string_agg(coalesce(pg_get_expr(pol.polqual, pol.polrelid),'') || ' ' ||
                      coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid),''), ' ') AS body
    FROM pg_policy pol
  ),
  open_readers AS (
    SELECT p.oid::regprocedure::text AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    CROSS JOIN policy_text pt
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND has_function_privilege('anon', p.oid, 'EXECUTE')
      AND p.prorettype <> 'trigger'::regtype
      AND p.prosrc !~* '\m(INSERT INTO|UPDATE |DELETE FROM)\M'
      AND p.prosrc NOT ILIKE '%assert_company_access%'
      AND p.prosrc NOT ILIKE '%auth.uid()%'
      AND p.prosrc ~* 'company_id'
      AND pg_get_function_identity_arguments(p.oid) <> ''
      AND pt.body !~ ('\m' || p.proname || '\s*\(')
      AND p.proname NOT IN ('find_user_by_login','check_username_available',
                            'generate_username_from_email','get_user_company_status')
  )
  SELECT (SELECT count(*) FROM open_readers),
         (SELECT string_agg(sig, ', ' ORDER BY sig) FROM (SELECT sig FROM open_readers ORDER BY sig LIMIT 5) s)
    INTO v_count, v_sample;

  IF v_count = 0 THEN
    RETURN;
  END IF;

  RETURN QUERY SELECT 'medium'::text,
    jsonb_build_object(
      'open_reader_count', v_count,
      'examples', v_sample,
      'note', 'Infrastructure-wide, identical for every company. One row by design.',
      'reason', 'SECURITY DEFINER + EXECUTE to anon + company-scoped read + no caller check'
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.ic_anon_reachable_readers(uuid) FROM anon, PUBLIC;

-- Verified after applying: run_all_integrity_checks returns 1 row per company,
-- down from 104, for all four companies.
