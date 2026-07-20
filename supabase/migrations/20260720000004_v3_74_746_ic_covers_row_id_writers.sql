-- v3.74.746 — widen the watcher to the class it was blind to.
--
-- ic_exposed_definer_functions only ever examined functions taking company_id
-- as an argument. It reported CLEAN while 48 functions reached company data
-- through a ROW id instead — record_payment(p_invoice_id), post_payroll_run_
-- atomic(p_payroll_run_id), delete_fixed_asset_completely(p_asset_id) — all of
-- them callable by anon, 19 touching the ledger, 3 deleting from it.
--
-- The check was accurate inside its scope. The scope was the defect. A clean
-- report is worth exactly as much as the question behind it, so the question is
-- now the broader one: can this function write to a company's data without
-- establishing who is asking?
--
-- Reported as three separate findings, because they need different remedies:
--   anon reachable        → revoke the grant
--   company_id, unguarded → PERFORM assert_company_access(p_company_id)
--   row id, unguarded     → resolve the company from the row first, then check
CREATE OR REPLACE FUNCTION public.ic_exposed_definer_functions(p_company_id uuid)
RETURNS TABLE(severity text, detail jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_anon_names   TEXT[];
  v_by_company   INT;
  v_by_row_id    INT;
  v_row_examples TEXT[];
BEGIN
  WITH risky AS (
    SELECT p.oid,
           p.proname,
           (pg_get_function_identity_arguments(p.oid) ILIKE '%company_id%') AS takes_company_id
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND p.prosecdef
      AND p.prorettype <> 'trigger'::regtype
      AND p.proname NOT LIKE 'assert_company_access%'
      AND (pg_get_function_identity_arguments(p.oid) ILIKE '%company_id%'
        OR pg_get_function_identity_arguments(p.oid) ~ '_id uuid')
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
    count(*) FILTER (WHERE takes_company_id AND has_function_privilege('authenticated', oid, 'EXECUTE')),
    count(*) FILTER (WHERE NOT takes_company_id AND has_function_privilege('authenticated', oid, 'EXECUTE')),
    (array_agg(proname ORDER BY proname) FILTER (WHERE NOT takes_company_id
       AND has_function_privilege('authenticated', oid, 'EXECUTE')))[1:5]
  INTO v_anon_names, v_by_company, v_by_row_id, v_row_examples
  FROM risky;

  IF COALESCE(array_length(v_anon_names, 1), 0) > 0 THEN
    severity := 'high';
    detail := jsonb_build_object(
      'subject', 'دوال تكتب فى البيانات ويمكن نداؤها بلا تسجيل دخول: '
                 || array_length(v_anon_names, 1) || ' دالة',
      'functions', to_jsonb(v_anon_names[1:10]),
      'hint', 'These run as postgres, so RLS does not apply, and the anon key ships in the browser bundle. Revoke from PUBLIC and anon; grant authenticated and service_role only.');
    RETURN NEXT;
  END IF;

  IF COALESCE(v_by_company, 0) > 0 THEN
    severity := 'high';
    detail := jsonb_build_object(
      'subject', 'دوال تأخذ معرّف الشركة من المُنادى بلا فحص عضوية: ' || v_by_company || ' دالة',
      'count', v_by_company,
      'hint', 'Add PERFORM assert_company_access(p_company_id) as the first statement.');
    RETURN NEXT;
  END IF;

  IF COALESCE(v_by_row_id, 0) > 0 THEN
    severity := 'high';
    detail := jsonb_build_object(
      'subject', 'دوال تصل إلى بيانات الشركة عبر معرّف سجل بلا تحقق من الهوية: '
                 || v_by_row_id || ' دالة — (المرحلة الثانية)',
      'count', v_by_row_id,
      'examples', to_jsonb(v_row_examples),
      'hint', 'These take a row id (invoice, payroll run, asset) rather than company_id, so assert_company_access cannot be called directly. Each must resolve the owning company from its row, then check membership.');
    RETURN NEXT;
  END IF;
EXCEPTION WHEN undefined_table OR undefined_column THEN RETURN;
END $function$;

REVOKE ALL ON FUNCTION public.ic_exposed_definer_functions(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ic_exposed_definer_functions(uuid) TO authenticated, service_role;
