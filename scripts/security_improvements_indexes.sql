-- =============================================
-- 🔐 Security Improvements: Database Indexes
-- Date: 2025-01-XX
-- Description: Add composite indexes for authorization performance
-- =============================================

-- 1. Composite index for company_members lookups
-- This optimizes the most common authorization query pattern:
-- WHERE company_id = X AND user_id = Y
CREATE INDEX IF NOT EXISTS idx_company_members_company_user
ON company_members(company_id, user_id);

-- 2. Composite index for company_role_permissions lookups
-- This optimizes permission checks:
-- WHERE company_id = X AND role = Y AND resource = Z
CREATE INDEX IF NOT EXISTS idx_company_role_permissions_company_role_resource
ON company_role_permissions(company_id, role, resource);

-- 3. Index for company ownership lookups
-- This optimizes ownership checks in canAccessCompany():
-- WHERE id = X AND user_id = Y
CREATE INDEX IF NOT EXISTS idx_companies_id_user
ON companies(id, user_id);

-- 4. Verify indexes were created
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE indexname = 'idx_company_members_company_user'
  ) THEN
    RAISE NOTICE '✅ Index idx_company_members_company_user created successfully';
  ELSE
    RAISE WARNING '❌ Failed to create idx_company_members_company_user';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE indexname = 'idx_company_role_permissions_company_role_resource'
  ) THEN
    RAISE NOTICE '✅ Index idx_company_role_permissions_company_role_resource created successfully';
  ELSE
    RAISE WARNING '❌ Failed to create idx_company_role_permissions_company_role_resource';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE indexname = 'idx_companies_id_user'
  ) THEN
    RAISE NOTICE '✅ Index idx_companies_id_user created successfully';
  ELSE
    RAISE WARNING '❌ Failed to create idx_companies_id_user';
  END IF;
END $$;
