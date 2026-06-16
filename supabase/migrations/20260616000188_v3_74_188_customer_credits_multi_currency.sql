-- v3.74.188 — customer_credits + customer_credit_ledger multi-currency support.
-- Part 2 of the audit launched in v3.74.186. customer_credits has carried the
-- net base-currency balance, which means a FX rate change between the moment
-- a credit was earned (from a USD sales_return) and the moment it was spent
-- (against an EGP-only invoice) was being silently absorbed into Sales.
-- Backfill source rows: payments, sales_returns, customer_credits.

ALTER TABLE public.customer_credits
  ADD COLUMN IF NOT EXISTS original_currency text DEFAULT 'EGP',
  ADD COLUMN IF NOT EXISTS original_amount numeric(18,4),
  ADD COLUMN IF NOT EXISTS exchange_rate_used numeric(18,8) DEFAULT 1,
  ADD COLUMN IF NOT EXISTS exchange_rate_id uuid REFERENCES public.exchange_rates(id);

ALTER TABLE public.customer_credit_ledger
  ADD COLUMN IF NOT EXISTS original_currency text DEFAULT 'EGP',
  ADD COLUMN IF NOT EXISTS original_amount numeric(18,4),
  ADD COLUMN IF NOT EXISTS exchange_rate_used numeric(18,8) DEFAULT 1,
  ADD COLUMN IF NOT EXISTS exchange_rate_id uuid REFERENCES public.exchange_rates(id);

-- Backfill customer_credits from the originating payment (overpayments).
UPDATE public.customer_credits cc
SET
  original_currency = COALESCE(NULLIF(cc.original_currency, ''), p.currency_code, 'EGP'),
  exchange_rate_used = COALESCE(cc.exchange_rate_used, NULLIF(p.exchange_rate, 0), 1),
  original_amount = COALESCE(cc.original_amount,
    CASE WHEN COALESCE(p.currency_code, 'EGP') = 'EGP' THEN cc.amount
         ELSE ROUND(cc.amount / NULLIF(COALESCE(p.exchange_rate, 1), 0), 4) END)
FROM public.payments p
WHERE cc.source_payment_id = p.id;

-- Backfill from sales_returns (credit from a return).
UPDATE public.customer_credits cc
SET
  original_currency = COALESCE(NULLIF(cc.original_currency, ''), sr.original_currency, 'EGP'),
  exchange_rate_used = COALESCE(cc.exchange_rate_used, NULLIF(sr.exchange_rate_used, 0), 1),
  exchange_rate_id = COALESCE(cc.exchange_rate_id, sr.exchange_rate_id),
  original_amount = COALESCE(cc.original_amount,
    CASE WHEN COALESCE(sr.original_currency, 'EGP') = 'EGP' THEN cc.amount
         ELSE ROUND(cc.amount / NULLIF(COALESCE(sr.exchange_rate_used, 1), 0), 4) END)
FROM public.sales_returns sr
WHERE cc.source_sales_return_id = sr.id
  AND cc.original_currency IS NULL;

-- Fallback default.
UPDATE public.customer_credits
SET original_currency = COALESCE(NULLIF(original_currency, ''), 'EGP'),
    original_amount = COALESCE(original_amount, amount),
    exchange_rate_used = COALESCE(exchange_rate_used, 1)
WHERE original_currency IS NULL OR original_currency = ''
   OR original_amount IS NULL OR exchange_rate_used IS NULL;

-- Backfill the ledger by joining to its parent credit row.
UPDATE public.customer_credit_ledger ledg
SET
  original_currency = COALESCE(NULLIF(ledg.original_currency, ''), cc.original_currency, 'EGP'),
  exchange_rate_used = COALESCE(ledg.exchange_rate_used, NULLIF(cc.exchange_rate_used, 0), 1),
  exchange_rate_id = COALESCE(ledg.exchange_rate_id, cc.exchange_rate_id),
  original_amount = COALESCE(ledg.original_amount,
    CASE WHEN COALESCE(cc.original_currency, 'EGP') = 'EGP' THEN ledg.amount
         ELSE ROUND(ledg.amount / NULLIF(COALESCE(cc.exchange_rate_used, 1), 0), 4) END)
