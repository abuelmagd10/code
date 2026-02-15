-- =============================================
-- Quick Verification: Phase 1 Deployment
-- Run this to verify both migrations were applied
-- =============================================

\echo '🔍 Verifying Phase 1 Deployment...'
\echo ''

-- 1. Check action types constraint
\echo '1️⃣ Action Types:'
SELECT 
  CASE 
    WHEN pg_get_constraintdef(oid) LIKE '%APPROVE%' THEN '✅ New action types added'
    ELSE '❌ Old constraint still in place'
  END as status
FROM pg_constraint 
WHERE conrelid = 'audit_logs'::regclass 
  AND conname = 'audit_logs_action_check';

-- 2. Check reason column
\echo ''
\echo '2️⃣ Reason Column:'
SELECT 
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'audit_logs' AND column_name = 'reason'
    ) THEN '✅ Reason column exists'
    ELSE '❌ Reason column missing'
  END as status;

-- 3. Check UPDATE prevention policy
\echo ''
\echo '3️⃣ UPDATE Prevention:'
SELECT 
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM pg_policies 
      WHERE tablename = 'audit_logs' AND policyname = 'audit_logs_no_update'
    ) THEN '✅ UPDATE prevention policy active'
    ELSE '❌ Policy missing'
  END as status;

-- 4. Count total triggers
\echo ''
\echo '4️⃣ Audit Triggers:'
SELECT 
  COUNT(*) as total_triggers,
  CASE 
    WHEN COUNT(*) >= 24 THEN '✅ Expected number of triggers'
    ELSE '⚠️  Less triggers than expected'
  END as status
FROM pg_trigger t
JOIN pg_class c ON t.tgrelid = c.oid
JOIN pg_namespace n ON c.relnamespace = n.oid
WHERE n.nspname = 'public'
  AND t.tgname LIKE 'audit_%';

-- 5. List new triggers from Phase 1
\echo ''
\echo '5️⃣ New Triggers (Phase 1):'
SELECT 
  c.relname as table_name,
  '✅' as status
FROM pg_trigger t
JOIN pg_class c ON t.tgrelid = c.oid
JOIN pg_namespace n ON c.relnamespace = n.oid
WHERE n.nspname = 'public'
  AND t.tgname LIKE 'audit_%'
  AND c.relname IN (
    'sales_orders',
    'purchase_returns',
    'customer_debit_notes',
    'inventory_write_offs',
    'company_members',
    'company_role_permissions',
    'fixed_assets',
    'asset_transactions',
    'accounting_periods',
    'payroll_runs'
  )
ORDER BY c.relname;

-- 6. Verify function signature
\echo ''
\echo '6️⃣ Function Signature:'
SELECT 
  CASE 
    WHEN pg_get_function_arguments(oid) LIKE '%p_reason%' THEN '✅ Function has reason parameter'
    ELSE '❌ Function missing reason parameter'
  END as status
FROM pg_proc 
WHERE proname = 'create_audit_log';

\echo ''
\echo '✅ Verification Complete!'
