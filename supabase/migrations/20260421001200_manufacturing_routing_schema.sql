-- ==============================================================================
-- Manufacturing Phase 2A - Routing B1
-- Purpose:
--   Create Routing schema tables only.
-- Scope:
--   - manufacturing_routings
--   - manufacturing_routing_versions
--   - manufacturing_routing_operations
-- Excludes:
--   - unique constraints
--   - check constraints
--   - indexes
--   - helper functions
--   - triggers
--   - RLS
--   - APIs / UI
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.manufacturing_routings (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id         UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  branch_id          UUID NOT NULL REFERENCES public.branches(id) ON DELETE RESTRICT,
  product_id         UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  routing_code       TEXT NOT NULL,
  routing_name       TEXT NOT NULL,
  routing_usage      TEXT NOT NULL DEFAULT 'production',
  description        TEXT,
  is_active          BOOLEAN NOT NULL DEFAULT true,
  created_by         UUID,
  updated_by         UUID,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.manufacturing_routing_versions (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id         UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  branch_id          UUID NOT NULL REFERENCES public.branches(id) ON DELETE RESTRICT,
  routing_id         UUID NOT NULL REFERENCES public.manufacturing_routings(id) ON DELETE CASCADE,
  version_no         INTEGER NOT NULL,
  status             TEXT NOT NULL DEFAULT 'draft',
  effective_from     TIMESTAMPTZ,
  effective_to       TIMESTAMPTZ,
  change_summary     TEXT,
  notes              TEXT,
  created_by         UUID,
  updated_by         UUID,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.manufacturing_routing_operations (
  id                           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id                   UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  branch_id                    UUID NOT NULL REFERENCES public.branches(id) ON DELETE RESTRICT,
  routing_version_id           UUID NOT NULL REFERENCES public.manufacturing_routing_versions(id) ON DELETE CASCADE,
  operation_no                 INTEGER NOT NULL,
  operation_code               TEXT NOT NULL,
  operation_name               TEXT NOT NULL,
  work_center_id               UUID NOT NULL REFERENCES public.manufacturing_work_centers(id) ON DELETE RESTRICT,
  setup_time_minutes           NUMERIC(10,2) NOT NULL DEFAULT 0,
  run_time_minutes_per_unit    NUMERIC(10,4) NOT NULL DEFAULT 0,
  queue_time_minutes           NUMERIC(10,2) NOT NULL DEFAULT 0,
  move_time_minutes            NUMERIC(10,2) NOT NULL DEFAULT 0,
  labor_time_minutes           NUMERIC(10,2) NOT NULL DEFAULT 0,
  machine_time_minutes         NUMERIC(10,2) NOT NULL DEFAULT 0,
  quality_checkpoint_required  BOOLEAN NOT NULL DEFAULT false,
  instructions                 TEXT,
  created_by                   UUID,
  updated_by                   UUID,
  created_at                   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
