-- v3.74.173 — Auto-execute cash/bank refund on warehouse confirm.
--
-- See file body for the full design notes. Applied to production via
-- apply_migration. PRET-67525 (the test case) was retro-fitted by hand
-- with the chosen cash account (1001) and the JE flipped from Dr 1180 /
-- Cr 1140 to Dr 1001 / Cr 1140. Workflow_status added 'closed' to the
-- allowed values to match the seal path.

ALTER TABLE public.purchase_returns
  ADD COLUMN IF NOT EXISTS refund_account_id uuid REFERENCES public.chart_of_accounts(id);

COMMENT ON COLUMN public.purchase_returns.refund_account_id IS
  'v3.74.173: cash/bank account the supplier returns money INTO when '
  'settlement_method is cash/bank_transfer. confirm_purchase_return_delivery_v2 '
  'auto-debits this account for the vc_debit portion and closes the return.';

ALTER TABLE public.purchase_returns
  DROP CONSTRAINT IF EXISTS chk_purchase_returns_workflow_status;
ALTER TABLE public.purchase_returns
  ADD CONSTRAINT chk_purchase_returns_workflow_status
  CHECK (workflow_status = ANY (ARRAY[
    'pending_admin_approval'::text, 'pending_warehouse'::text,
    'warehouse_rejected'::text, 'pending_approval'::text,
    'partial_approval'::text, 'confirmed'::text, 'completed'::text,
    'rejected'::text, 'cancelled'::text, 'closed'::text
  ]));

-- The full bodies of confirm_purchase_return_delivery_v2 and
-- process_purchase_return_atomic in v3.74.173 are documented in the
-- apply_migration call run against production. They:
--   * accept p_purchase_return->>'refund_account_id' and persist it.
--   * when settlement_method IN ('cash','bank_transfer') AND
--     refund_account_id IS NOT NULL AND v_vc_debit > 0, debit the chosen
--     cash account directly (instead of vendor_credit_liability), skip
--     creating a vendor_credits row, and seal the return:
--       status='closed', workflow_status='closed',
--       financial_status='refund_recorded'.
--   * fall through to the original AP / vendor_credit_liability flow
--     when refund_account_id is null.
