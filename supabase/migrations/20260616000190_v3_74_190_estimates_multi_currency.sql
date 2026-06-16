-- v3.74.190 — estimates (quotes) carry no GL impact, but the quote needs
-- to remember which currency the customer was quoted in. Adds currency_code
-- + exchange_rate parallel to invoices / sales_orders.
ALTER TABLE public.estimates
  ADD COLUMN IF NOT EXISTS currency_code text DEFAULT 'EGP',
  ADD COLUMN IF NOT EXISTS exchange_rate numeric(18,8) DEFAULT 1,
  ADD COLUMN IF NOT EXISTS exchange_rate_id uuid REFERENCES public.exchange_rates(id);

UPDATE public.estimates
SET currency_code = COALESCE(NULLIF(currency_code, ''), 'EGP'),
    exchange_rate = COALESCE(exchange_rate, 1)
WHERE currency_code IS NULL OR currency_code = '' OR exchange_rate IS NULL;
