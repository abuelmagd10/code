-- v3.74.394 — Stage 1 of system-wide tax dropdown unification.
-- Adds tax_code_id FK to purchase_order_items + bill_items so each
-- line item can reference a row in tax_codes (defined in /settings/taxes)
-- instead of carrying a free-text rate. tax_rate is preserved alongside
-- for ledger/back-compat.
--
-- Also extends assert_baseline()/baseline_report() with Section H:
--   - the two new columns must exist (schema contract)
--   - any row linked to a tax_code must have tax_rate matching tax_codes.rate
--     (data-integrity contract — surfaces drift caused by manual edits)
--
-- Stages 2-N (sales invoices, sales orders, returns, credit notes, item
-- defaults) will extend Section H to cover their own *_items tables.

ALTER TABLE public.purchase_order_items
  ADD COLUMN IF NOT EXISTS tax_code_id uuid REFERENCES public.tax_codes(id) ON DELETE SET NULL;

ALTER TABLE public.bill_items
  ADD COLUMN IF NOT EXISTS tax_code_id uuid REFERENCES public.tax_codes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_purchase_order_items_tax_code_id
  ON public.purchase_order_items(tax_code_id);
CREATE INDEX IF NOT EXISTS idx_bill_items_tax_code_id
  ON public.bill_items(tax_code_id);

-- assert_baseline + baseline_report bodies were updated in the live DB
-- via Supabase MCP at apply time. The canonical source for the function
-- bodies lives here for review; if you ever need to rebuild a fresh
-- environment, run this file directly (CREATE OR REPLACE is idempotent).

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
  v_taxmis    record;
  v_errors    int := 0;
  v_drift_cnt int := 0;
  v_tax_cnt   int := 0;
BEGIN
  FOR v_name IN
    SELECT unnest(ARRAY['can_modify_data','can_manage_supplier_row','complete_booking_atomic',
                        'execute_sales_invoice_accounting','check_booking_service_inventory','run_all_integrity_checks'])
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = v_name) THEN
      RAISE EXCEPTION 'BASELINE FAIL: function missing: %', v_name;
    END IF;
  END LOOP;

  FOR v_name IN
    SELECT unnest(ARRAY['discount_approvals','company_seat_licenses','service_products'])
  LOOP
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = v_name) THEN
      RAISE EXCEPTION 'BASELINE FAIL: table missing: %', v_name;
    END IF;
  END LOOP;

  FOR v_name IN
    SELECT unnest(ARRAY['bkg_request_discount_approval','inv_request_discount_approval','inv_block_post_unapproved_discount',
                        'bill_request_discount_approval','bill_block_post_unapproved_discount',
                        'sync_employee_user_id_ins','sync_employee_user_id_upd','sync_employee_user_id_del'])
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = v_name AND NOT tgisinternal) THEN
      RAISE EXCEPTION 'BASELINE FAIL: trigger missing: %', v_name;
    END IF;
  END LOOP;

  FOR v_name IN
    SELECT unnest(ARRAY['suppliers_insert','suppliers_update','suppliers_delete'])
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'suppliers' AND policyname = v_name) THEN
      RAISE EXCEPTION 'BASELINE FAIL: policy missing on suppliers: %', v_name;
    END IF;
  END LOOP;

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

  FOR v_company IN SELECT id, name FROM companies LOOP
    FOR v_error IN
      SELECT check_code, name_ar, severity, detail FROM run_all_integrity_checks(v_company.id) WHERE severity = 'error'
    LOOP
      v_errors := v_errors + 1;
      RAISE WARNING 'BASELINE integrity error: company "%" check "%" (%) -> %',
        v_company.name, v_error.check_code, v_error.name_ar, v_error.detail;
    END LOOP;
  END LOOP;
  IF v_errors > 0 THEN
    RAISE EXCEPTION 'BASELINE FAIL: % integrity error(s) across companies', v_errors;
  END IF;

  FOR v_drift IN
    SELECT c.name AS company, pr.name AS product_name, pr.id AS product_id,
           pr.quantity_on_hand AS in_products_col,
           coalesce((SELECT sum(quantity_change) FROM inventory_transactions WHERE product_id = pr.id), 0) AS net_ledger
      FROM products pr JOIN companies c ON c.id = pr.company_id
     WHERE coalesce(pr.product_type, pr.item_type, 'physical') NOT IN ('service','خدمة')
       AND pr.quantity_on_hand IS DISTINCT FROM
           coalesce((SELECT sum(quantity_change) FROM inventory_transactions WHERE product_id = pr.id), 0)
  LOOP
    v_drift_cnt := v_drift_cnt + 1;
    RAISE WARNING 'BASELINE inventory drift: company "%" product "%" (%) -> col=% ledger=%',
      v_drift.company, v_drift.product_name, v_drift.product_id, v_drift.in_products_col, v_drift.net_ledger;
  END LOOP;
  IF v_drift_cnt > 0 THEN
    RAISE EXCEPTION 'BASELINE FAIL: % product(s) inventory drift', v_drift_cnt;
  END IF;

  -- Section H (v3.74.394): tax_code_id columns + rate consistency
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='purchase_order_items' AND column_name='tax_code_id') THEN
    RAISE EXCEPTION 'BASELINE FAIL: purchase_order_items.tax_code_id column missing (v3.74.394 contract)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='bill_items' AND column_name='tax_code_id') THEN
    RAISE EXCEPTION 'BASELINE FAIL: bill_items.tax_code_id column missing (v3.74.394 contract)';
  END IF;

  FOR v_taxmis IN
    SELECT 'purchase_order_items' AS tbl, poi.id AS row_id, poi.tax_code_id, poi.tax_rate, tc.rate AS expected_rate
      FROM purchase_order_items poi JOIN tax_codes tc ON tc.id = poi.tax_code_id
     WHERE poi.tax_code_id IS NOT NULL AND coalesce(poi.tax_rate, 0) <> coalesce(tc.rate, 0)
    UNION ALL
    SELECT 'bill_items', bi.id, bi.tax_code_id, bi.tax_rate, tc.rate
      FROM bill_items bi JOIN tax_codes tc ON tc.id = bi.tax_code_id
     WHERE bi.tax_code_id IS NOT NULL AND coalesce(bi.tax_rate, 0) <> coalesce(tc.rate, 0)
  LOOP
    v_tax_cnt := v_tax_cnt + 1;
    RAISE WARNING 'BASELINE tax mismatch: %.id=% tax_code_id=% rate=% expected=%',
      v_taxmis.tbl, v_taxmis.row_id, v_taxmis.tax_code_id, v_taxmis.tax_rate, v_taxmis.expected_rate;
  END LOOP;
  IF v_tax_cnt > 0 THEN
    RAISE EXCEPTION 'BASELINE FAIL: % row(s) tax_rate does not match linked tax_code rate', v_tax_cnt;
  END IF;

  RAISE NOTICE 'BASELINE OK: all contracts intact';
END;
$function$;

COMMENT ON FUNCTION public.assert_baseline() IS
  'v3.74.394 - Sections A-G as v3.74.393, plus Section H: tax_code_id columns + rate consistency for purchase items / bill items.';
