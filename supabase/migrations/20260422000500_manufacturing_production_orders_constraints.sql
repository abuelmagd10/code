-- ==============================================================================
-- Manufacturing Phase 2A - Production Orders B2
-- Purpose:
--   Add Production Orders constraints and indexes only.
-- Scope:
--   - manufacturing_production_orders
--   - manufacturing_production_order_operations
-- Excludes:
--   - helper functions
--   - triggers
--   - RLS
--   - APIs / UI
--   - release-specific enforcement
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1) Check constraints - manufacturing_production_orders
-- ------------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_mfg_prod_orders_order_no_not_blank'
  ) THEN
    ALTER TABLE public.manufacturing_production_orders
      ADD CONSTRAINT chk_mfg_prod_orders_order_no_not_blank
      CHECK (BTRIM(order_no) <> '');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_mfg_prod_orders_status'
  ) THEN
    ALTER TABLE public.manufacturing_production_orders
      ADD CONSTRAINT chk_mfg_prod_orders_status
      CHECK (status IN ('draft', 'released', 'in_progress', 'completed', 'cancelled'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_mfg_prod_orders_planned_qty_positive'
  ) THEN
    ALTER TABLE public.manufacturing_production_orders
      ADD CONSTRAINT chk_mfg_prod_orders_planned_qty_positive
      CHECK (planned_quantity > 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_mfg_prod_orders_completed_qty_nonneg'
  ) THEN
    ALTER TABLE public.manufacturing_production_orders
      ADD CONSTRAINT chk_mfg_prod_orders_completed_qty_nonneg
      CHECK (completed_quantity >= 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_mfg_prod_orders_qty_balance'
  ) THEN
    ALTER TABLE public.manufacturing_production_orders
      ADD CONSTRAINT chk_mfg_prod_orders_qty_balance
      CHECK (completed_quantity <= planned_quantity);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_mfg_prod_orders_planned_window'
  ) THEN
    ALTER TABLE public.manufacturing_production_orders
      ADD CONSTRAINT chk_mfg_prod_orders_planned_window
      CHECK (
        planned_start_at IS NULL OR
        planned_end_at IS NULL OR
        planned_end_at > planned_start_at
      );
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 2) Check constraints - manufacturing_production_order_operations
-- ------------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_mfg_prod_order_ops_status'
  ) THEN
    ALTER TABLE public.manufacturing_production_order_operations
      ADD CONSTRAINT chk_mfg_prod_order_ops_status
      CHECK (status IN ('pending', 'ready', 'in_progress', 'completed', 'cancelled'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_mfg_prod_order_ops_no_positive'
  ) THEN
    ALTER TABLE public.manufacturing_production_order_operations
      ADD CONSTRAINT chk_mfg_prod_order_ops_no_positive
      CHECK (operation_no > 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_mfg_prod_order_ops_code_not_blank'
  ) THEN
    ALTER TABLE public.manufacturing_production_order_operations
      ADD CONSTRAINT chk_mfg_prod_order_ops_code_not_blank
      CHECK (BTRIM(operation_code) <> '');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_mfg_prod_order_ops_name_not_blank'
  ) THEN
    ALTER TABLE public.manufacturing_production_order_operations
      ADD CONSTRAINT chk_mfg_prod_order_ops_name_not_blank
      CHECK (BTRIM(operation_name) <> '');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_mfg_prod_order_ops_planned_qty_pos'
  ) THEN
    ALTER TABLE public.manufacturing_production_order_operations
      ADD CONSTRAINT chk_mfg_prod_order_ops_planned_qty_pos
      CHECK (planned_quantity > 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_mfg_prod_order_ops_completed_nonneg'
  ) THEN
    ALTER TABLE public.manufacturing_production_order_operations
      ADD CONSTRAINT chk_mfg_prod_order_ops_completed_nonneg
      CHECK (completed_quantity >= 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_mfg_prod_order_ops_qty_balance'
  ) THEN
    ALTER TABLE public.manufacturing_production_order_operations
      ADD CONSTRAINT chk_mfg_prod_order_ops_qty_balance
      CHECK (completed_quantity <= planned_quantity);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_mfg_prod_order_ops_setup_nonneg'
  ) THEN
    ALTER TABLE public.manufacturing_production_order_operations
      ADD CONSTRAINT chk_mfg_prod_order_ops_setup_nonneg
      CHECK (setup_time_minutes >= 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_mfg_prod_order_ops_run_nonneg'
  ) THEN
    ALTER TABLE public.manufacturing_production_order_operations
      ADD CONSTRAINT chk_mfg_prod_order_ops_run_nonneg
      CHECK (run_time_minutes_per_unit >= 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_mfg_prod_order_ops_queue_nonneg'
  ) THEN
    ALTER TABLE public.manufacturing_production_order_operations
      ADD CONSTRAINT chk_mfg_prod_order_ops_queue_nonneg
      CHECK (queue_time_minutes >= 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_mfg_prod_order_ops_move_nonneg'
  ) THEN
    ALTER TABLE public.manufacturing_production_order_operations
      ADD CONSTRAINT chk_mfg_prod_order_ops_move_nonneg
      CHECK (move_time_minutes >= 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_mfg_prod_order_ops_labor_nonneg'
  ) THEN
    ALTER TABLE public.manufacturing_production_order_operations
      ADD CONSTRAINT chk_mfg_prod_order_ops_labor_nonneg
      CHECK (labor_time_minutes >= 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_mfg_prod_order_ops_machine_nonneg'
  ) THEN
    ALTER TABLE public.manufacturing_production_order_operations
      ADD CONSTRAINT chk_mfg_prod_order_ops_machine_nonneg
      CHECK (machine_time_minutes >= 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_mfg_prod_order_ops_planned_window'
  ) THEN
    ALTER TABLE public.manufacturing_production_order_operations
      ADD CONSTRAINT chk_mfg_prod_order_ops_planned_window
      CHECK (
        planned_start_at IS NULL OR
        planned_end_at IS NULL OR
        planned_end_at > planned_start_at
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_mfg_prod_order_ops_actual_window'
  ) THEN
    ALTER TABLE public.manufacturing_production_order_operations
      ADD CONSTRAINT chk_mfg_prod_order_ops_actual_window
      CHECK (
        actual_start_at IS NULL OR
        actual_end_at IS NULL OR
        actual_end_at > actual_start_at
      );
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 3) Unique constraints
-- ------------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uq_mfg_prod_orders_branch_order_no'
  ) THEN
    ALTER TABLE public.manufacturing_production_orders
      ADD CONSTRAINT uq_mfg_prod_orders_branch_order_no
      UNIQUE (company_id, branch_id, order_no);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uq_mfg_prod_order_ops_order_no'
  ) THEN
    ALTER TABLE public.manufacturing_production_order_operations
      ADD CONSTRAINT uq_mfg_prod_order_ops_order_no
      UNIQUE (production_order_id, operation_no);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uq_mfg_prod_order_ops_order_code'
  ) THEN
    ALTER TABLE public.manufacturing_production_order_operations
      ADD CONSTRAINT uq_mfg_prod_order_ops_order_code
      UNIQUE (production_order_id, operation_code);
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 4) Non-unique indexes
-- ------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_mfg_prod_orders_branch_status_updated
  ON public.manufacturing_production_orders (company_id, branch_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_mfg_prod_orders_product_status
  ON public.manufacturing_production_orders (company_id, branch_id, product_id, status);

CREATE INDEX IF NOT EXISTS idx_mfg_prod_orders_bom_version
  ON public.manufacturing_production_orders (bom_version_id);

CREATE INDEX IF NOT EXISTS idx_mfg_prod_orders_routing_version
  ON public.manufacturing_production_orders (routing_version_id);

CREATE INDEX IF NOT EXISTS idx_mfg_prod_order_ops_order_status
  ON public.manufacturing_production_order_operations (production_order_id, status, operation_no);

CREATE INDEX IF NOT EXISTS idx_mfg_prod_order_ops_work_center_status
  ON public.manufacturing_production_order_operations (company_id, branch_id, work_center_id, status);
