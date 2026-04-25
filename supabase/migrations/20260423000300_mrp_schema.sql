-- ==============================================================================
-- Manufacturing Phase 2B - MRP B3
-- Purpose:
--   Create MRP persisted-run schema tables only.
-- Scope:
--   - mrp_runs
--   - mrp_demand_rows
--   - mrp_supply_rows
--   - mrp_net_rows
--   - mrp_suggestions
-- Excludes:
--   - unique constraints
--   - check constraints
--   - indexes
--   - helper functions
--   - triggers
--   - RLS
--   - APIs / UI
-- Notes:
--   - MRP v1 is advisory-only.
--   - MRP v1 is current-state and single-level.
--   - Demand/supply rows are warehouse-resolved before persistence.
--   - source_type/source_id/source_line_id are polymorphic traceability fields.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.mrp_runs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  branch_id         UUID NOT NULL REFERENCES public.branches(id) ON DELETE RESTRICT,
  run_scope         TEXT NOT NULL DEFAULT 'branch',
  warehouse_id      UUID REFERENCES public.warehouses(id) ON DELETE RESTRICT,
  run_mode          TEXT NOT NULL DEFAULT 'current_state_single_level',
  status            TEXT NOT NULL DEFAULT 'running',
  as_of_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at      TIMESTAMPTZ,
  failed_at         TIMESTAMPTZ,
  failure_message   TEXT,
  demand_row_count  INTEGER NOT NULL DEFAULT 0,
  supply_row_count  INTEGER NOT NULL DEFAULT 0,
  net_row_count     INTEGER NOT NULL DEFAULT 0,
  suggestion_count  INTEGER NOT NULL DEFAULT 0,
  notes             TEXT,
  created_by        UUID,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.mrp_demand_rows (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id         UUID NOT NULL REFERENCES public.mrp_runs(id) ON DELETE CASCADE,
  company_id     UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  branch_id      UUID NOT NULL REFERENCES public.branches(id) ON DELETE RESTRICT,
  warehouse_id   UUID NOT NULL REFERENCES public.warehouses(id) ON DELETE RESTRICT,
  product_id     UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  product_type   TEXT NOT NULL,
  demand_type    TEXT NOT NULL,
  source_type    TEXT NOT NULL,
  source_id      UUID NOT NULL,
  source_line_id UUID,
  document_no    TEXT,
  due_at         TIMESTAMPTZ,
  original_qty   NUMERIC(18,4) NOT NULL,
  covered_qty    NUMERIC(18,4) NOT NULL DEFAULT 0,
  uncovered_qty  NUMERIC(18,4) NOT NULL,
  uom            TEXT,
  explanation    TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.mrp_supply_rows (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id         UUID NOT NULL REFERENCES public.mrp_runs(id) ON DELETE CASCADE,
  company_id     UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  branch_id      UUID NOT NULL REFERENCES public.branches(id) ON DELETE RESTRICT,
  warehouse_id   UUID NOT NULL REFERENCES public.warehouses(id) ON DELETE RESTRICT,
  product_id     UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  product_type   TEXT NOT NULL,
  supply_type    TEXT NOT NULL,
  source_type    TEXT NOT NULL,
  source_id      UUID NOT NULL,
  source_line_id UUID,
  document_no    TEXT,
  expected_at    TIMESTAMPTZ,
  original_qty   NUMERIC(18,4) NOT NULL,
  available_qty  NUMERIC(18,4) NOT NULL,
  uom            TEXT,
  explanation    TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.mrp_net_rows (
  id                           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id                       UUID NOT NULL REFERENCES public.mrp_runs(id) ON DELETE CASCADE,
  company_id                   UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  branch_id                    UUID NOT NULL REFERENCES public.branches(id) ON DELETE RESTRICT,
  warehouse_id                 UUID NOT NULL REFERENCES public.warehouses(id) ON DELETE RESTRICT,
  product_id                   UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  product_type                 TEXT NOT NULL,
  uom                          TEXT,
  total_demand_qty             NUMERIC(18,4) NOT NULL DEFAULT 0,
  sales_demand_qty             NUMERIC(18,4) NOT NULL DEFAULT 0,
  production_demand_qty        NUMERIC(18,4) NOT NULL DEFAULT 0,
  reorder_demand_qty           NUMERIC(18,4) NOT NULL DEFAULT 0,
  free_stock_qty               NUMERIC(18,4) NOT NULL DEFAULT 0,
  incoming_purchase_qty        NUMERIC(18,4) NOT NULL DEFAULT 0,
  incoming_production_qty      NUMERIC(18,4) NOT NULL DEFAULT 0,
  total_supply_qty             NUMERIC(18,4) NOT NULL DEFAULT 0,
  reorder_level_qty            NUMERIC(18,4) NOT NULL DEFAULT 0,
  projected_after_committed_qty NUMERIC(18,4) NOT NULL DEFAULT 0,
  net_required_qty             NUMERIC(18,4) NOT NULL DEFAULT 0,
  suggested_action             TEXT,
  created_at                   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.mrp_suggestions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id          UUID NOT NULL REFERENCES public.mrp_runs(id) ON DELETE CASCADE,
  net_row_id      UUID NOT NULL REFERENCES public.mrp_net_rows(id) ON DELETE CASCADE,
  company_id      UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  branch_id       UUID NOT NULL REFERENCES public.branches(id) ON DELETE RESTRICT,
  warehouse_id    UUID NOT NULL REFERENCES public.warehouses(id) ON DELETE RESTRICT,
  product_id      UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  product_type    TEXT NOT NULL,
  suggestion_type TEXT NOT NULL,
  suggested_qty   NUMERIC(18,4) NOT NULL,
  uom             TEXT,
  reason_code     TEXT NOT NULL,
  explanation     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
