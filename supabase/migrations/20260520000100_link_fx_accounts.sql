-- =============================================================================
-- Migration: Auto-link FX Gain/Loss accounts on companies
-- Date: 2026-05-20
-- Author: AI Assistant (v3.4.0 — IAS 21 compliance follow-up)
--
-- Purpose:
--   Migration 20260519000200 added columns companies.fx_gain_account_id and
--   companies.fx_loss_account_id, but left them NULL. This migration populates
--   them automatically by linking to the matching account codes 4320 / 5310
--   that already exist in each company's chart_of_accounts.
--
-- Why this matters:
--   - getFXAccounts() falls back to account-code lookup when the columns are
--     NULL, so the system currently works — but the link is implicit.
--   - Making the link explicit at the company row makes the configuration
--     visible in the UI (settings page) and auditable.
--   - It also enables companies to later override the default by pointing
--     fx_gain_account_id / fx_loss_account_id to a different account.
--
-- Idempotent: Yes (only updates rows where the column is NULL)
-- Reversible: Yes (see ROLLBACK section at bottom)
-- =============================================================================

-- =============================================================================
-- STEP 1: Link fx_gain_account_id to account 4320 where currently NULL
-- =============================================================================

UPDATE companies c
SET fx_gain_account_id = coa.id
FROM chart_of_accounts coa
WHERE c.fx_gain_account_id IS NULL
  AND coa.company_id = c.id
  AND coa.account_code = '4320'
  AND coa.is_active = true;

-- =============================================================================
-- STEP 2: Link fx_loss_account_id to account 5310 where currently NULL
-- =============================================================================

UPDATE companies c
SET fx_loss_account_id = coa.id
FROM chart_of_accounts coa
WHERE c.fx_loss_account_id IS NULL
  AND coa.company_id = c.id
  AND coa.account_code = '5310'
  AND coa.is_active = true;

-- =============================================================================
-- STEP 3: Verification (informational — does not change data)
-- =============================================================================
-- After this migration runs, run:
--   SELECT
--     COUNT(*) AS total,
--     COUNT(fx_gain_account_id) AS linked_gain,
--     COUNT(fx_loss_account_id) AS linked_loss
--   FROM companies;
-- Expected: total = linked_gain = linked_loss = 47 (or matching company count)

-- =============================================================================
-- ROLLBACK SQL (run manually to reverse this migration):
--
--   UPDATE companies SET fx_gain_account_id = NULL, fx_loss_account_id = NULL;
--
-- Note: The code's getFXAccounts() fallback will continue to work after
-- rollback (it looks up account codes 4320/5310 when the link is NULL).
-- =============================================================================
