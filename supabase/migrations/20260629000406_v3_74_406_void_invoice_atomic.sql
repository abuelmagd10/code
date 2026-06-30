-- v3.74.406 — Sales invoice void. See CONTRACTS.md Section P.
-- Body lives in DB (applied via Supabase MCP).

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS voided_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS voided_at timestamptz,
  ADD COLUMN IF NOT EXISTS voided_reason text;

-- void_invoice_atomic body summary:
--   * gate: status=draft + no payments + no JE + no inventory tx
--   * sets invoices.status='voided' + voided_by/at/reason
--   * cancels pending discount_approvals on the invoice
--   * clears sales_orders.invoice_id (SO status unchanged because SO
--     has no approval workflow)
--   * writes audit_logs row with action='VOID'
-- Section P added to assert_baseline.
