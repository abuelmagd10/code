-- ==============================================================================
-- Services & Booking Module — Phase 1 / B8
-- Purpose:
--   Constraints, CHECK constraints, and indexes for bookings tables.
--   Includes conflict-prevention index setup.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1) bookings — UNIQUE & CHECK constraints
-- ------------------------------------------------------------------------------
ALTER TABLE public.bookings
  ADD CONSTRAINT uq_bookings_company_no
    UNIQUE (company_id, booking_no);

ALTER TABLE public.bookings
  ADD CONSTRAINT chk_bookings_status
    CHECK (status IN ('draft','confirmed','in_progress','completed','cancelled','no_show'));

ALTER TABLE public.bookings
  ADD CONSTRAINT chk_bookings_end_after_start
    CHECK (end_time > start_time);

ALTER TABLE public.bookings
  ADD CONSTRAINT chk_bookings_duration_positive
    CHECK (duration_minutes > 0);

ALTER TABLE public.bookings
  ADD CONSTRAINT chk_bookings_unit_price
    CHECK (unit_price >= 0);

ALTER TABLE public.bookings
  ADD CONSTRAINT chk_bookings_quantity
    CHECK (quantity > 0);

ALTER TABLE public.bookings
  ADD CONSTRAINT chk_bookings_discount
    CHECK (discount_amount >= 0);

ALTER TABLE public.bookings
  ADD CONSTRAINT chk_bookings_tax_amount
    CHECK (tax_amount >= 0);

ALTER TABLE public.bookings
  ADD CONSTRAINT chk_bookings_total_amount
    CHECK (total_amount >= 0);

ALTER TABLE public.bookings
  ADD CONSTRAINT chk_bookings_paid_amount
    CHECK (paid_amount >= 0);

ALTER TABLE public.bookings
  ADD CONSTRAINT chk_bookings_payment_status
    CHECK (payment_status IN ('unpaid','partial','paid'));

ALTER TABLE public.bookings
  ADD CONSTRAINT chk_bookings_booking_source
    CHECK (booking_source IN ('manual','online','phone','walkin'));

ALTER TABLE public.bookings
  ADD CONSTRAINT chk_bookings_rating
    CHECK (rating IS NULL OR (rating >= 1 AND rating <= 5));

-- ------------------------------------------------------------------------------
-- 2) booking_payments — CHECK constraints
-- ------------------------------------------------------------------------------
ALTER TABLE public.booking_payments
  ADD CONSTRAINT chk_booking_payments_amount
    CHECK (amount > 0);

ALTER TABLE public.booking_payments
  ADD CONSTRAINT chk_booking_payments_method
    CHECK (payment_method IN ('cash','card','transfer','other'));

-- ------------------------------------------------------------------------------
-- 3) Performance indexes — bookings
-- ------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_bookings_company_branch
  ON public.bookings (company_id, branch_id);

CREATE INDEX IF NOT EXISTS idx_bookings_company_status
  ON public.bookings (company_id, status);

CREATE INDEX IF NOT EXISTS idx_bookings_service_date
  ON public.bookings (service_id, booking_date)
  WHERE status NOT IN ('cancelled','no_show');

-- Conflict-prevention: fast lookup of active bookings per staff + date
CREATE INDEX IF NOT EXISTS idx_bookings_staff_date_active
  ON public.bookings (staff_user_id, booking_date, start_time, end_time)
  WHERE staff_user_id IS NOT NULL
    AND status NOT IN ('cancelled','no_show');

-- Conflict-prevention: fast lookup of active bookings per service + date (capacity check)
CREATE INDEX IF NOT EXISTS idx_bookings_service_date_active
  ON public.bookings (service_id, booking_date, start_time, end_time)
  WHERE status NOT IN ('cancelled','no_show');

CREATE INDEX IF NOT EXISTS idx_bookings_customer
  ON public.bookings (customer_id, company_id);

CREATE INDEX IF NOT EXISTS idx_bookings_invoice
  ON public.bookings (invoice_id)
  WHERE invoice_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_bookings_date_range
  ON public.bookings (company_id, booking_date DESC);

-- ------------------------------------------------------------------------------
-- 4) Performance indexes — booking_status_history
-- ------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_booking_status_history_booking
  ON public.booking_status_history (booking_id, created_at DESC);

-- ------------------------------------------------------------------------------
-- 5) Performance indexes — booking_payments
-- ------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_booking_payments_booking
  ON public.booking_payments (booking_id);

CREATE INDEX IF NOT EXISTS idx_booking_payments_company
  ON public.booking_payments (company_id, payment_date DESC);
