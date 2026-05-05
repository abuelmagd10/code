-- ==============================================================================
-- Manufacturing Simplification — Phase 1
-- Purpose:
--   Add source_warehouse_id (default issue warehouse) to manufacturing_boms.
--   This allows the BOM to define the default source warehouse for material issue,
--   which will be auto-populated in production orders.
-- Safety:
--   - Column is NULLABLE — no existing data is broken.
--   - All old BOMs work as before (source_warehouse_id = NULL).
--   - Production orders still allow manual override of issue_warehouse_id.
-- ==============================================================================

ALTER TABLE public.manufacturing_boms
  ADD COLUMN IF NOT EXISTS source_warehouse_id UUID REFERENCES public.warehouses(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.manufacturing_boms.source_warehouse_id IS
  'Default warehouse for raw material issue. When set, production orders will auto-populate issue_warehouse_id from this value. Nullable — manual override always allowed.';

-- Index for warehouse lookups
CREATE INDEX IF NOT EXISTS idx_manufacturing_boms_source_warehouse
  ON public.manufacturing_boms (source_warehouse_id)
  WHERE source_warehouse_id IS NOT NULL;
