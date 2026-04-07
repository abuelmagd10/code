-- =============================================================================
-- Migration: 20260407_005_add_payments_warehouse_id.sql
-- Purpose : Add missing warehouse_id to payments so invoice/bill payment RPCs
--           can persist warehouse context without failing with column 42703.
-- =============================================================================

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS warehouse_id UUID REFERENCES public.warehouses(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_payments_company_warehouse_id
  ON public.payments(company_id, warehouse_id)
  WHERE warehouse_id IS NOT NULL;

COMMENT ON COLUMN public.payments.warehouse_id IS
  'Warehouse context associated with the payment source document when available.';

-- Historical payment rows may have legacy branch/company inconsistencies.
-- Disable user triggers during warehouse_id backfill so scope/paid_amount sync
-- triggers do not block this additive metadata repair.
ALTER TABLE public.payments DISABLE TRIGGER USER;

-- Backfill from linked sales invoices when warehouse context exists there and
-- the payment/invoice belong to the same company.
UPDATE public.payments p
SET warehouse_id = i.warehouse_id
FROM public.invoices i
WHERE p.invoice_id = i.id
  AND p.company_id = i.company_id
  AND p.warehouse_id IS NULL
  AND i.warehouse_id IS NOT NULL;

-- Backfill from linked purchase bills when warehouse context exists there and
-- the payment/bill belong to the same company.
UPDATE public.payments p
SET warehouse_id = b.warehouse_id
FROM public.bills b
WHERE p.bill_id = b.id
  AND p.company_id = b.company_id
  AND p.warehouse_id IS NULL
  AND b.warehouse_id IS NOT NULL;

ALTER TABLE public.payments ENABLE TRIGGER USER;
