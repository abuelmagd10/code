-- ==============================================================================
-- Services & Booking Module — Phase 1 / B7
-- Purpose:
--   Create bookings schema tables.
-- Scope:
--   - bookings              (master booking record)
--   - booking_status_history (full audit trail of status changes)
--   - booking_payments       (deposits & partial payments before invoice)
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1) bookings
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.bookings (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Multi-tenant isolation
  company_id          UUID        NOT NULL REFERENCES public.companies(id)    ON DELETE CASCADE,
  branch_id           UUID        NOT NULL REFERENCES public.branches(id)     ON DELETE RESTRICT,
  cost_center_id      UUID                 REFERENCES public.cost_centers(id) ON DELETE SET NULL,

  -- Reference number
  booking_no          TEXT        NOT NULL,                            -- BKG-YYYY-NNNNN

  -- Core relations
  service_id          UUID        NOT NULL REFERENCES public.services(id)     ON DELETE RESTRICT,
  customer_id         UUID        NOT NULL REFERENCES public.customers(id)    ON DELETE RESTRICT,
  staff_user_id       UUID,                                            -- company_members.user_id (soft ref)

  -- Scheduling
  booking_date        DATE        NOT NULL,
  start_time          TIME        NOT NULL,
  end_time            TIME        NOT NULL,
  duration_minutes    INTEGER     NOT NULL,

  -- Status lifecycle
  -- draft | confirmed | in_progress | completed | cancelled | no_show
  status              TEXT        NOT NULL DEFAULT 'draft',

  -- Pricing (snapshot at booking time)
  unit_price          NUMERIC(18,4) NOT NULL DEFAULT 0,
  quantity            NUMERIC(18,4) NOT NULL DEFAULT 1,
  discount_amount     NUMERIC(18,4) NOT NULL DEFAULT 0,
  tax_amount          NUMERIC(18,4) NOT NULL DEFAULT 0,
  total_amount        NUMERIC(18,4) NOT NULL DEFAULT 0,
  currency_code       TEXT          NOT NULL DEFAULT 'EGP',

  -- Commission (for payroll reference — no direct GL entry)
  commission_amount   NUMERIC(18,4) NOT NULL DEFAULT 0,

  -- Payment tracking
  payment_status      TEXT          NOT NULL DEFAULT 'unpaid',         -- unpaid | partial | paid
  paid_amount         NUMERIC(18,4) NOT NULL DEFAULT 0,

  -- Accounting link (created on completion)
  invoice_id          UUID                   REFERENCES public.invoices(id) ON DELETE SET NULL,

  -- Booking metadata
  booking_source      TEXT          NOT NULL DEFAULT 'manual',         -- manual | online | phone | walkin
  reminder_sent       BOOLEAN       NOT NULL DEFAULT false,

  -- Customer feedback (post-completion)
  rating              INTEGER,                                          -- 1–5
  feedback            TEXT,

  -- Cancellation
  cancellation_reason TEXT,
  notes               TEXT,

  -- Workflow timestamps & actors
  confirmed_by        UUID,
  confirmed_at        TIMESTAMPTZ,
  started_by          UUID,
  started_at          TIMESTAMPTZ,
  completed_by        UUID,
  completed_at        TIMESTAMPTZ,
  cancelled_by        UUID,
  cancelled_at        TIMESTAMPTZ,

  -- Audit
  created_by          UUID,
  updated_by          UUID,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- 2) booking_status_history  (immutable audit trail)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.booking_status_history (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  booking_id    UUID        NOT NULL REFERENCES public.bookings(id)  ON DELETE CASCADE,
  old_status    TEXT,
  new_status    TEXT        NOT NULL,
  changed_by    UUID,
  reason        TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- 3) booking_payments  (deposits / partial payments before invoice creation)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.booking_payments (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID        NOT NULL REFERENCES public.companies(id)  ON DELETE CASCADE,
  branch_id       UUID        NOT NULL REFERENCES public.branches(id)   ON DELETE RESTRICT,
  booking_id      UUID        NOT NULL REFERENCES public.bookings(id)   ON DELETE CASCADE,

  amount          NUMERIC(18,4) NOT NULL,
  currency_code   TEXT          NOT NULL DEFAULT 'EGP',
  payment_method  TEXT          NOT NULL DEFAULT 'cash',               -- cash | card | transfer | other
  payment_date    DATE          NOT NULL DEFAULT CURRENT_DATE,
  reference_no    TEXT,                                                 -- external reference / receipt no
  notes           TEXT,

  -- After invoice is created, payments can be linked to it
  invoice_id      UUID                   REFERENCES public.invoices(id) ON DELETE SET NULL,

  created_by      UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
