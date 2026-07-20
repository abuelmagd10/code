-- v3.74.763 — the ic_* integrity checkers, closed to anon.
--
-- 52 of them were callable with the publishable key that ships in every browser
-- bundle. Each takes a company id, bypasses row-level security, and reports
-- that company's accounting and inventory problems: negative stock, unbalanced
-- journals, payment double allocations, customer credit integrity. Less severe
-- than handing over a balance sheet, but still a description of another
-- company's books given to an anonymous caller.
--
-- They are invoked by run_all_integrity_checks, which the nightly cron route
-- calls with service_role, and by the dashboard with a signed-in session. anon
-- was never the caller.
--
-- REVOKE names PUBLIC as well as anon. v3.74.762 learned this the hard way:
-- revoking the role alone runs cleanly and changes nothing, because Postgres
-- grants function EXECUTE to PUBLIC by default and anon inherits it. Revoking
-- PUBLIC also strips authenticated and service_role, so both are re-granted.
--
-- Two ic_* functions are deliberately NOT touched:
-- ic_user_can_access_consolidation_group and ic_user_can_access_legal_entity
-- are referenced inside RLS policy expressions. A policy is evaluated as the
-- querying role, so revoking anon would break row-level security rather than
-- tighten it. They are excluded by querying pg_policy, not by recognising the
-- names — the filter found them without being told.
DO $$
DECLARE
  r record;
  n int := 0;
BEGIN
  FOR r IN
    WITH policy_text AS (
      SELECT string_agg(coalesce(pg_get_expr(pol.polqual,pol.polrelid),'') || ' ' ||
                        coalesce(pg_get_expr(pol.polwithcheck,pol.polrelid),''),' ') AS body
      FROM pg_policy pol
    )
    SELECT p.oid::regprocedure::text AS sig
    FROM pg_proc p
    JOIN pg_namespace n2 ON n2.oid = p.pronamespace
    CROSS JOIN policy_text pt
    WHERE n2.nspname='public' AND p.prosecdef
      AND has_function_privilege('anon', p.oid,'EXECUTE')
      AND p.prorettype <> 'trigger'::regtype
      AND p.prosrc !~* '\m(INSERT INTO|UPDATE |DELETE FROM)\M'
      AND p.prosrc ~* 'company_id'
      AND p.proname LIKE 'ic\_%'
      AND pt.body !~ ('\m' || p.proname || '\s*\(')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon, PUBLIC', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', r.sig);
    n := n + 1;
  END LOOP;
  RAISE NOTICE 'closed % ic_* checkers to anon', n;
END;
$$;

-- Verified after applying, end to end rather than by inspection:
--   run_all_integrity_checks(<company>)              -> still runs, returns its finding
--   ic_* lacking EXECUTE for authenticated           -> 0
--   ic_* lacking EXECUTE for service_role            -> 0
--   ic_user_can_access_legal_entity, anon            -> true (RLS helper, kept)
--   find_user_by_login, anon                         -> true (login, kept)
--   company-scoped readers still open to anon        -> 104 down to 52