FROM public.customer_credits cc
WHERE ledg.customer_credit_id = cc.id;

UPDATE public.customer_credit_ledger
SET original_currency = COALESCE(NULLIF(original_currency, ''), 'EGP'),
    original_amount = COALESCE(original_amount, amount),
    exchange_rate_used = COALESCE(exchange_rate_used, 1)
WHERE original_currency IS NULL OR original_currency = ''
   OR original_amount IS NULL OR exchange_rate_used IS NULL;

-- Auto-fill triggers. The procs that INSERT into these tables don't need
-- to be edited: the trigger inspects the source row (payment / sales_return)
-- and stamps the FX columns before the row hits disk.
CREATE OR REPLACE FUNCTION public.fill_customer_credit_fx_from_source()
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
    NEW.original_amount := COALESCE(NEW.original_amount, NEW.amount);
    RETURN NEW;
  END IF;

  IF NEW.source_payment_id IS NOT NULL THEN
    SELECT currency_code, exchange_rate, NULL::uuid
    INTO v_currency, v_rate, v_rate_id
    FROM payments WHERE id = NEW.source_payment_id;
  END IF;
  IF v_currency IS NULL AND NEW.source_sales_return_id IS NOT NULL THEN
    SELECT original_currency, exchange_rate_used, exchange_rate_id
    INTO v_currency, v_rate, v_rate_id
    FROM sales_returns WHERE id = NEW.source_sales_return_id;
  END IF;

  v_currency := COALESCE(v_currency, 'EGP');
  v_rate := COALESCE(NULLIF(v_rate, 0), 1);

  NEW.original_currency := COALESCE(NEW.original_currency, v_currency);
  NEW.exchange_rate_used := COALESCE(NEW.exchange_rate_used, v_rate);
  NEW.exchange_rate_id := COALESCE(NEW.exchange_rate_id, v_rate_id);
  NEW.original_amount := COALESCE(NEW.original_amount,
    CASE WHEN v_currency = 'EGP' THEN NEW.amount
         ELSE ROUND(NEW.amount / NULLIF(v_rate, 0), 4) END);
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_fill_customer_credit_fx ON public.customer_credits;
CREATE TRIGGER trg_fill_customer_credit_fx
BEFORE INSERT ON public.customer_credits
FOR EACH ROW EXECUTE FUNCTION public.fill_customer_credit_fx_from_source();

-- Same idea for the ledger: look at the parent credit row.
CREATE OR REPLACE FUNCTION public.fill_customer_credit_ledger_fx_from_source()
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
    NEW.original_amount := COALESCE(NEW.original_amount, NEW.amount);
    RETURN NEW;
  END IF;

  IF NEW.customer_credit_id IS NOT NULL THEN
    SELECT original_currency, exchange_rate_used, exchange_rate_id
    INTO v_currency, v_rate, v_rate_id
    FROM customer_credits WHERE id = NEW.customer_credit_id;
  END IF;

  v_currency := COALESCE(v_currency, 'EGP');
  v_rate := COALESCE(NULLIF(v_rate, 0), 1);

  NEW.original_currency := COALESCE(NEW.original_currency, v_currency);
  NEW.exchange_rate_used := COALESCE(NEW.exchange_rate_used, v_rate);
  NEW.exchange_rate_id := COALESCE(NEW.exchange_rate_id, v_rate_id);
  NEW.original_amount := COALESCE(NEW.original_amount,
    CASE WHEN v_currency = 'EGP' THEN NEW.amount
         ELSE ROUND(NEW.amount / NULLIF(v_rate, 0), 4) END);
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_fill_customer_credit_ledger_fx ON public.customer_credit_ledger;
CREATE TRIGGER trg_fill_customer_credit_ledger_fx
BEFORE INSERT ON public.customer_credit_ledger
FOR EACH ROW EXECUTE FUNCTION public.fill_customer_credit_ledger_fx_from_source();

COMMENT ON COLUMN public.customer_credits.original_currency IS
  'v3.74.188: currency the credit was earned in. amount stays in base currency for the customer_balance projection; original_amount + exchange_rate_used carry the native side.';
