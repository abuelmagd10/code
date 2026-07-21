-- v3.74.781 — one owner for the cost side of a sales return, and it works.
--
-- FOUR DEFECTS, ALL IN THE LIVE PATH, NONE OF THEM VISIBLE YET
-- ----------------------------------------------------------------------------
-- No sales return has ever completed in this system (sales_returns is empty),
-- so none of this has done damage. The first return would have hit all four.
--
-- 1. THE FIFO LOOKUP COULD NEVER MATCH, SO COGS WAS REVERSED AT CARD COST.
--
--    The trigger asked:
--        restore_fifo_lots_on_return('invoice', NEW.reference_id, ...)
--    but for a return, inventory_transactions.reference_id is the SALES RETURN
--    id, not the invoice id (lib/sales-returns.ts sets reference_type
--    'sales_return', reference_id salesReturnId). The consumptions it needed are
--    recorded against the INVOICE. So the lookup returned zero rows, every time,
--    v_fifo_restored came back 0, and the code fell through to:
--
--        v_cogs_reversal_amount := quantity * products.cost_price
--
--    The FIFO branch was unreachable. Reversing cost of goods at the product
--    card price is the same defect that removed four functions in v3.74.726 and
--    v3.74.759. The fallback is meant for legacy stock with no FIFO history; it
--    had quietly become the only path.
--
--    Fixed by resolving the invoice from the return before asking.
--
-- 2. THE LOTS WERE RESTORED TWICE.
--
--    restore_fifo_lots_on_return already puts the returned units back, correctly
--    and partial-safe. Separately, lib/sales-returns.ts built a full reversal of
--    EVERY consumption on the invoice — all products, whole quantity, ignoring
--    what was actually returned — and post_accounting_event applied it on top.
--
--    Once defect 1 is fixed and the database restore starts working, that second
--    restoration becomes a live over-count. The TS side is removed in the same
--    release for exactly that reason; fixing either alone would be worse than
--    fixing neither. The database owns this now.
--
-- 3. THE SUB-LEDGER AND THE GL WERE COMPUTED FROM DIFFERENT NUMBERS.
--
--    The GL reversal came from the trigger. The cogs_transactions rows came from
--    lib/sales-returns.ts pro-rating the original by qtyToReturn/quantity. Two
--    independent calculations of one figure, guaranteed to drift.
--
--    The trigger now writes the cogs_transactions row itself, from the exact
--    cost the lots gave back. They cannot disagree, because there is only one
--    number.
--
-- 4. ic_cogs_balance COULD NOT SEE RETURNS AT ALL.
--
--    It reconciles cogs_transactions against journal entries whose
--    reference_type is in ('invoice_cogs','invoice_cogs_reversal',
--    'sale_return_cogs') — but this trigger wrote 'cogs_return'. The name was
--    never in the list, so return reversals were silently outside the
--    reconciliation. Renamed to 'sale_return_cogs'.
--
--    Checked before renaming: 'cogs_return' appears in no app code, no other
--    database function, and zero journal_entries rows. Nothing to migrate.
--
-- 5. THE TRIGGER READ A COLUMN THAT DOES NOT EXIST.
--
--    It used COALESCE(NEW.transaction_date, CURRENT_DATE), but
--    inventory_transactions has no transaction_date column — it has created_at.
--    In PL/pgSQL that raises at execution time, so the trigger would have failed
--    the moment it was first reached. It never was, because defect 0 below
--    stopped every return before it got that far. Two blockers stacked.
--
--    Found by the rehearsal, not by reading: this defect was faithfully copied
--    into the first draft of this very migration and only surfaced when the
--    test actually inserted a row.
--
-- AND ONE BEHAVIOUR CHANGE, DELIBERATE
-- ----------------------------------------------------------------------------
-- The journal insert was wrapped in EXCEPTION WHEN OTHERS ... RAISE WARNING,
-- while the lot restore ran before it. A failing journal therefore left the
-- stock and lots restored with no cost reversal in the ledger, and said nothing
-- louder than a warning. It now re-raises: the whole return rolls back. A return
-- that cannot post its cost reversal must not be allowed to complete.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.auto_reverse_cogs_on_sale_return()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
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
  v_invoice_id           UUID;
  v_qty                  NUMERIC;
  v_used_fallback        BOOLEAN := false;
