-- Migration: Add Chart of Accounts Safeguards
-- Description: Adds is_system column, cycle detection, and modification protection.

-- 1. Add is_system column to protect core accounts
ALTER TABLE chart_of_accounts 
ADD COLUMN IF NOT EXISTS is_system BOOLEAN DEFAULT FALSE;

-- 2. Function to check for cycles in parent-child relationship
CREATE OR REPLACE FUNCTION check_account_cycle()
RETURNS TRIGGER AS $$
BEGIN
  -- If parent_id is NULL, no cycle possible
  IF NEW.parent_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Allow self-reference check (already prevented by logic, but good sanity check)
  IF NEW.parent_id = NEW.id THEN
    RAISE EXCEPTION 'Account cannot be its own parent.';
  END IF;

  -- Recursive check: Walk up the hierarchy from the new parent
  -- If we find the current account ID in the ancestry, it's a cycle.
  IF EXISTS (
    WITH RECURSIVE ancestry AS (
      -- Start with the proposed parent
      SELECT id, parent_id
      FROM chart_of_accounts
      WHERE id = NEW.parent_id
      
      UNION ALL
      
      -- Walk up
      SELECT c.id, c.parent_id
      FROM chart_of_accounts c
      JOIN ancestry a ON c.id = a.parent_id
    )
    SELECT 1 FROM ancestry WHERE id = NEW.id
  ) THEN
    RAISE EXCEPTION 'Cyclic dependency detected. Account % cannot be an ancestor of its own parent.', NEW.id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Trigger for cycle check
DROP TRIGGER IF EXISTS trg_coa_cycle_check ON chart_of_accounts;
CREATE TRIGGER trg_coa_cycle_check
  BEFORE INSERT OR UPDATE OF parent_id
  ON chart_of_accounts
  FOR EACH ROW
  EXECUTE FUNCTION check_account_cycle();


-- 4. Function to protect accounts
CREATE OR REPLACE FUNCTION prevent_critical_account_changes()
RETURNS TRIGGER AS $$
DECLARE
  has_transactions BOOLEAN;
BEGIN
  -- Check if account has transactions (posted or drafts)
  -- We prioritize data integrity, so even drafts should block type changes to avoid confusion, 
  -- but strict accounting only adheres to posted. Let's be strict: any usage blocks core changes.
  SELECT EXISTS (
    SELECT 1 FROM journal_entry_lines WHERE account_id = OLD.id LIMIT 1
  ) INTO has_transactions;

  -- Case A: Deletion
  IF TG_OP = 'DELETE' THEN
    IF OLD.is_system THEN
      RAISE EXCEPTION 'Cannot delete a system account.';
    END IF;
    
    IF has_transactions THEN
      RAISE EXCEPTION 'Cannot delete account % because it has associated journal entries.', OLD.account_name;
    END IF;
    
    RETURN OLD; -- Proceed with deletion if checks pass
  END IF;

  -- Case B: Update
  IF TG_OP = 'UPDATE' THEN
    -- Prevent changing Type if transactions exist
    -- account_type change invalidates historical reports
    IF OLD.account_type IS DISTINCT FROM NEW.account_type AND has_transactions THEN
      RAISE EXCEPTION 'Cannot change account type of % because it has transactions. This would corrupt historical financial statements.', OLD.account_name;
    END IF;

    -- System Account Protection
    IF OLD.is_system THEN
      -- Prevent changing Code or Type for system accounts
      -- Name change might be allowed for translation/customization, but code/type are structural.
      IF OLD.account_code IS DISTINCT FROM NEW.account_code THEN
         RAISE EXCEPTION 'Cannot change account code of a system account.';
      END IF;
      
      IF OLD.account_type IS DISTINCT FROM NEW.account_type THEN
         RAISE EXCEPTION 'Cannot change account type of a system account.';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 5. Trigger for protection
DROP TRIGGER IF EXISTS trg_coa_protection ON chart_of_accounts;
CREATE TRIGGER trg_coa_protection
  BEFORE DELETE OR UPDATE
  ON chart_of_accounts
  FOR EACH ROW
  EXECUTE FUNCTION prevent_critical_account_changes();

-- 6. Retroactive cleanup: Mark standard accounts as system for existing companies?
-- No, we cannot assume existing accounts match standard exactly. 
-- We will leave existing data as is_system=FALSE unless we are sure.
-- However, for NEW companies, code will set is_system=TRUE.

-- OPTIONAL: You can run a one-time update here if you are confident certain codes are standard.
-- Example: UPDATE chart_of_accounts SET is_system = TRUE WHERE account_code IN ('3200', '3300');
