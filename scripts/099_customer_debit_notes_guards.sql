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

-- 4️⃣ Trigger: Prevent modification of approved/applied debit notes
CREATE OR REPLACE FUNCTION prevent_customer_debit_note_modification()
RETURNS TRIGGER AS $$
BEGIN
  -- Prevent modification if approved (except approval fields)
  IF OLD.approval_status = 'approved' AND (
    NEW.total_amount != OLD.total_amount OR
    NEW.customer_id != OLD.customer_id OR
    NEW.source_invoice_id != OLD.source_invoice_id OR
    NEW.reference_type != OLD.reference_type
  ) THEN
    RAISE EXCEPTION 'Cannot modify approved customer debit note % (only draft/pending can be modified)',
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

-- =============================================
-- 🆕 NEW GUARDS - APPROVAL & APPLICATION WORKFLOW
-- =============================================

-- 9️⃣ Guard: Prevent direct INSERT into applications (must use function)
CREATE OR REPLACE FUNCTION prevent_direct_debit_application()
RETURNS TRIGGER AS $$
BEGIN
  -- Check if called from apply_customer_debit_note function
  -- This is a simplified check - in production, use session variables or other mechanisms
  IF current_setting('application.name', TRUE) != 'apply_customer_debit_note' THEN
    RAISE NOTICE 'Direct INSERT into customer_debit_note_applications is discouraged. Use apply_customer_debit_note() function instead.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_direct_debit_application ON customer_debit_note_applications;
CREATE TRIGGER trg_prevent_direct_debit_application
  BEFORE INSERT ON customer_debit_note_applications
  FOR EACH ROW
  EXECUTE FUNCTION prevent_direct_debit_application();

-- 🔟 Guard: Time-lock for old invoices (configurable)
CREATE OR REPLACE FUNCTION check_invoice_time_lock()
RETURNS TRIGGER AS $$
DECLARE
  v_invoice_date DATE;
  v_time_lock_days INTEGER := 90; -- Configurable: 90 days default
  v_days_old INTEGER;
BEGIN
  -- Get invoice date
  SELECT invoice_date INTO v_invoice_date
  FROM invoices
  WHERE id = NEW.source_invoice_id;

  -- Calculate age
  v_days_old := CURRENT_DATE - v_invoice_date;

  -- Check if invoice is too old
  IF v_days_old > v_time_lock_days THEN
    RAISE EXCEPTION 'Cannot create debit note for invoice older than % days (invoice is % days old). Contact administrator for override.',
      v_time_lock_days, v_days_old;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_check_invoice_time_lock ON customer_debit_notes;
CREATE TRIGGER trg_check_invoice_time_lock
  BEFORE INSERT ON customer_debit_notes
  FOR EACH ROW
  EXECUTE FUNCTION check_invoice_time_lock();

-- 1️⃣1️⃣ Additional Indexes for Approval Workflow
CREATE INDEX IF NOT EXISTS idx_customer_debit_notes_approval_status
ON customer_debit_notes(approval_status)
WHERE approval_status IN ('pending_approval', 'approved');

CREATE INDEX IF NOT EXISTS idx_customer_debit_notes_created_by
ON customer_debit_notes(created_by);

CREATE INDEX IF NOT EXISTS idx_customer_debit_notes_approved_by
ON customer_debit_notes(approved_by)
WHERE approved_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_customer_debit_applications_applied_by
ON customer_debit_note_applications(applied_by)
WHERE applied_by IS NOT NULL;

-- 1️⃣2️⃣ Comments for new workflow
COMMENT ON FUNCTION prevent_direct_debit_application IS
'Discourages direct INSERT into applications. Use apply_customer_debit_note() function for proper validation.';

COMMENT ON FUNCTION check_invoice_time_lock IS
'Prevents creating debit notes for invoices older than configured days (default: 90 days)';

