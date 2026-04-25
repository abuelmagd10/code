-- ==============================================================================
-- Manufacturing Phase 2A - Inventory Execution B2
-- Purpose:
--   Add Inventory Execution constraints and indexes only.
-- Scope:
--   - production_order_material_requirements
--   - production_order_issue_events
--   - production_order_issue_lines
--   - production_order_receipt_events
--   - production_order_receipt_lines
-- Excludes:
--   - helper functions
--   - triggers
--   - RLS
--   - APIs / UI
--   - release/issue/receipt workflow semantics
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1) Check constraints - production_order_material_requirements
-- ------------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_po_material_requirements_line_no_positive'
  ) THEN
    ALTER TABLE public.production_order_material_requirements
      ADD CONSTRAINT chk_po_material_requirements_line_no_positive
      CHECK (line_no > 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_po_material_requirements_type'
  ) THEN
    ALTER TABLE public.production_order_material_requirements
      ADD CONSTRAINT chk_po_material_requirements_type
      CHECK (requirement_type IN ('component'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_po_material_requirements_bom_base_output_positive'
  ) THEN
    ALTER TABLE public.production_order_material_requirements
      ADD CONSTRAINT chk_po_material_requirements_bom_base_output_positive
      CHECK (bom_base_output_qty > 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_po_material_requirements_order_planned_positive'
  ) THEN
    ALTER TABLE public.production_order_material_requirements
      ADD CONSTRAINT chk_po_material_requirements_order_planned_positive
      CHECK (order_planned_qty > 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_po_material_requirements_quantity_per_positive'
  ) THEN
    ALTER TABLE public.production_order_material_requirements
      ADD CONSTRAINT chk_po_material_requirements_quantity_per_positive
      CHECK (quantity_per > 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_po_material_requirements_scrap_percent'
  ) THEN
    ALTER TABLE public.production_order_material_requirements
      ADD CONSTRAINT chk_po_material_requirements_scrap_percent
      CHECK (scrap_percent >= 0 AND scrap_percent < 100);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_po_material_requirements_net_required_positive'
  ) THEN
    ALTER TABLE public.production_order_material_requirements
      ADD CONSTRAINT chk_po_material_requirements_net_required_positive
      CHECK (net_required_qty > 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_po_material_requirements_gross_required_positive'
  ) THEN
    ALTER TABLE public.production_order_material_requirements
      ADD CONSTRAINT chk_po_material_requirements_gross_required_positive
      CHECK (gross_required_qty > 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_po_material_requirements_gross_ge_net'
  ) THEN
    ALTER TABLE public.production_order_material_requirements
      ADD CONSTRAINT chk_po_material_requirements_gross_ge_net
      CHECK (gross_required_qty >= net_required_qty);
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 2) Check constraints - production_order_issue_events
-- ------------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_po_issue_events_issue_mode'
  ) THEN
    ALTER TABLE public.production_order_issue_events
      ADD CONSTRAINT chk_po_issue_events_issue_mode
      CHECK (issue_mode IN ('manual'));
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 3) Check constraints - production_order_issue_lines
-- ------------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_po_issue_lines_line_no_positive'
  ) THEN
    ALTER TABLE public.production_order_issue_lines
      ADD CONSTRAINT chk_po_issue_lines_line_no_positive
      CHECK (line_no > 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_po_issue_lines_issued_qty_positive'
  ) THEN
    ALTER TABLE public.production_order_issue_lines
      ADD CONSTRAINT chk_po_issue_lines_issued_qty_positive
      CHECK (issued_qty > 0);
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 4) Check constraints - production_order_receipt_events
-- ------------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_po_receipt_events_receipt_mode'
  ) THEN
    ALTER TABLE public.production_order_receipt_events
      ADD CONSTRAINT chk_po_receipt_events_receipt_mode
      CHECK (receipt_mode IN ('manual'));
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 5) Check constraints - production_order_receipt_lines
-- ------------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_po_receipt_lines_line_no_positive'
  ) THEN
    ALTER TABLE public.production_order_receipt_lines
      ADD CONSTRAINT chk_po_receipt_lines_line_no_positive
      CHECK (line_no > 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_po_receipt_lines_output_type'
  ) THEN
    ALTER TABLE public.production_order_receipt_lines
      ADD CONSTRAINT chk_po_receipt_lines_output_type
      CHECK (output_type IN ('main_output'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_po_receipt_lines_received_qty_positive'
  ) THEN
    ALTER TABLE public.production_order_receipt_lines
      ADD CONSTRAINT chk_po_receipt_lines_received_qty_positive
      CHECK (received_qty > 0);
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 6) Unique constraints
-- ------------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uq_po_material_requirements_order_line_no'
  ) THEN
    ALTER TABLE public.production_order_material_requirements
      ADD CONSTRAINT uq_po_material_requirements_order_line_no
      UNIQUE (production_order_id, line_no);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_po_material_requirements_order_source_bom_line_unique
  ON public.production_order_material_requirements (production_order_id, source_bom_line_id)
  WHERE source_bom_line_id IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uq_po_issue_lines_event_line_no'
  ) THEN
    ALTER TABLE public.production_order_issue_lines
      ADD CONSTRAINT uq_po_issue_lines_event_line_no
      UNIQUE (issue_event_id, line_no);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uq_po_issue_lines_event_requirement'
  ) THEN
    ALTER TABLE public.production_order_issue_lines
      ADD CONSTRAINT uq_po_issue_lines_event_requirement
      UNIQUE (issue_event_id, material_requirement_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uq_po_issue_lines_inventory_transaction'
  ) THEN
    ALTER TABLE public.production_order_issue_lines
      ADD CONSTRAINT uq_po_issue_lines_inventory_transaction
      UNIQUE (inventory_transaction_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uq_po_receipt_lines_event_line_no'
  ) THEN
    ALTER TABLE public.production_order_receipt_lines
      ADD CONSTRAINT uq_po_receipt_lines_event_line_no
      UNIQUE (receipt_event_id, line_no);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uq_po_receipt_lines_event_product_output'
  ) THEN
    ALTER TABLE public.production_order_receipt_lines
      ADD CONSTRAINT uq_po_receipt_lines_event_product_output
      UNIQUE (receipt_event_id, product_id, output_type);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uq_po_receipt_lines_inventory_transaction'
  ) THEN
    ALTER TABLE public.production_order_receipt_lines
      ADD CONSTRAINT uq_po_receipt_lines_inventory_transaction
      UNIQUE (inventory_transaction_id);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_po_receipt_lines_fifo_cost_lot_unique
  ON public.production_order_receipt_lines (fifo_cost_lot_id)
  WHERE fifo_cost_lot_id IS NOT NULL;

