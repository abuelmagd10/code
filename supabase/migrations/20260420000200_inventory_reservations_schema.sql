-- ==============================================================================
-- Reservation System - Step 1
-- Purpose:
--   Create additive reservation tables only.
-- Scope:
--   - inventory_reservations
--   - inventory_reservation_lines
--   - inventory_reservation_allocations
--   - inventory_reservation_consumptions
-- Excludes:
--   - indexes and unique/check constraints
--   - helper functions
--   - triggers
--   - RLS
--   - views
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.inventory_reservations (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_number     TEXT,
  company_id             UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  branch_id              UUID NOT NULL REFERENCES public.branches(id) ON DELETE RESTRICT,
  warehouse_id           UUID REFERENCES public.warehouses(id) ON DELETE SET NULL,
  cost_center_id         UUID REFERENCES public.cost_centers(id) ON DELETE SET NULL,
  source_type            TEXT NOT NULL,
  source_id              UUID NOT NULL,
  source_number          TEXT,
  status                 TEXT NOT NULL DEFAULT 'draft',
  close_reason           TEXT,
  expires_at             TIMESTAMPTZ,
  requested_qty          NUMERIC(18,4) NOT NULL DEFAULT 0,
  reserved_qty           NUMERIC(18,4) NOT NULL DEFAULT 0,
  consumed_qty           NUMERIC(18,4) NOT NULL DEFAULT 0,
  released_qty           NUMERIC(18,4) NOT NULL DEFAULT 0,
  version                INTEGER NOT NULL DEFAULT 1,
  metadata               JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_by             UUID,
  updated_by             UUID,
  last_status_changed_by UUID,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_status_changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.inventory_reservation_lines (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id             UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  branch_id              UUID NOT NULL REFERENCES public.branches(id) ON DELETE RESTRICT,
  warehouse_id           UUID REFERENCES public.warehouses(id) ON DELETE SET NULL,
  cost_center_id         UUID REFERENCES public.cost_centers(id) ON DELETE SET NULL,
  reservation_id         UUID NOT NULL REFERENCES public.inventory_reservations(id) ON DELETE CASCADE,
  source_line_id         UUID,
  line_no                INTEGER NOT NULL,
  product_id             UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  requested_qty          NUMERIC(18,4) NOT NULL,
  reserved_qty           NUMERIC(18,4) NOT NULL DEFAULT 0,
  consumed_qty           NUMERIC(18,4) NOT NULL DEFAULT 0,
  released_qty           NUMERIC(18,4) NOT NULL DEFAULT 0,
  created_by             UUID,
  updated_by             UUID,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.inventory_reservation_allocations (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id             UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  branch_id              UUID NOT NULL REFERENCES public.branches(id) ON DELETE RESTRICT,
  warehouse_id           UUID NOT NULL REFERENCES public.warehouses(id) ON DELETE RESTRICT,
  cost_center_id         UUID REFERENCES public.cost_centers(id) ON DELETE SET NULL,
  reservation_id         UUID NOT NULL REFERENCES public.inventory_reservations(id) ON DELETE CASCADE,
  reservation_line_id    UUID NOT NULL REFERENCES public.inventory_reservation_lines(id) ON DELETE CASCADE,
  product_id             UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  allocated_qty          NUMERIC(18,4) NOT NULL,
  consumed_qty           NUMERIC(18,4) NOT NULL DEFAULT 0,
  released_qty           NUMERIC(18,4) NOT NULL DEFAULT 0,
  status                 TEXT NOT NULL DEFAULT 'active',
  created_by             UUID,
  updated_by             UUID,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.inventory_reservation_consumptions (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id                UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  branch_id                 UUID NOT NULL REFERENCES public.branches(id) ON DELETE RESTRICT,
  warehouse_id              UUID NOT NULL REFERENCES public.warehouses(id) ON DELETE RESTRICT,
  cost_center_id            UUID REFERENCES public.cost_centers(id) ON DELETE SET NULL,
  reservation_id            UUID NOT NULL REFERENCES public.inventory_reservations(id) ON DELETE CASCADE,
  reservation_line_id       UUID NOT NULL REFERENCES public.inventory_reservation_lines(id) ON DELETE CASCADE,
  reservation_allocation_id UUID NOT NULL REFERENCES public.inventory_reservation_allocations(id) ON DELETE CASCADE,
  product_id                UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  inventory_transaction_id  UUID NOT NULL REFERENCES public.inventory_transactions(id) ON DELETE RESTRICT,
  source_event_type         TEXT NOT NULL,
  source_event_id           UUID NOT NULL,
  quantity                  NUMERIC(18,4) NOT NULL,
  created_by                UUID,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
