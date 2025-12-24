-- ============================================================================
-- Validation Triggers for Data Consistency
-- ============================================================================
-- Purpose: Add triggers to automatically validate and maintain data consistency
-- Date: 2025-12-24
-- ============================================================================

-- ============================================================================
-- 1. AUTO-SYNC INVENTORY VALUE WITH ACCOUNTING
-- ============================================================================

-- Trigger: Warn when inventory value diverges from accounting balance
CREATE OR REPLACE FUNCTION check_inventory_balance_sync()
RETURNS TRIGGER AS $$
DECLARE
  v_company_id UUID;
  v_inventory_account_id UUID;
  v_accounting_balance NUMERIC;
  v_inventory_value NUMERIC;
  v_difference NUMERIC;
BEGIN
  -- Get company_id from the affected record
  IF TG_TABLE_NAME = 'journal_entry_lines' THEN
    SELECT company_id INTO v_company_id
    FROM journal_entries
    WHERE id = NEW.journal_entry_id;
  ELSIF TG_TABLE_NAME = 'products' THEN
    v_company_id := NEW.company_id;
  END IF;
  
  -- Get inventory account for this company
  SELECT id INTO v_inventory_account_id
  FROM chart_of_accounts
  WHERE company_id = v_company_id
    AND sub_type = 'inventory'
  LIMIT 1;
  
  IF v_inventory_account_id IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- Calculate accounting balance
  SELECT COALESCE(SUM(debit_amount - credit_amount), 0)
  INTO v_accounting_balance
  FROM journal_entry_lines jel
  JOIN journal_entries je ON je.id = jel.journal_entry_id
  WHERE jel.account_id = v_inventory_account_id
    AND je.is_deleted = false;
  
  -- Calculate inventory value from products
  SELECT COALESCE(SUM(quantity_on_hand * cost_price), 0)
  INTO v_inventory_value
  FROM products
  WHERE company_id = v_company_id
    AND (item_type IS NULL OR item_type = 'product');
  
  -- Calculate difference
  v_difference := ABS(v_inventory_value - v_accounting_balance);
  
  -- Log warning if difference is significant (> 1000)
  IF v_difference > 1000 THEN
    RAISE WARNING 'Inventory value mismatch for company %: Accounting=%, Products=%, Diff=%',
      v_company_id, v_accounting_balance, v_inventory_value, v_difference;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to journal_entry_lines
DROP TRIGGER IF EXISTS trg_check_inventory_sync_journal ON journal_entry_lines;
CREATE TRIGGER trg_check_inventory_sync_journal
  AFTER INSERT OR UPDATE ON journal_entry_lines
  FOR EACH ROW
  EXECUTE FUNCTION check_inventory_balance_sync();

-- Apply to products
DROP TRIGGER IF EXISTS trg_check_inventory_sync_products ON products;
CREATE TRIGGER trg_check_inventory_sync_products
  AFTER UPDATE ON products
  FOR EACH ROW
  WHEN (OLD.quantity_on_hand != NEW.quantity_on_hand OR OLD.cost_price != NEW.cost_price)
  EXECUTE FUNCTION check_inventory_balance_sync();

COMMENT ON FUNCTION check_inventory_balance_sync() IS 
  'Warns when inventory value diverges from accounting balance';

-- ============================================================================
-- 2. AUTO-CREATE INVENTORY TRANSACTIONS FOR BILLS
-- ============================================================================

-- Trigger: Automatically create inventory transactions when bill items are added
CREATE OR REPLACE FUNCTION auto_create_bill_inventory_transaction()
RETURNS TRIGGER AS $$
DECLARE
  v_bill_status TEXT;
  v_company_id UUID;
  v_journal_entry_id UUID;
BEGIN
  -- Get bill status and company
  SELECT status, company_id INTO v_bill_status, v_company_id
  FROM bills
  WHERE id = NEW.bill_id;
  
  -- Only create transaction if bill is received or paid
  IF v_bill_status NOT IN ('received', 'paid') THEN
    RETURN NEW;
  END IF;
  
  -- Get journal entry for this bill
  SELECT id INTO v_journal_entry_id
  FROM journal_entries
  WHERE reference_type = 'bill'
    AND reference_id = NEW.bill_id
    AND is_deleted = false
  LIMIT 1;
  
  -- Create inventory transaction if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM inventory_transactions
    WHERE bill_id = NEW.bill_id
      AND product_id = NEW.product_id
  ) THEN
    INSERT INTO inventory_transactions (
      company_id,
      product_id,
      transaction_type,
      transaction_date,
      quantity_change,
      unit_cost,
      bill_id,
      journal_entry_id,
      notes
    ) VALUES (
      v_company_id,
      NEW.product_id,
      'purchase',
      (SELECT bill_date FROM bills WHERE id = NEW.bill_id),
      NEW.quantity,
      NEW.unit_price,
      NEW.bill_id,
      v_journal_entry_id,
      'Auto-created from bill_item'
    );
    
    RAISE NOTICE 'Auto-created inventory transaction for bill_item %', NEW.id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_auto_create_bill_transaction ON bill_items;
CREATE TRIGGER trg_auto_create_bill_transaction
  AFTER INSERT ON bill_items
  FOR EACH ROW
  EXECUTE FUNCTION auto_create_bill_inventory_transaction();

COMMENT ON FUNCTION auto_create_bill_inventory_transaction() IS 
  'Automatically creates inventory transactions when bill items are added';

-- ============================================================================
-- 3. VALIDATE COGS AMOUNT MATCHES INVOICE LINES
-- ============================================================================

-- Trigger: Validate COGS amount is reasonable compared to invoice
CREATE OR REPLACE FUNCTION validate_cogs_amount()
RETURNS TRIGGER AS $$
DECLARE
  v_invoice_total NUMERIC;
  v_cogs_total NUMERIC;
BEGIN
  -- Only check for COGS entries
  IF NEW.reference_type != 'invoice_cogs' THEN
    RETURN NEW;
  END IF;
  
  -- Get invoice total
  SELECT total_amount INTO v_invoice_total
  FROM invoices
  WHERE id = NEW.reference_id;
  
  -- Get COGS total from journal entry lines
  SELECT SUM(credit_amount) INTO v_cogs_total
  FROM journal_entry_lines
  WHERE journal_entry_id = NEW.id;
  
  -- COGS should not exceed invoice total (sanity check)
  IF v_cogs_total > v_invoice_total * 2 THEN
    RAISE WARNING 'COGS amount (%) seems too high for invoice total (%). Invoice: %',
      v_cogs_total, v_invoice_total, NEW.reference_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validate_cogs_amount ON journal_entries;
CREATE TRIGGER trg_validate_cogs_amount
  AFTER INSERT ON journal_entries
  FOR EACH ROW
  EXECUTE FUNCTION validate_cogs_amount();

COMMENT ON FUNCTION validate_cogs_amount() IS 
  'Validates COGS amount is reasonable compared to invoice total';

-- ============================================================================
-- SUMMARY
-- ============================================================================

SELECT 
  'Validation Triggers Added:' as message,
  COUNT(*) as total_triggers
FROM pg_trigger
WHERE tgname IN (
  'trg_check_inventory_sync_journal',
  'trg_check_inventory_sync_products',
  'trg_auto_create_bill_transaction',
  'trg_validate_cogs_amount'
);

