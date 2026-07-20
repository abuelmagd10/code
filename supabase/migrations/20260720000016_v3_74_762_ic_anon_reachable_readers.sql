-- Makes the REMAINING debt visible instead of letting it be forgotten.
--
-- v3.74.762 closed 46 company-scoped readers to anon: the financial statements,
-- the audit trail, payroll commissions, GL transactions. That set was chosen by
-- a name prefix (get_ / search_ / reconcile_ / validate_ / find_) as a safety
-- rail, because a blanket sweep over ~180 functions is exactly the kind of
-- change that fixes one thing and breaks another.
--
-- 104 remain in scope of this checker: the ic_* integrity checkers and the
-- can_* / check_* / is_* / erp_* families. They disclose less than a balance
-- sheet - mostly booleans and finding counts - but they are still
-- company-scoped data reachable without a session, and they should not be
-- quietly forgotten because a prefix filter happened not to match them.
--
-- Registering them as a dashboard finding is the honest option: the debt is
-- named and counted rather than described as complete.
CREATE OR REPLACE FUNCTION public.ic_anon_reachable_readers(p_company_id uuid)
RETURNS TABLE(severity text, detail jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH policy_text AS (
    SELECT string_agg(coalesce(pg_get_expr(pol.polqual, pol.polrelid),'') || ' ' ||
                      coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid),''), ' ') AS body
    FROM pg_policy pol
  )
  SELECT
    'medium'::text,
    jsonb_build_object(
      'function', p.oid::regprocedure::text,
      'reason', 'SECURITY DEFINER + EXECUTE to anon + company-scoped read + no caller check'
    )
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
    -- Referenced by an RLS policy: revoking anon would break row-level security.
    AND pt.body !~ ('\m' || p.proname || '\s*\(')
    -- Run before a session exists.
    AND p.proname NOT IN ('find_user_by_login','check_username_available',
                          'generate_username_from_email','get_user_company_status')
  ORDER BY 2;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.ic_anon_reachable_readers(uuid) FROM anon, PUBLIC;

INSERT INTO integrity_check_definitions (code, name_ar, name_en, category, fn_name, severity_default, description)
VALUES (
  'anon_reachable_readers',
  'دوال تقرأ بيانات شركة ويمكن نداؤها بدون تسجيل دخول',
  'Anonymously reachable company-scoped readers',
  'security',
  'ic_anon_reachable_readers',
  'medium',
  'Read-only SECURITY DEFINER functions that take a company id, bypass row-level security and are callable with the publishable key. v3.74.762 closed the 46 that return financial statements, audit trail and payroll. The remainder are tracked here so the prefix filter that spared them does not become permanent.'
)
ON CONFLICT (code) DO UPDATE
  SET fn_name = EXCLUDED.fn_name, category = EXCLUDED.category,
      severity_default = EXCLUDED.severity_default,
      description = EXCLUDED.description, active = true;

-- Proven by sabotage. Granting the balance sheet back to anon inside a
-- rolled-back transaction moved the checker from 104 to 105 and named it:
--
--   TESTRESULT >> tracked_before=104 after_sabotage=105
--                 caught=[get_balance_sheet(uuid,date)]
