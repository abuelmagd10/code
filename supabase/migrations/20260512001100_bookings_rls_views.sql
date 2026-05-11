-- ==============================================================================
-- Services & Booking Module — Phase 1 / B11
-- Purpose:
--   RLS policies for bookings tables + reporting views.
-- Permission Logic:
--   - owner / admin / general_manager  → all branches in company
--   - manager                          → own branch only
--   - receptionist (view_all_bookings) → all bookings in branch (future RBAC hook)
--   - staff/employee                   → only their own bookings (staff_user_id = auth.uid())
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- Enable RLS
-- ------------------------------------------------------------------------------
ALTER TABLE public.bookings               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_payments       ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------------------------
-- 1) bookings — SELECT policy (role-aware via helper functions)
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "bookings_select" ON public.bookings;
DROP POLICY IF EXISTS "bookings_insert" ON public.bookings;
DROP POLICY IF EXISTS "bookings_update" ON public.bookings;
DROP POLICY IF EXISTS "bookings_delete" ON public.bookings;

-- SELECT: company isolation + branch isolation (RLS handles data fence;
-- additional staff-level filtering is handled in the API layer for flexibility
-- so that receptionists and managers can access their scope via API queries)
CREATE POLICY "bookings_select" ON public.bookings FOR SELECT
  USING (
    company_id IN (SELECT public.get_user_company_ids())
    AND public.can_access_record_branch(company_id, branch_id)
  );

CREATE POLICY "bookings_insert" ON public.bookings FOR INSERT
  WITH CHECK (
    company_id IN (SELECT public.get_user_company_ids())
    AND public.can_access_record_branch(company_id, branch_id)
  );

CREATE POLICY "bookings_update" ON public.bookings FOR UPDATE
  USING (
    company_id IN (SELECT public.get_user_company_ids())
    AND public.can_access_record_branch(company_id, branch_id)
  )
  WITH CHECK (
    company_id IN (SELECT public.get_user_company_ids())
    AND public.can_access_record_branch(company_id, branch_id)
  );

-- Soft-delete only (no hard DELETE for audit integrity)
CREATE POLICY "bookings_delete" ON public.bookings FOR DELETE
  USING (false);

-- ------------------------------------------------------------------------------
-- 2) booking_status_history — read-only (immutable audit trail)
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "booking_status_history_select" ON public.booking_status_history;
DROP POLICY IF EXISTS "booking_status_history_insert" ON public.booking_status_history;

CREATE POLICY "booking_status_history_select" ON public.booking_status_history FOR SELECT
  USING (
    company_id IN (SELECT public.get_user_company_ids())
    AND EXISTS (
      SELECT 1 FROM public.bookings b
       WHERE b.id = booking_status_history.booking_id
         AND b.company_id = booking_status_history.company_id
    )
  );

-- Only triggers (SECURITY DEFINER) write here; block direct INSERT from clients
CREATE POLICY "booking_status_history_insert" ON public.booking_status_history FOR INSERT
  WITH CHECK (false);

-- ------------------------------------------------------------------------------
-- 3) booking_payments
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "booking_payments_select" ON public.booking_payments;
DROP POLICY IF EXISTS "booking_payments_insert" ON public.booking_payments;
DROP POLICY IF EXISTS "booking_payments_update" ON public.booking_payments;
DROP POLICY IF EXISTS "booking_payments_delete" ON public.booking_payments;

CREATE POLICY "booking_payments_select" ON public.booking_payments FOR SELECT
  USING (
    company_id IN (SELECT public.get_user_company_ids())
    AND public.can_access_record_branch(company_id, branch_id)
  );

CREATE POLICY "booking_payments_insert" ON public.booking_payments FOR INSERT
  WITH CHECK (
    company_id IN (SELECT public.get_user_company_ids())
    AND public.can_access_record_branch(company_id, branch_id)
  );

CREATE POLICY "booking_payments_update" ON public.booking_payments FOR UPDATE
  USING (
    company_id IN (SELECT public.get_user_company_ids())
    AND public.can_access_record_branch(company_id, branch_id)
  )
  WITH CHECK (
    company_id IN (SELECT public.get_user_company_ids())
    AND public.can_access_record_branch(company_id, branch_id)
  );

CREATE POLICY "booking_payments_delete" ON public.booking_payments FOR DELETE
  USING (
    company_id IN (SELECT public.get_user_company_ids())
    AND public.can_access_record_branch(company_id, branch_id)
  );

