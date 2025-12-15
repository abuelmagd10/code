-- ============================================================
-- INVENTORY TRIGGERS – TIGHTLY COUPLED TO CANONICAL PATTERN
-- ============================================================
-- This file MUST remain consistent with the approved pattern
-- documented in docs/ACCOUNTING_PATTERN_SALES_PURCHASES.md:
-- - Sales invoices:
--   * Draft: no inventory_transactions.
--   * Sent: stock only via transaction_type = 'sale' (no accounting).
--   * Paid/Partially Paid: NO extra stock movement at payment time.
-- - Purchase bills:
--   * Sent/Received: stock only via transaction_type = 'purchase'.
-- - Returns:
--   * Sales returns: 'sale_return' only for returned quantities.
--   * Purchase returns: 'purchase_return' to take stock out.
-- Any change to transaction_type semantics here that violates that
-- pattern is a BUG, not a new requirement.
-- ============================================================
-- Functions and triggers to auto-link inventory transactions to journal entries
-- and cleanup on journal entry deletion

CREATE OR REPLACE FUNCTION auto_link_inventory_to_journal()
RETURNS trigger AS $$
DECLARE
  je_id UUID;
BEGIN
  -- If journal_entry_id already provided, keep it
  IF NEW.journal_entry_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Ensure we have a reference_id to match
  IF NEW.reference_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Resolve journal entry based on transaction_type
  IF NEW.transaction_type = 'sale' THEN
    SELECT id INTO je_id FROM journal_entries
    WHERE company_id = NEW.company_id AND reference_type = 'invoice_cogs' AND reference_id = NEW.reference_id
    LIMIT 1;
  ELSIF NEW.transaction_type = 'sale_reversal' THEN
    SELECT id INTO je_id FROM journal_entries
    WHERE company_id = NEW.company_id AND reference_type = 'invoice_cogs_reversal' AND reference_id = NEW.reference_id
    LIMIT 1;
  ELSIF NEW.transaction_type = 'purchase' THEN
    SELECT id INTO je_id FROM journal_entries
    WHERE company_id = NEW.company_id AND reference_type = 'bill' AND reference_id = NEW.reference_id
    LIMIT 1;
  ELSIF NEW.transaction_type = 'purchase_reversal' THEN
    SELECT id INTO je_id FROM journal_entries
    WHERE company_id = NEW.company_id AND reference_type = 'bill_reversal' AND reference_id = NEW.reference_id
    LIMIT 1;
  ELSE
    je_id := NULL;
  END IF;

  IF je_id IS NOT NULL THEN
    NEW.journal_entry_id := je_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_inventory_autolink ON inventory_transactions;
CREATE TRIGGER trg_inventory_autolink
BEFORE INSERT OR UPDATE ON inventory_transactions
FOR EACH ROW EXECUTE FUNCTION auto_link_inventory_to_journal();

-- Cleanup trigger: delete inventory transactions when the linked journal entry is deleted
CREATE OR REPLACE FUNCTION cleanup_inventory_on_journal_delete()
RETURNS trigger AS $$
BEGIN
  DELETE FROM inventory_transactions WHERE journal_entry_id = OLD.id;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_cleanup_inventory_on_journal_delete ON journal_entries;
CREATE TRIGGER trg_cleanup_inventory_on_journal_delete
AFTER DELETE ON journal_entries
FOR EACH ROW EXECUTE FUNCTION cleanup_inventory_on_journal_delete();

-- Apply inventory transactions to product quantities automatically
-- NOTE: Services (item_type = 'service') are excluded from inventory tracking
CREATE OR REPLACE FUNCTION apply_inventory_to_product_qty()
RETURNS trigger AS $$
DECLARE
  prod_item_type TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.product_id IS NULL THEN
      RETURN NEW;
    END IF;
    -- Check if product is a service (skip inventory for services)
    SELECT item_type INTO prod_item_type FROM products WHERE id = NEW.product_id;
    IF prod_item_type = 'service' THEN
      RETURN NEW;
    END IF;
    UPDATE products
      SET quantity_on_hand = COALESCE(quantity_on_hand, 0) + COALESCE(NEW.quantity_change, 0)
      WHERE id = NEW.product_id;
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    -- If product changed, revert old then apply new; else apply the delta
    IF NEW.product_id IS DISTINCT FROM OLD.product_id THEN
      IF OLD.product_id IS NOT NULL THEN
        SELECT item_type INTO prod_item_type FROM products WHERE id = OLD.product_id;
        IF prod_item_type IS NULL OR prod_item_type != 'service' THEN
          UPDATE products
            SET quantity_on_hand = COALESCE(quantity_on_hand, 0) - COALESCE(OLD.quantity_change, 0)
            WHERE id = OLD.product_id;
        END IF;
      END IF;
      IF NEW.product_id IS NOT NULL THEN
        SELECT item_type INTO prod_item_type FROM products WHERE id = NEW.product_id;
        IF prod_item_type IS NULL OR prod_item_type != 'service' THEN
          UPDATE products
            SET quantity_on_hand = COALESCE(quantity_on_hand, 0) + COALESCE(NEW.quantity_change, 0)
            WHERE id = NEW.product_id;
        END IF;
      END IF;
    ELSE
      SELECT item_type INTO prod_item_type FROM products WHERE id = NEW.product_id;
      IF prod_item_type IS NULL OR prod_item_type != 'service' THEN
        UPDATE products
          SET quantity_on_hand = COALESCE(quantity_on_hand, 0) + (COALESCE(NEW.quantity_change, 0) - COALESCE(OLD.quantity_change, 0))
          WHERE id = NEW.product_id;
      END IF;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.product_id IS NULL THEN
      RETURN NULL;
    END IF;
    SELECT item_type INTO prod_item_type FROM products WHERE id = OLD.product_id;
    IF prod_item_type = 'service' THEN
      RETURN NULL;
    END IF;
    UPDATE products
      SET quantity_on_hand = COALESCE(quantity_on_hand, 0) - COALESCE(OLD.quantity_change, 0)
      WHERE id = OLD.product_id;
    RETURN NULL;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_apply_inventory_insert ON inventory_transactions;
