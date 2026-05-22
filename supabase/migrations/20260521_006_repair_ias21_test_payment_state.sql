-- v3.23.0 cleanup: repair IAS21-TEST payment GL state.
--
-- Background: a manual v3.10.0 hotfix left this payment in an inconsistent state:
-- - Original invoice_payment journal 77dc3f52 posted with FC amounts (2 EGP)
-- - FX adjustment journal 9e9c040a created as DRAFT (delta to correct:
--     +104.22 cash, -98 AR, +6.22 FX gain)
-- - Reversal 384a8785 posted, cancelling the original journal entirely
--
-- Effect: payment record is "approved" and visible in /payments list, but its GL
-- effect is zero — customer balance ignored the 2 USD payment.
--
-- Fix:
-- 1. Soft-delete the reversal 384a8785 (un-cancel the original)
-- 2. Post the FX adjustment 9e9c040a (apply the delta)
--
-- Final state (correct IAS 21 §28):
--   Cash Dr 106.22 EGP (2 USD × 53.11 at payment rate)
--   AR   Cr 100.00 EGP (2 USD × 50.00 at invoice rate)
--   FX Gain Cr 6.22 EGP (rate diff)
--
-- Customer ahmed abuelmagd AR after this migration:
--   4999.32 EGP (was) → 4899.32 EGP (now correct)
--
-- Status: Applied to Production on 2026-05-21.

DO $$
BEGIN
  PERFORM set_config('app.allow_direct_post', 'true', true);

  -- 1. Soft-delete the reversal journal
  UPDATE journal_entries
  SET is_deleted = true, deleted_at = NOW()
  WHERE id = '384a8785-d91e-4d7a-85ca-2f505b50637a'
    AND reference_type = 'reversal';

  -- 2. Post the FX adjustment (draft → posted)
  UPDATE journal_entries
  SET status = 'posted'
  WHERE id = '9e9c040a-7b75-41e7-a8df-14fd403a37b2'
    AND status = 'draft';

  PERFORM set_config('app.allow_direct_post', 'false', true);
END $$;
