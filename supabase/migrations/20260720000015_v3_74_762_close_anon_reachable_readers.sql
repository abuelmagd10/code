-- v3.74.762 — the reading half of the surface.
--
-- Every sweep run this week searched for functions that WRITE. None looked at
-- functions that only READ, so ~180 SECURITY DEFINER readers with EXECUTE
-- granted to anon were never examined. Among them:
--
--   get_balance_sheet(company_id, date)
--   get_income_statement(company_id, date, date)
--   get_trial_balance(company_id, date)          -- and two more overloads
--   get_audit_trail_report(...)  search_audit_trail(...)
--   get_employee_commission_summary_for_payroll(...)
--   get_gl_transactions_paginated(...)
--
-- SECURITY DEFINER means row-level security does not apply. EXECUTE to anon
-- means the publishable key that ships in every browser bundle can call them.
-- Together: anyone holding a company's UUID could read that company's complete
-- financial statements, payroll commissions and audit trail without logging in.
-- Company UUIDs are not secret - they appear in URLs, exports and support
-- threads, and any former employee knows theirs.
--
-- HOW THIS WAS GOT WRONG FIRST
-- ----------------------------
-- The first version of this migration wrote:
--
--     REVOKE EXECUTE ON FUNCTION <sig> FROM anon;
--
-- It ran 46 statements without error and reported success. Checking afterwards
-- showed eight of the headline readers were STILL reachable by anon, because
-- REVOKE FROM anon does not remove a privilege held via PUBLIC, and Postgres
-- grants EXECUTE to PUBLIC on functions by default. v3.74.759 had this right
-- ("FROM anon, PUBLIC") and this migration simply dropped the second half.
--
-- A migration that executes cleanly and changes nothing is the same failure
-- this whole body of work keeps circling. Only verifying the result caught it.
--
-- Revoking PUBLIC also removes authenticated and service_role where they held
-- access only through PUBLIC, so both are re-granted explicitly below.
--
-- TWO DELIBERATE EXCLUSIONS
-- -------------------------
--  * Functions referenced inside RLS policy expressions. A policy is evaluated
--    as the querying role, so revoking anon there would BREAK row-level
--    security rather than tighten it. Determined from pg_policy, not by name.
--  * find_user_by_login, check_username_available, generate_username_from_email
--    and get_user_company_status run before a session exists. Revoking them
--    would break signup and login. Same lesson as leaving
--    check_and_increment_rate_limit alone in v3.74.759.
DO $$
DECLARE
  r record;
  n int := 0;
BEGIN
  FOR r IN
    WITH policy_text AS (
      SELECT string_agg(coalesce(pg_get_expr(pol.polqual, pol.polrelid),'') || ' ' ||
                        coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid),''), ' ') AS body
      FROM pg_policy pol
    )
    SELECT p.oid::regprocedure::text AS sig
    FROM pg_proc p
    JOIN pg_namespace n2 ON n2.oid = p.pronamespace
    CROSS JOIN policy_text pt
    WHERE n2.nspname = 'public' AND p.prosecdef
      AND has_function_privilege('anon', p.oid, 'EXECUTE')
      AND p.prorettype <> 'trigger'::regtype
      AND p.prosrc !~* '\m(INSERT INTO|UPDATE |DELETE FROM)\M'
      AND p.prosrc NOT ILIKE '%assert_company_access%'
      AND p.prosrc NOT ILIKE '%auth.uid()%'
      AND pg_get_function_identity_arguments(p.oid) <> ''
      AND pt.body !~ ('\m' || p.proname || '\s*\(')
      AND p.prosrc ~* 'company_id'
      AND p.proname ~ '^(get_|search_|reconcile_|validate_|find_)'
      AND p.proname NOT IN ('find_user_by_login','check_username_available',
                            'generate_username_from_email','get_user_company_status')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon, PUBLIC', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', r.sig);
    n := n + 1;
  END LOOP;
  RAISE NOTICE 'closed % company-scoped readers to anon', n;
END;
$$;

-- Verified after applying:
--   get_balance_sheet / get_income_statement / get_trial_balance (x3) /
--   get_audit_trail_report / search_audit_trail / get_financial_summary /
--   get_employee_commission_summary_for_payroll / get_gl_transactions_paginated
--     anon = false, authenticated = true, service_role = true
--   find_user_by_login, check_username_available,
--   check_and_increment_rate_limit, can_access_invoice_items,
--   can_access_journal_lines
--     anon = true, as required
