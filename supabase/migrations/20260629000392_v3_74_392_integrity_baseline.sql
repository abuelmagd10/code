-- v3.74.392 — Integrity baseline: assert_baseline() + baseline_report().
--
-- WHY
-- Through ~50 migrations the system has accumulated contracts (a function
-- must have a particular role list; a trigger must exist on a particular
-- table; an RLS policy must call the new helper; per-company GL/FIFO/AR
-- must balance). Each new migration risks unknowingly breaking a prior
-- one. There is no CI yet.
--
-- assert_baseline() is the single procedural call that verifies every
-- contract documented in CONTRACTS.md. It raises EXCEPTION on the first
-- broken contract so any wrapper (a future CI job, a manual post-apply
-- step, a one-off psql session) instantly knows the migration regressed
-- something.
--
-- baseline_report() returns one row per checked item without raising —
-- use this for diagnostics ("which contracts are broken?") instead of
-- the all-or-nothing assert.
--
-- HOW TO USE AFTER ANY MIGRATION
--   SELECT assert_baseline();          -- pass/fail (preferred in scripts)
--   SELECT * FROM baseline_report();   -- full row-by-row status
--
-- ADDING A NEW CONTRACT
-- When a future migration introduces a new contract (e.g. a new RLS
-- policy, a new function, a fingerprint inside a function body), add an
-- assertion block to BOTH functions below and append a line to
-- CONTRACTS.md. Migrations stay self-documenting that way.

-- ===========================================================================
-- assert_baseline() — raises on first failure
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.assert_baseline()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_name    text;
  v_company record;
  v_error   record;
  v_errors  int := 0;
BEGIN
  -- Section A: critical functions exist
  FOR v_name IN
    SELECT unnest(ARRAY[
      'can_modify_data',
      'can_manage_supplier_row',
      'complete_booking_atomic',
      'execute_sales_invoice_accounting',
      'check_booking_service_inventory',
      'run_all_integrity_checks'
    ])
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = v_name) THEN
      RAISE EXCEPTION 'BASELINE FAIL: function missing: %', v_name;
    END IF;
  END LOOP;

  -- Section B: critical tables exist
  FOR v_name IN
    SELECT unnest(ARRAY[
      'discount_approvals',
      'company_seat_licenses',
      'service_products'
    ])
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = v_name
    ) THEN
      RAISE EXCEPTION 'BASELINE FAIL: table missing: %', v_name;
    END IF;
  END LOOP;

  -- Section C: critical triggers exist
  FOR v_name IN
    SELECT unnest(ARRAY[
      'bkg_request_discount_approval',
      'inv_request_discount_approval',
      'inv_block_post_unapproved_discount',
      'bill_request_discount_approval',
      'bill_block_post_unapproved_discount',
      'sync_employee_user_id_ins',
      'sync_employee_user_id_upd',
      'sync_employee_user_id_del'
    ])
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger
       WHERE tgname = v_name AND NOT tgisinternal
    ) THEN
      RAISE EXCEPTION 'BASELINE FAIL: trigger missing: %', v_name;
    END IF;
  END LOOP;

  -- Section D: critical RLS policies exist
  FOR v_name IN
    SELECT unnest(ARRAY[
      'suppliers_insert',
      'suppliers_update',
      'suppliers_delete'
    ])
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
       WHERE schemaname = 'public'
         AND tablename  = 'suppliers'
         AND policyname = v_name
    ) THEN
      RAISE EXCEPTION 'BASELINE FAIL: policy missing on suppliers: %', v_name;
    END IF;
  END LOOP;

  -- Section E: function-body fingerprints. These catch a future migration
  -- that recreates a function but drops a previously-shipped guarantee.
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
     WHERE p.proname = 'can_modify_data'
       AND pg_get_functiondef(p.oid) LIKE '%purchasing_officer%'
       AND pg_get_functiondef(p.oid) LIKE '%general_manager%'
       AND pg_get_functiondef(p.oid) LIKE '%booking_officer%'
       AND pg_get_functiondef(p.oid) LIKE '%manufacturing_officer%'
       AND pg_get_functiondef(p.oid) LIKE '%hr_officer%'
       AND pg_get_functiondef(p.oid) LIKE '%store_manager%'
  ) THEN
    RAISE EXCEPTION 'BASELINE FAIL: can_modify_data is missing one of the modern operational roles (v3.74.390 contract broken)';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
     WHERE p.proname = 'can_manage_supplier_row'
       AND pg_get_functiondef(p.oid) LIKE '%p_row_branch_id = v_user_branch_id%'
  ) THEN
    RAISE EXCEPTION 'BASELINE FAIL: can_manage_supplier_row no longer enforces branch-scoped check (v3.74.391 contract broken)';
  END IF;

  -- Section F: per-company data integrity. run_all_integrity_checks is the
  -- canonical aggregator (~50 ic_* checks: GL trial balance, AR/AP, FIFO
  -- vs COGS, branch isolation, FX accuracy, etc). We only treat severity
  -- 'error' as blocking; warnings get surfaced through baseline_report().
  FOR v_company IN
    SELECT id, name FROM companies
  LOOP
    FOR v_error IN
      SELECT check_code, name_ar, severity, detail
        FROM run_all_integrity_checks(v_company.id)
       WHERE severity = 'error'
    LOOP
      v_errors := v_errors + 1;
      RAISE WARNING 'BASELINE integrity error: company "%" check "%" (%) → %',
        v_company.name, v_error.check_code, v_error.name_ar, v_error.detail;
    END LOOP;
  END LOOP;

  IF v_errors > 0 THEN
    RAISE EXCEPTION 'BASELINE FAIL: % integrity error(s) across companies (details above as WARNINGs)', v_errors;
  END IF;

  RAISE NOTICE 'BASELINE OK: all contracts intact';
