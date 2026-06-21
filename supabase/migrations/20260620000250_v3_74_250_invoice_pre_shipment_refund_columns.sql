-- v3.74.250 — pre-shipment payment refund audit columns on invoices.
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS pre_shipment_refund_at    timestamptz,
  ADD COLUMN IF NOT EXISTS pre_shipment_refund_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pre_shipment_refund_amount numeric,
  ADD COLUMN IF NOT EXISTS pre_shipment_refund_mode   text CHECK (pre_shipment_refund_mode IN ('cancel_invoice', 'keep_open')),
  ADD COLUMN IF NOT EXISTS pre_shipment_refund_reason text,
  ADD COLUMN IF NOT EXISTS pre_shipment_refund_je_id  uuid REFERENCES public.journal_entries(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.invoices.pre_shipment_refund_mode   IS 'v3.74.250 — cancel_invoice or keep_open.';
COMMENT ON COLUMN public.invoices.pre_shipment_refund_je_id  IS 'v3.74.250 — aggregate refund JE.';
COMMENT ON COLUMN public.invoices.pre_shipment_refund_amount IS 'v3.74.250 — total cash refunded.';
