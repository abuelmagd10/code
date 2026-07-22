-- ============================================================================
-- v3.74.786 — مستهلِك واحد لطبقات FIFO (إصلاح الاستهلاك المزدوج)
--
-- Root cause (live, INV-00002 dispatch approval, 2026-07-22):
--   Since v3.74.702, trg_auto_cogs_on_sale (auto_create_cogs_journal) calls
--   consume_fifo_lots — which RECORDS a consumption and DEPLETES the lot.
--   The atomic executors (post_accounting_event / _v2) ALSO apply the
--   TS-prepared p_fifo_consumptions payload: a second decrement of the same
--   lots. Every RPC-driven sale since 702 consumed FIFO twice — silently
--   while lots had slack (the −5.41 FIFO-vs-snapshot drift), and loudly now:
--   remaining 1 − 1 (trigger) − 1 (payload) = −1 → chk_quantities violation.
--
-- Fix: single-consumer principle.
--   post_accounting_event raises a transaction-local flag when the event
--   carries explicit consumption rows; the trigger then computes COGS with
--   the READ-ONLY calculate_fifo_cogs (same lots, same allocation → same
--   amount) and leaves depletion to the payload. Legacy paths without a
--   payload keep the old behaviour — the trigger remains their only consumer.
--
-- Rehearsed on the restored test copy: single decrement (1→0), exactly one
-- consumption row, correct COGS journal, deferred revenue journal posted.
-- APPLIED to test (bhvylzzscrnzusnnkaal) and prod (hfvsbsizokxontflgdyn)
-- on 2026-07-22 via MCP apply_migration; this file is the repo record.
-- ============================================================================

-- ── 1. auto_create_cogs_journal: read-only when a payload is present ────────
CREATE OR REPLACE FUNCTION public.auto_create_cogs_journal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_company_id UUID;
  v_product_cost NUMERIC;
  v_cogs_amount NUMERIC;
  v_fifo_cogs NUMERIC;
  v_inventory_account_id UUID;
  v_cogs_account_id UUID;
  v_journal_entry_id UUID;
  v_invoice_number TEXT;
  v_invoice_date DATE;
  v_product_item_type TEXT;
BEGIN
  IF NEW.transaction_type != 'sale' THEN RETURN NEW; END IF;

  SELECT item_type INTO v_product_item_type FROM products WHERE id = NEW.product_id;
  IF v_product_item_type = 'service' THEN RETURN NEW; END IF;

  SELECT company_id, cost_price INTO v_company_id, v_product_cost
  FROM products WHERE id = NEW.product_id;

  -- v3.74.786 — single-consumer principle. When the atomic event carries
  -- explicit lot-level consumption rows (app.fifo_payload_present), the
  -- payload is the one and only depleter; this trigger must only PRICE the
  -- COGS journal. calculate_fifo_cogs is read-only and, running BEFORE the
  -- payload loop touches the lots, allocates from the very same lots the
  -- payload was prepared from — same order, same amounts.
  IF current_setting('app.fifo_payload_present', true) = 'true' THEN
    SELECT total_cogs INTO v_fifo_cogs
      FROM public.calculate_fifo_cogs(NEW.product_id, ABS(NEW.quantity_change));
  ELSE
    -- v3.74.702 — COGS from FIFO lots (what was ACTUALLY paid per batch).
    -- consume_fifo_lots records the consumption and depletes the batch —
    -- correct ONLY when nobody else does (legacy paths without a payload).
    v_fifo_cogs := public.consume_fifo_lots(
      v_company_id, NEW.product_id, ABS(NEW.quantity_change),
      'sale', 'invoice', NEW.reference_id,
      COALESCE(NEW.created_at::date, CURRENT_DATE)
    );
  END IF;

  IF COALESCE(v_fifo_cogs, 0) > 0 THEN
    v_cogs_amount := v_fifo_cogs;
  ELSE
    -- Fallback: legacy stock with no FIFO lot yet. Keeps the old behaviour so
    -- COGS is never silently zeroed.
    v_cogs_amount := ABS(NEW.quantity_change) * COALESCE(v_product_cost, 0);
  END IF;

  IF v_cogs_amount = 0 THEN RETURN NEW; END IF;

  SELECT coa.id INTO v_inventory_account_id FROM chart_of_accounts coa
  WHERE coa.company_id = v_company_id AND coa.sub_type = 'inventory'
  AND (coa.parent_id IS NOT NULL OR coa.level > 1) LIMIT 1;

  SELECT coa.id INTO v_cogs_account_id FROM chart_of_accounts coa
  WHERE coa.company_id = v_company_id
  AND (coa.sub_type = 'cost_of_goods_sold' OR coa.sub_type = 'cogs' OR coa.account_code = '5000')
  AND (coa.parent_id IS NOT NULL OR coa.level > 1) LIMIT 1;

  IF v_inventory_account_id IS NULL OR v_cogs_account_id IS NULL THEN RETURN NEW; END IF;

  SELECT invoice_number, invoice_date INTO v_invoice_number, v_invoice_date
  FROM invoices WHERE id = NEW.reference_id;

  INSERT INTO journal_entries (company_id, reference_type, reference_id, entry_date, description, branch_id, cost_center_id)
  VALUES (v_company_id, 'invoice_cogs', NEW.reference_id, COALESCE(v_invoice_date, CURRENT_DATE),
  'COGS - ' || COALESCE(v_invoice_number, 'Invoice'), NEW.branch_id, NEW.cost_center_id)
  RETURNING id INTO v_journal_entry_id;

  INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit_amount, credit_amount, description) VALUES
  (v_journal_entry_id, v_cogs_account_id, v_cogs_amount, 0, 'COGS'),
  (v_journal_entry_id, v_inventory_account_id, 0, v_cogs_amount, 'Inventory');

  NEW.journal_entry_id := v_journal_entry_id;
  RETURN NEW;
END;
$function$;

-- ── 2. post_accounting_event: raise the flag when the payload consumes ──────
DO $patch$
DECLARE
  d  text;
  a  text := 'PERFORM public.assert_company_access(p_company_id);';
  r  text;
  n  int;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO d
  FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
  WHERE ns.nspname='public' AND p.proname='post_accounting_event'
  ORDER BY length(pg_get_functiondef(p.oid)) DESC LIMIT 1;

  IF d LIKE '%fifo_payload_present%' THEN
    RAISE NOTICE 'post_accounting_event already patched — skipping';
    RETURN;
  END IF;

  n := (length(d) - length(replace(d, a, ''))) / length(a);
  IF n <> 1 THEN
    RAISE EXCEPTION 'anchor matched % times, expected exactly 1 — aborting', n;
  END IF;

  r := a || chr(10) ||
       '  -- v3.74.786 — single-consumer flag: this event carries explicit FIFO' || chr(10) ||
       '  -- consumption rows, so trg_auto_cogs_on_sale must PRICE only, not deplete.' || chr(10) ||
       '  IF p_fifo_consumptions IS NOT NULL AND jsonb_typeof(p_fifo_consumptions) = ''array''' || chr(10) ||
       '     AND jsonb_array_length(p_fifo_consumptions) > 0 THEN' || chr(10) ||
       '    PERFORM set_config(''app.fifo_payload_present'', ''true'', true);' || chr(10) ||
       '  END IF;';

  EXECUTE replace(d, a, r);
  RAISE NOTICE 'post_accounting_event patched';
END $patch$;
