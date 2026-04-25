-- ==============================================================================
-- Reservation System - Step 2
-- Purpose:
--   Add indexes, unique constraints, and check constraints only.
-- Scope:
--   - quantity invariants
--   - status/source domains
--   - open-source uniqueness
--   - lookup/performance indexes
-- Excludes:
--   - helper functions
--   - triggers
--   - RLS
--   - views
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1) Check constraints - inventory_reservations
-- ------------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_inventory_reservations_status'
  ) THEN
    ALTER TABLE public.inventory_reservations
      ADD CONSTRAINT chk_inventory_reservations_status
      CHECK (status IN (
        'draft',
        'active',
        'partially_reserved',
        'fully_reserved',
        'partially_consumed',
        'consumed',
        'released',
        'cancelled',
        'expired',
        'closed'
      ));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_inventory_reservations_source_type'
  ) THEN
    ALTER TABLE public.inventory_reservations
      ADD CONSTRAINT chk_inventory_reservations_source_type
      CHECK (source_type IN ('sales_order', 'production_order', 'manual'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_inventory_reservations_close_reason'
  ) THEN
    ALTER TABLE public.inventory_reservations
      ADD CONSTRAINT chk_inventory_reservations_close_reason
      CHECK (
        close_reason IS NULL OR close_reason IN (
          'manual_release',
          'source_cancelled',
          'expired',
          'source_reduced',
          'mixed'
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_inventory_reservations_version_positive'
  ) THEN
    ALTER TABLE public.inventory_reservations
      ADD CONSTRAINT chk_inventory_reservations_version_positive
      CHECK (version > 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_inventory_reservations_qty_nonnegative'
  ) THEN
    ALTER TABLE public.inventory_reservations
      ADD CONSTRAINT chk_inventory_reservations_qty_nonnegative
      CHECK (
        requested_qty >= 0 AND
        reserved_qty >= 0 AND
        consumed_qty >= 0 AND
        released_qty >= 0
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_inventory_reservations_qty_balance'
  ) THEN
    ALTER TABLE public.inventory_reservations
      ADD CONSTRAINT chk_inventory_reservations_qty_balance
      CHECK (requested_qty >= (reserved_qty + consumed_qty + released_qty));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_inventory_reservations_expires_after_created'
  ) THEN
    ALTER TABLE public.inventory_reservations
      ADD CONSTRAINT chk_inventory_reservations_expires_after_created
      CHECK (expires_at IS NULL OR expires_at > created_at);
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 2) Check constraints - inventory_reservation_lines
-- ------------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_inventory_reservation_lines_line_no'
  ) THEN
    ALTER TABLE public.inventory_reservation_lines
      ADD CONSTRAINT chk_inventory_reservation_lines_line_no
      CHECK (line_no > 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_inventory_reservation_lines_requested_positive'
  ) THEN
    ALTER TABLE public.inventory_reservation_lines
      ADD CONSTRAINT chk_inventory_reservation_lines_requested_positive
      CHECK (requested_qty > 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_inventory_reservation_lines_qty_nonnegative'
  ) THEN
    ALTER TABLE public.inventory_reservation_lines
      ADD CONSTRAINT chk_inventory_reservation_lines_qty_nonnegative
      CHECK (
        reserved_qty >= 0 AND
        consumed_qty >= 0 AND
        released_qty >= 0
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_inventory_reservation_lines_qty_balance'
  ) THEN
    ALTER TABLE public.inventory_reservation_lines
      ADD CONSTRAINT chk_inventory_reservation_lines_qty_balance
      CHECK (requested_qty >= (reserved_qty + consumed_qty + released_qty));
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 3) Check constraints - inventory_reservation_allocations
-- ------------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_inventory_reservation_allocations_status'
  ) THEN
    ALTER TABLE public.inventory_reservation_allocations
      ADD CONSTRAINT chk_inventory_reservation_allocations_status
      CHECK (status IN ('active', 'consumed', 'released', 'expired'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_inventory_reservation_allocations_allocated_positive'
  ) THEN
    ALTER TABLE public.inventory_reservation_allocations
      ADD CONSTRAINT chk_inventory_reservation_allocations_allocated_positive
      CHECK (allocated_qty > 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_inventory_reservation_allocations_qty_nonnegative'
  ) THEN
    ALTER TABLE public.inventory_reservation_allocations
      ADD CONSTRAINT chk_inventory_reservation_allocations_qty_nonnegative
      CHECK (
        consumed_qty >= 0 AND
        released_qty >= 0
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_inventory_reservation_allocations_qty_balance'
  ) THEN
    ALTER TABLE public.inventory_reservation_allocations
      ADD CONSTRAINT chk_inventory_reservation_allocations_qty_balance
      CHECK (allocated_qty >= (consumed_qty + released_qty));
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 4) Check constraints - inventory_reservation_consumptions
-- ------------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_inventory_reservation_consumptions_source_event_type'
  ) THEN
    ALTER TABLE public.inventory_reservation_consumptions
      ADD CONSTRAINT chk_inventory_reservation_consumptions_source_event_type
      CHECK (source_event_type IN ('sale_dispatch', 'production_issue'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_inventory_reservation_consumptions_quantity_positive'
  ) THEN
    ALTER TABLE public.inventory_reservation_consumptions
      ADD CONSTRAINT chk_inventory_reservation_consumptions_quantity_positive
      CHECK (quantity > 0);
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 5) Unique constraints
-- ------------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uq_inventory_reservation_lines_reservation_line_no'
  ) THEN
    ALTER TABLE public.inventory_reservation_lines
      ADD CONSTRAINT uq_inventory_reservation_lines_reservation_line_no
      UNIQUE (reservation_id, line_no);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uq_inventory_reservation_consumptions_allocation_inventory_tx'
  ) THEN
    ALTER TABLE public.inventory_reservation_consumptions
      ADD CONSTRAINT uq_inventory_reservation_consumptions_allocation_inventory_tx
      UNIQUE (reservation_allocation_id, inventory_transaction_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uq_inventory_reservation_consumptions_allocation_source_event'
  ) THEN
    ALTER TABLE public.inventory_reservation_consumptions
      ADD CONSTRAINT uq_inventory_reservation_consumptions_allocation_source_event
      UNIQUE (reservation_allocation_id, source_event_type, source_event_id);
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 6) Partial unique indexes
-- ------------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_reservations_number_unique
  ON public.inventory_reservations (company_id, reservation_number)
  WHERE reservation_number IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_reservations_open_source_unique
  ON public.inventory_reservations (company_id, source_type, source_id)
  WHERE status NOT IN ('consumed', 'released', 'cancelled', 'expired', 'closed');

CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_reservation_lines_source_line_unique
  ON public.inventory_reservation_lines (reservation_id, source_line_id)
  WHERE source_line_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_reservation_allocations_active_line_warehouse_unique
  ON public.inventory_reservation_allocations (reservation_line_id, warehouse_id)
  WHERE status = 'active';

-- ------------------------------------------------------------------------------
-- 7) Non-unique indexes
-- ------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_inventory_reservations_branch_status_created
  ON public.inventory_reservations (company_id, branch_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_inventory_reservations_source_created
  ON public.inventory_reservations (company_id, source_type, source_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_inventory_reservations_open_expires_at
  ON public.inventory_reservations (company_id, expires_at)
  WHERE expires_at IS NOT NULL
    AND status NOT IN ('consumed', 'released', 'cancelled', 'expired', 'closed');

CREATE INDEX IF NOT EXISTS idx_inventory_reservation_lines_reservation_product
  ON public.inventory_reservation_lines (reservation_id, product_id);

CREATE INDEX IF NOT EXISTS idx_inventory_reservation_lines_company_branch_product
  ON public.inventory_reservation_lines (company_id, branch_id, product_id);

CREATE INDEX IF NOT EXISTS idx_inventory_reservation_allocations_active_bucket
  ON public.inventory_reservation_allocations (company_id, warehouse_id, product_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_inventory_reservation_allocations_reservation_status_created
  ON public.inventory_reservation_allocations (reservation_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_inventory_reservation_allocations_line_status
  ON public.inventory_reservation_allocations (reservation_line_id, status);

CREATE INDEX IF NOT EXISTS idx_inventory_reservation_allocations_branch_warehouse_status
  ON public.inventory_reservation_allocations (company_id, branch_id, warehouse_id, status);

CREATE INDEX IF NOT EXISTS idx_inventory_reservation_consumptions_inventory_transaction
  ON public.inventory_reservation_consumptions (inventory_transaction_id);

CREATE INDEX IF NOT EXISTS idx_inventory_reservation_consumptions_source_event
  ON public.inventory_reservation_consumptions (source_event_type, source_event_id);

CREATE INDEX IF NOT EXISTS idx_inventory_reservation_consumptions_reservation_created
  ON public.inventory_reservation_consumptions (reservation_id, created_at DESC);
