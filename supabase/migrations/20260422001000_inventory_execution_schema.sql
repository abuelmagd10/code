-- ==============================================================================
-- Manufacturing Phase 2A - Inventory Execution B1
-- Purpose:
--   Create Inventory Execution schema tables only.
-- Scope:
--   - production_order_material_requirements
--   - production_order_issue_events
--   - production_order_issue_lines
--   - production_order_receipt_events
--   - production_order_receipt_lines
-- Excludes:
--   - unique constraints
--   - check constraints
--   - indexes
--   - helper functions
--   - triggers
--   - RLS
--   - APIs / UI
-- Notes:
--   - Material requirements are release-time snapshots.
--   - Issue/receipt events are posted execution records.
--   - Reservation consumption trace remains event-based, not direct-FK based.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.production_order_material_requirements (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  branch_id           UUID NOT NULL REFERENCES public.branches(id) ON DELETE RESTRICT,
  production_order_id UUID NOT NULL REFERENCES public.manufacturing_production_orders(id) ON DELETE RESTRICT,
  source_bom_line_id  UUID REFERENCES public.manufacturing_bom_lines(id) ON DELETE SET NULL,
  warehouse_id        UUID NOT NULL REFERENCES public.warehouses(id) ON DELETE RESTRICT,
  cost_center_id      UUID NOT NULL REFERENCES public.cost_centers(id) ON DELETE RESTRICT,
  line_no             INTEGER NOT NULL,
  requirement_type    TEXT NOT NULL DEFAULT 'component',
  product_id          UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  issue_uom           TEXT,
  is_optional         BOOLEAN NOT NULL DEFAULT false,
  bom_base_output_qty NUMERIC(18,4) NOT NULL,
  order_planned_qty   NUMERIC(18,4) NOT NULL,
  quantity_per        NUMERIC(18,4) NOT NULL,
  scrap_percent       NUMERIC(9,4) NOT NULL DEFAULT 0,
  net_required_qty    NUMERIC(18,4) NOT NULL,
  gross_required_qty  NUMERIC(18,4) NOT NULL,
  notes               TEXT,
  created_by          UUID,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.production_order_issue_events (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  branch_id           UUID NOT NULL REFERENCES public.branches(id) ON DELETE RESTRICT,
  production_order_id UUID NOT NULL REFERENCES public.manufacturing_production_orders(id) ON DELETE RESTRICT,
  warehouse_id        UUID NOT NULL REFERENCES public.warehouses(id) ON DELETE RESTRICT,
  cost_center_id      UUID NOT NULL REFERENCES public.cost_centers(id) ON DELETE RESTRICT,
  event_number        TEXT,
  issue_mode          TEXT NOT NULL DEFAULT 'manual',
  posted_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  posted_by           UUID,
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.production_order_issue_lines (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id              UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  branch_id               UUID NOT NULL REFERENCES public.branches(id) ON DELETE RESTRICT,
  issue_event_id          UUID NOT NULL REFERENCES public.production_order_issue_events(id) ON DELETE CASCADE,
  production_order_id     UUID NOT NULL REFERENCES public.manufacturing_production_orders(id) ON DELETE RESTRICT,
  material_requirement_id UUID NOT NULL REFERENCES public.production_order_material_requirements(id) ON DELETE RESTRICT,
  line_no                 INTEGER NOT NULL,
  warehouse_id            UUID NOT NULL REFERENCES public.warehouses(id) ON DELETE RESTRICT,
  cost_center_id          UUID NOT NULL REFERENCES public.cost_centers(id) ON DELETE RESTRICT,
  product_id              UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  reservation_allocation_id UUID REFERENCES public.inventory_reservation_allocations(id) ON DELETE RESTRICT,
  inventory_transaction_id  UUID NOT NULL REFERENCES public.inventory_transactions(id) ON DELETE RESTRICT,
  issued_qty             NUMERIC(18,4) NOT NULL,
  issue_uom              TEXT,
  notes                  TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.production_order_receipt_events (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  branch_id           UUID NOT NULL REFERENCES public.branches(id) ON DELETE RESTRICT,
  production_order_id UUID NOT NULL REFERENCES public.manufacturing_production_orders(id) ON DELETE RESTRICT,
  warehouse_id        UUID NOT NULL REFERENCES public.warehouses(id) ON DELETE RESTRICT,
  cost_center_id      UUID NOT NULL REFERENCES public.cost_centers(id) ON DELETE RESTRICT,
  event_number        TEXT,
  receipt_mode        TEXT NOT NULL DEFAULT 'manual',
  posted_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  posted_by           UUID,
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.production_order_receipt_lines (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id              UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  branch_id               UUID NOT NULL REFERENCES public.branches(id) ON DELETE RESTRICT,
  receipt_event_id        UUID NOT NULL REFERENCES public.production_order_receipt_events(id) ON DELETE CASCADE,
  production_order_id     UUID NOT NULL REFERENCES public.manufacturing_production_orders(id) ON DELETE RESTRICT,
  line_no                 INTEGER NOT NULL,
  warehouse_id            UUID NOT NULL REFERENCES public.warehouses(id) ON DELETE RESTRICT,
  cost_center_id          UUID NOT NULL REFERENCES public.cost_centers(id) ON DELETE RESTRICT,
  product_id              UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  output_type             TEXT NOT NULL DEFAULT 'main_output',
  inventory_transaction_id UUID NOT NULL REFERENCES public.inventory_transactions(id) ON DELETE RESTRICT,
  fifo_cost_lot_id        UUID REFERENCES public.fifo_cost_lots(id) ON DELETE RESTRICT,
  received_qty            NUMERIC(18,4) NOT NULL,
  receipt_uom             TEXT,
  notes                   TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
