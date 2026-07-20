-- v3.74.747 — Phase 2 for the row-id class: guard the 15 that touch the ledger.
--
-- These functions cannot call assert_company_access(p_company_id) — they have
-- no company_id to pass. They receive an invoice id, a payroll run id, a
-- depreciation schedule id, and reach the company through that row.
--
-- HOW THE TABLE FOR EACH ONE WAS DETERMINED. Not from the parameter name. My
-- first attempt derived it by pluralising the parameter (p_asset_id → "assets",
-- p_schedule_id → "schedules") and 29 of 48 resolved to tables that do not
-- exist. Guessing from names is precisely the habit that produced the blind
-- spot this release exists to close.
--
-- Instead each table was read out of the function's OWN body, by matching the
-- statement where it loads its row:
--
--     FROM <table> WHERE id = <that function's id parameter>
--
-- 15 of the 19 ledger-touching functions state their table that way. Those 15
-- are guarded here. The other 4 (confirm_purchase_return_delivery,
-- delete_fixed_asset_completely, execute_customer_refund,
-- force_delete_all_depreciation_schedules) load their data differently and are
-- deliberately left for individual review rather than guessed at.
--
-- Every one of the 11 tables involved was confirmed to carry both id and
-- company_id before anything was written.
--
-- Verified by execution, on a real invoice:
--   server-side call, no JWT        → allowed  (API routes keep working)
--   member of that invoice's company → allowed
--   logged-in user of another company → rejected (57014)
CREATE OR REPLACE FUNCTION public.assert_company_access_by_row(
  p_table text,
  p_row_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_company uuid;
BEGIN
  -- No end-user identity: server-side call. The API layer authorised it, same
  -- rule as assert_company_access.
  IF auth.uid() IS NULL OR p_row_id IS NULL THEN
    RETURN;
  END IF;

  EXECUTE format('SELECT company_id FROM public.%I WHERE id = $1', p_table)
    INTO v_company
    USING p_row_id;

  -- Row does not exist. Say nothing here and let the calling function raise its
  -- own "not found" — a guard should not invent a different error for a case it
  -- was not asked about.
  IF v_company IS NULL THEN
    RETURN;
  END IF;

  PERFORM public.assert_company_access(v_company);
END;
$function$;

REVOKE ALL ON FUNCTION public.assert_company_access_by_row(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assert_company_access_by_row(text, uuid) TO authenticated, service_role;

-- Inject as the first statement of each of the 15.
DO $patch$
DECLARE
  r         RECORD;
  v_def     TEXT;
  v_new     TEXT;
  v_start   INT;
  v_rel     INT;
  v_abs     INT;
  v_done    INT := 0;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('post_bank_voucher',                     'bank_voucher_requests',                 'p_request_id'),
      ('update_capital_contribution_amount',    'capital_contributions',                 'p_contribution_id'),
      ('pay_commission_run_atomic',             'commission_runs',                       'p_commission_run_id'),
      ('post_commission_run_atomic',            'commission_runs',                       'p_commission_run_id'),
      ('post_depreciation',                     'depreciation_schedules',                'p_schedule_id'),
      ('post_commission_atomic',                'employee_commissions',                  'p_commission_id'),
      ('approve_write_off',                     'inventory_write_offs',                  'p_write_off_id'),
      ('cancel_approved_write_off',             'inventory_write_offs',                  'p_write_off_id'),
      ('execute_sales_invoice_accounting',      'invoices',                              'p_invoice_id'),
      ('record_payment',                        'invoices',                              'p_invoice_id'),
      ('create_reversal_entry',                 'journal_entries',                       'p_original_entry_id'),
      ('post_payroll_run_atomic',               'payroll_runs',                          'p_payroll_run_id'),
      ('confirm_warehouse_allocation',          'purchase_return_warehouse_allocations', 'p_allocation_id'),
      ('confirm_purchase_return_delivery_v2',   'purchase_returns',                      'p_purchase_return_id'),
      ('confirm_purchase_return_delivery_v3',   'purchase_returns',                      'p_purchase_return_id')
    ) AS v(fn, tbl, idparam)
  LOOP
    SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace AND p.proname = r.fn
    LIMIT 1;

    IF v_def IS NULL THEN
      RAISE EXCEPTION 'function % not found', r.fn;
    END IF;

    IF v_def ILIKE '%assert_company_access%' THEN
      CONTINUE;
    END IF;

    v_start := position('$function$' in v_def);
    IF v_start = 0 THEN RAISE EXCEPTION 'no $function$ delimiter in %', r.fn; END IF;

    -- First BEGIN in the body, tolerant of formatting. Skipping silently is how
    -- three functions were quietly missed in v3.74.730.
    v_rel := position('BEGIN' in substr(v_def, v_start + 10));
    IF v_rel = 0 THEN RAISE EXCEPTION 'no BEGIN found in %', r.fn; END IF;
    v_abs := v_start + 10 + v_rel - 1;

    v_new := substr(v_def, 1, v_abs + 4)
          || E'\n  -- v3.74.747 — reject a caller acting on another company''s data.'
          || format(E'\n  PERFORM public.assert_company_access_by_row(%L, %s);\n',
                    r.tbl, r.idparam)
          || substr(v_def, v_abs + 5);

    EXECUTE v_new;
    v_done := v_done + 1;
  END LOOP;

  RAISE NOTICE 'v3.74.747: guarded % ledger-touching row-id functions', v_done;
END;
$patch$;
