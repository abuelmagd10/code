-- v3.74.172 — Production WIP accounting.
--
-- Before this migration: production_order_issue_lines and
-- production_order_receipt_lines updated FIFO lots and
-- inventory_transactions but never wrote into journal_entries /
-- journal_entry_lines. GL 1140 drifted behind FIFO remaining value by
-- the unposted material cost of every receipt, and WIP (1145) stayed
-- empty. ic_inventory_gl_vs_fifo only flagged it when drift exceeded
-- the tolerance, but the underlying gap grew on every production cycle.
--
-- Fix:
--   - After-insert trigger on production_order_issue_lines posts a
--     paired line into a single JE per issue event:
--         Dr 1145 (WIP) / Cr 1140 (Inventory) = FIFO cost consumed
--     Cost is read from fifo_lot_consumptions rows tied to that line
--     (consumption_type = 'production_issue'). Falls back to
--     products.cost_price * issued_qty if the FIFO row isn't there yet.
--
--   - After-insert trigger on production_order_receipt_lines posts a
--     paired line into a single JE per receipt event:
--         Dr 1140 (Inventory) / Cr 1145 (WIP) = received_qty * unit_cost
--     Cost is read from the fifo_cost_lot the receipt line points at.
--
--   - _production_get_or_create_je is a small helper that returns the
--     event's JE if it already exists, or creates a fresh posted JE
--     and returns its id. This lets a multi-line event accumulate all
--     of its Dr/Cr pairs on the same JE.
--
-- Both triggers temporarily set app.allow_direct_post so the
-- enforce_je_integrity safety net allows the insert.
--
-- Applied to production via apply_migration; backfilled the one
-- pre-existing pair of (issue, receipt) events on company
-- 8ef6338c-1713-4202-98ac-863633b76526 with the same logic. After the
-- backfill, ic_ap_balance and ic_inventory_gl_vs_fifo both return zero
-- rows for the company.

