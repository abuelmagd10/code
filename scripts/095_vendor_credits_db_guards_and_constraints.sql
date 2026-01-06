-- ============================================================================
-- Script: Vendor Credits Database Guards and Constraints
-- Purpose: Add protection constraints to prevent data integrity issues
-- Author: System Migration
-- Date: 2026-01-06
-- ============================================================================

-- ============================================================================
-- PART 1: ADD UNIQUE CONSTRAINT TO PREVENT DUPLICATE VENDOR CREDITS
-- ============================================================================

-- Drop existing index if exists
DROP INDEX IF EXISTS idx_unique_vendor_credit_per_bill_return;

-- Create unique partial index: one vendor credit per bill return
CREATE UNIQUE INDEX idx_unique_vendor_credit_per_bill_return
ON vendor_credits(source_purchase_invoice_id, reference_type)
WHERE reference_type = 'bill_return' AND source_purchase_invoice_id IS NOT NULL;

COMMENT ON INDEX idx_unique_vendor_credit_per_bill_return IS
'Ensures only one vendor credit can be created per bill return';

-- ============================================================================
-- PART 2: ADD CHECK CONSTRAINTS
-- ============================================================================

-- Ensure total_amount is positive
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'check_vendor_credit_total_amount_positive'
  ) THEN
    ALTER TABLE vendor_credits
    ADD CONSTRAINT check_vendor_credit_total_amount_positive
    CHECK (total_amount > 0);
    
    RAISE NOTICE 'Added constraint: check_vendor_credit_total_amount_positive';
  END IF;
END $$;

-- Ensure applied_amount doesn't exceed total_amount
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'check_vendor_credit_applied_not_exceed_total'
  ) THEN
    ALTER TABLE vendor_credits
    ADD CONSTRAINT check_vendor_credit_applied_not_exceed_total
    CHECK (applied_amount <= total_amount);
    
    RAISE NOTICE 'Added constraint: check_vendor_credit_applied_not_exceed_total';
  END IF;
END $$;

-- ============================================================================
-- PART 3: CREATE TRIGGER TO PREVENT DELETION OF VENDOR CREDITS
-- ============================================================================

CREATE OR REPLACE FUNCTION prevent_vendor_credit_deletion()
RETURNS TRIGGER AS $$
BEGIN
  -- Allow deletion only if status is 'draft' or 'cancelled'
  IF OLD.status NOT IN ('draft', 'cancelled') THEN
    RAISE EXCEPTION 'Cannot delete Vendor Credit % (%). Only draft or cancelled credits can be deleted.',
      OLD.credit_number, OLD.status;
  END IF;
  
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if exists
DROP TRIGGER IF EXISTS trigger_prevent_vendor_credit_deletion ON vendor_credits;

-- Create trigger
CREATE TRIGGER trigger_prevent_vendor_credit_deletion
BEFORE DELETE ON vendor_credits
FOR EACH ROW
EXECUTE FUNCTION prevent_vendor_credit_deletion();

COMMENT ON FUNCTION prevent_vendor_credit_deletion() IS
'Prevents deletion of vendor credits unless they are in draft or cancelled status';

-- ============================================================================
-- PART 4: CREATE TRIGGER TO VALIDATE VENDOR CREDIT BEFORE INSERT/UPDATE
-- ============================================================================

CREATE OR REPLACE FUNCTION validate_vendor_credit()
RETURNS TRIGGER AS $$
BEGIN
  -- Ensure company_id is set
  IF NEW.company_id IS NULL THEN
    RAISE EXCEPTION 'company_id is required for Vendor Credit';
  END IF;

  -- Ensure branch_id is set
  IF NEW.branch_id IS NULL THEN
    RAISE EXCEPTION 'branch_id is required for Vendor Credit';
  END IF;

  -- Ensure supplier_id is set
  IF NEW.supplier_id IS NULL THEN
    RAISE EXCEPTION 'supplier_id is required for Vendor Credit';
  END IF;

  -- If reference_type is 'bill_return', ensure source_purchase_invoice_id is set
  IF NEW.reference_type = 'bill_return' AND NEW.source_purchase_invoice_id IS NULL THEN
    RAISE EXCEPTION 'source_purchase_invoice_id is required when reference_type is bill_return';
  END IF;

  -- If reference_type is set, ensure reference_id is set
  IF NEW.reference_type IS NOT NULL AND NEW.reference_id IS NULL THEN
    RAISE EXCEPTION 'reference_id is required when reference_type is set';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if exists
DROP TRIGGER IF EXISTS trigger_validate_vendor_credit ON vendor_credits;

-- Create trigger
CREATE TRIGGER trigger_validate_vendor_credit
BEFORE INSERT OR UPDATE ON vendor_credits
FOR EACH ROW
EXECUTE FUNCTION validate_vendor_credit();

COMMENT ON FUNCTION validate_vendor_credit() IS
'Validates vendor credit data before insert or update to ensure all required fields are set';

-- ============================================================================
-- PART 5: CREATE FUNCTION TO PREVENT BILL DELETION IF IT HAS VENDOR CREDIT
-- ============================================================================

CREATE OR REPLACE FUNCTION prevent_bill_deletion_with_vendor_credit()
RETURNS TRIGGER AS $$
DECLARE
  v_vc_count INTEGER;
BEGIN
  -- Check if bill has associated vendor credits
  SELECT COUNT(*) INTO v_vc_count
  FROM vendor_credits
  WHERE source_purchase_invoice_id = OLD.id;

  IF v_vc_count > 0 THEN
    RAISE EXCEPTION 'Cannot delete Bill % because it has % associated Vendor Credit(s). Delete or cancel the Vendor Credits first.',
      OLD.bill_number, v_vc_count;
  END IF;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if exists
DROP TRIGGER IF EXISTS trigger_prevent_bill_deletion_with_vendor_credit ON bills;

-- Create trigger
CREATE TRIGGER trigger_prevent_bill_deletion_with_vendor_credit
BEFORE DELETE ON bills
FOR EACH ROW
EXECUTE FUNCTION prevent_bill_deletion_with_vendor_credit();

COMMENT ON FUNCTION prevent_bill_deletion_with_vendor_credit() IS
'Prevents deletion of bills that have associated vendor credits';

-- ============================================================================
-- PART 6: ADD INDEXES FOR PERFORMANCE
-- ============================================================================

-- Index on source_purchase_invoice_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_vendor_credits_source_invoice_reference
ON vendor_credits(source_purchase_invoice_id, reference_type)
WHERE source_purchase_invoice_id IS NOT NULL;

-- Index on reference fields
CREATE INDEX IF NOT EXISTS idx_vendor_credits_reference_lookup
ON vendor_credits(reference_type, reference_id)
WHERE reference_type IS NOT NULL;

-- Index on status for filtering
CREATE INDEX IF NOT EXISTS idx_vendor_credits_status_filter
ON vendor_credits(status, company_id);

-- ============================================================================
-- PART 7: SUMMARY
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Vendor Credits DB Guards Applied';
  RAISE NOTICE '========================================';
  RAISE NOTICE '✅ Unique constraint: one VC per bill return';
  RAISE NOTICE '✅ Check constraints: amount validations';
  RAISE NOTICE '✅ Trigger: prevent VC deletion (except draft/cancelled)';
  RAISE NOTICE '✅ Trigger: validate VC before insert/update';
  RAISE NOTICE '✅ Trigger: prevent bill deletion with VC';
  RAISE NOTICE '✅ Indexes: performance optimization';
  RAISE NOTICE '========================================';
END $$;

