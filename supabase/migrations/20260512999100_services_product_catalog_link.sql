-- ==============================================================================
-- Booking Module — Integration Bridge (Phase D / Step 1)
-- File   : 20260512999100_services_product_catalog_link.sql
-- Purpose:
--   Add an optional FK bridge between the bookable-services catalog (services)
--   and the billing catalog (products) to enable:
--     • invoice_items.product_id population when completing a booking
--     • unified financial reporting across both invoicing paths
--     • optional GL reconciliation via products.income_account_id
--
-- Design:
--   • product_catalog_id is NULLABLE — no obligation to link
--   • Must reference a product with item_type = 'service' in the same company
--   • ON DELETE SET NULL so deleting a product never breaks a service
--   • Partial index for FK performance (only non-NULL rows indexed)
--   • Trigger validates company isolation and item_type constraint
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Add column
-- ------------------------------------------------------------------------------
ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS product_catalog_id UUID
    REFERENCES public.products(id)
    ON DELETE SET NULL
    DEFERRABLE INITIALLY DEFERRED;

COMMENT ON COLUMN public.services.product_catalog_id IS
  'Optional bridge: references a product (item_type=''service'') in the same company.
   When set, complete_booking_atomic uses this product_id in invoice_items,
   enabling the accounting engine to post revenue via products.income_account_id.
   NULL means a direct GL entry is created using services.revenue_account_id instead.';

-- ------------------------------------------------------------------------------
-- 2. Partial index (only non-NULL rows — avoids bloat for unlinked services)
-- ------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_services_product_catalog_id
  ON public.services(product_catalog_id)
  WHERE product_catalog_id IS NOT NULL;

-- ------------------------------------------------------------------------------
-- 3. Validation trigger function
--    Ensures:
--      a) product_catalog_id belongs to the same company as the service
--      b) referenced product has item_type = 'service'
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.svc_validate_product_catalog_company()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Skip check when the column is not being set or is being cleared
  IF NEW.product_catalog_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Reject if no matching service-type product in the same company
  IF NOT EXISTS (
    SELECT 1
      FROM public.products
     WHERE id          = NEW.product_catalog_id
       AND company_id  = NEW.company_id
       AND item_type   = 'service'
  ) THEN
    RAISE EXCEPTION
      'product_catalog_id (%) must reference a product with item_type=''service'' in the same company (%). '
      'Check that the product exists, belongs to company_id=%, and has item_type=''service''.',
      NEW.product_catalog_id, NEW.company_id, NEW.company_id
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

-- ------------------------------------------------------------------------------
-- 4. Attach trigger (BEFORE INSERT OR UPDATE)
-- ------------------------------------------------------------------------------
DROP TRIGGER IF EXISTS svc_trg_validate_product_catalog ON public.services;

CREATE TRIGGER svc_trg_validate_product_catalog
  BEFORE INSERT OR UPDATE OF product_catalog_id, company_id
  ON public.services
  FOR EACH ROW
  EXECUTE FUNCTION public.svc_validate_product_catalog_company();

-- ------------------------------------------------------------------------------
-- 5. Expose column in v_bookings_full view (extend SELECT to include it)
--    The view is recreated with the same definition + product_catalog_id.
--    If the view doesn't join services yet, we patch it here.
-- ------------------------------------------------------------------------------
-- (No view change required — v_bookings_full already joins services.
--  The new column is available transparently via SELECT * on the services row.
--  ServiceForm.tsx will fetch it via /api/services/[id].)
