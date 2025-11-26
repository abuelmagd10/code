-- =============================================
-- Improved Returns & Journal Deletion Triggers
-- =============================================

-- Add journal_entry_id to vendor_credits for linking
ALTER TABLE vendor_credits ADD COLUMN IF NOT EXISTS journal_entry_id UUID REFERENCES journal_entries(id) ON DELETE SET NULL;

-- =============================================
-- Trigger: Update invoice when related journal entry is deleted
-- =============================================
CREATE OR REPLACE FUNCTION update_invoice_on_journal_delete()
RETURNS trigger AS $$
DECLARE
  inv_id UUID;
  ref_type TEXT;
  pay_amount DECIMAL(15,2);
BEGIN
  ref_type := OLD.reference_type;
  inv_id := OLD.reference_id;
  
  IF inv_id IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Handle invoice payment reversal
  IF ref_type = 'invoice_payment' THEN
    -- Get the payment amount from journal lines (debit to cash/bank)
    SELECT COALESCE(SUM(debit_amount), 0) INTO pay_amount
    FROM journal_entry_lines WHERE journal_entry_id = OLD.id AND debit_amount > 0;
    
    -- Update invoice paid_amount and status
    UPDATE invoices 
    SET paid_amount = GREATEST(0, paid_amount - pay_amount),
        status = CASE 
          WHEN GREATEST(0, paid_amount - pay_amount) <= 0 THEN 'sent'
          WHEN GREATEST(0, paid_amount - pay_amount) < total_amount THEN 'partially_paid'
          ELSE status
        END
    WHERE id = inv_id;
  END IF;
  
  -- Handle invoice reversal (return)
  IF ref_type = 'invoice_reversal' OR ref_type = 'credit_note' THEN
    -- Reset return status
    UPDATE invoices 
    SET return_status = NULL,
        returned_amount = 0
    WHERE id = inv_id;
  END IF;
  
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_update_invoice_on_journal_delete ON journal_entries;
CREATE TRIGGER trg_update_invoice_on_journal_delete
AFTER DELETE ON journal_entries
FOR EACH ROW 
WHEN (OLD.reference_type IN ('invoice_payment', 'invoice_reversal', 'credit_note'))
EXECUTE FUNCTION update_invoice_on_journal_delete();

-- =============================================
-- Trigger: Update bill when related journal entry is deleted
-- =============================================
CREATE OR REPLACE FUNCTION update_bill_on_journal_delete()
RETURNS trigger AS $$
DECLARE
  bill_uuid UUID;
  ref_type TEXT;
  pay_amount DECIMAL(15,2);
BEGIN
  ref_type := OLD.reference_type;
  bill_uuid := OLD.reference_id;
  
  IF bill_uuid IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Handle bill payment reversal
  IF ref_type = 'bill_payment' THEN
    SELECT COALESCE(SUM(credit_amount), 0) INTO pay_amount
    FROM journal_entry_lines WHERE journal_entry_id = OLD.id AND credit_amount > 0;
    
    UPDATE bills 
    SET paid_amount = GREATEST(0, paid_amount - pay_amount),
        status = CASE 
          WHEN GREATEST(0, paid_amount - pay_amount) <= 0 THEN 'sent'
          WHEN GREATEST(0, paid_amount - pay_amount) < total_amount THEN 'partially_paid'
          ELSE status
        END
    WHERE id = bill_uuid;
  END IF;
  
  -- Handle bill reversal (return)
  IF ref_type = 'bill_reversal' OR ref_type = 'vendor_credit' THEN
    UPDATE bills 
    SET return_status = NULL,
        returned_amount = 0
    WHERE id = bill_uuid;
  END IF;
  
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_update_bill_on_journal_delete ON journal_entries;
CREATE TRIGGER trg_update_bill_on_journal_delete
AFTER DELETE ON journal_entries
FOR EACH ROW 
WHEN (OLD.reference_type IN ('bill_payment', 'bill_reversal', 'vendor_credit'))
EXECUTE FUNCTION update_bill_on_journal_delete();

-- =============================================
-- Trigger: Auto-create journal entry for vendor credit
-- =============================================
CREATE OR REPLACE FUNCTION auto_journal_for_vendor_credit()
RETURNS trigger AS $$
DECLARE
  ap_account UUID;
  inventory_account UUID;
  vat_account UUID;
  je_id UUID;
