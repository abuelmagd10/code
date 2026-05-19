-- =============================================================================
-- Migration: Configure FX (Foreign Exchange) Gain/Loss Accounts
-- Date: 2026-05-19
-- Author: AI Assistant (Phase 2-A: Critical Safety Fixes)
--
-- Purpose:
--   1. Create account 4320 (أرباح فروق العملة / FX Gains) for all companies
--      that have parent account 4300 but are missing 4320.
--   2. Add fx_gain_account_id and fx_loss_account_id columns to companies table
--      so each company can configure its own FX accounts.
--
-- Context:
--   - Account 4320 is defined in default-chart-of-accounts.ts:158 but was never
--     created via migration. Account 5310 (FX Losses) already exists in all 47 companies.
--   - The old code incorrectly used hardcoded accounts 4200 (Service Revenue) and
--     5200 (Operating Expenses) for FX entries. No FX entries were ever posted
--     (confirmed via production DB query on 2026-05-19), so no historical correction needed.
--
-- Idempotent: Yes (WHERE NOT EXISTS + IF NOT EXISTS)
-- Reversible: Yes (see ROLLBACK section at bottom)
-- =============================================================================

-- =============================================================================
-- STEP 1: Create account 4320 (أرباح فروق العملة) for all companies
-- =============================================================================
-- Matches the structure of sibling accounts under 4300 (إيرادات أخرى):
--   account_type = 'income', normal_balance = 'credit', level = 3
-- Only inserts for companies that have 4300 but are missing 4320.

INSERT INTO chart_of_accounts (
  company_id,
  account_code,
  account_name,
  account_type,
  normal_balance,
  level,
  parent_id,
  opening_balance,
  is_active,
  is_system,
  is_archived,
  original_currency,
  exchange_rate_used
)
SELECT
  c.id,
  '4320',
  'أرباح فروق العملة',
  'income',
  'credit',
  3,
  parent_4300.id,
  0,
  true,
  false,
  false,
  COALESCE(c.base_currency, 'EGP'),
  1
FROM companies c
INNER JOIN chart_of_accounts parent_4300
  ON parent_4300.company_id = c.id
  AND parent_4300.account_code = '4300'
WHERE NOT EXISTS (
  SELECT 1 FROM chart_of_accounts existing
  WHERE existing.company_id = c.id
    AND existing.account_code = '4320'
);

-- =============================================================================
-- STEP 2: Add FX account configuration columns to companies table
-- =============================================================================
-- Both columns are nullable (NULL = use default 4320/5310 via code fallback).
-- ON DELETE RESTRICT prevents deleting an account that is configured as FX account.

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS fx_gain_account_id UUID
    REFERENCES chart_of_accounts(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS fx_loss_account_id UUID
    REFERENCES chart_of_accounts(id) ON DELETE RESTRICT;

COMMENT ON COLUMN companies.fx_gain_account_id
  IS 'FK to chart_of_accounts for FX Gains. NULL = default to account code 4320.';
COMMENT ON COLUMN companies.fx_loss_account_id
  IS 'FK to chart_of_accounts for FX Losses. NULL = default to account code 5310.';

-- =============================================================================
-- ROLLBACK SQL (run manually to reverse this migration):
--
--   ALTER TABLE companies DROP COLUMN IF EXISTS fx_gain_account_id;
--   ALTER TABLE companies DROP COLUMN IF EXISTS fx_loss_account_id;
--   DELETE FROM chart_of_accounts
--     WHERE account_code = '4320'
--       AND account_name = 'أرباح فروق العملة';
-- =============================================================================
