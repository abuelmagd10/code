-- =============================================================================
-- Migration: HOTFIX — Fix WIP account conflict with existing 1140 (inventory)
-- Date: 2026-05-20
-- Author: AI Assistant (v3.8.1 — Manufacturing Phase B critical fix)
--
-- BUG (discovered during testing):
--   Migration 20260520000300_manufacturing_wip_accounts.sql used:
--     WHERE NOT EXISTS (account_code = '1140')
--   But account 1140 ALREADY EXISTED in all 47 companies as "المخزون" (Inventory).
--   So no new WIP account was created, and the subsequent UPDATE wrongly linked
--   companies.wip_account_id to the inventory account.
--
-- Result: 46 of 47 companies have wip_account_id = inventory account,
--   making material issue journals create Dr 1140 / Cr 1140 (same account!).
--
-- FIX:
--   1. Unlink wrong wip_account_id values (where sub_type != 'work_in_process')
--   2. Create WIP at account_code = '1145' (avoiding the 1140 collision)
--      with sub_type = 'work_in_process' for clear identification
--   3. Re-link companies.wip_account_id to the new 1145 accounts
--
-- Idempotent: Yes
-- Reversible: Yes (see ROLLBACK at bottom)
-- =============================================================================

-- =============================================================================
-- STEP 1: Unlink wip_account_id where it points to a non-WIP account
-- =============================================================================

UPDATE companies c
SET wip_account_id = NULL
FROM chart_of_accounts coa
WHERE c.wip_account_id = coa.id
  AND COALESCE(coa.sub_type, '') != 'work_in_process';

-- =============================================================================
-- STEP 2: Create proper WIP account at code 1145 for companies missing it
-- =============================================================================

INSERT INTO chart_of_accounts (
  company_id, account_code, account_name, account_type, sub_type,
  normal_balance, level, parent_id, opening_balance,
  is_active, is_system, is_archived,
  original_currency, exchange_rate_used
)
SELECT
  c.id,
  '1145',
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
  WHERE existing.company_id = c.id
    AND existing.sub_type = 'work_in_process'
);

-- =============================================================================
-- STEP 3: Re-link companies.wip_account_id to the correct WIP account
--         (by sub_type, not by code)
-- =============================================================================

UPDATE companies c
SET wip_account_id = coa.id
FROM chart_of_accounts coa
WHERE c.wip_account_id IS NULL
  AND coa.company_id = c.id
  AND coa.sub_type = 'work_in_process'
  AND coa.is_active = true;

-- =============================================================================
-- VERIFICATION QUERIES (informational, after running):
--   SELECT
--     COUNT(*) AS total,
--     COUNT(*) FILTER (WHERE coa.sub_type = 'work_in_process') AS correct_wip
--   FROM companies c
--   LEFT JOIN chart_of_accounts coa ON coa.id = c.wip_account_id;
--   -- Expected: total = correct_wip = 47
-- =============================================================================

-- =============================================================================
-- ROLLBACK SQL (run manually to reverse this migration):
--
--   UPDATE companies SET wip_account_id = NULL
--   WHERE wip_account_id IN (SELECT id FROM chart_of_accounts WHERE account_code='1145');
--   DELETE FROM chart_of_accounts WHERE account_code='1145' AND sub_type='work_in_process';
-- =============================================================================
