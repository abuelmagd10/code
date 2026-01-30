-- =====================================================
-- Expenses Module Permissions
-- =====================================================
-- This script adds the 'expenses' resource to the permissions system
-- and assigns default permissions to each role.
-- =====================================================
--
-- Permission Model:
-- - owner, admin: Full access (all_access = true)
-- - accountant: Can read, write, update (but not delete)
-- - viewer: Read-only
--
-- Approval permissions are role-based (not in permissions table):
-- - Only 'owner' and 'admin' can approve/reject expenses
-- =====================================================

-- Add expenses permissions to all existing companies
DO $$
DECLARE
  v_company_id UUID;
  v_company_count INTEGER := 0;
  v_permission_count INTEGER := 0;
BEGIN
  -- Loop through all companies
  FOR v_company_id IN SELECT id FROM companies LOOP
    v_company_count := v_company_count + 1;

    -- Owner: Full access
    IF NOT EXISTS (
      SELECT 1 FROM company_role_permissions
      WHERE company_id = v_company_id AND role = 'owner' AND resource = 'expenses'
    ) THEN
      INSERT INTO company_role_permissions (company_id, role, resource, can_read, can_write, can_update, can_delete, all_access)
      VALUES (v_company_id, 'owner', 'expenses', true, true, true, true, true);
      v_permission_count := v_permission_count + 1;
    END IF;

    -- Admin: Full access
    IF NOT EXISTS (
      SELECT 1 FROM company_role_permissions
      WHERE company_id = v_company_id AND role = 'admin' AND resource = 'expenses'
    ) THEN
      INSERT INTO company_role_permissions (company_id, role, resource, can_read, can_write, can_update, can_delete, all_access)
      VALUES (v_company_id, 'admin', 'expenses', true, true, true, true, true);
      v_permission_count := v_permission_count + 1;
    END IF;

    -- Accountant: Can read, write, update (but not delete)
    IF NOT EXISTS (
      SELECT 1 FROM company_role_permissions
      WHERE company_id = v_company_id AND role = 'accountant' AND resource = 'expenses'
    ) THEN
      INSERT INTO company_role_permissions (company_id, role, resource, can_read, can_write, can_update, can_delete, all_access)
      VALUES (v_company_id, 'accountant', 'expenses', true, true, true, false, false);
      v_permission_count := v_permission_count + 1;
    END IF;

    -- Viewer: Read-only
    IF NOT EXISTS (
      SELECT 1 FROM company_role_permissions
      WHERE company_id = v_company_id AND role = 'viewer' AND resource = 'expenses'
    ) THEN
      INSERT INTO company_role_permissions (company_id, role, resource, can_read, can_write, can_update, can_delete, all_access)
      VALUES (v_company_id, 'viewer', 'expenses', true, false, false, false, false);
      v_permission_count := v_permission_count + 1;
    END IF;
  END LOOP;

  RAISE NOTICE '✅ Added expenses permissions to % companies (% new permissions created)', v_company_count, v_permission_count;
END;
$$;

-- =====================================================
-- ✅ Expenses permissions added successfully
-- =====================================================

