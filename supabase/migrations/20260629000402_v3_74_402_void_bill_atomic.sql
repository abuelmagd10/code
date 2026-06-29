-- v3.74.402 — see CONTRACTS.md Section N.
-- The actual function body lives in DB (applied via Supabase MCP);
-- this file is the canonical source for rebuilds.

ALTER TABLE public.bills
  ADD COLUMN IF NOT EXISTS voided_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS voided_at timestamptz,
  ADD COLUMN IF NOT EXISTS voided_reason text;

-- void_bill_atomic body:
--   * status='draft' + no payments → set status='voided',
--     voided_by, voided_at, voided_reason
--   * cancel any pending discount_approvals on the bill
--   * unblock the linked PO: bill_id = NULL, status = 'pending_approval'
--   * write audit_logs row with action='VOID'
-- Permission: owner / admin / general_manager / accountant.
-- assert_baseline() Section N pins the body markers so a future
-- migration that drops the PO unblock or the discount-approval cleanup
-- fails baseline before it can ship.
