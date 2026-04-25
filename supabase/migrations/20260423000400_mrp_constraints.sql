-- ==============================================================================
-- Manufacturing Phase 2B - MRP B4
-- Purpose:
--   Add MRP constraints and indexes only.
-- Scope:
--   - mrp_runs
--   - mrp_demand_rows
--   - mrp_supply_rows
--   - mrp_net_rows
--   - mrp_suggestions
-- Excludes:
--   - helper functions
--   - triggers
--   - RLS
--   - APIs / UI
--   - workflow semantics
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1) Check constraints - mrp_runs
-- ------------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_mrp_runs_scope'
  ) THEN
    ALTER TABLE public.mrp_runs
      ADD CONSTRAINT chk_mrp_runs_scope
      CHECK (run_scope IN ('branch', 'warehouse_filtered'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_mrp_runs_mode'
  ) THEN
    ALTER TABLE public.mrp_runs
      ADD CONSTRAINT chk_mrp_runs_mode
      CHECK (run_mode IN ('current_state_single_level'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_mrp_runs_status'
  ) THEN
    ALTER TABLE public.mrp_runs
      ADD CONSTRAINT chk_mrp_runs_status
      CHECK (status IN ('running', 'completed', 'failed'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_mrp_runs_scope_wh'
  ) THEN
    ALTER TABLE public.mrp_runs
      ADD CONSTRAINT chk_mrp_runs_scope_wh
      CHECK (
        (run_scope = 'branch' AND warehouse_id IS NULL)
        OR
        (run_scope = 'warehouse_filtered' AND warehouse_id IS NOT NULL)
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_mrp_runs_counts_nonneg'
  ) THEN
    ALTER TABLE public.mrp_runs
      ADD CONSTRAINT chk_mrp_runs_counts_nonneg
      CHECK (
        demand_row_count >= 0
        AND supply_row_count >= 0
        AND net_row_count >= 0
        AND suggestion_count >= 0
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_mrp_runs_status_times'
  ) THEN
    ALTER TABLE public.mrp_runs
      ADD CONSTRAINT chk_mrp_runs_status_times
      CHECK (
        (status = 'running' AND completed_at IS NULL AND failed_at IS NULL)
        OR
        (status = 'completed' AND completed_at IS NOT NULL AND failed_at IS NULL)
        OR
        (status = 'failed' AND failed_at IS NOT NULL AND completed_at IS NULL)
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_mrp_runs_complete_after'
  ) THEN
    ALTER TABLE public.mrp_runs
      ADD CONSTRAINT chk_mrp_runs_complete_after
      CHECK (completed_at IS NULL OR completed_at >= started_at);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_mrp_runs_failed_after'
  ) THEN
    ALTER TABLE public.mrp_runs
      ADD CONSTRAINT chk_mrp_runs_failed_after
      CHECK (failed_at IS NULL OR failed_at >= started_at);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_mrp_runs_failed_msg'
  ) THEN
    ALTER TABLE public.mrp_runs
      ADD CONSTRAINT chk_mrp_runs_failed_msg
      CHECK (
        status <> 'failed'
        OR NULLIF(BTRIM(COALESCE(failure_message, '')), '') IS NOT NULL
      );
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 2) Check constraints - mrp_demand_rows
-- ------------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_mrp_demand_product'
  ) THEN
    ALTER TABLE public.mrp_demand_rows
      ADD CONSTRAINT chk_mrp_demand_product
      CHECK (product_type IN ('manufactured', 'raw_material', 'purchased'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_mrp_demand_type'
  ) THEN
    ALTER TABLE public.mrp_demand_rows
      ADD CONSTRAINT chk_mrp_demand_type
      CHECK (demand_type IN ('sales', 'production_component', 'reorder'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_mrp_demand_reorder_prod'
  ) THEN
    ALTER TABLE public.mrp_demand_rows
      ADD CONSTRAINT chk_mrp_demand_reorder_prod
      CHECK (
        demand_type <> 'reorder'
        OR product_type IN ('raw_material', 'purchased')
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_mrp_demand_source_type'
  ) THEN
    ALTER TABLE public.mrp_demand_rows
      ADD CONSTRAINT chk_mrp_demand_source_type
      CHECK (BTRIM(source_type) <> '');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_mrp_demand_orig_pos'
  ) THEN
    ALTER TABLE public.mrp_demand_rows
      ADD CONSTRAINT chk_mrp_demand_orig_pos
      CHECK (original_qty > 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_mrp_demand_cov_nonneg'
  ) THEN
    ALTER TABLE public.mrp_demand_rows
      ADD CONSTRAINT chk_mrp_demand_cov_nonneg
      CHECK (covered_qty >= 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_mrp_demand_uncov_nonneg'
  ) THEN
    ALTER TABLE public.mrp_demand_rows
      ADD CONSTRAINT chk_mrp_demand_uncov_nonneg
      CHECK (uncovered_qty >= 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_mrp_demand_cov_le_orig'
  ) THEN
    ALTER TABLE public.mrp_demand_rows
      ADD CONSTRAINT chk_mrp_demand_cov_le_orig
      CHECK (covered_qty <= original_qty);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_mrp_demand_uncov_le_orig'
  ) THEN
    ALTER TABLE public.mrp_demand_rows
      ADD CONSTRAINT chk_mrp_demand_uncov_le_orig
      CHECK (uncovered_qty <= original_qty);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_mrp_demand_qty_balance'
  ) THEN
    ALTER TABLE public.mrp_demand_rows
      ADD CONSTRAINT chk_mrp_demand_qty_balance
      CHECK (covered_qty + uncovered_qty = original_qty);
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 3) Check constraints - mrp_supply_rows
-- ------------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_mrp_supply_product'
  ) THEN
    ALTER TABLE public.mrp_supply_rows
      ADD CONSTRAINT chk_mrp_supply_product
      CHECK (product_type IN ('manufactured', 'raw_material', 'purchased'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_mrp_supply_type'
  ) THEN
    ALTER TABLE public.mrp_supply_rows
      ADD CONSTRAINT chk_mrp_supply_type
      CHECK (supply_type IN ('free_stock', 'purchase_incoming', 'production_incoming'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_mrp_supply_source_type'
  ) THEN
    ALTER TABLE public.mrp_supply_rows
      ADD CONSTRAINT chk_mrp_supply_source_type
      CHECK (BTRIM(source_type) <> '');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_mrp_supply_orig_nonneg'
  ) THEN
    ALTER TABLE public.mrp_supply_rows
      ADD CONSTRAINT chk_mrp_supply_orig_nonneg
      CHECK (original_qty >= 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_mrp_supply_avail_nonneg'
  ) THEN
    ALTER TABLE public.mrp_supply_rows
      ADD CONSTRAINT chk_mrp_supply_avail_nonneg
      CHECK (available_qty >= 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_mrp_supply_avail_le_orig'
  ) THEN
    ALTER TABLE public.mrp_supply_rows
      ADD CONSTRAINT chk_mrp_supply_avail_le_orig
      CHECK (available_qty <= original_qty);
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 4) Check constraints - mrp_net_rows
-- ------------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_mrp_net_product'
  ) THEN
    ALTER TABLE public.mrp_net_rows
      ADD CONSTRAINT chk_mrp_net_product
      CHECK (product_type IN ('manufactured', 'raw_material', 'purchased'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_mrp_net_demand_nonneg'
  ) THEN
    ALTER TABLE public.mrp_net_rows
      ADD CONSTRAINT chk_mrp_net_demand_nonneg
      CHECK (
        total_demand_qty >= 0
        AND sales_demand_qty >= 0
        AND production_demand_qty >= 0
        AND reorder_demand_qty >= 0
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_mrp_net_supply_nonneg'
  ) THEN
    ALTER TABLE public.mrp_net_rows
      ADD CONSTRAINT chk_mrp_net_supply_nonneg
      CHECK (
        free_stock_qty >= 0
        AND incoming_purchase_qty >= 0
        AND incoming_production_qty >= 0
        AND total_supply_qty >= 0
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_mrp_net_reorder_nonneg'
  ) THEN
    ALTER TABLE public.mrp_net_rows
      ADD CONSTRAINT chk_mrp_net_reorder_nonneg
      CHECK (reorder_level_qty >= 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_mrp_net_required_nonneg'
  ) THEN
    ALTER TABLE public.mrp_net_rows
      ADD CONSTRAINT chk_mrp_net_required_nonneg
      CHECK (net_required_qty >= 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_mrp_net_demand_total'
  ) THEN
    ALTER TABLE public.mrp_net_rows
      ADD CONSTRAINT chk_mrp_net_demand_total
      CHECK (total_demand_qty = sales_demand_qty + production_demand_qty + reorder_demand_qty);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_mrp_net_supply_total'
  ) THEN
    ALTER TABLE public.mrp_net_rows
      ADD CONSTRAINT chk_mrp_net_supply_total
      CHECK (total_supply_qty = free_stock_qty + incoming_purchase_qty + incoming_production_qty);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_mrp_net_action'
  ) THEN
    ALTER TABLE public.mrp_net_rows
      ADD CONSTRAINT chk_mrp_net_action
      CHECK (suggested_action IS NULL OR suggested_action IN ('purchase', 'production', 'none'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_mrp_net_action_prod'
  ) THEN
    ALTER TABLE public.mrp_net_rows
      ADD CONSTRAINT chk_mrp_net_action_prod
      CHECK (
        suggested_action IS NULL
        OR suggested_action = 'none'
        OR (product_type = 'manufactured' AND suggested_action = 'production')
        OR (product_type IN ('raw_material', 'purchased') AND suggested_action = 'purchase')
      );
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 5) Check constraints - mrp_suggestions
-- ------------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_mrp_sugg_product'
  ) THEN
    ALTER TABLE public.mrp_suggestions
      ADD CONSTRAINT chk_mrp_sugg_product
      CHECK (product_type IN ('manufactured', 'raw_material', 'purchased'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_mrp_sugg_type'
  ) THEN
    ALTER TABLE public.mrp_suggestions
      ADD CONSTRAINT chk_mrp_sugg_type
      CHECK (suggestion_type IN ('purchase', 'production'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_mrp_sugg_qty_pos'
  ) THEN
    ALTER TABLE public.mrp_suggestions
      ADD CONSTRAINT chk_mrp_sugg_qty_pos
      CHECK (suggested_qty > 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_mrp_sugg_reason'
  ) THEN
    ALTER TABLE public.mrp_suggestions
      ADD CONSTRAINT chk_mrp_sugg_reason
      CHECK (reason_code IN ('sales_shortage', 'production_shortage', 'reorder_shortage', 'mixed'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_mrp_sugg_type_prod'
  ) THEN
    ALTER TABLE public.mrp_suggestions
      ADD CONSTRAINT chk_mrp_sugg_type_prod
      CHECK (
        (product_type = 'manufactured' AND suggestion_type = 'production')
        OR
        (product_type IN ('raw_material', 'purchased') AND suggestion_type = 'purchase')
      );
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 6) Unique constraints
-- ------------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uq_mrp_net_run_grain'
  ) THEN
    ALTER TABLE public.mrp_net_rows
      ADD CONSTRAINT uq_mrp_net_run_grain
      UNIQUE (run_id, company_id, branch_id, warehouse_id, product_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uq_mrp_sugg_net_type'
  ) THEN
    ALTER TABLE public.mrp_suggestions
      ADD CONSTRAINT uq_mrp_sugg_net_type
      UNIQUE (net_row_id, suggestion_type);
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 7) Non-unique indexes
-- ------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_mrp_runs_status_started
  ON public.mrp_runs (status, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_mrp_runs_company_branch_started
  ON public.mrp_runs (company_id, branch_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_mrp_demand_run
  ON public.mrp_demand_rows (run_id);

CREATE INDEX IF NOT EXISTS idx_mrp_demand_run_grain
  ON public.mrp_demand_rows (run_id, company_id, branch_id, warehouse_id, product_id);

CREATE INDEX IF NOT EXISTS idx_mrp_demand_grain
  ON public.mrp_demand_rows (company_id, branch_id, warehouse_id, product_id);

CREATE INDEX IF NOT EXISTS idx_mrp_demand_run_type
  ON public.mrp_demand_rows (run_id, demand_type);

CREATE INDEX IF NOT EXISTS idx_mrp_supply_run
  ON public.mrp_supply_rows (run_id);

CREATE INDEX IF NOT EXISTS idx_mrp_supply_run_grain
  ON public.mrp_supply_rows (run_id, company_id, branch_id, warehouse_id, product_id);

CREATE INDEX IF NOT EXISTS idx_mrp_supply_grain
  ON public.mrp_supply_rows (company_id, branch_id, warehouse_id, product_id);

CREATE INDEX IF NOT EXISTS idx_mrp_supply_run_type
  ON public.mrp_supply_rows (run_id, supply_type);

CREATE INDEX IF NOT EXISTS idx_mrp_net_grain
  ON public.mrp_net_rows (company_id, branch_id, warehouse_id, product_id);

CREATE INDEX IF NOT EXISTS idx_mrp_sugg_run_type
  ON public.mrp_suggestions (run_id, suggestion_type);

CREATE INDEX IF NOT EXISTS idx_mrp_sugg_grain
  ON public.mrp_suggestions (company_id, branch_id, warehouse_id, product_id);
