-- =====================================================
-- User Currency Preferences
-- =====================================================
-- Purpose: Store user-specific currency display preferences
-- Date: 2025-12-22
-- =====================================================

BEGIN;

-- =====================================================
-- 1. Add currency preference to company_members
-- =====================================================
-- This allows each user to have their own display currency preference
-- But for invited users, this will be overridden by company currency

ALTER TABLE company_members
  ADD COLUMN IF NOT EXISTS preferred_currency TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS currency_sync_enabled BOOLEAN DEFAULT TRUE;

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_company_members_preferred_currency 
  ON company_members(preferred_currency) 
  WHERE preferred_currency IS NOT NULL;

-- =====================================================
-- 2. Comments
-- =====================================================
COMMENT ON COLUMN company_members.preferred_currency IS 
'User preferred display currency. For invited users, this is overridden by company base currency if currency_sync_enabled is true.';

COMMENT ON COLUMN company_members.currency_sync_enabled IS 
'If true, invited users will always use company base currency. If false, they can use their preferred currency.';

-- =====================================================
-- 3. Function to get user display currency
-- =====================================================
CREATE OR REPLACE FUNCTION get_user_display_currency(
  p_user_id UUID,
  p_company_id UUID
) RETURNS TEXT AS $$
DECLARE
  v_is_owner BOOLEAN;
  v_preferred_currency TEXT;
  v_sync_enabled BOOLEAN;
  v_company_currency TEXT;
BEGIN
  -- Check if user is company owner
  SELECT (user_id = p_user_id) INTO v_is_owner
  FROM companies
  WHERE id = p_company_id;

  -- Get company base currency
  SELECT COALESCE(base_currency, currency, 'EGP') INTO v_company_currency
  FROM companies
  WHERE id = p_company_id;

  -- If owner, use their preference or company currency
  IF v_is_owner THEN
    SELECT preferred_currency INTO v_preferred_currency
    FROM company_members
    WHERE user_id = p_user_id AND company_id = p_company_id;
    
    RETURN COALESCE(v_preferred_currency, v_company_currency);
  END IF;

  -- For invited users, check sync setting
  SELECT preferred_currency, COALESCE(currency_sync_enabled, TRUE)
  INTO v_preferred_currency, v_sync_enabled
  FROM company_members
  WHERE user_id = p_user_id AND company_id = p_company_id;

  -- If sync enabled, always return company currency
  IF v_sync_enabled THEN
    RETURN v_company_currency;
  END IF;

  -- Otherwise, return user preference or company currency
  RETURN COALESCE(v_preferred_currency, v_company_currency);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- 4. Function to update user currency preference
-- =====================================================
CREATE OR REPLACE FUNCTION update_user_currency_preference(
  p_user_id UUID,
  p_company_id UUID,
  p_currency TEXT,
  p_sync_enabled BOOLEAN DEFAULT TRUE
) RETURNS JSONB AS $$
DECLARE
  v_is_owner BOOLEAN;
  v_result JSONB;
BEGIN
  -- Check if user is company owner
  SELECT (user_id = p_user_id) INTO v_is_owner
  FROM companies
  WHERE id = p_company_id;

  -- Update preference
  UPDATE company_members
  SET 
    preferred_currency = p_currency,
    currency_sync_enabled = CASE 
      WHEN v_is_owner THEN FALSE -- Owners can disable sync
      ELSE p_sync_enabled -- Invited users follow sync setting
    END
  WHERE user_id = p_user_id AND company_id = p_company_id;

  -- Return result
  SELECT jsonb_build_object(
    'success', TRUE,
    'currency', p_currency,
    'sync_enabled', CASE WHEN v_is_owner THEN FALSE ELSE p_sync_enabled END,
    'is_owner', v_is_owner
  ) INTO v_result;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- 5. Trigger to sync invited users' currency
-- =====================================================
-- When company base currency changes, update all invited users
CREATE OR REPLACE FUNCTION sync_invited_users_currency()
RETURNS TRIGGER AS $$
BEGIN
  -- If base_currency changed
  IF OLD.base_currency IS DISTINCT FROM NEW.base_currency THEN
    -- Update all invited users with sync enabled
    UPDATE company_members
    SET preferred_currency = NEW.base_currency
    WHERE company_id = NEW.id
      AND user_id != NEW.user_id -- Not the owner
      AND COALESCE(currency_sync_enabled, TRUE) = TRUE;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_invited_users_currency ON companies;
CREATE TRIGGER trg_sync_invited_users_currency
AFTER UPDATE ON companies
FOR EACH ROW
WHEN (OLD.base_currency IS DISTINCT FROM NEW.base_currency)
EXECUTE FUNCTION sync_invited_users_currency();

-- =====================================================
-- 6. Grant permissions
-- =====================================================
GRANT EXECUTE ON FUNCTION get_user_display_currency TO authenticated;
GRANT EXECUTE ON FUNCTION update_user_currency_preference TO authenticated;

-- =====================================================
-- 7. Initial data migration
-- =====================================================
-- Set currency_sync_enabled to TRUE for all existing invited users
UPDATE company_members cm
SET currency_sync_enabled = TRUE
WHERE EXISTS (
  SELECT 1 FROM companies c
  WHERE c.id = cm.company_id
  AND c.user_id != cm.user_id
);

COMMIT;

-- =====================================================
-- Usage Examples:
-- =====================================================
-- Get user's display currency:
-- SELECT get_user_display_currency('user-id', 'company-id');

-- Update user's currency preference:
-- SELECT update_user_currency_preference('user-id', 'company-id', 'USD', TRUE);

-- Check if user is synced:
-- SELECT preferred_currency, currency_sync_enabled 
-- FROM company_members 
-- WHERE user_id = 'user-id' AND company_id = 'company-id';

