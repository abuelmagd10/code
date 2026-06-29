-- v3.74.393 — Fix stale products.quantity_on_hand on VitaSlims + add a
-- new Section G assertion to assert_baseline()/baseline_report() so the
-- same pathology gets caught automatically next time it sneaks in.
--
-- WHY (owner-reported)
-- Purchasing officer opened "new purchase order" → product picker
-- showed "VitaSlims contains 4". But:
--   inventory_transactions for the product : 0 rows
--   fifo_cost_lots                          : 0 rows
--   cogs_transactions                       : 0 rows
--   bill_items / purchase_order_items       : 0 rows
--   GL inventory account net for company   : 0
-- The 4 was a stale value on products.quantity_on_hand only — no
-- ledger backing. Almost certainly a relic from before we enforced
-- "every inventory movement must produce an inventory_transactions
-- row + a JE", or a residue from an earlier test-data cleanup that
-- truncated the ledgers but did not reset this column.
--
-- The fix is one UPDATE, but the long-term value is the new check:
-- now any product whose quantity_on_hand diverges from
-- sum(inventory_transactions.quantity_change) for the same product_id
-- will trip assert_baseline() and block the next migration until
-- somebody explains the drift.

-- ---------------------------------------------------------------------------
-- 1) Reset VitaSlims to match its (zero) ledger.
-- ---------------------------------------------------------------------------

UPDATE products
   SET quantity_on_hand = 0,
       updated_at       = NOW()
 WHERE id = '36babbef-e709-4848-b1a8-535a79dc9d1d'
   AND quantity_on_hand IS DISTINCT FROM 0;

-- ---------------------------------------------------------------------------
-- 2) Replace assert_baseline() to add Section G (inventory column
--    consistency). Sections A-F are byte-identical to v3.74.392.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.assert_baseline()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_name      text;
  v_company   record;
  v_error     record;
  v_drift     record;
  v_errors    int := 0;
  v_drift_cnt int := 0;
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

  -- Section E: function-body fingerprints
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

  -- Section F: per-company data integrity (run_all_integrity_checks)
  FOR v_company IN
    SELECT id, name FROM companies
  LOOP
    FOR v_error IN
      SELECT check_code, name_ar, severity, detail
        FROM run_all_integrity_checks(v_company.id)
       WHERE severity = 'error'
    LOOP
      v_errors := v_errors + 1;
      RAISE WARNING 'BASELINE integrity error: company "%" check "%" (%) -> %',
        v_company.name, v_error.check_code, v_error.name_ar, v_error.detail;
    END LOOP;
  END LOOP;

  IF v_errors > 0 THEN
    RAISE EXCEPTION 'BASELINE FAIL: % integrity error(s) across companies (details above as WARNINGs)', v_errors;
  END IF;

  -- Section G (v3.74.393): products.quantity_on_hand must equal the
  -- net sum of inventory_transactions.quantity_change for the same
  -- product_id. Services are excluded (no physical stock). This
  -- catches stale values that got out of sync with the ledger —
  -- exactly the VitaSlims pathology owner reported.
  FOR v_drift IN
    SELECT c.name AS company, pr.name AS product_name, pr.id AS product_id,
           pr.quantity_on_hand AS in_products_col,
           coalesce((SELECT sum(quantity_change) FROM inventory_transactions
                      WHERE product_id = pr.id), 0) AS net_ledger
      FROM products pr
      JOIN companies c ON c.id = pr.company_id
     WHERE coalesce(pr.product_type, pr.item_type, 'physical') NOT IN ('service','خدمة')
       AND pr.quantity_on_hand IS DISTINCT FROM
           coalesce((SELECT sum(quantity_change) FROM inventory_transactions
                      WHERE product_id = pr.id), 0)
  LOOP
    v_drift_cnt := v_drift_cnt + 1;
    RAISE WARNING 'BASELINE inventory drift: company "%" product "%" (%) -> products.quantity_on_hand=% but ledger sum=%',
      v_drift.company, v_drift.product_name, v_drift.product_id,
      v_drift.in_products_col, v_drift.net_ledger;
  END LOOP;

  IF v_drift_cnt > 0 THEN
    RAISE EXCEPTION 'BASELINE FAIL: % product(s) have quantity_on_hand out of sync with inventory_transactions (details above)', v_drift_cnt;
  END IF;

  RAISE NOTICE 'BASELINE OK: all contracts intact';