BEGIN
  IF NEW.transaction_type != 'sale_return' THEN
    RETURN NEW;
  END IF;

  SELECT item_type INTO v_product_item_type FROM products WHERE id = NEW.product_id;
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
    SELECT w.company_id INTO v_company_id FROM warehouses w WHERE w.id = NEW.warehouse_id LIMIT 1;
  END IF;
  IF v_company_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- v3.74.702 — this row's own link is the re-entry guard.
  IF NEW.journal_entry_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT id INTO v_inventory_account_id FROM chart_of_accounts
   WHERE company_id = v_company_id AND is_active = true AND sub_type = 'inventory' LIMIT 1;
  SELECT id INTO v_cogs_account_id FROM chart_of_accounts
   WHERE company_id = v_company_id AND is_active = true
     AND sub_type IN ('cost_of_goods_sold','cogs') LIMIT 1;

  IF v_inventory_account_id IS NULL OR v_cogs_account_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_qty := ABS(COALESCE(NEW.quantity_change, 0));
  IF v_qty <= 0 THEN
    RETURN NEW;
  END IF;

  -- ---- defect 1: ask about the INVOICE, which is where the consumption lives.
  -- NEW.reference_id is the sales_return id. The lots were consumed under the
  -- invoice. Resolve one from the other instead of passing the wrong key and
  -- silently getting zero back.
  IF NEW.reference_type = 'sales_return' THEN
    SELECT sr.invoice_id INTO v_invoice_id FROM sales_returns sr WHERE sr.id = NEW.reference_id;
  ELSE
    v_invoice_id := NEW.reference_id;
  END IF;

  IF v_invoice_id IS NOT NULL THEN
    v_fifo_restored := public.restore_fifo_lots_on_return(
      'invoice', v_invoice_id, NEW.product_id, v_qty
    );
  END IF;

  IF COALESCE(v_fifo_restored, 0) > 0 THEN
    v_cogs_reversal_amount := v_fifo_restored;
  ELSE
    -- Genuine legacy stock: no FIFO history to give back. Recorded on the row so
    -- "we fell back to the card price" is visible rather than assumed.
    v_cogs_reversal_amount := v_qty * COALESCE(v_product_cost, 0);
    v_used_fallback := true;
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
      -- defect 4: the name ic_cogs_balance actually reconciles.
      'sale_return_cogs',
      COALESCE(NEW.reference_id, NEW.id),
      COALESCE(NEW.created_at::date, CURRENT_DATE),
      'عكس تكلفة مرتجع مبيعات',
      'draft'
    ) RETURNING id INTO v_journal_entry_id;

    INSERT INTO journal_entry_lines (
      journal_entry_id, account_id, debit_amount, credit_amount, description
    ) VALUES (
      v_journal_entry_id, v_inventory_account_id,
      v_cogs_reversal_amount, 0, 'عكس المخزون - مرتجع'
    );

    INSERT INTO journal_entry_lines (
      journal_entry_id, account_id, debit_amount, credit_amount, description
    ) VALUES (
      v_journal_entry_id, v_cogs_account_id,
      0, v_cogs_reversal_amount, 'عكس تكلفة البضاعة'
    );

    UPDATE journal_entries SET status = 'posted' WHERE id = v_journal_entry_id;

    -- ---- defect 3: the sub-ledger row is written HERE, from the same number
    -- that just went to the ledger, so the two cannot be computed differently.
    INSERT INTO cogs_transactions (
      company_id, branch_id, cost_center_id, warehouse_id, product_id,
      source_type, source_id, quantity, unit_cost, total_cost,
      transaction_date, notes
    ) VALUES (
      v_company_id, v_branch_id, NEW.cost_center_id, NEW.warehouse_id, NEW.product_id,
      -- Magnitudes, not signed values: cogs_transactions has CHECK constraints
      -- requiring quantity > 0 and total_cost >= 0. The table stores the size of
      -- the movement and source_type carries its direction. A first draft wrote
      -- negatives here and the constraint rejected it - correctly. Changing a
      -- check constraint on a financial table to fit my choice would have been
      -- the wrong way round.
      'return', NEW.reference_id,
      v_qty,
      ROUND(v_cogs_reversal_amount / NULLIF(v_qty, 0), 6),
      v_cogs_reversal_amount,
      COALESCE(NEW.created_at::date, CURRENT_DATE),
      CASE WHEN v_used_fallback
           THEN 'عكس تكلفة مرتجع — لا يوجد تاريخ FIFO، استُخدم سعر البطاقة'
           ELSE 'عكس تكلفة مرتجع — بتكلفة الدفعات الأصلية' END
    );

    NEW.journal_entry_id := v_journal_entry_id;
  EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('app.allow_direct_post', 'false', true);
    -- Deliberate change: the lots have already been given back above. Warning
    -- and carrying on would leave stock restored with no cost reversal in the
    -- ledger, quietly. Re-raise so the entire return rolls back.
    RAISE EXCEPTION 'SALE_RETURN_COGS_FAILED: %', SQLERRM;
  END;

  PERFORM set_config('app.allow_direct_post', 'false', true);
  RETURN NEW;
END;
$fn$;

COMMENT ON FUNCTION public.auto_reverse_cogs_on_sale_return() IS
  'v3.74.781 — reverses COGS for a sales return at the original FIFO cost, writes '
  'the matching cogs_transactions row from the same figure, and rolls the return '
  'back if the reversal cannot post.';
