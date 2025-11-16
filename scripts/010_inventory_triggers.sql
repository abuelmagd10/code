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