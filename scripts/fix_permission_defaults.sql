-- =============================================
-- 🔐 Fix Permission Defaults - Align with Default DENY
-- Date: 2025-01-XX
-- Description: Change default values in company_role_permissions to align with Default DENY security model
-- =============================================

-- ⚠️ IMPORTANT: This is a security hardening change
-- Current defaults allow access by default, which conflicts with "Default DENY" principle
-- This migration changes defaults to DENY, requiring explicit permission grants

-- =============================================
-- Step 1: Change can_read default to false
-- =============================================
ALTER TABLE company_role_permissions
  ALTER COLUMN can_read SET DEFAULT false;

-- =============================================
-- Step 2: Change can_access default to false (if nullable)
-- =============================================
-- Note: can_access might be nullable, so we set default for new inserts
ALTER TABLE company_role_permissions
  ALTER COLUMN can_access SET DEFAULT false;

-- =============================================
-- Step 3: Verify changes
-- =============================================
DO $$
DECLARE
  v_can_read_default TEXT;
  v_can_access_default TEXT;
BEGIN
  -- Check can_read default
  SELECT column_default INTO v_can_read_default
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'company_role_permissions'
    AND column_name = 'can_read';
  
  -- Check can_access default
  SELECT column_default INTO v_can_access_default
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'company_role_permissions'
    AND column_name = 'can_access';
  
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Permission Defaults Verification';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'can_read default: %', v_can_read_default;
  RAISE NOTICE 'can_access default: %', v_can_access_default;
  RAISE NOTICE '========================================';
  
  IF v_can_read_default LIKE '%false%' AND (v_can_access_default IS NULL OR v_can_access_default LIKE '%false%') THEN
    RAISE NOTICE '✅ Defaults changed to DENY successfully';
  ELSE
    RAISE WARNING '⚠️ Some defaults may not have been changed correctly';
  END IF;
END $$;

-- =============================================
-- Step 4: Important Notes
-- =============================================
-- ⚠️ This change affects NEW permission records only
-- Existing records keep their current values
-- 
-- To update existing records to explicit grants:
-- 1. Review existing permissions
-- 2. Update records that should have access
-- 3. Leave records that should be denied as-is
--
-- Example update for existing records that should have read access:
-- UPDATE company_role_permissions
-- SET can_read = true
-- WHERE company_id = 'xxx' AND role = 'staff' AND resource = 'products';
