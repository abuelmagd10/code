-- ==============================================================================
-- Manufacturing Phase 2A - Production Orders B1
-- Purpose:
--   Create Production Orders schema tables only.
-- Scope:
--   - manufacturing_production_orders
--   - manufacturing_production_order_operations
-- Excludes:
--   - unique constraints
--   - check constraints
--   - indexes
--   - helper functions
--   - triggers
--   - RLS
--   - APIs / UI
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.manufacturing_production_orders (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id           UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  branch_id            UUID NOT NULL REFERENCES public.branches(id) ON DELETE RESTRICT,
  order_no             TEXT NOT NULL,
  product_id           UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  bom_id               UUID NOT NULL REFERENCES public.manufacturing_boms(id) ON DELETE RESTRICT,
  bom_version_id       UUID NOT NULL REFERENCES public.manufacturing_bom_versions(id) ON DELETE RESTRICT,
  routing_id           UUID NOT NULL REFERENCES public.manufacturing_routings(id) ON DELETE RESTRICT,
  routing_version_id   UUID NOT NULL REFERENCES public.manufacturing_routing_versions(id) ON DELETE RESTRICT,
  issue_warehouse_id   UUID REFERENCES public.warehouses(id) ON DELETE RESTRICT,
  receipt_warehouse_id UUID REFERENCES public.warehouses(id) ON DELETE RESTRICT,
  planned_quantity     NUMERIC(18,4) NOT NULL,
  completed_quantity   NUMERIC(18,4) NOT NULL DEFAULT 0,
  order_uom            TEXT,
  status               TEXT NOT NULL DEFAULT 'draft',
  planned_start_at     TIMESTAMPTZ,
  planned_end_at       TIMESTAMPTZ,
  released_at          TIMESTAMPTZ,
  released_by          UUID,
  started_at           TIMESTAMPTZ,
  started_by           UUID,
  completed_at         TIMESTAMPTZ,
  completed_by         UUID,
  cancelled_at         TIMESTAMPTZ,
  cancelled_by         UUID,
  cancellation_reason  TEXT,
  notes                TEXT,
  created_by           UUID,
  updated_by           UUID,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.manufacturing_production_order_operations (
  id                           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id                   UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  branch_id                    UUID NOT NULL REFERENCES public.branches(id) ON DELETE RESTRICT,
  production_order_id          UUID NOT NULL REFERENCES public.manufacturing_production_orders(id) ON DELETE CASCADE,
  routing_version_id           UUID NOT NULL REFERENCES public.manufacturing_routing_versions(id) ON DELETE RESTRICT,
  source_routing_operation_id  UUID REFERENCES public.manufacturing_routing_operations(id) ON DELETE SET NULL,
  operation_no                 INTEGER NOT NULL,
  operation_code               TEXT NOT NULL,
  operation_name               TEXT NOT NULL,
  work_center_id               UUID NOT NULL REFERENCES public.manufacturing_work_centers(id) ON DELETE RESTRICT,
  status                       TEXT NOT NULL DEFAULT 'pending',
  planned_quantity             NUMERIC(18,4) NOT NULL,
  completed_quantity           NUMERIC(18,4) NOT NULL DEFAULT 0,
  setup_time_minutes           NUMERIC(10,2) NOT NULL DEFAULT 0,
  run_time_minutes_per_unit    NUMERIC(10,4) NOT NULL DEFAULT 0,
  queue_time_minutes           NUMERIC(10,2) NOT NULL DEFAULT 0,
  move_time_minutes            NUMERIC(10,2) NOT NULL DEFAULT 0,
  labor_time_minutes           NUMERIC(10,2) NOT NULL DEFAULT 0,
  machine_time_minutes         NUMERIC(10,2) NOT NULL DEFAULT 0,
  quality_checkpoint_required  BOOLEAN NOT NULL DEFAULT false,
  instructions                 TEXT,
  planned_start_at             TIMESTAMPTZ,
  planned_end_at               TIMESTAMPTZ,
  actual_start_at              TIMESTAMPTZ,
  started_by                   UUID,
  actual_end_at                TIMESTAMPTZ,
  completed_by                 UUID,
  last_progress_at             TIMESTAMPTZ,
  notes                        TEXT,
  created_by                   UUID,
  updated_by                   UUID,
  created_at                   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
