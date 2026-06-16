-- v3.74.189 — vendor_credits multi-currency. Mirror of v3.74.188 on the
-- supplier side. Source rows: purchase_returns (already FX-aware since
-- v3.74.171) and bills (currency_code + exchange_rate live on the bill).

ALTER TABLE public.vendor_credits
  ADD COLUMN IF NOT EXISTS original_currency text DEFAULT 'EGP',
  ADD COLUMN IF NOT EXISTS original_subtotal numeric(18,4),
  ADD COLUMN IF NOT EXISTS original_tax_amount numeric(18,4),
  ADD COLUMN IF NOT EXISTS original_total_amount numeric(18,4),
  ADD COLUMN IF NOT EXISTS exchange_rate_used numeric(18,8) DEFAULT 1,
  ADD COLUMN IF NOT EXISTS exchange_rate_id uuid REFERENCES public.exchange_rates(id);

-- Backfill from the linked purchase_return.
UPDATE public.vendor_credits vc
SET
  original_currency = COALESCE(NULLIF(vc.original_currency, ''), pr.original_currency, 'EGP'),
  exchange_rate_used = COALESCE(vc.exchange_rate_used, NULLIF(pr.exchange_rate_used, 0), 1),
  exchange_rate_id = COALESCE(vc.exchange_rate_id, pr.exchange_rate_id),
  original_subtotal = COALESCE(vc.original_subtotal,
    CASE WHEN COALESCE(pr.original_currency, 'EGP') = 'EGP' THEN vc.subtotal
         ELSE ROUND(vc.subtotal / NULLIF(COALESCE(pr.exchange_rate_used, 1), 0), 4) END),
  original_tax_amount = COALESCE(vc.original_tax_amount,
    CASE WHEN COALESCE(pr.original_currency, 'EGP') = 'EGP' THEN vc.tax_amount
         ELSE ROUND(vc.tax_amount / NULLIF(COALESCE(pr.exchange_rate_used, 1), 0), 4) END),
  original_total_amount = COALESCE(vc.original_total_amount,
    CASE WHEN COALESCE(pr.original_currency, 'EGP') = 'EGP' THEN vc.total_amount
         ELSE ROUND(vc.total_amount / NULLIF(COALESCE(pr.exchange_rate_used, 1), 0), 4) END)
FROM public.purchase_returns pr
WHERE vc.source_purchase_return_id = pr.id;

-- Backfill from the linked bill (the legacy bill-only path).
UPDATE public.vendor_credits vc
SET
  original_currency = COALESCE(NULLIF(vc.original_currency, ''), b.currency_code, 'EGP'),
  exchange_rate_used = COALESCE(vc.exchange_rate_used, NULLIF(b.exchange_rate, 0), 1),
  original_subtotal = COALESCE(vc.original_subtotal,
    CASE WHEN COALESCE(b.currency_code, 'EGP') = 'EGP' THEN vc.subtotal
         ELSE ROUND(vc.subtotal / NULLIF(COALESCE(b.exchange_rate, 1), 0), 4) END),
  original_tax_amount = COALESCE(vc.original_tax_amount,
    CASE WHEN COALESCE(b.currency_code, 'EGP') = 'EGP' THEN vc.tax_amount
         ELSE ROUND(vc.tax_amount / NULLIF(COALESCE(b.exchange_rate, 1), 0), 4) END),
  original_total_amount = COALESCE(vc.original_total_amount,
    CASE WHEN COALESCE(b.currency_code, 'EGP') = 'EGP' THEN vc.total_amount
         ELSE ROUND(vc.total_amount / NULLIF(COALESCE(b.exchange_rate, 1), 0), 4) END)
FROM public.bills b
WHERE vc.bill_id = b.id AND vc.original_currency IS NULL;

-- Fallback default.
UPDATE public.vendor_credits
SET
  original_currency = COALESCE(NULLIF(original_currency, ''), 'EGP'),
  original_subtotal = COALESCE(original_subtotal, subtotal),
  original_tax_amount = COALESCE(original_tax_amount, tax_amount),
  original_total_amount = COALESCE(original_total_amount, total_amount),
  exchange_rate_used = COALESCE(exchange_rate_used, 1)
WHERE original_currency IS NULL OR original_currency = ''
   OR original_total_amount IS NULL OR exchange_rate_used IS NULL;

-- Auto-fill trigger: prefer purchase_return, fall back to bill.
CREATE OR REPLACE FUNCTION public.fill_vendor_credit_fx_from_source()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_currency text;
  v_rate numeric(18,8);
  v_rate_id uuid;
BEGIN
  IF NEW.original_currency IS NOT NULL AND NEW.original_currency <> '' AND NEW.original_currency <> 'EGP' THEN
    NEW.exchange_rate_used := COALESCE(NEW.exchange_rate_used, 1);
    NEW.original_total_amount := COALESCE(NEW.original_total_amount, NEW.total_amount);
    NEW.original_subtotal := COALESCE(NEW.original_subtotal, NEW.subtotal);
    NEW.original_tax_amount := COALESCE(NEW.original_tax_amount, NEW.tax_amount);
    RETURN NEW;
  END IF;

  IF NEW.source_purchase_return_id IS NOT NULL THEN
    SELECT original_currency, exchange_rate_used, exchange_rate_id
    INTO v_currency, v_rate, v_rate_id
    FROM purchase_returns WHERE id = NEW.source_purchase_return_id;
  END IF;
  IF v_currency IS NULL AND NEW.bill_id IS NOT NULL THEN
    SELECT currency_code, exchange_rate, NULL::uuid
    INTO v_currency, v_rate, v_rate_id
    FROM bills WHERE id = NEW.bill_id;
  END IF;

  v_currency := COALESCE(v_currency, 'EGP');
  v_rate := COALESCE(NULLIF(v_rate, 0), 1);

  NEW.original_currency := COALESCE(NEW.original_currency, v_currency);
  NEW.exchange_rate_used := COALESCE(NEW.exchange_rate_used, v_rate);
  NEW.exchange_rate_id := COALESCE(NEW.exchange_rate_id, v_rate_id);
  NEW.original_subtotal := COALESCE(NEW.original_subtotal,
    CASE WHEN v_currency = 'EGP' THEN NEW.subtotal
         ELSE ROUND(NEW.subtotal / NULLIF(v_rate, 0), 4) END);
  NEW.original_tax_amount := COALESCE(NEW.original_tax_amount,
    CASE WHEN v_currency = 'EGP' THEN NEW.tax_amount
         ELSE ROUND(NEW.tax_amount / NULLIF(v_rate, 0), 4) END);
  NEW.original_total_amount := COALESCE(NEW.original_total_amount,
    CASE WHEN v_currency = 'EGP' THEN NEW.total_amount
         ELSE ROUND(NEW.total_amount / NULLIF(v_rate, 0), 4) END);

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_fill_vendor_credit_fx ON public.vendor_credits;
CREATE TRIGGER trg_fill_vendor_credit_fx
BEFORE INSERT ON public.vendor_credits
FOR EACH ROW EXECUTE FUNCTION public.fill_vendor_credit_fx_from_source();

COMMENT ON COLUMN public.vendor_credits.original_currency IS
  'v3.74.189: currency of the original purchase/refund. total_amount stays in base currency for accounting; original_total_amount carries the native amount.';
