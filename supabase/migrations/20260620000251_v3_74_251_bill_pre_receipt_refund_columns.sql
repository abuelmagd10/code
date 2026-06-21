-- v3.74.251 — pre-receipt payment refund audit columns on bills.
-- Purchases-side mirror of v3.74.250.
ALTER TABLE public.bills
  ADD COLUMN IF NOT EXISTS pre_receipt_refund_at    timestamptz,
  ADD COLUMN IF NOT EXISTS pre_receipt_refund_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pre_receipt_refund_amount numeric,
  ADD COLUMN IF NOT EXISTS pre_receipt_refund_mode   text CHECK (pre_receipt_refund_mode IN ('cancel_bill', 'keep_open')),
  ADD COLUMN IF NOT EXISTS pre_receipt_refund_reason text,
  ADD COLUMN IF NOT EXISTS pre_receipt_refund_je_id  uuid REFERENCES public.journal_entries(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.bills.pre_receipt_refund_mode   IS 'v3.74.251 — cancel_bill or keep_open.';
COMMENT ON COLUMN public.bills.pre_receipt_refund_je_id  IS 'v3.74.251 — aggregate refund JE.';
COMMENT ON COLUMN public.bills.pre_receipt_refund_amount IS 'v3.74.251 — total cash refunded by supplier.';