-- ==============================================================================
-- REPORTING VIEWS
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- V1) v_bookings_full — enriched bookings with all related data
-- ------------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_bookings_full AS
SELECT
  b.id,
  b.company_id,
  b.branch_id,
  br.name                              AS branch_name,
  b.booking_no,
  b.status,
  b.booking_date,
  b.start_time,
  b.end_time,
  b.duration_minutes,
  b.booking_source,

  -- Service
  b.service_id,
  s.service_code,
  s.service_name,
  s.service_type,
  s.category                           AS service_category,
  s.color_code                         AS service_color,

  -- Customer
  b.customer_id,
  c.name                               AS customer_name,
  c.phone                              AS customer_phone,
  c.email                              AS customer_email,

  -- Staff
  b.staff_user_id,
  cm.email                             AS staff_email,

  -- Pricing
  b.unit_price,
  b.quantity,
  b.discount_amount,
  b.tax_amount,
  b.total_amount,
  b.currency_code,
  b.commission_amount,

  -- Payment
  b.payment_status,
  b.paid_amount,
  b.total_amount - b.paid_amount       AS outstanding_amount,
  b.invoice_id,

  -- Feedback
  b.rating,
  b.feedback,

  -- Workflow
  b.confirmed_at,
  b.started_at,
  b.completed_at,
  b.cancelled_at,
  b.cancellation_reason,
  b.reminder_sent,
  b.notes,

  -- Cost center
  b.cost_center_id,
  cc.cost_center_name,

  -- Audit
  b.created_by,
  b.created_at,
  b.updated_at

FROM public.bookings b
LEFT JOIN public.branches      br ON br.id = b.branch_id
LEFT JOIN public.services       s ON  s.id = b.service_id
LEFT JOIN public.customers      c ON  c.id = b.customer_id
LEFT JOIN public.company_members cm ON cm.user_id = b.staff_user_id AND cm.company_id = b.company_id
LEFT JOIN public.cost_centers  cc ON cc.id = b.cost_center_id;

-- ------------------------------------------------------------------------------
-- V2) v_service_revenue_summary — revenue per service per month
-- ------------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_service_revenue_summary AS
SELECT
  b.company_id,
  b.branch_id,
  b.service_id,
  s.service_name,
  s.service_type,
  s.category,
  DATE_TRUNC('month', b.booking_date::TIMESTAMPTZ)  AS month,
  COUNT(*)                                           AS total_bookings,
  COUNT(*) FILTER (WHERE b.status = 'completed')     AS completed_bookings,
  COUNT(*) FILTER (WHERE b.status = 'cancelled')     AS cancelled_bookings,
  COUNT(*) FILTER (WHERE b.status = 'no_show')       AS no_show_bookings,
  COALESCE(SUM(b.total_amount)  FILTER (WHERE b.status = 'completed'), 0) AS total_revenue,
  COALESCE(SUM(b.tax_amount)    FILTER (WHERE b.status = 'completed'), 0) AS total_tax,
  COALESCE(SUM(b.paid_amount)   FILTER (WHERE b.status = 'completed'), 0) AS total_collected,
  COALESCE(AVG(b.rating)        FILTER (WHERE b.rating IS NOT NULL), 0)   AS avg_rating
FROM public.bookings b
LEFT JOIN public.services s ON s.id = b.service_id
GROUP BY b.company_id, b.branch_id, b.service_id, s.service_name, s.service_type, s.category,
         DATE_TRUNC('month', b.booking_date::TIMESTAMPTZ);

-- ------------------------------------------------------------------------------
-- V3) v_staff_performance — bookings & revenue per staff member per month
-- ------------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_staff_performance AS
SELECT
  b.company_id,
  b.branch_id,
  b.staff_user_id,
  cm.email                                           AS staff_email,
  DATE_TRUNC('month', b.booking_date::TIMESTAMPTZ)  AS month,
  COUNT(*)                                           AS total_bookings,
  COUNT(*) FILTER (WHERE b.status = 'completed')     AS completed_bookings,
  COUNT(*) FILTER (WHERE b.status = 'cancelled')     AS cancelled_bookings,
  COUNT(*) FILTER (WHERE b.status = 'no_show')       AS no_show_bookings,
  COALESCE(SUM(b.total_amount)      FILTER (WHERE b.status = 'completed'), 0) AS total_revenue,
  COALESCE(SUM(b.commission_amount) FILTER (WHERE b.status = 'completed'), 0) AS total_commission,
  COALESCE(AVG(b.rating)            FILTER (WHERE b.rating IS NOT NULL), 0)   AS avg_rating
FROM public.bookings b
LEFT JOIN public.company_members cm ON cm.user_id = b.staff_user_id AND cm.company_id = b.company_id
WHERE b.staff_user_id IS NOT NULL
GROUP BY b.company_id, b.branch_id, b.staff_user_id, cm.email,
         DATE_TRUNC('month', b.booking_date::TIMESTAMPTZ);

-- ------------------------------------------------------------------------------
-- V4) v_branch_occupancy_rate — occupancy (booked slots vs working hours) per branch/service/day
-- ------------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_branch_occupancy_rate AS
SELECT
  b.company_id,
  b.branch_id,
  b.service_id,
  s.service_name,
  s.capacity,
  s.duration_minutes                                 AS slot_minutes,
  b.booking_date,
  COUNT(*) FILTER (WHERE b.status NOT IN ('cancelled','no_show'))  AS active_bookings,
  s.capacity                                                        AS max_capacity,
  ROUND(
    COUNT(*) FILTER (WHERE b.status NOT IN ('cancelled','no_show'))::NUMERIC
    / NULLIF(s.capacity, 0) * 100, 2
  )                                                  AS occupancy_pct
FROM public.bookings b
LEFT JOIN public.services s ON s.id = b.service_id
GROUP BY b.company_id, b.branch_id, b.service_id, s.service_name,
         s.capacity, s.duration_minutes, b.booking_date;
