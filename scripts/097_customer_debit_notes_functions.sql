-- =============================================
-- Customer Debit Notes - Functions & Triggers
-- إشعارات مدين العملاء - الدوال والمحفزات
-- =============================================

-- 1️⃣ Function: Auto-update debit note status based on applied_amount
CREATE OR REPLACE FUNCTION update_customer_debit_note_status()
RETURNS TRIGGER AS $$
BEGIN
  -- Update status based on applied_amount vs total_amount
  IF NEW.applied_amount >= NEW.total_amount THEN
    NEW.status := 'applied';
  ELSIF NEW.applied_amount > 0 THEN
    NEW.status := 'partially_applied';
  ELSE
    NEW.status := 'open';
  END IF;
  
  -- Update timestamp
  NEW.updated_at := NOW();
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for status updates
DROP TRIGGER IF EXISTS trg_update_customer_debit_note_status ON customer_debit_notes;
CREATE TRIGGER trg_update_customer_debit_note_status
  BEFORE UPDATE OF applied_amount ON customer_debit_notes
  FOR EACH ROW
  EXECUTE FUNCTION update_customer_debit_note_status();

-- 2️⃣ Function: Update applied_amount when application is created/deleted
CREATE OR REPLACE FUNCTION sync_customer_debit_note_applied_amount()
RETURNS TRIGGER AS $$
DECLARE
  v_total_applied DECIMAL(15,2);
BEGIN
  -- Calculate total applied amount for this debit note
  SELECT COALESCE(SUM(amount_applied), 0)
  INTO v_total_applied
  FROM customer_debit_note_applications
  WHERE customer_debit_note_id = COALESCE(NEW.customer_debit_note_id, OLD.customer_debit_note_id);
  
  -- Update the debit note's applied_amount
  UPDATE customer_debit_notes
  SET applied_amount = v_total_applied
  WHERE id = COALESCE(NEW.customer_debit_note_id, OLD.customer_debit_note_id);
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Create triggers for application sync
DROP TRIGGER IF EXISTS trg_sync_debit_applied_insert ON customer_debit_note_applications;
CREATE TRIGGER trg_sync_debit_applied_insert
  AFTER INSERT ON customer_debit_note_applications
  FOR EACH ROW
  EXECUTE FUNCTION sync_customer_debit_note_applied_amount();

DROP TRIGGER IF EXISTS trg_sync_debit_applied_update ON customer_debit_note_applications;
CREATE TRIGGER trg_sync_debit_applied_update
  AFTER UPDATE ON customer_debit_note_applications
  FOR EACH ROW
  EXECUTE FUNCTION sync_customer_debit_note_applied_amount();

DROP TRIGGER IF EXISTS trg_sync_debit_applied_delete ON customer_debit_note_applications;
CREATE TRIGGER trg_sync_debit_applied_delete
  AFTER DELETE ON customer_debit_note_applications
  FOR EACH ROW
  EXECUTE FUNCTION sync_customer_debit_note_applied_amount();

-- 3️⃣ Function: Prevent deletion of applied debit notes
CREATE OR REPLACE FUNCTION prevent_customer_debit_note_deletion()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.applied_amount > 0 THEN
    RAISE EXCEPTION 'Cannot delete customer debit note % - it has been applied (%.2f applied)', 
      OLD.debit_note_number, OLD.applied_amount;
  END IF;
  
  IF OLD.journal_entry_id IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot delete customer debit note % - it has a journal entry', 
      OLD.debit_note_number;
  END IF;
  
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for deletion protection
DROP TRIGGER IF EXISTS trg_prevent_customer_debit_deletion ON customer_debit_notes;
CREATE TRIGGER trg_prevent_customer_debit_deletion
  BEFORE DELETE ON customer_debit_notes
  FOR EACH ROW
  EXECUTE FUNCTION prevent_customer_debit_note_deletion();

-- 4️⃣ Function: Auto-calculate totals from items
CREATE OR REPLACE FUNCTION calculate_customer_debit_note_totals()
RETURNS TRIGGER AS $$
DECLARE
  v_subtotal DECIMAL(15,2);
  v_tax_amount DECIMAL(15,2);
  v_total_amount DECIMAL(15,2);
BEGIN
  -- Calculate totals from items
  SELECT 
    COALESCE(SUM(line_total), 0),
    COALESCE(SUM(line_total * tax_rate / 100), 0)
  INTO v_subtotal, v_tax_amount
  FROM customer_debit_note_items
  WHERE customer_debit_note_id = COALESCE(NEW.customer_debit_note_id, OLD.customer_debit_note_id);
  
  v_total_amount := v_subtotal + v_tax_amount;
  
  -- Update the debit note
  UPDATE customer_debit_notes
  SET 
    subtotal = v_subtotal,
    tax_amount = v_tax_amount,
    total_amount = v_total_amount,
    updated_at = NOW()
  WHERE id = COALESCE(NEW.customer_debit_note_id, OLD.customer_debit_note_id);
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Create triggers for total calculation
DROP TRIGGER IF EXISTS trg_calc_debit_totals_insert ON customer_debit_note_items;
CREATE TRIGGER trg_calc_debit_totals_insert
  AFTER INSERT ON customer_debit_note_items
  FOR EACH ROW
  EXECUTE FUNCTION calculate_customer_debit_note_totals();

DROP TRIGGER IF EXISTS trg_calc_debit_totals_update ON customer_debit_note_items;
CREATE TRIGGER trg_calc_debit_totals_update
  AFTER UPDATE ON customer_debit_note_items
  FOR EACH ROW
  EXECUTE FUNCTION calculate_customer_debit_note_totals();

DROP TRIGGER IF EXISTS trg_calc_debit_totals_delete ON customer_debit_note_items;
CREATE TRIGGER trg_calc_debit_totals_delete
  AFTER DELETE ON customer_debit_note_items
  FOR EACH ROW
  EXECUTE FUNCTION calculate_customer_debit_note_totals();

-- 5️⃣ Function: Generate debit note number
CREATE OR REPLACE FUNCTION generate_customer_debit_note_number(p_company_id UUID)
RETURNS VARCHAR(50) AS $$
DECLARE
  v_prefix VARCHAR(10);
  v_next_number INTEGER;
  v_debit_number VARCHAR(50);
BEGIN
  -- Get company prefix (first 3 letters of company name)
  SELECT UPPER(LEFT(name, 3)) INTO v_prefix
  FROM companies WHERE id = p_company_id;
  
  -- Get next number
  SELECT COALESCE(MAX(CAST(SUBSTRING(debit_note_number FROM '[0-9]+$') AS INTEGER)), 0) + 1
  INTO v_next_number
  FROM customer_debit_notes
  WHERE company_id = p_company_id
    AND debit_note_number ~ (v_prefix || '-DN-[0-9]+$');
  
  -- Format: ABC-DN-0001
  v_debit_number := v_prefix || '-DN-' || LPAD(v_next_number::TEXT, 4, '0');
  
  RETURN v_debit_number;
END;
$$ LANGUAGE plpgsql;

