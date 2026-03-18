-- =============================================================================
-- Migration: 20260318120000_disable_legacy_accrual_triggers_on_bills
-- Purpose  : Disable two legacy triggers that fire on bill status change and
--            try to INSERT directly into journal_entries, conflicting with the
--            enforce_je_integrity trigger (DIRECT_POST_BLOCKED).
--
--            These triggers are superseded by the RPC-based posting flow:
--            - handleApproveReceipt → postBillAtomic → post_purchase_transaction
--              which already creates journal entries correctly with
--              app.allow_direct_post='true' flag set.
--
--            Disabling (not dropping) preserves the definitions if needed later.
-- =============================================================================

-- Disable legacy accrual trigger (duplicate journal entries on sent/received)
ALTER TABLE bills DISABLE TRIGGER trg_accrual_bill;

-- Disable legacy accrual engine (duplicate journal entries logic)
ALTER TABLE bills DISABLE TRIGGER trg_accrual_bills;
