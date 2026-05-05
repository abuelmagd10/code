-- ==============================================================================
-- Manufacturing Simplification — Phase 2
-- Purpose:
--   Link manufacturing_routings directly to a specific BOM via bom_id.
--   When a routing is created with bom_id, the product_id is auto-inherited
--   from the BOM, eliminating duplicate data entry.
-- Safety:
--   - Column is NULLABLE — no existing routings are broken.
--   - Old routings continue using product_id directly (fallback preserved).
--   - bom_id = NULL means "legacy routing" — linked only via product_id.
-- ==============================================================================

ALTER TABLE public.manufacturing_routings
  ADD COLUMN IF NOT EXISTS bom_id UUID REFERENCES public.manufacturing_boms(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.manufacturing_routings.bom_id IS
  'Optional direct link to a specific BOM. When set, product_id is inherited from the BOM and the routing inherits BOM materials for display. Nullable for backward compatibility with old routings linked only via product_id.';

-- Index for BOM-routing lookups
CREATE INDEX IF NOT EXISTS idx_manufacturing_routings_bom_id
  ON public.manufacturing_routings (bom_id)
  WHERE bom_id IS NOT NULL;
