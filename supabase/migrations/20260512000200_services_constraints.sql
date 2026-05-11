-- ==============================================================================
-- Services & Booking Module — Phase 1 / B2
-- Purpose:
--   Add constraints, unique indexes, and check constraints for services tables.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1) services — UNIQUE & CHECK constraints
-- ------------------------------------------------------------------------------
ALTER TABLE public.services
  ADD CONSTRAINT uq_services_company_code
    UNIQUE (company_id, service_code);

ALTER TABLE public.services
  ADD CONSTRAINT chk_services_type
    CHECK (service_type IN ('individual','group','hourly','session','daily'));

ALTER TABLE public.services
  ADD CONSTRAINT chk_services_unit_price
    CHECK (unit_price >= 0);

ALTER TABLE public.services
  ADD CONSTRAINT chk_services_cost_price
    CHECK (cost_price >= 0);

ALTER TABLE public.services
  ADD CONSTRAINT chk_services_tax_rate
    CHECK (tax_rate >= 0 AND tax_rate <= 100);

ALTER TABLE public.services
  ADD CONSTRAINT chk_services_commission_rate
    CHECK (commission_rate >= 0 AND commission_rate <= 100);

ALTER TABLE public.services
  ADD CONSTRAINT chk_services_duration
    CHECK (duration_minutes > 0);

ALTER TABLE public.services
  ADD CONSTRAINT chk_services_capacity
    CHECK (capacity > 0);

ALTER TABLE public.services
  ADD CONSTRAINT chk_services_buffer
    CHECK (buffer_minutes >= 0);

ALTER TABLE public.services
  ADD CONSTRAINT chk_services_advance_booking_days
    CHECK (advance_booking_days >= 0);

ALTER TABLE public.services
  ADD CONSTRAINT chk_services_min_advance_hours
    CHECK (min_advance_hours >= 0);

ALTER TABLE public.services
  ADD CONSTRAINT chk_services_cancel_before_hours
    CHECK (cancel_before_hours >= 0);

-- ------------------------------------------------------------------------------
-- 2) service_schedules — CHECK constraints
-- ------------------------------------------------------------------------------
ALTER TABLE public.service_schedules
  ADD CONSTRAINT chk_service_schedules_day_of_week
    CHECK (day_of_week BETWEEN 0 AND 6);

ALTER TABLE public.service_schedules
  ADD CONSTRAINT chk_service_schedules_times
    CHECK (end_time > start_time);

-- Prevent duplicate schedule slots for same service + day
ALTER TABLE public.service_schedules
  ADD CONSTRAINT uq_service_schedules_service_day
    UNIQUE (service_id, day_of_week);

-- ------------------------------------------------------------------------------
-- 3) service_staff — UNIQUE constraint
-- ------------------------------------------------------------------------------
ALTER TABLE public.service_staff
  ADD CONSTRAINT uq_service_staff_service_employee
    UNIQUE (service_id, employee_user_id);

-- ------------------------------------------------------------------------------
-- 4) Performance indexes
-- ------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_services_company_branch
  ON public.services (company_id, branch_id);

CREATE INDEX IF NOT EXISTS idx_services_company_active
  ON public.services (company_id, is_active)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_services_cost_center
  ON public.services (cost_center_id)
  WHERE cost_center_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_service_schedules_service
  ON public.service_schedules (service_id, day_of_week)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_service_staff_service
  ON public.service_staff (service_id);

CREATE INDEX IF NOT EXISTS idx_service_staff_employee
  ON public.service_staff (employee_user_id, company_id);
