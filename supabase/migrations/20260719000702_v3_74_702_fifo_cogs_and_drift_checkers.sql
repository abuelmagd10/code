-- v3.74.702 — (A) integrity checkers must ignore soft-deleted journals,
--             (B) COGS is taken from FIFO lots instead of products.cost_price.
-- ------------------------------------------------------------------
-- The dashboard reported 4 integrity drifts. Investigation split them in two:
--
-- (A) THREE WERE FALSE POSITIVES. All four ic_* checkers joined journal_entries
--     on status='posted' only, never excluding is_deleted. A reverted/voided
--     document keeps its old journal flagged is_deleted, so the checkers counted
--     it alongside its replacement and reported: "duplicate journals" (high),
--     an AP mismatch equal to the dead journal, and a GL-vs-FIFO gap. This would
--     fire for ANY voided document, not just the case that surfaced it.
--     ic_inventory_valuation_drift additionally summed soft-deleted stock moves.
--
-- (B) ONE WAS REAL. products.cost_price is only a DEFAULT that pre-fills the
--     price on a purchase invoice (owner's design: the product card is the
--     source, the invoice inherits). But when a product is created without a
--     purchase price, the user types it on the invoice and it is never written
--     back — the card stays 0. COGS was computed as qty * products.cost_price,
--     so a product bought at 20.00 with a 0 card was sold at ZERO cost,
--     inflating profit. The FIFO lots already store the real price paid per
--     batch (verified: the same product had a lot at exactly 20.00) but nothing
--     used them: every COGS journal in the database came from this trigger.
--
--     Owner's decision: adopt FIFO for COGS. consume_fifo_lots returns the true
--     batch cost AND depletes the lot (recording fifo_lot_consumptions), so the
--     next sale draws from the next batch. Falls back to products.cost_price
--     when a product has no lots yet, so COGS is never silently zeroed.
--
-- (C) RETURNS — both directions, partial and full.
--     Sale returns reversed COGS at products.cost_price and never gave the units
--     back to their FIFO batches. Purchase returns did not touch FIFO at all, so
--     goods shipped back to the supplier stayed in the batches as phantom stock
--     (2 such returns already exist in the database). Both are aligned here.
--
--     reverse_fifo_consumption() could not be reused: it deletes EVERY
--     consumption row for a reference, so it only ever served a 100% return.
-- ------------------------------------------------------------------

-- (A1) duplicate journals
DO $do$
DECLARE d text;
BEGIN
  SELECT pg_get_functiondef('public.ic_duplicate_journals'::regproc) INTO d;
  IF d NOT LIKE '%v3.74.702%' THEN
    d := replace(d,
      $a$      AND status = 'posted'$a$,
      $a$      AND status = 'posted'
      -- v3.74.702 — ignore soft-deleted journals.
      AND COALESCE(is_deleted, false) = false$a$);
    EXECUTE d;
  END IF;
END $do$;

-- (A2) AP balance
DO $do$
DECLARE d text;
BEGIN
  SELECT pg_get_functiondef('public.ic_ap_balance'::regproc) INTO d;
  IF d NOT LIKE '%v3.74.702%' THEN
    d := replace(d,
      $a$  JOIN journal_entries je ON je.id=jel.journal_entry_id AND je.status='posted'$a$,
      $a$  -- v3.74.702 — soft-deleted journals must not count toward the AP ledger.
  JOIN journal_entries je ON je.id=jel.journal_entry_id AND je.status='posted'
                         AND COALESCE(je.is_deleted, false) = false$a$);
    EXECUTE d;
  END IF;
END $do$;

-- (A3) inventory valuation drift (journals + soft-deleted stock moves)
DO $do$
DECLARE d text;
BEGIN
  SELECT pg_get_functiondef('public.ic_inventory_valuation_drift'::regproc) INTO d;
  IF d NOT LIKE '%v3.74.702%' THEN
    d := replace(d,
      $a$  JOIN journal_entries je ON je.id=jel.journal_entry_id AND je.status='posted'$a$,
      $a$  -- v3.74.702 — exclude soft-deleted journals.
  JOIN journal_entries je ON je.id=jel.journal_entry_id AND je.status='posted'
                         AND COALESCE(je.is_deleted, false) = false$a$);
    d := replace(d,
      $a$    WHERE it.company_id = p_company_id
      AND COALESCE(p.item_type,'goods') <> 'service'$a$,
      $a$    WHERE it.company_id = p_company_id
      AND COALESCE(it.is_deleted, false) = false
      AND COALESCE(p.item_type,'goods') <> 'service'$a$);
    EXECUTE d;
  END IF;
END $do$;

