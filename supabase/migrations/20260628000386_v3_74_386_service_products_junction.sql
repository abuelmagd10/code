-- v3.74.386 — Stage B of 2: service_products junction table.
--
-- A service like "تقشير" (peeling) can require consumable products
-- per execution — say 1 unit of peeling cream and 2 cotton pads. The
-- product BOM lives in this junction; per-booking quantity multiplies
-- by booking.quantity, and the warehouse on the invoice is what gets
-- deducted (Stage C).
--
-- Distinction
--   services.product_catalog_id  → the "service item" sold on the
--     invoice (line_total, revenue account). Not a consumable.
--   service_products             → the consumables that get deducted
--     from inventory when the service is executed. New in this stage.
--   booking-time extras (separate, mentioned by owner)
--     → extra products the staff can ADD during execution. Not part
--     of this stage.
--
-- RLS strategy
--   read: any company member can view the BOM of their company's
--         services (so the booking page can show what gets consumed)
--   write: owner / admin / general_manager / manager only (the same
--          set that already manages services).

CREATE TABLE IF NOT EXISTS public.service_products (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  service_id            uuid NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  product_id            uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  quantity_per_service  numeric(18,4) NOT NULL CHECK (quantity_per_service > 0),
  notes                 text,
  created_by            uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT NOW(),
  updated_at            timestamptz NOT NULL DEFAULT NOW(),

  -- Same product can't be linked twice to the same service.
  CONSTRAINT service_products_service_product_unique
    UNIQUE (service_id, product_id)
);

-- Hot paths: list BOM by service, find services that consume a product
CREATE INDEX IF NOT EXISTS service_products_service_idx
  ON public.service_products (service_id);
CREATE INDEX IF NOT EXISTS service_products_product_idx
  ON public.service_products (product_id);
CREATE INDEX IF NOT EXISTS service_products_company_idx
  ON public.service_products (company_id);

COMMENT ON TABLE public.service_products IS
  'v3.74.386 - Per-service consumable BOM. quantity_per_service is multiplied by booking.quantity at execution. Stock is deducted from the warehouse on the generated invoice.';

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.service_products_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS service_products_updated_at ON public.service_products;
CREATE TRIGGER service_products_updated_at
  BEFORE UPDATE ON public.service_products
  FOR EACH ROW EXECUTE FUNCTION public.service_products_set_updated_at();

-- ── RLS ────────────────────────────────────────────────────────
ALTER TABLE public.service_products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_products_select ON public.service_products;
CREATE POLICY service_products_select
  ON public.service_products
  FOR SELECT
  USING (
    company_id IN (
      SELECT cm.company_id FROM public.company_members cm
       WHERE cm.user_id = auth.uid()
    )
  );

-- All writes go through SECURITY DEFINER RPCs / API routes that
-- enforce role checks. No INSERT/UPDATE/DELETE RLS policies.

-- ── Helper for Stage C: list (product_id, qty_needed) for a service
-- multiplied by an arbitrary booking quantity. Stage C uses this in
-- the activation pre-check + the post-create deduction.
CREATE OR REPLACE FUNCTION public.get_service_consumables(
  p_service_id      uuid,
  p_booking_qty     numeric DEFAULT 1
)
RETURNS TABLE (
  product_id      uuid,
  product_name    text,
  qty_per_service numeric,
  qty_needed      numeric,
  track_inventory boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT sp.product_id,
         p.name,
         sp.quantity_per_service,
         sp.quantity_per_service * COALESCE(p_booking_qty, 1) AS qty_needed,
         COALESCE(p.track_inventory, false) AS track_inventory
    FROM public.service_products sp
    JOIN public.products p ON p.id = sp.product_id
   WHERE sp.service_id = p_service_id
   ORDER BY p.name;
$$;

COMMENT ON FUNCTION public.get_service_consumables(uuid, numeric) IS
  'v3.74.386 - Returns the BOM for a service multiplied by the booking quantity. track_inventory tells Stage C whether to gate / deduct stock.';
