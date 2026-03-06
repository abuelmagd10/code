-- =============================================
-- 🔐 Security Tests - Authorization System
-- Date: 2025-01-XX
-- Description: SQL queries to verify security mechanisms
-- =============================================

-- Test 1: Verify RLS Policies are Enabled
-- =============================================
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'companies',
    'company_members',
    'products',
    'invoices',
    'bills',
    'customers',
    'suppliers',
    'sales_orders',
    'purchase_orders',
    'payments',
    'journal_entries',
    'inventory_transactions'
  )
ORDER BY tablename, policyname;

-- Expected: All tables should have RLS policies
-- Verify: Each table has at least one SELECT policy checking company_id

-- =============================================
-- Test 2: Verify Company Isolation in RLS Policies
-- =============================================
-- Check that RLS policies use company_members or companies.user_id
SELECT 
  tablename,
  policyname,
  qual
FROM pg_policies
WHERE schemaname = 'public'
  AND cmd = 'SELECT'
  AND (
    qual LIKE '%company_members%' 
    OR qual LIKE '%companies%user_id%'
  )
ORDER BY tablename;

-- Expected: All SELECT policies should check membership or ownership
-- Verify: No policies allow unrestricted access

-- =============================================
-- Test 3: Verify Indexes Exist
-- =============================================
SELECT 
  indexname,
  tablename,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname IN (
    'idx_company_members_company_user',
    'idx_company_role_permissions_company_role_resource',
    'idx_companies_id_user'
  )
ORDER BY indexname;

-- Expected: All three indexes should exist
-- Verify: Indexes are created and active

-- =============================================
-- Test 4: Verify company_id NOT NULL Constraints
-- =============================================
SELECT 
  table_name,
  column_name,
  is_nullable,
  data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND column_name = 'company_id'
  AND is_nullable = 'YES'
ORDER BY table_name;

-- Expected: No results (all company_id columns should be NOT NULL)
-- Verify: All business tables require company_id

-- =============================================
-- Test 5: Verify Foreign Key Constraints
-- =============================================
SELECT
  tc.table_name,
  kcu.column_name,
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name,
  tc.constraint_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND kcu.column_name = 'company_id'
  AND ccu.table_name = 'companies'
ORDER BY tc.table_name;

-- Expected: All company_id columns should reference companies.id
-- Verify: Foreign key constraints enforce referential integrity

-- =============================================
-- Test 6: Verify Role CHECK Constraints
-- =============================================
SELECT
  c.relname AS table_name,
  con.conname AS constraint_name,
  pg_get_constraintdef(con.oid) AS check_clause
FROM pg_constraint con
JOIN pg_class c ON con.conrelid = c.oid
JOIN pg_namespace n ON c.relnamespace = n.oid
WHERE n.nspname = 'public'
  AND con.contype = 'c'  -- CHECK constraint
  AND (
    pg_get_constraintdef(con.oid) LIKE '%role%'
    OR c.relname IN ('company_members', 'company_invitations', 'company_role_permissions')
  )
ORDER BY c.relname;

-- Expected: Role columns should have CHECK constraints
-- Verify: Only valid roles can be stored

-- =============================================
-- Test 7: Count Tables with company_id
-- =============================================
SELECT 
  COUNT(DISTINCT table_name) as tables_with_company_id
FROM information_schema.columns
WHERE table_schema = 'public'
  AND column_name = 'company_id'
  AND table_name NOT IN ('companies', 'company_members', 'company_invitations');

-- Expected: All business tables should have company_id
-- Verify: Count matches expected number of business tables

-- =============================================
-- Test 8: Verify Permission Table Structure
-- =============================================
SELECT 
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'company_role_permissions'
ORDER BY ordinal_position;

-- Expected: Table should have company_id, role, resource, and permission columns
-- Verify: Structure matches expected schema

-- =============================================
-- Summary Report
-- =============================================
DO $$
DECLARE
  rls_count INTEGER;
  index_count INTEGER;
  fk_count INTEGER;
  check_count INTEGER;
BEGIN
  -- Count RLS policies
  SELECT COUNT(*) INTO rls_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename IN ('products', 'invoices', 'bills', 'customers', 'suppliers');
  
  -- Count indexes
  SELECT COUNT(*) INTO index_count
  FROM pg_indexes
  WHERE schemaname = 'public'
    AND indexname IN (
      'idx_company_members_company_user',
      'idx_company_role_permissions_company_role_resource',
      'idx_companies_id_user'
    );
  
  -- Count foreign keys
  SELECT COUNT(*) INTO fk_count
  FROM information_schema.table_constraints AS tc
  JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
  WHERE tc.constraint_type = 'FOREIGN KEY'
    AND kcu.column_name = 'company_id'
    AND kcu.table_schema = 'public';
  
  -- Count CHECK constraints on roles
  SELECT COUNT(*) INTO check_count
  FROM pg_constraint con
  JOIN pg_class c ON con.conrelid = c.oid
  JOIN pg_namespace n ON c.relnamespace = n.oid
  WHERE n.nspname = 'public'
    AND con.contype = 'c'  -- CHECK constraint
    AND pg_get_constraintdef(con.oid) LIKE '%role%';
  
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Security Test Summary';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'RLS Policies (on core tables): %', rls_count;
  RAISE NOTICE 'Performance Indexes: %', index_count;
  RAISE NOTICE 'Foreign Key Constraints (company_id): %', fk_count;
  RAISE NOTICE 'Role CHECK Constraints: %', check_count;
  RAISE NOTICE '========================================';
  
  IF rls_count >= 5 AND index_count = 3 AND fk_count > 0 AND check_count > 0 THEN
    RAISE NOTICE '✅ Security mechanisms verified';
  ELSE
    RAISE WARNING '⚠️ Some security mechanisms may be missing';
  END IF;
END $$;
