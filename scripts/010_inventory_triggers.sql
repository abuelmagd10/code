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
CREATE OR REPLACE FUNCTION apply_inventory_to_product_qty()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.product_id IS NULL THEN
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
        UPDATE products
          SET quantity_on_hand = COALESCE(quantity_on_hand, 0) - COALESCE(OLD.quantity_change, 0)
          WHERE id = OLD.product_id;
      END IF;
      IF NEW.product_id IS NOT NULL THEN
        UPDATE products
          SET quantity_on_hand = COALESCE(quantity_on_hand, 0) + COALESCE(NEW.quantity_change, 0)
          WHERE id = NEW.product_id;
      END IF;
    ELSE
      UPDATE products
        SET quantity_on_hand = COALESCE(quantity_on_hand, 0) + (COALESCE(NEW.quantity_change, 0) - COALESCE(OLD.quantity_change, 0))
        WHERE id = NEW.product_id;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.product_id IS NULL THEN
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