-- =============================================
-- TEST SCRIPT: Audit Log Phase 1 Verification
-- =============================================
-- Purpose: Verify that all Phase 1 changes are applied correctly
-- Run this after applying migrations

\echo '🧪 Starting Audit Log Phase 1 Verification...'
\echo ''

-- =============================================
-- 1. Schema Verification
-- =============================================
\echo '1️⃣ Verifying Schema Changes...'
\echo ''

-- Check action constraint
\echo '  ✓ Checking action types constraint...'
SELECT 
  conname as constraint_name,
  pg_get_constraintdef(oid) as definition
FROM pg_constraint 
WHERE conrelid = 'audit_logs'::regclass 
  AND conname = 'audit_logs_action_check';

-- Check reason column
\echo '  ✓ Checking reason column...'
SELECT 
  column_name, 
  data_type,
  is_nullable
FROM information_schema.columns 
WHERE table_name = 'audit_logs' 
  AND column_name = 'reason';

-- Check UPDATE prevention policy
\echo '  ✓ Checking UPDATE prevention policy...'
SELECT 
  policyname,
  cmd,
  qual,
  with_check
FROM pg_policies 
WHERE tablename = 'audit_logs' 
  AND policyname = 'audit_logs_no_update';

-- Check indexes
\echo '  ✓ Checking new indexes...'
SELECT 
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename = 'audit_logs'
  AND indexname IN ('idx_audit_logs_reason', 'idx_audit_logs_company_action_date');

\echo ''

-- =============================================
-- 2. Triggers Verification
-- =============================================
\echo '2️⃣ Verifying Triggers on Critical Tables...'
\echo ''

SELECT 
  t.tgname as trigger_name,
  c.relname as table_name,
  p.proname as function_name
FROM pg_trigger t
JOIN pg_class c ON t.tgrelid = c.oid
JOIN pg_proc p ON t.tgfoid = p.oid
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

\echo ''

-- =============================================
-- 3. Function Verification
-- =============================================
\echo '3️⃣ Verifying create_audit_log function signature...'
\echo ''

SELECT 
  p.proname as function_name,
  pg_get_function_arguments(p.oid) as arguments
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND p.proname = 'create_audit_log';

\echo ''

-- =============================================
-- 4. Summary
-- =============================================
\echo '📊 Verification Summary'
\echo ''

-- Count total triggers
\echo '  Total audit triggers:'
SELECT COUNT(*) as total_triggers
FROM pg_trigger t
JOIN pg_class c ON t.tgrelid = c.oid
JOIN pg_namespace n ON c.relnamespace = n.oid
WHERE n.nspname = 'public'
  AND t.tgname LIKE 'audit_%';

-- Count tables with triggers
\echo '  Tables with audit triggers:'
SELECT COUNT(DISTINCT c.relname) as tables_with_triggers
FROM pg_trigger t
JOIN pg_class c ON t.tgrelid = c.oid
JOIN pg_namespace n ON c.relnamespace = n.oid
WHERE n.nspname = 'public'
  AND t.tgname LIKE 'audit_%';

\echo ''
\echo '✅ Verification Complete!'
\echo ''
\echo 'Expected Results:'
\echo '  - Action constraint should include 13 action types'
\echo '  - reason column should exist (TEXT, nullable)'
\echo '  - audit_logs_no_update policy should exist with USING (false)'
\echo '  - 2 new indexes should exist'
\echo '  - 10 new triggers should exist on critical tables'
\echo '  - create_audit_log should accept p_reason parameter'
\echo '  - Total triggers should be 24+'
\echo ''
