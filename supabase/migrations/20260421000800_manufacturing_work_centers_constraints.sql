-- ==============================================================================
-- Manufacturing Phase 2A - Work Centers B2
-- Purpose:
--   Add Work Centers constraints and indexes only.
-- Scope:
--   - manufacturing_work_centers
-- Excludes:
--   - helper functions
--   - triggers
--   - RLS
--   - APIs / UI
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1) Check constraints
-- ------------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_mfg_work_centers_code_not_blank'
  ) THEN
    ALTER TABLE public.manufacturing_work_centers
      ADD CONSTRAINT chk_mfg_work_centers_code_not_blank
      CHECK (BTRIM(code) <> '');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_mfg_work_centers_name_not_blank'
  ) THEN
    ALTER TABLE public.manufacturing_work_centers
      ADD CONSTRAINT chk_mfg_work_centers_name_not_blank
      CHECK (BTRIM(name) <> '');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_mfg_work_centers_type'
  ) THEN
    ALTER TABLE public.manufacturing_work_centers
      ADD CONSTRAINT chk_mfg_work_centers_type
      CHECK (work_center_type IN ('machine', 'production_line', 'labor_group'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_mfg_work_centers_status'
  ) THEN
    ALTER TABLE public.manufacturing_work_centers
      ADD CONSTRAINT chk_mfg_work_centers_status
      CHECK (status IN ('active', 'inactive', 'blocked'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_mfg_work_centers_parallel_capacity_positive'
  ) THEN
    ALTER TABLE public.manufacturing_work_centers
      ADD CONSTRAINT chk_mfg_work_centers_parallel_capacity_positive
      CHECK (parallel_capacity > 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_mfg_work_centers_efficiency_percent'
  ) THEN
    ALTER TABLE public.manufacturing_work_centers
      ADD CONSTRAINT chk_mfg_work_centers_efficiency_percent
      CHECK (efficiency_percent > 0 AND efficiency_percent <= 100);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_mfg_work_centers_setup_minutes_nonnegative'
  ) THEN
    ALTER TABLE public.manufacturing_work_centers
      ADD CONSTRAINT chk_mfg_work_centers_setup_minutes_nonnegative
      CHECK (default_setup_time_minutes >= 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_mfg_work_centers_queue_minutes_nonnegative'
  ) THEN
    ALTER TABLE public.manufacturing_work_centers
      ADD CONSTRAINT chk_mfg_work_centers_queue_minutes_nonnegative
      CHECK (default_queue_time_minutes >= 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_mfg_work_centers_move_minutes_nonnegative'
  ) THEN
    ALTER TABLE public.manufacturing_work_centers
      ADD CONSTRAINT chk_mfg_work_centers_move_minutes_nonnegative
      CHECK (default_move_time_minutes >= 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_mfg_work_centers_available_hours_positive'
  ) THEN
    ALTER TABLE public.manufacturing_work_centers
      ADD CONSTRAINT chk_mfg_work_centers_available_hours_positive
      CHECK (available_hours_per_day IS NULL OR available_hours_per_day > 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_mfg_work_centers_nominal_capacity_positive'
  ) THEN
    ALTER TABLE public.manufacturing_work_centers
      ADD CONSTRAINT chk_mfg_work_centers_nominal_capacity_positive
      CHECK (nominal_capacity_per_hour IS NULL OR nominal_capacity_per_hour > 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_mfg_work_centers_capacity_uom_not_blank'
  ) THEN
    ALTER TABLE public.manufacturing_work_centers
      ADD CONSTRAINT chk_mfg_work_centers_capacity_uom_not_blank
      CHECK (capacity_uom IS NULL OR BTRIM(capacity_uom) <> '');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_mfg_work_centers_capacity_pairing'
  ) THEN
    ALTER TABLE public.manufacturing_work_centers
      ADD CONSTRAINT chk_mfg_work_centers_capacity_pairing
      CHECK (
        (capacity_uom IS NULL AND nominal_capacity_per_hour IS NULL) OR
        (capacity_uom IS NOT NULL AND nominal_capacity_per_hour IS NOT NULL)
      );
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 2) Unique constraints
-- ------------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uq_mfg_work_centers_branch_code'
  ) THEN
    ALTER TABLE public.manufacturing_work_centers
      ADD CONSTRAINT uq_mfg_work_centers_branch_code
      UNIQUE (company_id, branch_id, code);
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 3) Non-unique indexes
-- ------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_mfg_work_centers_branch_status_updated
  ON public.manufacturing_work_centers (company_id, branch_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_mfg_work_centers_branch_type_status
  ON public.manufacturing_work_centers (company_id, branch_id, work_center_type, status);

CREATE INDEX IF NOT EXISTS idx_mfg_work_centers_branch_cost_center
  ON public.manufacturing_work_centers (company_id, branch_id, cost_center_id);
