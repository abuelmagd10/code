-- ==============================================================================
-- Services & Booking Module — Phase 1 / B1
-- Purpose:
--   Create core services schema tables.
-- Scope:
--   - services           (catalog of offered services)
--   - service_schedules  (weekly working hours per service)
--   - service_staff      (employees authorized to deliver a service)
-- Excludes:
--   - bookings tables (B7)
--   - constraints / indexes (B2)
--   - helper functions (B3)
--   - triggers (B4)
--   - RLS (B5)
--   - API RPCs (B6)
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1) services
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.services (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Multi-tenant isolation
  company_id            UUID        NOT NULL REFERENCES public.companies(id)         ON DELETE CASCADE,
  branch_id             UUID        NOT NULL REFERENCES public.branches(id)          ON DELETE RESTRICT,
  cost_center_id        UUID                 REFERENCES public.cost_centers(id)      ON DELETE SET NULL,

  -- Identity
  service_code          TEXT        NOT NULL,
  service_name          TEXT        NOT NULL,
  description           TEXT,
  category              TEXT,

  -- Type — 'individual' | 'group' | 'hourly' | 'session' | 'daily'
  service_type          TEXT        NOT NULL DEFAULT 'session',

  -- Pricing
  unit_price            NUMERIC(18,4) NOT NULL DEFAULT 0,
  cost_price            NUMERIC(18,4) NOT NULL DEFAULT 0,
  tax_rate              NUMERIC(9,4)  NOT NULL DEFAULT 0,
  currency_code         TEXT          NOT NULL DEFAULT 'EGP',

  -- Staff commission (tracked here; paid via payroll — no direct GL entry)
  commission_rate       NUMERIC(9,4)  NOT NULL DEFAULT 0,

  -- Scheduling
  duration_minutes      INTEGER       NOT NULL DEFAULT 60,
  capacity              INTEGER       NOT NULL DEFAULT 1,
  buffer_minutes        INTEGER       NOT NULL DEFAULT 0,
  advance_booking_days  INTEGER       NOT NULL DEFAULT 30,
  min_advance_hours     INTEGER       NOT NULL DEFAULT 1,
  cancel_before_hours   INTEGER       NOT NULL DEFAULT 24,

  -- Accounting
  revenue_account_id    UUID                   REFERENCES public.chart_of_accounts(id) ON DELETE SET NULL,
  expense_account_id    UUID                   REFERENCES public.chart_of_accounts(id) ON DELETE SET NULL,

  -- Display
  image_url             TEXT,
  color_code            TEXT,

  -- Flags
  is_bookable           BOOLEAN       NOT NULL DEFAULT true,
  is_active             BOOLEAN       NOT NULL DEFAULT true,
  requires_approval     BOOLEAN       NOT NULL DEFAULT false,

  -- Notes
  notes                 TEXT,

  -- Audit
  created_by            UUID,
  updated_by            UUID,
  created_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- 2) service_schedules  (weekly availability windows per service)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.service_schedules (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Multi-tenant isolation
  company_id        UUID        NOT NULL REFERENCES public.companies(id)  ON DELETE CASCADE,
  branch_id         UUID        NOT NULL REFERENCES public.branches(id)   ON DELETE RESTRICT,
  service_id        UUID        NOT NULL REFERENCES public.services(id)   ON DELETE CASCADE,

  -- 0 = Sunday … 6 = Saturday (ISO: 1=Monday … 7=Sunday is also common; we use JS convention)
  day_of_week       INTEGER     NOT NULL,
  start_time        TIME        NOT NULL,
  end_time          TIME        NOT NULL,
  is_active         BOOLEAN     NOT NULL DEFAULT true,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- 3) service_staff  (employees authorized to deliver a service)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.service_staff (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Multi-tenant isolation
  company_id        UUID        NOT NULL REFERENCES public.companies(id)  ON DELETE CASCADE,
  branch_id         UUID        NOT NULL REFERENCES public.branches(id)   ON DELETE RESTRICT,
  service_id        UUID        NOT NULL REFERENCES public.services(id)   ON DELETE CASCADE,

  -- References company_members.user_id (no hard FK — members can be removed without losing history)
  employee_user_id  UUID        NOT NULL,
  is_primary        BOOLEAN     NOT NULL DEFAULT false,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
