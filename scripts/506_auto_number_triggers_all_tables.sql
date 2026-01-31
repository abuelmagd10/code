-- =====================================
-- 🔢 Auto-Generate Document Numbers - All Tables
-- =====================================
-- This script creates BEFORE INSERT triggers for all tables that need
-- auto-generated sequential numbers. Uses Advisory Locks to prevent race conditions.
-- =====================================

-- =====================================
-- 1️⃣ INVOICES - Auto-generate invoice_number (INV-0001, INV-0002, ...)
-- =====================================
CREATE OR REPLACE FUNCTION auto_generate_invoice_number()
RETURNS TRIGGER AS $$
DECLARE
  v_lock_key BIGINT;
  v_max_number INTEGER;
  v_number TEXT;
BEGIN
  IF NEW.invoice_number IS NULL OR NEW.invoice_number = '' THEN
    v_lock_key := hashtext('invoice_' || NEW.company_id::TEXT);
    PERFORM pg_advisory_xact_lock(v_lock_key);

    SELECT COALESCE(MAX(CAST(SUBSTRING(invoice_number FROM 'INV-([0-9]+)') AS INTEGER)), 0)
    INTO v_max_number
    FROM invoices
    WHERE company_id = NEW.company_id AND invoice_number ~ '^INV-[0-9]+$';

    v_number := 'INV-' || LPAD((v_max_number + 1)::TEXT, 4, '0');
    NEW.invoice_number := v_number;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_auto_generate_invoice_number ON invoices;
CREATE TRIGGER trigger_auto_generate_invoice_number
  BEFORE INSERT ON invoices FOR EACH ROW EXECUTE FUNCTION auto_generate_invoice_number();

-- =====================================
-- 2️⃣ BILLS - Auto-generate bill_number (BILL-0001, BILL-0002, ...)
-- =====================================
CREATE OR REPLACE FUNCTION auto_generate_bill_number()
RETURNS TRIGGER AS $$
DECLARE
  v_lock_key BIGINT;
  v_max_number INTEGER;
  v_number TEXT;
BEGIN
  IF NEW.bill_number IS NULL OR NEW.bill_number = '' THEN
    v_lock_key := hashtext('bill_' || NEW.company_id::TEXT);
    PERFORM pg_advisory_xact_lock(v_lock_key);

    SELECT COALESCE(MAX(CAST(SUBSTRING(bill_number FROM 'BILL-([0-9]+)') AS INTEGER)), 0)
    INTO v_max_number
    FROM bills
    WHERE company_id = NEW.company_id AND bill_number ~ '^BILL-[0-9]+$';

    v_number := 'BILL-' || LPAD((v_max_number + 1)::TEXT, 4, '0');
    NEW.bill_number := v_number;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_auto_generate_bill_number ON bills;
CREATE TRIGGER trigger_auto_generate_bill_number
  BEFORE INSERT ON bills FOR EACH ROW EXECUTE FUNCTION auto_generate_bill_number();

-- =====================================
-- 3️⃣ SALES_ORDERS - Auto-generate so_number (SO-0001, SO-0002, ...)
-- =====================================
CREATE OR REPLACE FUNCTION auto_generate_so_number()
RETURNS TRIGGER AS $$
DECLARE
  v_lock_key BIGINT;
  v_max_number INTEGER;
  v_number TEXT;
BEGIN
  IF NEW.so_number IS NULL OR NEW.so_number = '' THEN
    v_lock_key := hashtext('so_' || NEW.company_id::TEXT);
    PERFORM pg_advisory_xact_lock(v_lock_key);

    SELECT COALESCE(MAX(CAST(SUBSTRING(so_number FROM 'SO-([0-9]+)') AS INTEGER)), 0)
    INTO v_max_number
    FROM sales_orders
    WHERE company_id = NEW.company_id AND so_number ~ '^SO-[0-9]+$';

    v_number := 'SO-' || LPAD((v_max_number + 1)::TEXT, 4, '0');
    NEW.so_number := v_number;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_auto_generate_so_number ON sales_orders;
CREATE TRIGGER trigger_auto_generate_so_number
  BEFORE INSERT ON sales_orders FOR EACH ROW EXECUTE FUNCTION auto_generate_so_number();

-- =====================================
-- 4️⃣ PURCHASE_ORDERS - Auto-generate po_number (PO-0001, PO-0002, ...)
-- =====================================
CREATE OR REPLACE FUNCTION auto_generate_po_number()
RETURNS TRIGGER AS $$
DECLARE
  v_lock_key BIGINT;
  v_max_number INTEGER;
  v_number TEXT;
BEGIN
  IF NEW.po_number IS NULL OR NEW.po_number = '' THEN
    v_lock_key := hashtext('po_' || NEW.company_id::TEXT);
    PERFORM pg_advisory_xact_lock(v_lock_key);

    SELECT COALESCE(MAX(CAST(SUBSTRING(po_number FROM 'PO-([0-9]+)') AS INTEGER)), 0)
    INTO v_max_number
    FROM purchase_orders
    WHERE company_id = NEW.company_id AND po_number ~ '^PO-[0-9]+$';

    v_number := 'PO-' || LPAD((v_max_number + 1)::TEXT, 4, '0');
    NEW.po_number := v_number;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_auto_generate_po_number ON purchase_orders;