END;
$function$;

COMMENT ON FUNCTION public.assert_baseline() IS
  'v3.74.392 — Asserts every prior-version contract (functions, tables, triggers, RLS policies, function-body fingerprints, per-company integrity checks). Raises EXCEPTION on first failure. Invoke after every migration: SELECT assert_baseline();';

-- ===========================================================================
-- baseline_report() — returns row set, never raises
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.baseline_report()
RETURNS TABLE(section text, item text, status text, detail text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
BEGIN
  -- functions
  RETURN QUERY
  SELECT 'function'::text,
         fn::text,
         CASE WHEN EXISTS (SELECT 1 FROM pg_proc WHERE proname = fn) THEN 'OK' ELSE 'MISSING' END,
         NULL::text
    FROM unnest(ARRAY[
      'can_modify_data',
      'can_manage_supplier_row',
      'complete_booking_atomic',
      'execute_sales_invoice_accounting',
      'check_booking_service_inventory',
      'run_all_integrity_checks'
    ]) AS fn;

  -- tables
  RETURN QUERY
  SELECT 'table'::text,
         tbl::text,
         CASE WHEN EXISTS (
           SELECT 1 FROM information_schema.tables
            WHERE table_schema='public' AND table_name = tbl
         ) THEN 'OK' ELSE 'MISSING' END,
         NULL::text
    FROM unnest(ARRAY[
      'discount_approvals',
      'company_seat_licenses',
      'service_products'
    ]) AS tbl;

  -- triggers
  RETURN QUERY
  SELECT 'trigger'::text,
         trg::text,
         CASE WHEN EXISTS (
           SELECT 1 FROM pg_trigger WHERE tgname = trg AND NOT tgisinternal
         ) THEN 'OK' ELSE 'MISSING' END,
         NULL::text
    FROM unnest(ARRAY[
      'bkg_request_discount_approval',
      'inv_request_discount_approval',
      'inv_block_post_unapproved_discount',
      'bill_request_discount_approval',
      'bill_block_post_unapproved_discount',
      'sync_employee_user_id_ins',
      'sync_employee_user_id_upd',
      'sync_employee_user_id_del'
    ]) AS trg;

  -- policies
  RETURN QUERY
  SELECT 'policy'::text,
         ('suppliers.' || pol)::text,
         CASE WHEN EXISTS (
           SELECT 1 FROM pg_policies
            WHERE schemaname='public' AND tablename='suppliers' AND policyname = pol
         ) THEN 'OK' ELSE 'MISSING' END,
         NULL::text
    FROM unnest(ARRAY['suppliers_insert','suppliers_update','suppliers_delete']) AS pol;

  -- function body fingerprints
  RETURN QUERY
  SELECT 'fingerprint'::text,
         'can_modify_data references modern roles (v3.74.390)'::text,
         CASE WHEN EXISTS (
           SELECT 1 FROM pg_proc p
            WHERE p.proname = 'can_modify_data'
              AND pg_get_functiondef(p.oid) LIKE '%purchasing_officer%'
              AND pg_get_functiondef(p.oid) LIKE '%general_manager%'
              AND pg_get_functiondef(p.oid) LIKE '%booking_officer%'
              AND pg_get_functiondef(p.oid) LIKE '%manufacturing_officer%'
              AND pg_get_functiondef(p.oid) LIKE '%hr_officer%'
              AND pg_get_functiondef(p.oid) LIKE '%store_manager%'
         ) THEN 'OK' ELSE 'BROKEN' END,
         NULL::text;

  RETURN QUERY
  SELECT 'fingerprint'::text,
         'can_manage_supplier_row enforces branch-scope (v3.74.391)'::text,
         CASE WHEN EXISTS (
           SELECT 1 FROM pg_proc p
            WHERE p.proname = 'can_manage_supplier_row'
              AND pg_get_functiondef(p.oid) LIKE '%p_row_branch_id = v_user_branch_id%'
         ) THEN 'OK' ELSE 'BROKEN' END,
         NULL::text;

  -- per-company integrity (error + warning rows surface here for visibility)
  RETURN QUERY
  SELECT 'integrity'::text,
         (c.name || ' / ' || r.check_code)::text,
         CASE r.severity
           WHEN 'error'   THEN 'ERROR'
           WHEN 'warning' THEN 'WARN'
           ELSE upper(r.severity)
         END,
         r.detail::text
    FROM companies c
    CROSS JOIN LATERAL run_all_integrity_checks(c.id) r
   WHERE r.severity IN ('error','warning');
END;
$function$;

COMMENT ON FUNCTION public.baseline_report() IS
  'v3.74.392 — Companion to assert_baseline(). Returns one row per contract being verified (functions, tables, triggers, policies, fingerprints, per-company integrity). Status is OK / MISSING / BROKEN / ERROR / WARN. Never raises — use for diagnostics.';