-- (A4) GL vs FIFO
DO $do$
DECLARE d text;
BEGIN
  SELECT pg_get_functiondef('public.ic_inventory_gl_vs_fifo'::regproc) INTO d;
  IF d NOT LIKE '%v3.74.702%' THEN
    d := replace(d,
      $a$  JOIN journal_entries je ON je.id = jel.journal_entry_id AND je.status='posted'$a$,
      $a$  -- v3.74.702 — exclude soft-deleted journals.
  JOIN journal_entries je ON je.id = jel.journal_entry_id AND je.status='posted'
                         AND COALESCE(je.is_deleted, false) = false$a$);
    EXECUTE d;
  END IF;
END $do$;

-- (B) COGS from FIFO lots.
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

  -- v3.74.702 — COGS from the FIFO lots (what was actually paid per batch)
  -- instead of products.cost_price. consume_fifo_lots also depletes the batch
  -- and records the consumption, so the next sale uses the following batch.
  v_fifo_cogs := public.consume_fifo_lots(
    v_company_id, NEW.product_id, ABS(NEW.quantity_change),
    'sale', 'invoice', NEW.reference_id,
    COALESCE(NEW.created_at::date, CURRENT_DATE)
  );

  IF COALESCE(v_fifo_cogs, 0) > 0 THEN
    v_cogs_amount := v_fifo_cogs;
  ELSE
    -- Fallback for legacy stock with no FIFO lot: keep the previous behaviour
    -- so COGS is never silently zeroed.
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

-- Data fix: a product purchased at 20.00 whose card still carried 0 (the price
-- was typed on the invoice and never written back). Only fills cards that are
-- still empty; never overwrites a price the owner set deliberately.
UPDATE public.products p
   SET cost_price = sub.avg_unit_price
  FROM (
    SELECT bi.product_id,
           ROUND(SUM(bi.quantity * bi.unit_price) / NULLIF(SUM(bi.quantity), 0), 2) AS avg_unit_price
      FROM public.bill_items bi
      JOIN public.bills b ON b.id = bi.bill_id
     WHERE COALESCE(b.status,'') = 'received'
       AND bi.unit_price > 0
     GROUP BY bi.product_id
  ) sub
 WHERE p.id = sub.product_id
   AND COALESCE(p.cost_price, 0) = 0;

-- ------------------------------------------------------------------
-- (C1) SALE returns — put the units back in the exact batches they came from.
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.restore_fifo_lots_on_return(
  p_reference_type text,
  p_reference_id   uuid,
  p_product_id     uuid,
  p_quantity       numeric
) RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_catalog'
AS $function$
-- v3.74.702 — partial-safe FIFO restore for SALE returns.
-- Gives back exactly p_quantity units at the very cost each batch was taken at,
-- and returns that cost so the caller reverses COGS by the same amount.
-- Order is the mirror image of FIFO: the LAST batch consumed is the FIRST put
-- back. It must be keyed on the batch date, not on the consumption row's
-- created_at — rows written inside one statement share an identical timestamp
-- and would otherwise unwind in arbitrary order (caught in testing: a partial
-- return of 3 units reversed 15.00 instead of the correct 21.00).
DECLARE
  v_c         RECORD;
  v_remaining NUMERIC := ABS(COALESCE(p_quantity, 0));
  v_take      NUMERIC;
  v_cost      NUMERIC := 0;
BEGIN
  IF v_remaining <= 0 THEN RETURN 0; END IF;

  FOR v_c IN
    SELECT c.id, c.lot_id, c.quantity_consumed, c.unit_cost
    FROM fifo_lot_consumptions c
    JOIN fifo_cost_lots l ON l.id = c.lot_id
    WHERE c.reference_type = p_reference_type
      AND c.reference_id   = p_reference_id
      AND c.product_id     = p_product_id
      AND c.quantity_consumed > 0
    ORDER BY l.lot_date DESC, l.created_at DESC, c.created_at DESC
    FOR UPDATE OF c
  LOOP
    EXIT WHEN v_remaining <= 0;
    v_take := LEAST(v_c.quantity_consumed, v_remaining);

    UPDATE fifo_cost_lots
       SET remaining_quantity = remaining_quantity + v_take,
           updated_at = CURRENT_TIMESTAMP
     WHERE id = v_c.lot_id;

    IF v_take >= v_c.quantity_consumed THEN
      DELETE FROM fifo_lot_consumptions WHERE id = v_c.id;
    ELSE
      UPDATE fifo_lot_consumptions
         SET quantity_consumed = quantity_consumed - v_take,
             total_cost        = ROUND((quantity_consumed - v_take) * unit_cost, 4)
       WHERE id = v_c.id;
    END IF;

    v_cost      := v_cost + (v_take * v_c.unit_cost);
    v_remaining := v_remaining - v_take;
  END LOOP;

  IF v_remaining > 0 THEN
    RAISE WARNING 'Sale return exceeds recorded FIFO consumption for product % (% units unmatched)',
      p_product_id, v_remaining;
  END IF;

  RETURN v_cost;
