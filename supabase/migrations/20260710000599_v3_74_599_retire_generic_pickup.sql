-- =====================================================================
-- v3.74.599 — retire the generic 'استلام من الفرع' (onsite_pickup)
-- completely (applied to production via Supabase MCP on 2026-07-10 as
-- v3_74_598b_retire_generic_pickup; mirrored here).
--
-- Superseded by per-branch outlets (v3.74.597). The owner spotted the
-- generic option still listed (and one company copy re-activated) in
-- settings/shipping. Verified before deletion: ZERO invoice references
-- and ZERO shipment references across all 4 company copies.
--
-- Mappings removed first, then the providers (guarded against any
-- copy that gained a reference), then the now-unused creator functions
-- (nothing calls them since v3.74.597b).
--
-- Post-cleanup state for شركة تست: exactly 3 providers — bosta
-- (mapped to مدينة نصر), منفذ بيع الفرع الرئيسي, منفذ بيع مدينة نصر.
-- =====================================================================

DELETE FROM public.branch_shipping_providers
WHERE shipping_provider_id IN (
  SELECT id FROM public.shipping_providers WHERE provider_code = 'onsite_pickup'
);

DELETE FROM public.shipping_providers sp
WHERE sp.provider_code = 'onsite_pickup'
  AND NOT EXISTS (SELECT 1 FROM public.invoices i WHERE i.shipping_provider_id = sp.id)
  AND NOT EXISTS (SELECT 1 FROM public.shipments s WHERE s.shipping_provider_id = sp.id);

DROP FUNCTION IF EXISTS public.ensure_onsite_pickup_provider(uuid);
DROP FUNCTION IF EXISTS public.map_pickup_provider_to_new_branch();
