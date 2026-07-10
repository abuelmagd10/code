-- =====================================================================
-- v3.74.596 — "استلام من الفرع" delivery option for booking invoices
-- (applied to production via Supabase MCP on 2026-07-10; mirrored here)
--
-- System philosophy (settings/shipping docs): shipping provider =
-- DELIVERY METHOD (external courier / on-site pickup / internal
-- courier), mandatory on sales invoices. Booking-generated invoices
-- were created with NULL provider, worrying the accountant and
-- breaking the "every invoice states its delivery method" rule.
--
-- (1) auto-seed provider 'استلام من الفرع' (code onsite_pickup,
--     base_url 'manual' per the settings-page guidance) per company +
--     map it to every branch (branch_shipping_providers) + keep it
--     mapped for future branches via trigger. Seeded 4 companies /
--     5 branch mappings at apply time.
-- (2) complete_booking_atomic stamps new booking invoices with it —
--     booking customers receive goods in person at the branch. The
--     accountant can still switch the DRAFT to a courier if the
--     customer wants delivery (then it enters the third-party cycle).
-- (3) backfill INV-2026-00001 (the draft test invoice) — verified
--     stamped 'استلام من الفرع'.
--
-- NOTE: full complete_booking_atomic body lives in the applied
-- migration (v3.74.578 definition + v_pickup_provider lookup + the
-- shipping_provider_id column in the invoice INSERT). See MCP
-- migration v3_74_596_onsite_pickup_for_booking_invoices for the
-- authoritative text; this mirror records intent and the seed parts.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.ensure_onsite_pickup_provider(p_company_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_id uuid;
BEGIN
  SELECT id INTO v_id FROM public.shipping_providers
  WHERE company_id = p_company_id AND provider_code = 'onsite_pickup'
  LIMIT 1;

  IF v_id IS NULL THEN
    INSERT INTO public.shipping_providers
      (company_id, provider_name, provider_code, base_url, is_active)
    VALUES
      (p_company_id, 'استلام من الفرع', 'onsite_pickup', 'manual', true)
    RETURNING id INTO v_id;
  END IF;

  INSERT INTO public.branch_shipping_providers (branch_id, shipping_provider_id, is_active)
  SELECT b.id, v_id, true
  FROM public.branches b
  WHERE b.company_id = p_company_id
    AND NOT EXISTS (
      SELECT 1 FROM public.branch_shipping_providers bsp
      WHERE bsp.branch_id = b.id AND bsp.shipping_provider_id = v_id
    );

  RETURN v_id;
END;
$$;

DO $$
DECLARE c RECORD;
BEGIN
  FOR c IN SELECT id FROM public.companies LOOP
    PERFORM public.ensure_onsite_pickup_provider(c.id);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.map_pickup_provider_to_new_branch()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_id uuid;
BEGIN
  SELECT id INTO v_id FROM public.shipping_providers
  WHERE company_id = NEW.company_id AND provider_code = 'onsite_pickup'
  LIMIT 1;
  IF v_id IS NOT NULL THEN
    INSERT INTO public.branch_shipping_providers (branch_id, shipping_provider_id, is_active)
    SELECT NEW.id, v_id, true
    WHERE NOT EXISTS (
      SELECT 1 FROM public.branch_shipping_providers bsp
      WHERE bsp.branch_id = NEW.id AND bsp.shipping_provider_id = v_id
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS branches_map_pickup_provider ON public.branches;
CREATE TRIGGER branches_map_pickup_provider
AFTER INSERT ON public.branches
FOR EACH ROW EXECUTE FUNCTION public.map_pickup_provider_to_new_branch();
