-- ==============================================================================
-- Manufacturing Phase 2A - Work Centers B1
-- Purpose:
--   Create Work Centers schema table only.
-- Scope:
--   - manufacturing_work_centers
-- Excludes:
--   - unique constraints
--   - check constraints
--   - indexes
--   - helper functions
--   - triggers
--   - RLS
--   - APIs / UI
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.manufacturing_work_centers (
  id                           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id                   UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  branch_id                    UUID NOT NULL REFERENCES public.branches(id) ON DELETE RESTRICT,
  cost_center_id               UUID REFERENCES public.cost_centers(id) ON DELETE SET NULL,
  code                         TEXT NOT NULL,
  name                         TEXT NOT NULL,
  work_center_type             TEXT NOT NULL DEFAULT 'machine',
  status                       TEXT NOT NULL DEFAULT 'active',
  description                  TEXT,
  capacity_uom                 TEXT,
  nominal_capacity_per_hour    NUMERIC(18,4),
  available_hours_per_day      NUMERIC(8,2),
  parallel_capacity            INTEGER NOT NULL DEFAULT 1,
  efficiency_percent           NUMERIC(5,2) NOT NULL DEFAULT 100.00,
  default_setup_time_minutes   NUMERIC(10,2) NOT NULL DEFAULT 0,
  default_queue_time_minutes   NUMERIC(10,2) NOT NULL DEFAULT 0,
  default_move_time_minutes    NUMERIC(10,2) NOT NULL DEFAULT 0,
  notes                        TEXT,
  created_by                   UUID,
  updated_by                   UUID,
  created_at                   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