CREATE OR REPLACE FUNCTION public._production_get_or_create_je(
  p_company_id uuid,
  p_branch_id uuid,
  p_cost_center_id uuid,
  p_reference_type text,
  p_reference_id uuid,
  p_entry_date date,
  p_description text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_je_id uuid;
BEGIN
  SELECT id INTO v_je_id
  FROM journal_entries
  WHERE company_id = p_company_id
    AND reference_type = p_reference_type
    AND reference_id = p_reference_id
  LIMIT 1;

  IF v_je_id IS NOT NULL THEN RETURN v_je_id; END IF;

  PERFORM set_config('app.allow_direct_post', 'true', true);
  INSERT INTO journal_entries (
    company_id, branch_id, cost_center_id,
    reference_type, reference_id,
    entry_date, description, status
  ) VALUES (
    p_company_id, p_branch_id, p_cost_center_id,
    p_reference_type, p_reference_id,
    p_entry_date, p_description, 'posted'
  ) RETURNING id INTO v_je_id;
  PERFORM set_config('app.allow_direct_post', 'false', true);
  RETURN v_je_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.post_production_issue_journal_entry()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_inventory_account uuid;
  v_wip_account uuid;
  v_cost numeric;
  v_je_id uuid;
  v_event RECORD;
BEGIN
  SELECT COALESCE(SUM(total_cost), 0)
  INTO v_cost
  FROM fifo_lot_consumptions
  WHERE company_id = NEW.company_id
    AND reference_id = NEW.id
    AND reference_type IN ('production_issue_line', 'production_issue');

  IF v_cost IS NULL OR v_cost <= 0 THEN
    SELECT COALESCE(p.cost_price, 0) * COALESCE(NEW.issued_qty, 0)
    INTO v_cost FROM products p WHERE p.id = NEW.product_id;
  END IF;

  IF v_cost IS NULL OR v_cost <= 0 THEN RETURN NEW; END IF;

  SELECT id INTO v_inventory_account FROM chart_of_accounts
   WHERE company_id = NEW.company_id AND sub_type = 'inventory' AND COALESCE(is_active, true) LIMIT 1;
  SELECT id INTO v_wip_account FROM chart_of_accounts
   WHERE company_id = NEW.company_id AND sub_type IN ('work_in_process', 'wip')
     AND COALESCE(is_active, true) LIMIT 1;
  IF v_inventory_account IS NULL OR v_wip_account IS NULL THEN RETURN NEW; END IF;

  SELECT id, posted_at, event_number INTO v_event
  FROM production_order_issue_events WHERE id = NEW.issue_event_id;

  v_je_id := public._production_get_or_create_je(
    NEW.company_id, NEW.branch_id, NEW.cost_center_id,
    'production_issue', NEW.issue_event_id,
    COALESCE(v_event.posted_at::date, CURRENT_DATE),
    'صرف إنتاج ' || COALESCE(v_event.event_number, NEW.issue_event_id::text)
  );

  PERFORM set_config('app.allow_direct_post', 'true', true);
  INSERT INTO journal_entry_lines (
    journal_entry_id, account_id, debit_amount, credit_amount,
    description, branch_id, cost_center_id
  ) VALUES (
    v_je_id, v_wip_account, v_cost, 0,
    'تكلفة خامات لإنتاج تحت التشغيل', NEW.branch_id, NEW.cost_center_id
  );
  INSERT INTO journal_entry_lines (
    journal_entry_id, account_id, debit_amount, credit_amount,
    description, branch_id, cost_center_id
  ) VALUES (
    v_je_id, v_inventory_account, 0, v_cost,
    'صرف خامات للإنتاج', NEW.branch_id, NEW.cost_center_id
  );
  PERFORM set_config('app.allow_direct_post', 'false', true);

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.post_production_receipt_journal_entry()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_inventory_account uuid;
  v_wip_account uuid;
  v_cost numeric;
  v_je_id uuid;
  v_event RECORD;
BEGIN
  SELECT (COALESCE(unit_cost, 0) * COALESCE(NEW.received_qty, 0))
  INTO v_cost
  FROM fifo_cost_lots WHERE id = NEW.fifo_cost_lot_id;

  IF v_cost IS NULL OR v_cost <= 0 THEN RETURN NEW; END IF;

  SELECT id INTO v_inventory_account FROM chart_of_accounts
   WHERE company_id = NEW.company_id AND sub_type = 'inventory' AND COALESCE(is_active, true) LIMIT 1;
  SELECT id INTO v_wip_account FROM chart_of_accounts
   WHERE company_id = NEW.company_id AND sub_type IN ('work_in_process', 'wip')
     AND COALESCE(is_active, true) LIMIT 1;
  IF v_inventory_account IS NULL OR v_wip_account IS NULL THEN RETURN NEW; END IF;

  SELECT id, posted_at, event_number INTO v_event
  FROM production_order_receipt_events WHERE id = NEW.receipt_event_id;

  v_je_id := public._production_get_or_create_je(
    NEW.company_id, NEW.branch_id, NEW.cost_center_id,
    'production_receipt', NEW.receipt_event_id,
    COALESCE(v_event.posted_at::date, CURRENT_DATE),
    'إنتاج تام ' || COALESCE(v_event.event_number, NEW.receipt_event_id::text)
  );

  PERFORM set_config('app.allow_direct_post', 'true', true);
  INSERT INTO journal_entry_lines (
    journal_entry_id, account_id, debit_amount, credit_amount,
    description, branch_id, cost_center_id
  ) VALUES (
    v_je_id, v_inventory_account, v_cost, 0,
    'استلام إنتاج تام في المخزون', NEW.branch_id, NEW.cost_center_id
  );
  INSERT INTO journal_entry_lines (
    journal_entry_id, account_id, debit_amount, credit_amount,
    description, branch_id, cost_center_id
  ) VALUES (
    v_je_id, v_wip_account, 0, v_cost,
    'إقفال تكلفة الإنتاج تحت التشغيل', NEW.branch_id, NEW.cost_center_id
  );
  PERFORM set_config('app.allow_direct_post', 'false', true);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_production_issue_post_je ON public.production_order_issue_lines;
CREATE TRIGGER trg_production_issue_post_je
AFTER INSERT ON public.production_order_issue_lines
FOR EACH ROW EXECUTE FUNCTION public.post_production_issue_journal_entry();

DROP TRIGGER IF EXISTS trg_production_receipt_post_je ON public.production_order_receipt_lines;
CREATE TRIGGER trg_production_receipt_post_je
AFTER INSERT ON public.production_order_receipt_lines
FOR EACH ROW EXECUTE FUNCTION public.post_production_receipt_journal_entry();

COMMENT ON FUNCTION public.post_production_issue_journal_entry() IS
  'v3.74.172: posts Dr WIP / Cr Inventory per issue line, aggregated per event.';
COMMENT ON FUNCTION public.post_production_receipt_journal_entry() IS
  'v3.74.172: posts Dr Inventory / Cr WIP per receipt line, aggregated per event.';
