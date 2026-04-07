-- Phase 1B Post-Migration Checks
-- Run immediately after 20260406_002_enterprise_financial_phase1_v2.sql

-- 1) Confirm trace tables exist
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('financial_operation_traces', 'financial_operation_trace_links')
ORDER BY table_name;

-- 2) Confirm required functions exist
SELECT routine_name
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN (
    'require_open_financial_period_db',
    'assert_journal_entries_balanced_v2',
    'post_accounting_event_v2',
    'post_invoice_atomic_v2',
    'approve_sales_delivery_v2',
    'process_sales_return_atomic_v2',
    'process_invoice_payment_atomic_v2'
  )
ORDER BY routine_name;

-- 3) Confirm feature flags remain OFF by default at runtime
-- Replace these values using your deployment environment tooling, not SQL.
SELECT
  'ERP_PHASE1_V2_INVOICE_POST' AS flag_name,
  'expected=false in runtime environment' AS expectation
UNION ALL
SELECT 'ERP_PHASE1_V2_WAREHOUSE_APPROVAL', 'expected=false in runtime environment'
UNION ALL
SELECT 'ERP_PHASE1_V2_PAYMENT', 'expected=false in runtime environment'
UNION ALL
SELECT 'ERP_PHASE1_V2_RETURNS', 'expected=false in runtime environment'
UNION ALL
SELECT 'ERP_PHASE1_FINANCIAL_EVENTS', 'expected=false in runtime environment';

-- 4) Confirm the hard period guard executes
-- Replace the company UUID with the production company under validation.
SELECT require_open_financial_period_db(
  '00000000-0000-0000-0000-000000000000'::uuid,
  CURRENT_DATE
);
