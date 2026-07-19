-- v3.74.727 — make this class of exposure visible on the dashboard, so it can
-- never quietly grow back. The reason fix_historical_cogs survived so long is
-- that nothing was watching for it.
--
-- A new category: 'security'. Filing this under 'accounting' or 'operational'
-- would bury a cross-tenant write risk among rounding differences. The runner
-- (run_all_integrity_checks) reads the category straight from this table, so it
-- needs no change — but the dashboard widget and the governance API have a
-- hardcoded category list and ARE updated in the same release.
ALTER TABLE integrity_check_definitions
  DROP CONSTRAINT IF EXISTS integrity_check_definitions_category_check;

ALTER TABLE integrity_check_definitions
  ADD CONSTRAINT integrity_check_definitions_category_check
  CHECK (category = ANY (ARRAY['accounting'::text, 'inventory'::text,
                               'operational'::text, 'security'::text]));

-- Two findings, deliberately separate:
--   * anon reachability → Phase 1 drove this to zero; any recurrence means a new
--     function shipped with the default PUBLIC grant.
--   * cross-tenant reachability by a logged-in user → expected to be non-zero
--     until Phase 2 finishes, so it doubles as a progress counter.
--
-- Privileges are global, not per-company; p_company_id exists only to satisfy
-- the runner's calling convention.
CREATE OR REPLACE FUNCTION public.ic_exposed_definer_functions(p_company_id uuid)
RETURNS TABLE(severity text, detail jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_anon_names      TEXT[];
  v_unguarded_count INT;
  v_examples        TEXT[];
BEGIN
  WITH risky AS (
    SELECT p.oid, p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND p.prosecdef
      AND p.prorettype <> 'trigger'::regtype
      AND pg_get_function_identity_arguments(p.oid) ILIKE '%company_id%'
      AND (p.prosrc ILIKE '%INSERT INTO%'
        OR p.prosrc ~* '\mUPDATE\s+\w'
        OR p.prosrc ~* '\mDELETE\s+FROM')
      AND p.prosrc NOT ILIKE '%company_members%'
      AND p.prosrc NOT ILIKE '%auth.uid()%'
      AND p.prosrc NOT ILIKE '%user_has_company_access%'
  )
  SELECT
    array_agg(proname ORDER BY proname) FILTER (WHERE has_function_privilege('anon', oid, 'EXECUTE')),
    count(*) FILTER (WHERE has_function_privilege('authenticated', oid, 'EXECUTE')),
    (array_agg(proname ORDER BY proname) FILTER (WHERE has_function_privilege('authenticated', oid, 'EXECUTE')))[1:5]
  INTO v_anon_names, v_unguarded_count, v_examples
  FROM risky;

  IF COALESCE(array_length(v_anon_names, 1), 0) > 0 THEN
    severity := 'high';
    detail := jsonb_build_object(
      'subject', 'دوال تكتب فى البيانات ويمكن نداؤها بلا تسجيل دخول: '
                 || array_length(v_anon_names, 1) || ' دالة',
      'functions', to_jsonb(v_anon_names[1:10]),
      'hint', 'These run as postgres, so RLS does not apply. They take company_id from the caller and are granted to anon — whose key ships in the browser bundle. Revoke from PUBLIC and anon, then grant to authenticated and service_role only.');
    RETURN NEXT;
  END IF;

  IF COALESCE(v_unguarded_count, 0) > 0 THEN
    severity := 'high';
    detail := jsonb_build_object(
      'subject', 'دوال تكتب بمعرّف شركة من المُنادى بلا فحص عضوية: '
                 || v_unguarded_count || ' دالة — قيد المعالجة (المرحلة الثانية)',
      'count', v_unguarded_count,
      'examples', to_jsonb(v_examples),
      'hint', 'A logged-in user of company A can pass company B''s id and write to B''s data, because SECURITY DEFINER bypasses RLS. Each function needs a membership check on p_company_id. Being fixed in reviewed batches.');
    RETURN NEXT;
  END IF;
EXCEPTION WHEN undefined_table OR undefined_column THEN RETURN;
END $function$;

REVOKE ALL ON FUNCTION public.ic_exposed_definer_functions(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ic_exposed_definer_functions(uuid) TO authenticated, service_role;

INSERT INTO integrity_check_definitions
  (code, name_ar, name_en, category, fn_name, active, severity_default, description)
VALUES
  ('exposed_definer_functions',
   'دوال نظام مكشوفة للنداء المباشر',
   'Exposed SECURITY DEFINER functions',
   'security',
   'ic_exposed_definer_functions',
   true,
   'high',
   'Functions that run with full database rights, accept company_id from the caller, write data, and carry no membership check. Watches both anonymous reachability and cross-tenant reachability.')
ON CONFLICT (code) DO UPDATE
  SET fn_name          = EXCLUDED.fn_name,
      category         = EXCLUDED.category,
      severity_default = EXCLUDED.severity_default,
      description      = EXCLUDED.description,
      active           = true;
