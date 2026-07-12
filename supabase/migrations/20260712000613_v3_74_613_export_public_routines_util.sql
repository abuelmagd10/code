-- v3.74.613 — read-only introspection utility used by
-- scripts/dump-db-functions.js to mirror all live public functions/
-- procedures into supabase/schema/functions.sql (keeps repo = SSOT).
-- Restricted to service_role so it is never exposed to anon/authenticated.
-- Applied to production via mcp apply_migration on 2026-07-12; this file mirrors it.
CREATE OR REPLACE FUNCTION public.export_public_routines()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(string_agg(
    format(
      E'-- ---------------------------------------------------------------\n-- %s(%s)\n-- ---------------------------------------------------------------\n%s;\n',
      p.proname,
      pg_get_function_identity_arguments(p.oid),
      pg_get_functiondef(p.oid)
    ),
    E'\n' ORDER BY p.proname, p.oid
  ), '')
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.prokind IN ('f','p');
$$;

REVOKE ALL ON FUNCTION public.export_public_routines() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.export_public_routines() TO service_role;
