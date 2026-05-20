-- =============================================================================
-- Migration: Manufacturing WIP + MOH + Wages Payable Accounts
-- Date: 2026-05-20
-- Author: AI Assistant (v3.8.0 — Manufacturing Phase B: WIP Journals)
--
-- Purpose:
--   Create the 3 default accounts required for manufacturing accounting per
--   IAS 2 (Inventories):
--     1130-WIP    : Work-in-Process (Asset)
--     2210-WAGES  : Wages Payable / Accrued Payroll (Liability)
--     5410-MOH    : Manufacturing Overhead Applied (Expense / Contra)
--
--   Also adds 3 nullable FK columns to companies for per-company overrides
--   (similar pattern to fx_gain_account_id / fx_loss_account_id from v3.4.0).
--
-- Account Code Rationale:
--   - 1130 chosen because invoice testing showed 1130 = AR in some CoAs, but
--     this is a NEW account "1140" to avoid collision.
--   - 2210 for Wages Payable (current liabilities)
--   - 5410 for MOH (manufacturing overhead = manufacturing expense)
--
-- Idempotent: Yes (WHERE NOT EXISTS)
-- Reversible: Yes (see ROLLBACK section)
-- =============================================================================

-- =============================================================================
-- STEP 1: Add nullable account FK columns to companies
-- =============================================================================

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS wip_account_id UUID
    REFERENCES chart_of_accounts(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS manufacturing_overhead_account_id UUID
    REFERENCES chart_of_accounts(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS wages_payable_account_id UUID
    REFERENCES chart_of_accounts(id) ON DELETE RESTRICT;

COMMENT ON COLUMN companies.wip_account_id
  IS 'FK to chart_of_accounts for Work-in-Process. NULL = lookup by account_code 1140.';
COMMENT ON COLUMN companies.manufacturing_overhead_account_id
  IS 'FK to chart_of_accounts for Manufacturing Overhead Applied. NULL = lookup by 5410.';
COMMENT ON COLUMN companies.wages_payable_account_id
  IS 'FK to chart_of_accounts for Wages Payable. NULL = lookup by 2210.';

-- =============================================================================
-- STEP 2: Create 1140 - WIP (Work in Process) for all companies missing it
-- =============================================================================

INSERT INTO chart_of_accounts (
  company_id, account_code, account_name, account_type, sub_type,
  normal_balance, level, parent_id, opening_balance,
  is_active, is_system, is_archived,
  original_currency, exchange_rate_used
)
SELECT
  c.id,
  '1140',
  'الإنتاج تحت التشغيل',
  'asset',
  'work_in_process',
  'debit',
  3,
  (SELECT id FROM chart_of_accounts WHERE company_id = c.id AND account_code = '1100' LIMIT 1),
  0,
  true, true, false,
  COALESCE(c.base_currency, 'EGP'),
  1
FROM companies c
WHERE NOT EXISTS (
  SELECT 1 FROM chart_of_accounts existing
  WHERE existing.company_id = c.id AND existing.account_code = '1140'
);

-- =============================================================================
-- STEP 3: Create 2210 - Wages Payable for all companies missing it
-- =============================================================================

INSERT INTO chart_of_accounts (
  company_id, account_code, account_name, account_type, sub_type,
  normal_balance, level, parent_id, opening_balance,
  is_active, is_system, is_archived,
  original_currency, exchange_rate_used
)
SELECT
  c.id,
  '2210',
  'أجور مستحقة الدفع',
  'liability',
  'wages_payable',
  'credit',
  3,
  (SELECT id FROM chart_of_accounts WHERE company_id = c.id AND account_code = '2200' LIMIT 1),
  0,
  true, true, false,
  COALESCE(c.base_currency, 'EGP'),
  1
FROM companies c
WHERE NOT EXISTS (
  SELECT 1 FROM chart_of_accounts existing
  WHERE existing.company_id = c.id AND existing.account_code = '2210'
);

-- =============================================================================
-- STEP 4: Create 5410 - Manufacturing Overhead Applied for all companies
-- =============================================================================

INSERT INTO chart_of_accounts (
  company_id, account_code, account_name, account_type, sub_type,
  normal_balance, level, parent_id, opening_balance,
  is_active, is_system, is_archived,
  original_currency, exchange_rate_used
)
SELECT
  c.id,
  '5410',
  'أعباء صناعية محملة',
  'expense',
  'manufacturing_overhead_applied',
  'debit',
  3,
  (SELECT id FROM chart_of_accounts WHERE company_id = c.id AND account_code = '5400' LIMIT 1),
  0,
  true, true, false,
  COALESCE(c.base_currency, 'EGP'),
  1
FROM companies c
WHERE NOT EXISTS (
  SELECT 1 FROM chart_of_accounts existing
  WHERE existing.company_id = c.id AND existing.account_code = '5410'
);

-- =============================================================================
-- STEP 5: Auto-link the new accounts to companies (companies.wip_account_id, etc.)
-- =============================================================================

UPDATE companies c
SET wip_account_id = coa.id
FROM chart_of_accounts coa
WHERE c.wip_account_id IS NULL
  AND coa.company_id = c.id
  AND coa.account_code = '1140'
  AND coa.is_active = true;

UPDATE companies c
SET wages_payable_account_id = coa.id
FROM chart_of_accounts coa
WHERE c.wages_payable_account_id IS NULL
  AND coa.company_id = c.id
  AND coa.account_code = '2210'
  AND coa.is_active = true;

UPDATE companies c
SET manufacturing_overhead_account_id = coa.id
FROM chart_of_accounts coa
WHERE c.manufacturing_overhead_account_id IS NULL
  AND coa.company_id = c.id
  AND coa.account_code = '5410'
  AND coa.is_active = true;

-- =============================================================================
-- ROLLBACK SQL (run manually to reverse this migration):
--
--   ALTER TABLE companies
--     DROP COLUMN IF EXISTS wip_account_id,
--     DROP COLUMN IF EXISTS manufacturing_overhead_account_id,
--     DROP COLUMN IF EXISTS wages_payable_account_id;
--   DELETE FROM chart_of_accounts WHERE account_code IN ('1140','2210','5410') AND is_system = true;
-- =============================================================================
