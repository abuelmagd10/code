-- v3.74.187 — give sales_returns the same FX columns purchase_returns
-- has, so a return on a USD invoice keeps the rate used at return time
-- instead of being silently treated as base currency.
ALTER TABLE public.sales_returns
  ADD COLUMN IF NOT EXISTS original_currency text,
  ADD COLUMN IF NOT EXISTS original_subtotal numeric(18,4),
  ADD COLUMN IF NOT EXISTS original_tax_amount numeric(18,4),
  ADD COLUMN IF NOT EXISTS original_total_amount numeric(18,4),
  ADD COLUMN IF NOT EXISTS exchange_rate_used numeric(18,8),
  ADD COLUMN IF NOT EXISTS exchange_rate_id uuid REFERENCES public.exchange_rates(id),
  ADD COLUMN IF NOT EXISTS exchange_rate_at_return numeric(18,8);

UPDATE public.sales_returns sr
SET
  original_currency = COALESCE(sr.original_currency, i.currency_code, 'EGP'),
  exchange_rate_used = COALESCE(sr.exchange_rate_used,
    NULLIF((i.exchange_rate)::numeric, 0),
    NULLIF((i.exchange_rate_used)::numeric, 0),
    1),
  exchange_rate_at_return = COALESCE(sr.exchange_rate_at_return,
    NULLIF((i.exchange_rate)::numeric, 0),
    NULLIF((i.exchange_rate_used)::numeric, 0),
    1),
  original_subtotal = COALESCE(sr.original_subtotal,
    CASE WHEN COALESCE(i.currency_code, 'EGP') = 'EGP' THEN sr.subtotal
         ELSE ROUND(sr.subtotal / NULLIF(COALESCE(i.exchange_rate, i.exchange_rate_used, 1), 0), 4) END),
  original_tax_amount = COALESCE(sr.original_tax_amount,
    CASE WHEN COALESCE(i.currency_code, 'EGP') = 'EGP' THEN sr.tax_amount
         ELSE ROUND(sr.tax_amount / NULLIF(COALESCE(i.exchange_rate, i.exchange_rate_used, 1), 0), 4) END),
  original_total_amount = COALESCE(sr.original_total_amount,
    CASE WHEN COALESCE(i.currency_code, 'EGP') = 'EGP' THEN sr.total_amount
         ELSE ROUND(sr.total_amount / NULLIF(COALESCE(i.exchange_rate, i.exchange_rate_used, 1), 0), 4) END)
FROM public.invoices i
WHERE sr.invoice_id = i.id;

UPDATE public.sales_returns
SET
  original_currency = COALESCE(original_currency, 'EGP'),
  exchange_rate_used = COALESCE(exchange_rate_used, 1),
  exchange_rate_at_return = COALESCE(exchange_rate_at_return, 1),
  original_subtotal = COALESCE(original_subtotal, subtotal),
  original_tax_amount = COALESCE(original_tax_amount, tax_amount),
  original_total_amount = COALESCE(original_total_amount, total_amount)
WHERE original_currency IS NULL OR exchange_rate_used IS NULL;
