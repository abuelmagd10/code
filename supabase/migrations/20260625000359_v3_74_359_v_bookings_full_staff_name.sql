-- v3.74.359 — Add staff_name to v_bookings_full.
--
-- Symptom (owner, June 25 2026):
--   The bookings tab in /sales-orders showed the assigned employee as
--   a raw 8-char UUID prefix (e.g. "24550790") instead of the name.
--
-- Root cause:
--   v_bookings_full joined company_members but only surfaced
--   staff_email. BookingsTab fell back to staff_user_id.slice(0,8)
--   when staff_name was missing.
--
-- Fix:
--   Rebuild the view with a staff_name column that resolves
--   employees.full_name -> user_profiles.display_name ->
--   user_profiles.username -> company_members.email (in that order),
--   matching v3.74.347's approach for the service-staff endpoint.
--   The column lands at the end because CREATE OR REPLACE VIEW
--   forbids inserting in the middle of the column list; consumers
--   read by name so position is irrelevant.

CREATE OR REPLACE VIEW public.v_bookings_full AS
SELECT
  b.id,
  b.company_id,
  b.branch_id,
  br.name AS branch_name,
  b.booking_no,
  b.status,
  b.booking_date,
  b.start_time,
  b.end_time,
  b.duration_minutes,
  b.booking_source,
  b.service_id,
  s.service_code,
  s.service_name,
  s.service_type,
  s.category AS service_category,
  s.color_code AS service_color,
  b.customer_id,
  c.name AS customer_name,
  c.phone AS customer_phone,
  c.email AS customer_email,
  b.staff_user_id,
  cm.email AS staff_email,
  b.unit_price,
  b.quantity,
  b.discount_amount,
  b.tax_amount,
  b.total_amount,
  b.currency_code,
  b.commission_amount,
  b.payment_status,
  b.paid_amount,
  (b.total_amount - b.paid_amount) AS outstanding_amount,
  b.invoice_id,
  b.rating,
  b.feedback,
  b.confirmed_at,
  b.started_at,
  b.completed_at,
  b.cancelled_at,
  b.cancellation_reason,
  b.reminder_sent,
  b.notes,
  b.cost_center_id,
  cc.cost_center_name,
  b.created_by,
  b.created_at,
  b.updated_at,
  COALESCE(
    emp.full_name,
    up.display_name,
    up.username,
    cm.email
  ) AS staff_name
FROM public.bookings b
  LEFT JOIN public.branches br
    ON br.id = b.branch_id
  LEFT JOIN public.services s
    ON s.id = b.service_id
  LEFT JOIN public.customers c
    ON c.id = b.customer_id
  LEFT JOIN public.company_members cm
    ON cm.user_id = b.staff_user_id
   AND cm.company_id = b.company_id
  LEFT JOIN public.employees emp
    ON emp.id = cm.employee_id
  LEFT JOIN public.user_profiles up
    ON up.user_id = b.staff_user_id
  LEFT JOIN public.cost_centers cc
    ON cc.id = b.cost_center_id;
