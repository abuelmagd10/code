-- v3.74.751 (part 2) — one function escaped every sweep because of how its
-- parameter is spelled.
--
--     recompute_account_balances_for_date(target_company uuid, target_date date)
--
-- It rewrites account balances, was reachable by anon, and no pass caught it:
--
--   v3.74.727 looked for arguments matching '%company_id%'  → "target_company"
--   v3.74.746 looked for arguments matching '_id uuid'      → "target_company"
--   the watcher inherited both conditions                   → reported CLEAN
--
-- The parameter means exactly what those patterns were hunting for. It is
-- simply not spelled the way I assumed, and three separate checks agreed with
-- each other because they shared the same assumption. Twelfth time in this work
-- that matching a NAME rather than a SHAPE hid something real.
--
-- Found by deliberately widening the audit after the watcher said CLEAN — on
-- the principle that a clean report is only worth as much as the question
-- behind it. The wider net returned 30 candidates; 29 were already restricted
-- to service_role by v3.74.728 and genuinely unreachable. This was the one.
DO $fix$
DECLARE
  r      RECORD;
  v_def  TEXT;
  v_new  TEXT;
  v_start INT; v_rel INT; v_abs INT;
BEGIN
  FOR r IN
    SELECT p.oid, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    WHERE p.pronamespace='public'::regnamespace
      AND p.proname = 'recompute_account_balances_for_date'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.recompute_account_balances_for_date(%s) FROM PUBLIC, anon', r.args);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.recompute_account_balances_for_date(%s) TO authenticated, service_role', r.args);

    v_def := pg_get_functiondef(r.oid);
    IF v_def ILIKE '%assert_company_access%' THEN CONTINUE; END IF;

    v_start := position('$function$' in v_def);
    IF v_start = 0 THEN RAISE EXCEPTION 'no $function$ delimiter'; END IF;
    v_rel := position('BEGIN' in substr(v_def, v_start + 10));
    IF v_rel = 0 THEN RAISE EXCEPTION 'no BEGIN found'; END IF;
    v_abs := v_start + 10 + v_rel - 1;

    v_new := substr(v_def, 1, v_abs + 4)
          || E'\n  -- v3.74.751 — reject a caller acting on another company''s data.'
          || E'\n  PERFORM public.assert_company_access(target_company);\n'
          || substr(v_def, v_abs + 5);

    EXECUTE v_new;
  END LOOP;
END;
$fix$;

-- Widen the watcher so spelling stops mattering: ANY uuid argument now brings a
-- writer into scope, not only ones named company_id or ending in _id.
CREATE OR REPLACE FUNCTION public.ic_exposed_definer_functions(p_company_id uuid)
RETURNS TABLE(severity text, detail jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_anon_names TEXT[];
  v_unguarded  INT;
  v_examples   TEXT[];
BEGIN
  WITH risky AS (
    SELECT p.oid, p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND p.prosecdef
      AND p.prorettype <> 'trigger'::regtype
      AND p.proname NOT LIKE 'assert\_%'
      -- v3.74.751 — any uuid argument at all. The previous conditions
      -- ('%company_id%' or '_id uuid') both missed target_company.
      AND pg_get_function_identity_arguments(p.oid) ILIKE '%uuid%'
      AND (p.prosrc ILIKE '%INSERT INTO%'
        OR p.prosrc ~* '\mUPDATE\s+\w'
        OR p.prosrc ~* '\mDELETE\s+FROM')
      AND p.prosrc NOT ILIKE '%company_members%'
      AND p.prosrc NOT ILIKE '%auth.uid()%'
      AND p.prosrc NOT ILIKE '%user_has_company_access%'
      AND p.prosrc NOT ILIKE '%assert_company_access%'
      AND p.prosrc NOT ILIKE '%assert_is_self%'
  )
  SELECT
    array_agg(proname ORDER BY proname) FILTER (WHERE has_function_privilege('anon', oid, 'EXECUTE')),
    count(*) FILTER (WHERE has_function_privilege('authenticated', oid, 'EXECUTE')),
    (array_agg(proname ORDER BY proname) FILTER (WHERE has_function_privilege('authenticated', oid, 'EXECUTE')))[1:6]
  INTO v_anon_names, v_unguarded, v_examples
  FROM risky;

  IF COALESCE(array_length(v_anon_names, 1), 0) > 0 THEN
    severity := 'high';
    detail := jsonb_build_object(
      'subject', 'دوال تكتب فى البيانات ويمكن نداؤها بلا تسجيل دخول: '
                 || array_length(v_anon_names, 1) || ' دالة',
      'functions', to_jsonb(v_anon_names[1:10]),
      'hint', 'Revoke from PUBLIC and anon; grant authenticated and service_role only.');
    RETURN NEXT;
  END IF;

  IF COALESCE(v_unguarded, 0) > 0 THEN
    severity := 'high';
    detail := jsonb_build_object(
      'subject', 'دوال تكتب بصلاحيات كاملة بلا تحقق من هوية المُنادى: ' || v_unguarded || ' دالة',
      'count', v_unguarded,
      'examples', to_jsonb(v_examples),
      'hint', 'Use assert_company_access, assert_company_access_by_row, or assert_is_self — whichever question fits. Or restrict the function to service_role if the application never calls it.');
    RETURN NEXT;
  END IF;
EXCEPTION WHEN undefined_table OR undefined_column THEN RETURN;
END $function$;

REVOKE ALL ON FUNCTION public.ic_exposed_definer_functions(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ic_exposed_definer_functions(uuid) TO authenticated, service_role;
