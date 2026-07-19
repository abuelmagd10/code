-- v3.74.729 — teach the watcher to recognise the new guard.
--
-- ic_exposed_definer_functions decides a function is guarded by looking for
-- company_members / auth.uid() / user_has_company_access in its body. The guard
-- introduced in this release calls assert_company_access(), which contains none
-- of those strings itself — so the six functions just secured would still have
-- been counted as exposed.
--
-- That would have been the worst kind of failure: the number on the dashboard
-- refusing to move while the work was actually being done, making real progress
-- look like no progress. The recogniser and the guard have to be updated in the
-- same release.
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
      AND p.proname <> 'assert_company_access'
      AND pg_get_function_identity_arguments(p.oid) ILIKE '%company_id%'
      AND (p.prosrc ILIKE '%INSERT INTO%'
        OR p.prosrc ~* '\mUPDATE\s+\w'
        OR p.prosrc ~* '\mDELETE\s+FROM')
      AND p.prosrc NOT ILIKE '%company_members%'
      AND p.prosrc NOT ILIKE '%auth.uid()%'
      AND p.prosrc NOT ILIKE '%user_has_company_access%'
      AND p.prosrc NOT ILIKE '%assert_company_access%'
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
      'hint', 'A logged-in user of company A can pass company B''s id and write to B''s data, because SECURITY DEFINER bypasses RLS. Add PERFORM assert_company_access(p_company_id) as the first statement, or revoke authenticated if no app code calls it.');
    RETURN NEXT;
  END IF;
EXCEPTION WHEN undefined_table OR undefined_column THEN RETURN;
END $function$;

REVOKE ALL ON FUNCTION public.ic_exposed_definer_functions(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ic_exposed_definer_functions(uuid) TO authenticated, service_role;
