-- =============================================
-- Quick Check: Verify Phase 1 Triggers
-- Run this in Supabase Dashboard to see all triggers
-- =============================================

\echo '🔍 Checking Phase 1 Triggers...'
\echo ''

-- List all audit triggers created in Phase 1
SELECT 
  c.relname as table_name,
  t.tgname as trigger_name,
  CASE 
    WHEN c.relname IN ('sales_orders', 'company_members', 'company_role_permissions') 
    THEN '✅ Core (Always Created)'
    ELSE '⚠️  Conditional (Created if table exists)'
  END as status,
  pg_get_triggerdef(t.oid) as trigger_definition
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
ORDER BY 
  CASE 
    WHEN c.relname IN ('sales_orders', 'company_members', 'company_role_permissions') THEN 1
    ELSE 2
  END,
  c.relname;

\echo ''
\echo '📊 Summary:'

-- Count triggers
SELECT 
  COUNT(*) as total_phase1_triggers,
  COUNT(*) FILTER (WHERE c.relname IN ('sales_orders', 'company_members', 'company_role_permissions')) as core_triggers,
  COUNT(*) FILTER (WHERE c.relname NOT IN ('sales_orders', 'company_members', 'company_role_permissions')) as conditional_triggers
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
  );

\echo ''
\echo '✅ Verification Complete!'
