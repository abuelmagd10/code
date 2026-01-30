-- =====================================================
-- 🔐 Expenses Governance Triggers
-- =====================================================
-- Created: 2026-01-30
-- Purpose: Enterprise-grade governance for expenses module
-- Ensures branch and cost center integrity
-- =====================================================

-- =====================================
-- 1️⃣ Validate Branch and Cost Center Relationship
-- =====================================
-- This trigger ensures that:
-- 1. branch_id belongs to the same company_id
-- 2. cost_center_id belongs to the same branch_id
-- 3. warehouse_id (if provided) belongs to the same branch_id

CREATE OR REPLACE FUNCTION validate_expense_governance()
RETURNS TRIGGER AS $$
DECLARE
  v_branch_company_id UUID;
  v_cost_center_branch_id UUID;
  v_warehouse_branch_id UUID;
BEGIN
  -- 🔐 Rule 1: Validate branch belongs to company
  IF NEW.branch_id IS NOT NULL THEN
    SELECT company_id INTO v_branch_company_id
    FROM branches
    WHERE id = NEW.branch_id AND is_active = true;
    
    IF v_branch_company_id IS NULL THEN
      RAISE EXCEPTION 'Invalid branch: Branch does not exist or is inactive';
    END IF;
    
    IF v_branch_company_id != NEW.company_id THEN
      RAISE EXCEPTION 'Governance violation: Branch (%) does not belong to company (%)', 
        NEW.branch_id, NEW.company_id;
    END IF;
  END IF;

  -- 🔐 Rule 2: Validate cost center belongs to branch
  IF NEW.cost_center_id IS NOT NULL THEN
    IF NEW.branch_id IS NULL THEN
      RAISE EXCEPTION 'Governance violation: Cost center requires a branch to be selected';
    END IF;
    
    SELECT branch_id INTO v_cost_center_branch_id
    FROM cost_centers
    WHERE id = NEW.cost_center_id AND is_active = true;
    
    IF v_cost_center_branch_id IS NULL THEN
      RAISE EXCEPTION 'Invalid cost center: Cost center does not exist or is inactive';
    END IF;
    
    IF v_cost_center_branch_id != NEW.branch_id THEN
      RAISE EXCEPTION 'Governance violation: Cost center (%) does not belong to branch (%)', 
        NEW.cost_center_id, NEW.branch_id;
    END IF;
  END IF;

  -- 🔐 Rule 3: Validate warehouse belongs to branch (optional)
  IF NEW.warehouse_id IS NOT NULL THEN
    IF NEW.branch_id IS NULL THEN
      RAISE EXCEPTION 'Governance violation: Warehouse requires a branch to be selected';
    END IF;
    
    SELECT branch_id INTO v_warehouse_branch_id
    FROM warehouses
    WHERE id = NEW.warehouse_id AND is_active = true;
    
    IF v_warehouse_branch_id IS NULL THEN
      RAISE EXCEPTION 'Invalid warehouse: Warehouse does not exist or is inactive';
    END IF;
    
    IF v_warehouse_branch_id != NEW.branch_id THEN
      RAISE EXCEPTION 'Governance violation: Warehouse (%) does not belong to branch (%)', 
        NEW.warehouse_id, NEW.branch_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if exists
DROP TRIGGER IF EXISTS expenses_governance_trigger ON expenses;

-- Create trigger
CREATE TRIGGER expenses_governance_trigger
  BEFORE INSERT OR UPDATE ON expenses
  FOR EACH ROW
  EXECUTE FUNCTION validate_expense_governance();

-- =====================================
-- 2️⃣ Add Comments for Documentation
-- =====================================
COMMENT ON FUNCTION validate_expense_governance() IS 
'🔐 Enterprise Governance: Validates that branch, cost center, and warehouse relationships are correct before inserting/updating expenses';

COMMENT ON TRIGGER expenses_governance_trigger ON expenses IS 
'🔐 Enforces multi-branch governance rules: branch must belong to company, cost center must belong to branch, warehouse must belong to branch';

-- =====================================
-- 3️⃣ Test the Trigger (Optional)
-- =====================================
-- You can test this trigger by trying to insert an expense with:
-- 1. A branch from a different company → Should fail
-- 2. A cost center from a different branch → Should fail
-- 3. A warehouse from a different branch → Should fail

-- Example test (uncomment to run):
-- INSERT INTO expenses (
--   company_id, 
--   branch_id, 
--   cost_center_id,
--   expense_number,
--   expense_date,
--   description,
--   amount,
--   created_by
-- ) VALUES (
--   'wrong-company-id',
--   'some-branch-id',
--   'some-cost-center-id',
--   'TEST-001',
--   CURRENT_DATE,
--   'Test expense',
--   100.00,
--   'some-user-id'
-- );
-- Expected: ERROR: Governance violation: Branch does not belong to company

-- =====================================
-- ✅ Governance Rules Summary
-- =====================================
-- 1. ✅ Branch must belong to the same company
-- 2. ✅ Cost center must belong to the same branch
-- 3. ✅ Warehouse must belong to the same branch
-- 4. ✅ All entities must be active (is_active = true)
-- 5. ✅ Enforced at database level (cannot be bypassed)