CREATE TRIGGER trg_apply_inventory_insert
AFTER INSERT ON inventory_transactions
FOR EACH ROW EXECUTE FUNCTION apply_inventory_to_product_qty();

DROP TRIGGER IF EXISTS trg_apply_inventory_update ON inventory_transactions;
CREATE TRIGGER trg_apply_inventory_update
AFTER UPDATE ON inventory_transactions
FOR EACH ROW EXECUTE FUNCTION apply_inventory_to_product_qty();

DROP TRIGGER IF EXISTS trg_apply_inventory_delete ON inventory_transactions;
CREATE TRIGGER trg_apply_inventory_delete
AFTER DELETE ON inventory_transactions
FOR EACH ROW EXECUTE FUNCTION apply_inventory_to_product_qty();

-- ================================
-- Auto-recompute account balances on journal changes
-- ================================

-- Helper: recompute snapshots in account_balances up to a target date
CREATE OR REPLACE FUNCTION recompute_account_balances_for_date(target_company UUID, target_date DATE)
RETURNS void AS $$
BEGIN
  -- Remove existing snapshot for the date to avoid duplicates
  DELETE FROM account_balances WHERE company_id = target_company AND balance_date = target_date;

  -- Insert fresh aggregates up to the target date
  INSERT INTO account_balances (company_id, account_id, balance_date, debit_balance, credit_balance)
  SELECT je.company_id, l.account_id, target_date,
         COALESCE(SUM(l.debit_amount), 0) AS debit_balance,
         COALESCE(SUM(l.credit_amount), 0) AS credit_balance
  FROM journal_entry_lines l
  INNER JOIN journal_entries je ON je.id = l.journal_entry_id
  WHERE je.company_id = target_company AND je.entry_date <= target_date
  GROUP BY je.company_id, l.account_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger function: recompute when a journal entry is deleted
CREATE OR REPLACE FUNCTION recompute_on_journal_delete()
RETURNS trigger AS $$
DECLARE
  tgt_company UUID := OLD.company_id;
  tgt_date DATE := OLD.entry_date;
BEGIN
  PERFORM recompute_account_balances_for_date(tgt_company, tgt_date);
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_recompute_on_journal_delete ON journal_entries;
CREATE TRIGGER trg_recompute_on_journal_delete
AFTER DELETE ON journal_entries
FOR EACH ROW EXECUTE FUNCTION recompute_on_journal_delete();

-- Trigger function: recompute when a journal line changes (insert/update/delete)
CREATE OR REPLACE FUNCTION recompute_on_line_change()
RETURNS trigger AS $$
DECLARE
  comp_id UUID;
  entry_dt DATE;
  je_id UUID;
BEGIN
  IF TG_OP = 'INSERT' THEN
    je_id := NEW.journal_entry_id;
  ELSIF TG_OP = 'UPDATE' THEN
    je_id := COALESCE(NEW.journal_entry_id, OLD.journal_entry_id);
  ELSE
    je_id := OLD.journal_entry_id;
  END IF;

  SELECT company_id, entry_date INTO comp_id, entry_dt FROM journal_entries WHERE id = je_id;
  IF comp_id IS NULL OR entry_dt IS NULL THEN
    RETURN NULL;
  END IF;

  PERFORM recompute_account_balances_for_date(comp_id, entry_dt);
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_recompute_on_line_insert ON journal_entry_lines;
CREATE TRIGGER trg_recompute_on_line_insert
AFTER INSERT ON journal_entry_lines
FOR EACH ROW EXECUTE FUNCTION recompute_on_line_change();

DROP TRIGGER IF EXISTS trg_recompute_on_line_update ON journal_entry_lines;
CREATE TRIGGER trg_recompute_on_line_update
AFTER UPDATE ON journal_entry_lines
FOR EACH ROW EXECUTE FUNCTION recompute_on_line_change();

DROP TRIGGER IF EXISTS trg_recompute_on_line_delete ON journal_entry_lines;
CREATE TRIGGER trg_recompute_on_line_delete
AFTER DELETE ON journal_entry_lines
FOR EACH ROW EXECUTE FUNCTION recompute_on_line_change();