END;
$function$;

COMMENT ON FUNCTION public.assert_baseline() IS
  'v3.74.393 - Sections A-F as v3.74.392, plus Section G: products.quantity_on_hand must equal sum(inventory_transactions.quantity_change) per product. Raises EXCEPTION on first failure.';

-- ---------------------------------------------------------------------------
-- 3) Replace baseline_report() to surface the same Section G as rows.
--    Earlier sections identical to v3.74.392.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.baseline_report()
RETURNS TABLE(section text, item text, status text, detail text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
BEGIN
  RETURN QUERY
  SELECT 'function'::text, fn::text,
         CASE WHEN EXISTS (SELECT 1 FROM pg_proc WHERE proname = fn) THEN 'OK' ELSE 'MISSING' END,
         NULL::text
    FROM unnest(ARRAY[
      'can_modify_data','can_manage_supplier_row','complete_booking_atomic',
      'execute_sales_invoice_accounting','check_booking_service_inventory','run_all_integrity_checks'
    ]) AS fn;

  RETURN QUERY
  SELECT 'table'::text, tbl::text,
         CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables
                            WHERE table_schema='public' AND table_name = tbl) THEN 'OK' ELSE 'MISSING' END,
         NULL::text
    FROM unnest(ARRAY['discount_approvals','company_seat_licenses','service_products']) AS tbl;

  RETURN QUERY
  SELECT 'trigger'::text, trg::text,
         CASE WHEN EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = trg AND NOT tgisinternal) THEN 'OK' ELSE 'MISSING' END,
         NULL::text
    FROM unnest(ARRAY[
      'bkg_request_discount_approval','inv_request_discount_approval',
      'inv_block_post_unapproved_discount','bill_request_discount_approval',
      'bill_block_post_unapproved_discount','sync_employee_user_id_ins',
      'sync_employee_user_id_upd','sync_employee_user_id_del'
    ]) AS trg;

  RETURN QUERY
  SELECT 'policy'::text, ('suppliers.' || pol)::text,
         CASE WHEN EXISTS (SELECT 1 FROM pg_policies
                            WHERE schemaname='public' AND tablename='suppliers' AND policyname = pol) THEN 'OK' ELSE 'MISSING' END,
         NULL::text
    FROM unnest(ARRAY['suppliers_insert','suppliers_update','suppliers_delete']) AS pol;

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

  RETURN QUERY
  SELECT 'integrity'::text,
         (c.name || ' / ' || r.check_code)::text,
         CASE r.severity WHEN 'error' THEN 'ERROR' WHEN 'warning' THEN 'WARN' ELSE upper(r.severity) END,
         r.detail::text
    FROM companies c
    CROSS JOIN LATERAL run_all_integrity_checks(c.id) r
   WHERE r.severity IN ('error','warning');

  -- Section G (v3.74.393): inventory column consistency
  RETURN QUERY
  SELECT 'inventory_drift'::text,
         (c.name || ' / ' || pr.name)::text,
         'ERROR'::text,
         ('products.quantity_on_hand=' || pr.quantity_on_hand
           || ' but ledger sum=' ||
           coalesce((SELECT sum(quantity_change) FROM inventory_transactions
                      WHERE product_id = pr.id), 0)::text)::text
    FROM products pr
    JOIN companies c ON c.id = pr.company_id
   WHERE coalesce(pr.product_type, pr.item_type, 'physical') NOT IN ('service','خدمة')
     AND pr.quantity_on_hand IS DISTINCT FROM
         coalesce((SELECT sum(quantity_change) FROM inventory_transactions
                    WHERE product_id = pr.id), 0);
END;
$function$;

COMMENT ON FUNCTION public.baseline_report() IS
  'v3.74.393 - Returns rows per checked contract (sections A-G). Section G is new: products.quantity_on_hand vs inventory_transactions ledger drift.';
