-- =====================================================
-- Test Expenses Module Installation
-- =====================================================
-- This script verifies that the expenses module was installed correctly
-- =====================================================

-- Test 1: Check if expenses table exists
SELECT 
  'Test 1: Expenses table exists' AS test_name,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = 'expenses'
    ) THEN '✅ PASS'
    ELSE '❌ FAIL'
  END AS result;

-- Test 2: Check if generate_expense_number function exists
SELECT 
  'Test 2: generate_expense_number function exists' AS test_name,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM pg_proc 
      WHERE proname = 'generate_expense_number'
    ) THEN '✅ PASS'
    ELSE '❌ FAIL'
  END AS result;

-- Test 3: Check if RLS is enabled on expenses table
SELECT 
  'Test 3: RLS enabled on expenses' AS test_name,
  CASE 
    WHEN (SELECT relrowsecurity FROM pg_class WHERE relname = 'expenses') THEN '✅ PASS'
    ELSE '❌ FAIL'
  END AS result;

-- Test 4: Check if RLS policies exist
SELECT 
  'Test 4: RLS policies exist' AS test_name,
  CASE 
    WHEN (SELECT COUNT(*) FROM pg_policies WHERE tablename = 'expenses') >= 4 THEN '✅ PASS'
    ELSE '❌ FAIL - Found ' || (SELECT COUNT(*) FROM pg_policies WHERE tablename = 'expenses')::TEXT || ' policies'
  END AS result;

-- Test 5: Check if expenses permissions exist
SELECT
  'Test 5: Expenses permissions exist' AS test_name,
  CASE
    WHEN EXISTS (
      SELECT 1 FROM company_role_permissions
      WHERE resource = 'expenses'
    ) THEN '✅ PASS - Found ' || (SELECT COUNT(DISTINCT role) FROM company_role_permissions WHERE resource = 'expenses')::TEXT || ' roles'
    ELSE '❌ FAIL'
  END AS result;

-- Test 6: List all RLS policies on expenses
SELECT
  '📋 RLS Policies on expenses:' AS info,
  policyname,
  cmd AS command,
  CASE
    WHEN qual IS NOT NULL THEN 'Has USING clause'
    ELSE 'No USING clause'
  END AS using_clause,
  CASE
    WHEN with_check IS NOT NULL THEN 'Has WITH CHECK clause'
    ELSE 'No WITH CHECK clause'
  END AS with_check_clause
FROM pg_policies
WHERE tablename = 'expenses'
ORDER BY policyname;

-- Test 7: List permissions by role
SELECT
  '📋 Expenses permissions by role:' AS info,
  p.role,
  p.can_read,
  p.can_write,
  p.can_update,
  p.can_delete,
  p.all_access
FROM company_role_permissions p
WHERE p.resource = 'expenses'
ORDER BY
  CASE p.role
    WHEN 'owner' THEN 1
    WHEN 'admin' THEN 2
    WHEN 'accountant' THEN 3
    WHEN 'viewer' THEN 4
    ELSE 5
  END
LIMIT 20;

-- Test 8: Check table structure
SELECT 
  '📋 Expenses table columns:' AS info,
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'expenses'
ORDER BY ordinal_position;

-- Test 9: Test generate_expense_number function
-- Note: This will only work if you have at least one company
DO $$
DECLARE
  v_company_id UUID;
  v_expense_number TEXT;
BEGIN
  -- Get first company
  SELECT id INTO v_company_id FROM companies LIMIT 1;
  
  IF v_company_id IS NOT NULL THEN
    -- Generate expense number
    v_expense_number := generate_expense_number(v_company_id);
    
    RAISE NOTICE 'Test 9: Generate expense number - ✅ PASS - Generated: %', v_expense_number;
  ELSE
    RAISE NOTICE 'Test 9: Generate expense number - ⚠️ SKIP - No companies found';
  END IF;
END $$;

-- Summary
SELECT
  '📊 Installation Summary' AS summary,
  (SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'expenses') AS tables_created,
  (SELECT COUNT(*) FROM pg_policies WHERE tablename = 'expenses') AS rls_policies,
  (SELECT COUNT(DISTINCT role) FROM company_role_permissions WHERE resource = 'expenses') AS roles_with_permissions,
  (SELECT COUNT(*) FROM pg_proc WHERE proname LIKE '%expense%') AS functions_created;

-- =====================================================
-- ✅ Tests Complete
-- =====================================================

