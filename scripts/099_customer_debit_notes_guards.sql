-- =============================================
-- Customer Debit Notes - Database Guards & Constraints
-- إشعارات مدين العملاء - القيود والحماية
-- =============================================

-- 1️⃣ Unique Partial Index: Prevent duplicate debit notes for same invoice + reference
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_customer_debit_per_invoice_reference
ON customer_debit_notes(company_id, source_invoice_id, reference_type, reference_id)
WHERE status != 'cancelled' AND reference_id IS NOT NULL;

COMMENT ON INDEX idx_unique_customer_debit_per_invoice_reference IS 
'Prevents creating duplicate debit notes for the same invoice and reference';

-- 2️⃣ Check Constraint: Ensure valid amounts
ALTER TABLE customer_debit_notes
DROP CONSTRAINT IF EXISTS chk_customer_debit_valid_amounts;

ALTER TABLE customer_debit_notes
ADD CONSTRAINT chk_customer_debit_valid_amounts CHECK (
  total_amount = subtotal + tax_amount AND
  subtotal >= 0 AND
  tax_amount >= 0 AND
  total_amount > 0 AND
  applied_amount >= 0 AND
  applied_amount <= total_amount
);

COMMENT ON CONSTRAINT chk_customer_debit_valid_amounts ON customer_debit_notes IS
'Ensures debit note amounts are valid and consistent';

-- 3️⃣ Check Constraint: Ensure valid item amounts
ALTER TABLE customer_debit_note_items
DROP CONSTRAINT IF EXISTS chk_debit_item_valid_amounts;

ALTER TABLE customer_debit_note_items
ADD CONSTRAINT chk_debit_item_valid_amounts CHECK (
  quantity > 0 AND
  unit_price >= 0 AND
  line_total >= 0 AND
  tax_rate >= 0 AND
  tax_rate <= 100 AND
  line_total = quantity * unit_price
);

COMMENT ON CONSTRAINT chk_debit_item_valid_amounts ON customer_debit_note_items IS
'Ensures debit note item amounts are calculated correctly';

-- 4️⃣ Trigger: Prevent modification of posted debit notes
CREATE OR REPLACE FUNCTION prevent_customer_debit_note_modification()
RETURNS TRIGGER AS $$
BEGIN
  -- Prevent modification if journal entry exists
  IF OLD.journal_entry_id IS NOT NULL AND (
    NEW.total_amount != OLD.total_amount OR
    NEW.customer_id != OLD.customer_id OR
    NEW.source_invoice_id != OLD.source_invoice_id
  ) THEN
    RAISE EXCEPTION 'Cannot modify customer debit note % - it has a posted journal entry', 
      OLD.debit_note_number;
  END IF;
  
  -- Prevent modification if partially or fully applied
  IF OLD.applied_amount > 0 AND (
    NEW.total_amount < OLD.total_amount OR
    NEW.customer_id != OLD.customer_id
  ) THEN
    RAISE EXCEPTION 'Cannot modify customer debit note % - it has been applied (%.2f applied)', 
      OLD.debit_note_number, OLD.applied_amount;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_customer_debit_modification ON customer_debit_notes;
CREATE TRIGGER trg_prevent_customer_debit_modification
  BEFORE UPDATE ON customer_debit_notes
  FOR EACH ROW
  EXECUTE FUNCTION prevent_customer_debit_note_modification();

-- 5️⃣ Trigger: Prevent deletion of items from posted debit notes
CREATE OR REPLACE FUNCTION prevent_customer_debit_item_deletion()
RETURNS TRIGGER AS $$
DECLARE
  v_journal_entry_id UUID;
  v_debit_note_number VARCHAR(50);
BEGIN
  -- Check if parent debit note has journal entry
  SELECT journal_entry_id, debit_note_number
  INTO v_journal_entry_id, v_debit_note_number
  FROM customer_debit_notes
  WHERE id = OLD.customer_debit_note_id;
  
  IF v_journal_entry_id IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot delete item from customer debit note % - it has a posted journal entry', 
      v_debit_note_number;
  END IF;
  
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_customer_debit_item_deletion ON customer_debit_note_items;
CREATE TRIGGER trg_prevent_customer_debit_item_deletion
  BEFORE DELETE ON customer_debit_note_items
  FOR EACH ROW
  EXECUTE FUNCTION prevent_customer_debit_item_deletion();

-- 6️⃣ Trigger: Validate application amount
CREATE OR REPLACE FUNCTION validate_customer_debit_application()
RETURNS TRIGGER AS $$
DECLARE
  v_total_amount DECIMAL(15,2);
  v_current_applied DECIMAL(15,2);
  v_new_total DECIMAL(15,2);
BEGIN
  -- Get debit note total and current applied amount
  SELECT total_amount, applied_amount
  INTO v_total_amount, v_current_applied
  FROM customer_debit_notes
  WHERE id = NEW.customer_debit_note_id;
  
  -- Calculate new total applied (excluding current record if update)
  SELECT COALESCE(SUM(amount_applied), 0)
  INTO v_new_total
  FROM customer_debit_note_applications
  WHERE customer_debit_note_id = NEW.customer_debit_note_id
    AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::UUID);
  
  v_new_total := v_new_total + NEW.amount_applied;
  
  -- Validate that total applied doesn't exceed total amount
  IF v_new_total > v_total_amount THEN
    RAISE EXCEPTION 'Cannot apply %.2f - would exceed debit note total of %.2f (%.2f already applied)', 
      NEW.amount_applied, v_total_amount, v_current_applied;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validate_customer_debit_application ON customer_debit_note_applications;
CREATE TRIGGER trg_validate_customer_debit_application
  BEFORE INSERT OR UPDATE ON customer_debit_note_applications
  FOR EACH ROW
  EXECUTE FUNCTION validate_customer_debit_application();

-- 7️⃣ Performance Indexes
CREATE INDEX IF NOT EXISTS idx_customer_debit_notes_reference 
ON customer_debit_notes(reference_type, reference_id) 
WHERE reference_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_customer_debit_notes_journal 
ON customer_debit_notes(journal_entry_id) 
WHERE journal_entry_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_customer_debit_applications_applied_to 
ON customer_debit_note_applications(applied_to_type, applied_to_id);

-- 8️⃣ Add reference_type to validation list
COMMENT ON COLUMN customer_debit_notes.reference_type IS 
'Type of debit note: price_difference, additional_fees, penalty, correction, shipping, service_charge, late_fee, other';