-- ------------------------------------------------------------------------------
-- 7) Non-unique indexes
-- ------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_po_material_requirements_order_line
  ON public.production_order_material_requirements (production_order_id, line_no);

CREATE INDEX IF NOT EXISTS idx_po_material_requirements_order_product
  ON public.production_order_material_requirements (production_order_id, product_id);

CREATE INDEX IF NOT EXISTS idx_po_material_requirements_branch_warehouse_product
  ON public.production_order_material_requirements (company_id, branch_id, warehouse_id, product_id);

CREATE INDEX IF NOT EXISTS idx_po_material_requirements_source_bom_line
  ON public.production_order_material_requirements (source_bom_line_id);

CREATE INDEX IF NOT EXISTS idx_po_issue_events_order_posted
  ON public.production_order_issue_events (production_order_id, posted_at DESC);

CREATE INDEX IF NOT EXISTS idx_po_issue_events_branch_warehouse_posted
  ON public.production_order_issue_events (company_id, branch_id, warehouse_id, posted_at DESC);

CREATE INDEX IF NOT EXISTS idx_po_issue_lines_order_event
  ON public.production_order_issue_lines (production_order_id, issue_event_id, line_no);

CREATE INDEX IF NOT EXISTS idx_po_issue_lines_requirement
  ON public.production_order_issue_lines (material_requirement_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_po_issue_lines_branch_warehouse_product
  ON public.production_order_issue_lines (company_id, branch_id, warehouse_id, product_id);

CREATE INDEX IF NOT EXISTS idx_po_issue_lines_reservation_allocation
  ON public.production_order_issue_lines (reservation_allocation_id)
  WHERE reservation_allocation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_po_receipt_events_order_posted
  ON public.production_order_receipt_events (production_order_id, posted_at DESC);

CREATE INDEX IF NOT EXISTS idx_po_receipt_events_branch_warehouse_posted
  ON public.production_order_receipt_events (company_id, branch_id, warehouse_id, posted_at DESC);

CREATE INDEX IF NOT EXISTS idx_po_receipt_lines_order_event
  ON public.production_order_receipt_lines (production_order_id, receipt_event_id, line_no);

CREATE INDEX IF NOT EXISTS idx_po_receipt_lines_branch_warehouse_product
  ON public.production_order_receipt_lines (company_id, branch_id, warehouse_id, product_id);

CREATE INDEX IF NOT EXISTS idx_po_receipt_lines_fifo_cost_lot
  ON public.production_order_receipt_lines (fifo_cost_lot_id)
  WHERE fifo_cost_lot_id IS NOT NULL;