BEGIN
  -- Skip if journal already linked
  IF NEW.journal_entry_id IS NOT NULL THEN
    RETURN NEW;
  END IF;
  
  -- Find AP account
  SELECT id INTO ap_account FROM chart_of_accounts 
  WHERE company_id = NEW.company_id 
    AND (sub_type = 'accounts_payable' OR account_name ILIKE '%payable%' OR account_name LIKE '%دائن%')
  LIMIT 1;
  
  -- Find Inventory account
  SELECT id INTO inventory_account FROM chart_of_accounts 
  WHERE company_id = NEW.company_id 
    AND (sub_type = 'inventory' OR account_name ILIKE '%inventory%' OR account_name LIKE '%مخزون%')
  LIMIT 1;
  
  IF ap_account IS NULL OR inventory_account IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- Find VAT account (optional)
  SELECT id INTO vat_account FROM chart_of_accounts
  WHERE company_id = NEW.company_id
    AND (sub_type = 'vat_input' OR account_name ILIKE '%vat%' OR account_name LIKE '%ضريب%')
  LIMIT 1;

  -- Create journal entry for vendor credit
  INSERT INTO journal_entries (company_id, reference_type, reference_id, entry_date, description)
  VALUES (NEW.company_id, 'vendor_credit', NEW.id, NEW.credit_date,
    'إشعار دائن مورد رقم ' || NEW.credit_number)
  RETURNING id INTO je_id;

  -- Debit: Accounts Payable (reduce liability)
  INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit_amount, credit_amount, description)
  VALUES (je_id, ap_account, NEW.subtotal + COALESCE(NEW.tax_amount, 0), 0, 'تخفيض ذمم دائنة');

  -- Credit: Inventory (reduce inventory value)
  INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit_amount, credit_amount, description)
  VALUES (je_id, inventory_account, 0, NEW.subtotal, 'مردودات مشتريات');

  -- Credit: VAT (if applicable)
  IF vat_account IS NOT NULL AND NEW.tax_amount > 0 THEN
    INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit_amount, credit_amount, description)
    VALUES (je_id, vat_account, 0, NEW.tax_amount, 'تعديل ضريبة المشتريات');
  END IF;

  -- Link journal entry to vendor credit
  NEW.journal_entry_id := je_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_auto_journal_vendor_credit ON vendor_credits;
CREATE TRIGGER trg_auto_journal_vendor_credit
BEFORE INSERT ON vendor_credits
FOR EACH ROW
EXECUTE FUNCTION auto_journal_for_vendor_credit();

-- =============================================
-- Trigger: Create inventory transactions for vendor credit items
-- =============================================
CREATE OR REPLACE FUNCTION auto_inventory_for_vendor_credit()
RETURNS trigger AS $$
DECLARE
  vc_record RECORD;
BEGIN
  -- Get vendor credit info
  SELECT company_id, journal_entry_id, credit_number INTO vc_record
  FROM vendor_credits WHERE id = NEW.vendor_credit_id;

  -- Create inventory transaction (return to supplier = negative quantity)
  IF NEW.product_id IS NOT NULL AND vc_record.journal_entry_id IS NOT NULL THEN
    INSERT INTO inventory_transactions (
      company_id, product_id, transaction_type, quantity_change,
      reference_id, journal_entry_id, notes
    ) VALUES (
      vc_record.company_id, NEW.product_id, 'purchase_return',
      -NEW.quantity, NEW.vendor_credit_id, vc_record.journal_entry_id,
      'مرتجع مشتريات - إشعار دائن ' || vc_record.credit_number
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_auto_inventory_vendor_credit_item ON vendor_credit_items;
CREATE TRIGGER trg_auto_inventory_vendor_credit_item
AFTER INSERT ON vendor_credit_items
FOR EACH ROW
EXECUTE FUNCTION auto_inventory_for_vendor_credit();

-- =============================================
-- Trigger: Update bill when vendor credit is applied
-- =============================================
CREATE OR REPLACE FUNCTION update_bill_on_credit_application()
RETURNS trigger AS $$
DECLARE
  ap_account UUID;
  vc_liability UUID;
  je_id UUID;
  vc_record RECORD;
  bill_record RECORD;
BEGIN
  -- Get vendor credit info
  SELECT * INTO vc_record FROM vendor_credits WHERE id = NEW.vendor_credit_id;
  SELECT * INTO bill_record FROM bills WHERE id = NEW.bill_id;

  -- Find AP account
  SELECT id INTO ap_account FROM chart_of_accounts
  WHERE company_id = NEW.company_id
    AND (sub_type = 'accounts_payable' OR account_name ILIKE '%payable%')
  LIMIT 1;

  IF ap_account IS NULL THEN
    RETURN NEW;
  END IF;

  -- Create journal entry for the application
  INSERT INTO journal_entries (company_id, reference_type, reference_id, entry_date, description)
  VALUES (NEW.company_id, 'vendor_credit_application', NEW.id, NEW.applied_date,
    'تطبيق إشعار دائن ' || vc_record.credit_number || ' على فاتورة ' || bill_record.bill_number)
  RETURNING id INTO je_id;

  -- Debit: Vendor Credit Liability (reduce what supplier owes us)
  INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit_amount, credit_amount, description)
  VALUES (je_id, ap_account, 0, NEW.amount_applied, 'تسوية إشعار دائن');

  -- Credit: Accounts Payable (reduce what we owe supplier)
  INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit_amount, credit_amount, description)
  VALUES (je_id, ap_account, NEW.amount_applied, 0, 'تسوية ذمم دائنة');

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_journal_on_vendor_credit_application ON vendor_credit_applications;
CREATE TRIGGER trg_journal_on_vendor_credit_application
AFTER INSERT ON vendor_credit_applications
FOR EACH ROW
EXECUTE FUNCTION update_bill_on_credit_application();

