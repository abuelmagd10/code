-- v3.74.734 — export everything that is NOT a function body.
--
-- supabase/schema/functions.sql already mirrors all 1196 routines, refreshed on
-- every release. Nothing mirrors anything else. Living only inside the
-- production database right now:
--
--     249 tables / 4397 columns
--     797 RLS policies      <- the entire row-level security model
--     501 triggers          <- where FIFO and COGS automation actually fires
--   1,202 indexes
--   1,795 constraints
--     function grants       <- everything v3.74.727-731 changed
--
-- The migration ledger cannot substitute: 661 versions are recorded as applied
-- and only 49 of them correspond to a file in supabase/migrations. The rest
-- were applied through the SQL editor or MCP, which records a timestamp instead
-- of the filename. So the folder cannot tell anyone what production contains.
--
-- Note the grants line especially. This session revoked anon from 116 functions
-- and added guards to 88. Not one of those grant changes is captured by
-- functions.sql, because pg_get_functiondef does not emit ACLs. A rebuild from
-- the repo would restore every function with PostgreSQL's default
-- EXECUTE-to-PUBLIC — silently undoing the day's security work.
--
-- Read-only, service_role only. Mirrors export_public_routines (v3.74.613).
CREATE OR REPLACE FUNCTION public.export_public_schema()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_out text := '';
BEGIN
  -- ── TABLES ────────────────────────────────────────────────────────────────
  v_out := v_out || E'\n-- ===================== TABLES =====================\n\n';
  SELECT v_out || COALESCE(string_agg(stmt, E'\n\n' ORDER BY tbl), '')
  INTO v_out
  FROM (
    SELECT c.relname AS tbl,
           'CREATE TABLE IF NOT EXISTS public.' || quote_ident(c.relname) || E' (\n' ||
           string_agg(
             '  ' || quote_ident(a.attname) || ' ' || format_type(a.atttypid, a.atttypmod)
             || COALESCE(' DEFAULT ' || pg_get_expr(ad.adbin, ad.adrelid), '')
             || CASE WHEN a.attnotnull THEN ' NOT NULL' ELSE '' END,
             E',\n' ORDER BY a.attnum)
           || E'\n);' AS stmt
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
    LEFT JOIN pg_attrdef ad ON ad.adrelid = c.oid AND ad.adnum = a.attnum
    WHERE n.nspname = 'public' AND c.relkind = 'r'
    GROUP BY c.relname
  ) t;

  -- ── CONSTRAINTS ───────────────────────────────────────────────────────────
  v_out := v_out || E'\n\n-- ===================== CONSTRAINTS =====================\n\n';
  SELECT v_out || COALESCE(string_agg(stmt, E'\n' ORDER BY tbl, conname), '')
  INTO v_out
  FROM (
    SELECT c.relname AS tbl, con.conname,
           'ALTER TABLE public.' || quote_ident(c.relname)
           || ' ADD CONSTRAINT ' || quote_ident(con.conname) || ' '
           || pg_get_constraintdef(con.oid) || ';' AS stmt
    FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
  ) t;

  -- ── INDEXES (constraint-backing ones excluded; they come with the constraint)
  v_out := v_out || E'\n\n-- ===================== INDEXES =====================\n\n';
  SELECT v_out || COALESCE(string_agg(indexdef || ';', E'\n' ORDER BY indexname), '')
  INTO v_out
  FROM pg_indexes i
  WHERE i.schemaname = 'public'
    AND NOT EXISTS (
      SELECT 1 FROM pg_constraint con
      JOIN pg_class ic ON ic.oid = con.conindid
      WHERE ic.relname = i.indexname
    );

  -- ── TRIGGERS ──────────────────────────────────────────────────────────────
  -- Note: two of these are CONSTRAINT triggers (trg_enforce_journal_balance and
  -- trg_recurring_template_balance), so pg_get_triggerdef emits
  -- "CREATE CONSTRAINT TRIGGER". Count on the substring "TRIGGER", not
  -- "CREATE TRIGGER", or the two that enforce double-entry balance go missing
  -- from any tally.
  v_out := v_out || E'\n\n-- ===================== TRIGGERS =====================\n\n';
  SELECT v_out || COALESCE(string_agg(pg_get_triggerdef(t.oid) || ';', E'\n' ORDER BY c.relname, t.tgname), '')
  INTO v_out
  FROM pg_trigger t
  JOIN pg_class c ON c.oid = t.tgrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND NOT t.tgisinternal;

  -- ── ROW LEVEL SECURITY ────────────────────────────────────────────────────
  v_out := v_out || E'\n\n-- ===================== RLS =====================\n\n';
  SELECT v_out || COALESCE(string_agg(
           'ALTER TABLE public.' || quote_ident(c.relname) || ' ENABLE ROW LEVEL SECURITY;',
           E'\n' ORDER BY c.relname), '')
  INTO v_out
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity;

  v_out := v_out || E'\n\n-- ---- policies ----\n';
  SELECT v_out || COALESCE(string_agg(stmt, E'\n' ORDER BY tablename, policyname), '')
  INTO v_out
  FROM (
    SELECT p.tablename, p.policyname,
           'CREATE POLICY ' || quote_ident(p.policyname)
           || ' ON public.' || quote_ident(p.tablename)
           || ' AS ' || p.permissive
           || ' FOR ' || p.cmd
           || ' TO ' || array_to_string(p.roles, ', ')
           || COALESCE(' USING (' || p.qual || ')', '')
           || COALESCE(' WITH CHECK (' || p.with_check || ')', '')
           || ';' AS stmt
    FROM pg_policies p
    WHERE p.schemaname = 'public'
  ) t;

  -- ── GRANTS ────────────────────────────────────────────────────────────────
  -- The piece functions.sql structurally cannot hold: pg_get_functiondef does
  -- not emit ACLs, so a rebuild without this section restores every function
  -- with the default EXECUTE to PUBLIC.
  v_out := v_out || E'\n\n-- ===================== FUNCTION GRANTS =====================\n\n';
  SELECT v_out || COALESCE(string_agg(stmt, E'\n' ORDER BY sig), '')
  INTO v_out
  FROM (
    SELECT p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' AS sig,
           'REVOKE ALL ON FUNCTION public.' || quote_ident(p.proname)
             || '(' || pg_get_function_identity_arguments(p.oid) || ') FROM PUBLIC;'
           || COALESCE(
                E'\n' || string_agg(
                  'GRANT EXECUTE ON FUNCTION public.' || quote_ident(p.proname)
                  || '(' || pg_get_function_identity_arguments(p.oid) || ') TO ' || g.grantee || ';',
                  E'\n' ORDER BY g.grantee), '') AS stmt
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    LEFT JOIN LATERAL (
      SELECT r.rolname AS grantee
      FROM pg_roles r
      WHERE r.rolname IN ('anon', 'authenticated', 'service_role')
        AND has_function_privilege(r.rolname, p.oid, 'EXECUTE')
    ) g ON true
    WHERE n.nspname = 'public' AND p.prokind IN ('f', 'p')
    GROUP BY p.proname, p.oid
  ) t;

  v_out := v_out || E'\n\n-- ===================== TABLE GRANTS =====================\n\n';
  SELECT v_out || COALESCE(string_agg(stmt, E'\n' ORDER BY tbl, grantee), '')
  INTO v_out
  FROM (
    SELECT table_name AS tbl, grantee,
           'GRANT ' || string_agg(privilege_type, ', ' ORDER BY privilege_type)
           || ' ON public.' || quote_ident(table_name) || ' TO ' || quote_ident(grantee) || ';' AS stmt
    FROM information_schema.role_table_grants
    WHERE table_schema = 'public'
      AND grantee IN ('anon', 'authenticated', 'service_role')
    GROUP BY table_name, grantee
  ) t;

  RETURN v_out;
END;
$function$;

REVOKE ALL ON FUNCTION public.export_public_schema() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.export_public_schema() TO service_role;
