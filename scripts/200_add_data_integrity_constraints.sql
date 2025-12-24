-- ============================================================================
-- Data Integrity Constraints
-- ============================================================================
-- Purpose: Add database-level constraints to prevent data integrity issues
-- Date: 2025-12-24
-- ============================================================================

-- ============================================================================
-- 1. BILLS CONSTRAINTS
-- ============================================================================

-- Constraint: Bills must have at least one bill_item
-- This prevents creating bills without line items (the root cause of our issue)
CREATE OR REPLACE FUNCTION check_bill_has_items()
RETURNS TRIGGER AS $$
BEGIN
  -- Only check when bill status changes to 'received' or 'paid'
  IF (NEW.status IN ('received', 'paid') AND 
      (TG_OP = 'INSERT' OR OLD.status != NEW.status)) THEN
    
    -- Check if bill has at least one item
    IF NOT EXISTS (
      SELECT 1 FROM bill_items 
      WHERE bill_id = NEW.id
    ) THEN
      RAISE EXCEPTION 'Cannot mark bill as % without bill items. Bill: %', 
        NEW.status, NEW.bill_number;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if exists and create new one
DROP TRIGGER IF EXISTS trg_check_bill_has_items ON bills;
CREATE TRIGGER trg_check_bill_has_items
  BEFORE UPDATE ON bills
  FOR EACH ROW
  EXECUTE FUNCTION check_bill_has_items();

COMMENT ON FUNCTION check_bill_has_items() IS 
  'Ensures bills have at least one bill_item before marking as received/paid';

-- ============================================================================
-- 2. INVOICES CONSTRAINTS
-- ============================================================================

-- Constraint: Invoices must have at least one invoice_line
CREATE OR REPLACE FUNCTION check_invoice_has_lines()
RETURNS TRIGGER AS $$
BEGIN
  -- Only check when invoice status changes to 'sent' or 'paid'
  IF (NEW.status IN ('sent', 'paid') AND 
      (TG_OP = 'INSERT' OR OLD.status != NEW.status)) THEN
    
    -- Check if invoice has at least one line
    IF NOT EXISTS (
      SELECT 1 FROM invoice_lines 
      WHERE invoice_id = NEW.id
    ) THEN
      RAISE EXCEPTION 'Cannot mark invoice as % without invoice lines. Invoice: %', 
        NEW.status, NEW.invoice_number;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if exists and create new one
DROP TRIGGER IF EXISTS trg_check_invoice_has_lines ON invoices;
CREATE TRIGGER trg_check_invoice_has_lines
  BEFORE UPDATE ON invoices
  FOR EACH ROW
  EXECUTE FUNCTION check_invoice_has_lines();

COMMENT ON FUNCTION check_invoice_has_lines() IS 
  'Ensures invoices have at least one invoice_line before marking as sent/paid';

-- ============================================================================
-- 3. INVENTORY TRANSACTIONS CONSTRAINTS
-- ============================================================================

-- Constraint: Inventory transactions must have a journal entry
CREATE OR REPLACE FUNCTION check_transaction_has_journal()
RETURNS TRIGGER AS $$
BEGIN
  -- For purchase and sale transactions, journal_entry_id is required
  IF NEW.transaction_type IN ('purchase', 'sale') THEN
    IF NEW.journal_entry_id IS NULL THEN
      RAISE EXCEPTION 'Inventory transaction of type % must have a journal_entry_id', 
        NEW.transaction_type;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if exists and create new one
DROP TRIGGER IF EXISTS trg_check_transaction_has_journal ON inventory_transactions;
CREATE TRIGGER trg_check_transaction_has_journal
  BEFORE INSERT OR UPDATE ON inventory_transactions
  FOR EACH ROW
  EXECUTE FUNCTION check_transaction_has_journal();

COMMENT ON FUNCTION check_transaction_has_journal() IS 
  'Ensures purchase/sale transactions have associated journal entries';

-- ============================================================================
-- 4. JOURNAL ENTRIES CONSTRAINTS
-- ============================================================================

-- Constraint: Journal entries must be balanced (already exists, but let's verify)
-- This is already handled by trg_check_journal_balance_update

-- Constraint: COGS journal entries must reference an invoice
CREATE OR REPLACE FUNCTION check_cogs_has_invoice()
RETURNS TRIGGER AS $$
BEGIN
  -- For COGS entries, must have invoice reference
  IF NEW.reference_type IN ('invoice_cogs', 'invoice_cogs_reversal') THEN
    IF NEW.reference_id IS NULL THEN
      RAISE EXCEPTION 'COGS journal entry must have a reference_id (invoice_id)';
    END IF;
    
    -- Verify the invoice exists
    IF NOT EXISTS (SELECT 1 FROM invoices WHERE id = NEW.reference_id) THEN
      RAISE EXCEPTION 'COGS journal entry references non-existent invoice: %', 
        NEW.reference_id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if exists and create new one
DROP TRIGGER IF EXISTS trg_check_cogs_has_invoice ON journal_entries;
CREATE TRIGGER trg_check_cogs_has_invoice
  BEFORE INSERT OR UPDATE ON journal_entries
  FOR EACH ROW
  EXECUTE FUNCTION check_cogs_has_invoice();

COMMENT ON FUNCTION check_cogs_has_invoice() IS 
  'Ensures COGS journal entries reference valid invoices';

-- ============================================================================
-- 5. FIFO LOTS CONSTRAINTS
-- ============================================================================

-- Constraint: FIFO lots remaining_quantity must not be negative
CREATE OR REPLACE FUNCTION check_fifo_lot_quantity()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.remaining_quantity < 0 THEN
    RAISE EXCEPTION 'FIFO lot remaining_quantity cannot be negative. Product: %, Lot: %', 
      NEW.product_id, NEW.id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if exists and create new one
DROP TRIGGER IF EXISTS trg_check_fifo_lot_quantity ON fifo_cost_lots;
CREATE TRIGGER trg_check_fifo_lot_quantity
  BEFORE INSERT OR UPDATE ON fifo_cost_lots
  FOR EACH ROW
  EXECUTE FUNCTION check_fifo_lot_quantity();

COMMENT ON FUNCTION check_fifo_lot_quantity() IS 
  'Ensures FIFO lot quantities are never negative';

-- ============================================================================
-- SUMMARY
-- ============================================================================

-- List all new constraints
SELECT 
  'Data Integrity Constraints Added:' as message,
  COUNT(*) as total_triggers
FROM pg_trigger
WHERE tgname IN (
  'trg_check_bill_has_items',
  'trg_check_invoice_has_lines',
  'trg_check_transaction_has_journal',
  'trg_check_cogs_has_invoice',
  'trg_check_fifo_lot_quantity'
);