END;
$function$;

-- ------------------------------------------------------------------
-- (C2) PURCHASE returns — take the units back out of the batches.
-- ------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.reduce_fifo_lots_on_purchase_return(uuid, uuid, numeric, uuid);

CREATE OR REPLACE FUNCTION public.reduce_fifo_lots_on_purchase_return(
  p_company_id uuid,
  p_product_id uuid,
  p_quantity   numeric,
  p_bill_id    uuid DEFAULT NULL,
  p_reference_id uuid DEFAULT NULL
) RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_catalog'
AS $function$
-- v3.74.702 — goods sent BACK to the supplier must leave the FIFO batches too.
-- Nothing did this before, so a purchase return kept phantom batch quantity and
-- the next sale would have drawn cost from stock that no longer exists.
-- Preference order: the batch created by the very bill being returned, then the
-- newest batches (a return is always the most recent receipt in practice).
-- Only remaining_quantity is touched — units already sold cannot be un-received.
-- Every reduction is written to fifo_lot_consumptions as consumption_type
-- 'purchase_return'. That is not decoration: ic_fifo_lot_integrity asserts
-- remaining = original - SUM(consumed), so silently lowering remaining would
-- raise a false HIGH drift alert on the dashboard.
DECLARE
  v_lot       RECORD;
  v_remaining NUMERIC := ABS(COALESCE(p_quantity, 0));
  v_take      NUMERIC;
  v_cost      NUMERIC := 0;
BEGIN
  IF v_remaining <= 0 THEN RETURN 0; END IF;

  FOR v_lot IN
    SELECT id, remaining_quantity, unit_cost
    FROM fifo_cost_lots
    WHERE company_id = p_company_id
      AND product_id = p_product_id
      AND remaining_quantity > 0
    ORDER BY
      CASE WHEN p_bill_id IS NOT NULL AND reference_id = p_bill_id THEN 0 ELSE 1 END,
      lot_date DESC, created_at DESC
    FOR UPDATE
  LOOP
    EXIT WHEN v_remaining <= 0;
    v_take := LEAST(v_lot.remaining_quantity, v_remaining);

    UPDATE fifo_cost_lots
       SET remaining_quantity = remaining_quantity - v_take,
           updated_at = CURRENT_TIMESTAMP
     WHERE id = v_lot.id;

    INSERT INTO fifo_lot_consumptions (
      company_id, lot_id, product_id, consumption_type,
      reference_type, reference_id, quantity_consumed,
      unit_cost, total_cost, consumption_date, notes
    ) VALUES (
      p_company_id, v_lot.id, p_product_id, 'purchase_return',
      'purchase_return', p_reference_id, v_take,
      v_lot.unit_cost, ROUND(v_take * v_lot.unit_cost, 4), CURRENT_DATE,
      'مرتجع مشتريات - خصم من الدفعة'
    );

    v_cost      := v_cost + (v_take * v_lot.unit_cost);
    v_remaining := v_remaining - v_take;
  END LOOP;

  IF v_remaining > 0 THEN
    RAISE WARNING 'Purchase return exceeds available FIFO batch quantity for product % (% units unmatched)',
      p_product_id, v_remaining;
  END IF;

  RETURN v_cost;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_fifo_on_purchase_return()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_catalog'
AS $function$
-- v3.74.702 — hangs off the inventory movement itself rather than off any one
-- procedure, so it covers every purchase-return path (atomic / multi-warehouse
-- / delivery confirmation) including any added later.
DECLARE
  v_company_id UUID;
  v_bill_id    UUID;
BEGIN
  IF NEW.transaction_type <> 'purchase_return' THEN RETURN NEW; END IF;
  IF COALESCE(NEW.is_deleted, false) THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM products WHERE id = NEW.product_id AND item_type = 'service') THEN
    RETURN NEW;
  END IF;

  v_company_id := NEW.company_id;
  IF v_company_id IS NULL THEN
    SELECT company_id INTO v_company_id FROM warehouses WHERE id = NEW.warehouse_id LIMIT 1;
  END IF;
  IF v_company_id IS NULL THEN RETURN NEW; END IF;

  SELECT bill_id INTO v_bill_id FROM purchase_returns WHERE id = NEW.reference_id;

  PERFORM public.reduce_fifo_lots_on_purchase_return(
    v_company_id, NEW.product_id, ABS(COALESCE(NEW.quantity_change, 0)),
    v_bill_id, NEW.reference_id
  );

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_fifo_on_purchase_return ON public.inventory_transactions;
CREATE TRIGGER trg_fifo_on_purchase_return
AFTER INSERT ON public.inventory_transactions
FOR EACH ROW EXECUTE FUNCTION public.fn_fifo_on_purchase_return();

