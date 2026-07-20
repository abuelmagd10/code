-- v3.74.759 — a watcher for the shape that hid three ledger-rewriting functions.
--
-- The earlier watchers (v3.74.727, .746, .748, .751) all keyed on a uuid
-- argument, so a zero-argument function was structurally invisible to every one
-- of them. Each reported CLEAN, and each was telling the truth inside its own
-- scope. This one keys on what actually matters: can an unauthenticated caller
-- reach it over HTTP, does it write, and does it check who is asking.
--
-- Trigger functions are excluded because PostgREST cannot invoke them and
-- Postgres refuses them outside a trigger context — including them produced
-- ~60 rows of noise that would have buried the four real findings.
--
-- Severity is 'high', not 'critical': the CHECK constraint allows high/medium/
-- low only. Same class of mistake as v3.74.743 and .754, except a migration
-- rejects it loudly where supabase-js would have returned { error } and carried
-- on as though the row had been written.
CREATE OR REPLACE FUNCTION public.ic_anon_reachable_writers(p_company_id uuid)
RETURNS TABLE(severity text, detail jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    'high'::text,
    jsonb_build_object(
      'function',  p.proname,
      'arguments', pg_get_function_identity_arguments(p.oid),
      'writes_to_ledger', (p.prosrc ILIKE '%journal_entr%'),
      'reason', 'SECURITY DEFINER + EXECUTE granted to anon + writes + no caller check'
    )
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.prosecdef
    AND has_function_privilege('anon', p.oid, 'EXECUTE')
    AND p.prorettype <> 'trigger'::regtype
    AND p.prosrc ~* '\m(INSERT INTO|UPDATE|DELETE FROM)\M'
    AND p.prosrc NOT ILIKE '%assert_company_access%'
    AND p.prosrc NOT ILIKE '%assert_is_self%'
    AND p.prosrc NOT ILIKE '%company_members%'
    AND p.prosrc NOT ILIKE '%auth.uid()%'
    -- Rate limiting must run before authentication, and it fails OPEN on error,
    -- so revoking anon here would disable throttling on the login route without
    -- reporting anything. Deliberate, and named so it is not re-flagged.
    AND p.proname <> 'check_and_increment_rate_limit'
  ORDER BY (p.prosrc ILIKE '%journal_entr%') DESC, p.proname;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.ic_anon_reachable_writers(uuid) FROM anon, PUBLIC;

INSERT INTO integrity_check_definitions (code, name_ar, name_en, category, fn_name, severity_default, description)
VALUES (
  'anon_reachable_writers',
  'دوال تُعدِّل البيانات ويمكن نداؤها بدون تسجيل دخول',
  'Anonymously reachable writing functions',
  'security',
  'ic_anon_reachable_writers',
  'high',
  'Functions that bypass row-level security, accept calls from unauthenticated users, write to tables, and never check who is calling. Three COGS rewriters of this shape survived four earlier sweeps because those sweeps only examined functions that take a company id.'
)
ON CONFLICT (code) DO UPDATE
  SET fn_name = EXCLUDED.fn_name,
      category = EXCLUDED.category,
      severity_default = EXCLUDED.severity_default,
      description = EXCLUDED.description,
      active = true;

-- Proven by sabotage, not by assertion. Granting anon back on
-- cleanup_old_security_events inside a rolled-back transaction moved the
-- checker from 0 findings to 1, naming the right function:
--
--   TESTRESULT >> clean_before=0 after_sabotage=1 flagged=[cleanup_old_security_events]
