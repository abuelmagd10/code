-- ==============================================================================
-- Manufacturing Phase 2A - Routing B2
-- Purpose:
--   Add Routing constraints and indexes only.
-- Scope:
--   - manufacturing_routings
--   - manufacturing_routing_versions
--   - manufacturing_routing_operations
-- Excludes:
--   - helper functions
--   - triggers
--   - RLS
--   - APIs / UI
--   - same company/branch validation on work_center_id
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1) Check constraints - manufacturing_routings
-- ------------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_manufacturing_routings_routing_code_not_blank'
  ) THEN
    ALTER TABLE public.manufacturing_routings
      ADD CONSTRAINT chk_manufacturing_routings_routing_code_not_blank
      CHECK (BTRIM(routing_code) <> '');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_manufacturing_routings_routing_name_not_blank'
  ) THEN
    ALTER TABLE public.manufacturing_routings
      ADD CONSTRAINT chk_manufacturing_routings_routing_name_not_blank
      CHECK (BTRIM(routing_name) <> '');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_manufacturing_routings_routing_usage'
  ) THEN
    ALTER TABLE public.manufacturing_routings
      ADD CONSTRAINT chk_manufacturing_routings_routing_usage
      CHECK (routing_usage IN ('production', 'engineering'));
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 2) Check constraints - manufacturing_routing_versions
-- ------------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_manufacturing_routing_versions_status'
  ) THEN
    ALTER TABLE public.manufacturing_routing_versions
      ADD CONSTRAINT chk_manufacturing_routing_versions_status
      CHECK (status IN ('draft', 'active', 'inactive', 'archived'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_manufacturing_routing_versions_version_positive'
  ) THEN
    ALTER TABLE public.manufacturing_routing_versions
      ADD CONSTRAINT chk_manufacturing_routing_versions_version_positive
      CHECK (version_no > 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_manufacturing_routing_versions_effective_window'
  ) THEN
    ALTER TABLE public.manufacturing_routing_versions
      ADD CONSTRAINT chk_manufacturing_routing_versions_effective_window
      CHECK (
        effective_to IS NULL OR
        (effective_from IS NOT NULL AND effective_to > effective_from)
      );
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 3) Check constraints - manufacturing_routing_operations
-- ------------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_manufacturing_routing_operations_no_positive'
  ) THEN
    ALTER TABLE public.manufacturing_routing_operations
      ADD CONSTRAINT chk_manufacturing_routing_operations_no_positive
      CHECK (operation_no > 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_manufacturing_routing_operations_code_not_blank'
  ) THEN
    ALTER TABLE public.manufacturing_routing_operations
      ADD CONSTRAINT chk_manufacturing_routing_operations_code_not_blank
      CHECK (BTRIM(operation_code) <> '');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_manufacturing_routing_operations_name_not_blank'
  ) THEN
    ALTER TABLE public.manufacturing_routing_operations
      ADD CONSTRAINT chk_manufacturing_routing_operations_name_not_blank
      CHECK (BTRIM(operation_name) <> '');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_manufacturing_routing_operations_setup_time_nonnegative'
  ) THEN
    ALTER TABLE public.manufacturing_routing_operations
      ADD CONSTRAINT chk_manufacturing_routing_operations_setup_time_nonnegative
      CHECK (setup_time_minutes >= 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_manufacturing_routing_operations_run_time_nonnegative'
  ) THEN
    ALTER TABLE public.manufacturing_routing_operations
      ADD CONSTRAINT chk_manufacturing_routing_operations_run_time_nonnegative
      CHECK (run_time_minutes_per_unit >= 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_manufacturing_routing_operations_queue_time_nonnegative'
  ) THEN
    ALTER TABLE public.manufacturing_routing_operations
      ADD CONSTRAINT chk_manufacturing_routing_operations_queue_time_nonnegative
      CHECK (queue_time_minutes >= 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_manufacturing_routing_operations_move_time_nonnegative'
  ) THEN
    ALTER TABLE public.manufacturing_routing_operations
      ADD CONSTRAINT chk_manufacturing_routing_operations_move_time_nonnegative
      CHECK (move_time_minutes >= 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_manufacturing_routing_operations_labor_time_nonnegative'
  ) THEN
    ALTER TABLE public.manufacturing_routing_operations
      ADD CONSTRAINT chk_manufacturing_routing_operations_labor_time_nonnegative
      CHECK (labor_time_minutes >= 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_manufacturing_routing_operations_machine_time_nonnegative'
  ) THEN
    ALTER TABLE public.manufacturing_routing_operations
      ADD CONSTRAINT chk_manufacturing_routing_operations_machine_time_nonnegative
      CHECK (machine_time_minutes >= 0);
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 4) Unique constraints
-- ------------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uq_manufacturing_routings_branch_product_usage'
  ) THEN
    ALTER TABLE public.manufacturing_routings
      ADD CONSTRAINT uq_manufacturing_routings_branch_product_usage
      UNIQUE (company_id, branch_id, product_id, routing_usage);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uq_manufacturing_routings_branch_code'
  ) THEN
    ALTER TABLE public.manufacturing_routings
      ADD CONSTRAINT uq_manufacturing_routings_branch_code
      UNIQUE (company_id, branch_id, routing_code);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uq_manufacturing_routing_versions_routing_version_no'
  ) THEN
    ALTER TABLE public.manufacturing_routing_versions
      ADD CONSTRAINT uq_manufacturing_routing_versions_routing_version_no
      UNIQUE (routing_id, version_no);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uq_manufacturing_routing_operations_version_operation_no'
  ) THEN
    ALTER TABLE public.manufacturing_routing_operations
      ADD CONSTRAINT uq_manufacturing_routing_operations_version_operation_no
      UNIQUE (routing_version_id, operation_no);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uq_manufacturing_routing_operations_version_operation_code'
  ) THEN
    ALTER TABLE public.manufacturing_routing_operations
      ADD CONSTRAINT uq_manufacturing_routing_operations_version_operation_code
      UNIQUE (routing_version_id, operation_code);
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 5) Partial unique indexes
-- ------------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS idx_manufacturing_routing_versions_active_unique
  ON public.manufacturing_routing_versions (routing_id)
  WHERE status = 'active';

-- ------------------------------------------------------------------------------
-- 6) Non-unique indexes
-- ------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_manufacturing_routings_branch_active_updated
  ON public.manufacturing_routings (company_id, branch_id, is_active, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_manufacturing_routing_versions_routing_status_version
  ON public.manufacturing_routing_versions (routing_id, status, version_no DESC);

CREATE INDEX IF NOT EXISTS idx_manufacturing_routing_versions_branch_status_updated
  ON public.manufacturing_routing_versions (company_id, branch_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_manufacturing_routing_operations_branch_work_center
  ON public.manufacturing_routing_operations (company_id, branch_id, work_center_id);