CREATE TRIGGER trigger_auto_generate_po_number
  BEFORE INSERT ON purchase_orders FOR EACH ROW EXECUTE FUNCTION auto_generate_po_number();

-- =====================================
-- 5️⃣ INVENTORY_WRITE_OFFS - Auto-generate write_off_number (WO-2026-0001, ...)
-- =====================================
CREATE OR REPLACE FUNCTION auto_generate_write_off_number()
RETURNS TRIGGER AS $$
DECLARE
  v_lock_key BIGINT;
  v_max_number INTEGER;
  v_number TEXT;
  v_year TEXT;
BEGIN
  IF NEW.write_off_number IS NULL OR NEW.write_off_number = '' THEN
    v_lock_key := hashtext('wo_' || NEW.company_id::TEXT);
    PERFORM pg_advisory_xact_lock(v_lock_key);

    v_year := TO_CHAR(CURRENT_DATE, 'YYYY');

    SELECT COALESCE(MAX(CAST(SUBSTRING(write_off_number FROM 'WO-' || v_year || '-([0-9]+)') AS INTEGER)), 0)
    INTO v_max_number
    FROM inventory_write_offs
    WHERE company_id = NEW.company_id
      AND write_off_number ~ ('^WO-' || v_year || '-[0-9]+$');

    v_number := 'WO-' || v_year || '-' || LPAD((v_max_number + 1)::TEXT, 4, '0');
    NEW.write_off_number := v_number;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_auto_generate_write_off_number ON inventory_write_offs;
CREATE TRIGGER trigger_auto_generate_write_off_number
  BEFORE INSERT ON inventory_write_offs FOR EACH ROW EXECUTE FUNCTION auto_generate_write_off_number();

-- =====================================
-- 6️⃣ JOURNAL_ENTRIES - Auto-generate entry_number (JE-000001, JE-000002, ...)
-- =====================================
CREATE OR REPLACE FUNCTION auto_generate_entry_number()
RETURNS TRIGGER AS $$
DECLARE
  v_lock_key BIGINT;
  v_max_number INTEGER;
  v_number TEXT;
BEGIN
  IF NEW.entry_number IS NULL OR NEW.entry_number = '' THEN
    v_lock_key := hashtext('je_' || NEW.company_id::TEXT);
    PERFORM pg_advisory_xact_lock(v_lock_key);

    SELECT COALESCE(MAX(CAST(SUBSTRING(entry_number FROM 'JE-([0-9]+)') AS INTEGER)), 0)
    INTO v_max_number
    FROM journal_entries
    WHERE company_id = NEW.company_id AND entry_number ~ '^JE-[0-9]+$';

    v_number := 'JE-' || LPAD((v_max_number + 1)::TEXT, 6, '0');
    NEW.entry_number := v_number;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_auto_generate_entry_number ON journal_entries;
CREATE TRIGGER trigger_auto_generate_entry_number
  BEFORE INSERT ON journal_entries FOR EACH ROW EXECUTE FUNCTION auto_generate_entry_number();

-- =====================================
-- 7️⃣ INVENTORY_TRANSFERS - Auto-generate transfer_number (TRF-0001, TRF-0002, ...)
-- =====================================
CREATE OR REPLACE FUNCTION auto_generate_transfer_number()
RETURNS TRIGGER AS $$
DECLARE
  v_lock_key BIGINT;
  v_max_number INTEGER;
  v_number TEXT;
BEGIN
  IF NEW.transfer_number IS NULL OR NEW.transfer_number = '' THEN
    v_lock_key := hashtext('trf_' || NEW.company_id::TEXT);
    PERFORM pg_advisory_xact_lock(v_lock_key);

    SELECT COALESCE(MAX(CAST(SUBSTRING(transfer_number FROM 'TRF-([0-9]+)') AS INTEGER)), 0)
    INTO v_max_number
    FROM inventory_transfers
    WHERE company_id = NEW.company_id AND transfer_number ~ '^TRF-[0-9]+$';

    v_number := 'TRF-' || LPAD((v_max_number + 1)::TEXT, 4, '0');
    NEW.transfer_number := v_number;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_auto_generate_transfer_number ON inventory_transfers;
CREATE TRIGGER trigger_auto_generate_transfer_number
  BEFORE INSERT ON inventory_transfers FOR EACH ROW EXECUTE FUNCTION auto_generate_transfer_number();

-- =====================================
-- ✅ COMMENTS
-- =====================================
COMMENT ON FUNCTION auto_generate_invoice_number() IS 'Auto-generates invoice_number using advisory locks to prevent race conditions';
COMMENT ON FUNCTION auto_generate_bill_number() IS 'Auto-generates bill_number using advisory locks to prevent race conditions';
COMMENT ON FUNCTION auto_generate_so_number() IS 'Auto-generates so_number using advisory locks to prevent race conditions';
COMMENT ON FUNCTION auto_generate_po_number() IS 'Auto-generates po_number using advisory locks to prevent race conditions';
COMMENT ON FUNCTION auto_generate_write_off_number() IS 'Auto-generates write_off_number using advisory locks to prevent race conditions';
COMMENT ON FUNCTION auto_generate_entry_number() IS 'Auto-generates entry_number using advisory locks to prevent race conditions';
COMMENT ON FUNCTION auto_generate_transfer_number() IS 'Auto-generates transfer_number using advisory locks to prevent race conditions';
