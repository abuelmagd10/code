-- v3.74.403 — Stage A of sales-module catch-up.
-- See CONTRACTS.md Section H (expanded).
-- Body lives in DB (applied via Supabase MCP). This file is the
-- canonical source for rebuilds.

ALTER TABLE public.invoice_items
  ADD COLUMN IF NOT EXISTS tax_code_id uuid REFERENCES public.tax_codes(id) ON DELETE SET NULL;
ALTER TABLE public.sales_order_items
  ADD COLUMN IF NOT EXISTS tax_code_id uuid REFERENCES public.tax_codes(id) ON DELETE SET NULL;
ALTER TABLE public.vendor_credit_items
  ADD COLUMN IF NOT EXISTS tax_code_id uuid REFERENCES public.tax_codes(id) ON DELETE SET NULL;
ALTER TABLE public.estimate_items
  ADD COLUMN IF NOT EXISTS tax_code_id uuid REFERENCES public.tax_codes(id) ON DELETE SET NULL;
ALTER TABLE public.customer_debit_note_items
  ADD COLUMN IF NOT EXISTS tax_code_id uuid REFERENCES public.tax_codes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_invoice_items_tax_code_id ON public.invoice_items(tax_code_id);
CREATE INDEX IF NOT EXISTS idx_sales_order_items_tax_code_id ON public.sales_order_items(tax_code_id);
CREATE INDEX IF NOT EXISTS idx_vendor_credit_items_tax_code_id ON public.vendor_credit_items(tax_code_id);
CREATE INDEX IF NOT EXISTS idx_estimate_items_tax_code_id ON public.estimate_items(tax_code_id);
CREATE INDEX IF NOT EXISTS idx_customer_debit_note_items_tax_code_id ON public.customer_debit_note_items(tax_code_id);

-- assert_baseline() Section H expanded to cover all 7 items tables
-- (purchase, bill, invoice, sales_order, vendor_credit, estimate,
-- customer_debit_note). Body installed in DB via MCP.