-- ------------------------------------------------------------------
-- (C3) Sale-return COGS reversal now uses the restored FIFO cost, and the
--      duplicate guard is fixed so a SECOND partial return still posts.
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.auto_reverse_cogs_on_sale_return()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_company_id           UUID;
  v_product_cost         NUMERIC;
  v_cogs_reversal_amount NUMERIC;
  v_fifo_restored        NUMERIC;
  v_inventory_account_id UUID;
  v_cogs_account_id      UUID;
  v_journal_entry_id     UUID;
  v_product_item_type    TEXT;
  v_branch_id            UUID;
BEGIN
  IF NEW.transaction_type != 'sale_return' THEN
    RETURN NEW;
  END IF;

  SELECT item_type INTO v_product_item_type
  FROM products WHERE id = NEW.product_id;
  IF v_product_item_type = 'service' THEN
    RETURN NEW;
  END IF;

  SELECT it.company_id, p.cost_price
  INTO v_company_id, v_product_cost
  FROM inventory_transactions it
  JOIN products p ON p.id = NEW.product_id
  WHERE it.id = NEW.id
  LIMIT 1;

  IF v_company_id IS NULL THEN
    SELECT w.company_id INTO v_company_id
    FROM warehouses w WHERE w.id = NEW.warehouse_id LIMIT 1;
  END IF;

  IF v_company_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- v3.74.702 — the old guard skipped the reversal whenever ANY cogs_return
  -- journal existed for the invoice, so a SECOND partial return silently posted
  -- no reversal at all. Each return movement now carries its own journal, and
  -- the guard is this row's own link (which also stops re-firing on UPDATE).
  IF NEW.journal_entry_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT id INTO v_inventory_account_id FROM chart_of_accounts
  WHERE company_id = v_company_id AND is_active = true
    AND sub_type = 'inventory' LIMIT 1;

  SELECT id INTO v_cogs_account_id FROM chart_of_accounts
  WHERE company_id = v_company_id AND is_active = true
    AND sub_type IN ('cost_of_goods_sold','cogs') LIMIT 1;

  IF v_inventory_account_id IS NULL OR v_cogs_account_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- v3.74.702 — put the returned units back into the exact FIFO batches they
  -- were taken from and reverse COGS by that same original cost. Works for a
  -- partial return as well as a full one. Falls back to the product card only
  -- when no FIFO consumption was recorded (legacy stock).
  v_fifo_restored := public.restore_fifo_lots_on_return(
    'invoice', NEW.reference_id, NEW.product_id, ABS(COALESCE(NEW.quantity_change, 0))
  );

  IF COALESCE(v_fifo_restored, 0) > 0 THEN
    v_cogs_reversal_amount := v_fifo_restored;
  ELSE
    v_cogs_reversal_amount := ABS(COALESCE(NEW.quantity_change, 0)) * COALESCE(v_product_cost, 0);
  END IF;

  IF v_cogs_reversal_amount <= 0 THEN
    RETURN NEW;
  END IF;

  v_branch_id := COALESCE(NEW.branch_id, NULL);
  IF v_branch_id IS NULL THEN
    SELECT id INTO v_branch_id FROM branches
    WHERE company_id = v_company_id AND is_active = true
    ORDER BY is_main DESC NULLS LAST LIMIT 1;
  END IF;

  PERFORM set_config('app.allow_direct_post', 'true', true);

  BEGIN
    INSERT INTO journal_entries (
      company_id, branch_id, reference_type, reference_id,
      entry_date, description, status
    ) VALUES (
      v_company_id, v_branch_id,
      'cogs_return',
      COALESCE(NEW.reference_id, NEW.id),
      COALESCE(NEW.transaction_date, CURRENT_DATE),
      'عكس تكلفة مرتجع مبيعات',
      'draft'
    ) RETURNING id INTO v_journal_entry_id;

    INSERT INTO journal_entry_lines (
      journal_entry_id, account_id, debit_amount, credit_amount, description
    ) VALUES (
      v_journal_entry_id, v_inventory_account_id,
      v_cogs_reversal_amount, 0,
      'عكس المخزون - مرتجع'
    );

    INSERT INTO journal_entry_lines (
      journal_entry_id, account_id, debit_amount, credit_amount, description
    ) VALUES (
      v_journal_entry_id, v_cogs_account_id,
      0, v_cogs_reversal_amount,
      'عكس تكلفة البضاعة'
    );

    UPDATE journal_entries SET status = 'posted' WHERE id = v_journal_entry_id;
    NEW.journal_entry_id := v_journal_entry_id;
  EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('app.allow_direct_post', 'false', true);
    RAISE WARNING 'COGS reversal JE failed: %', SQLERRM;
  END;

  PERFORM set_config('app.allow_direct_post', 'false', true);
  RETURN NEW;
END;
$function$;
