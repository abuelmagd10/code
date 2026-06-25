-- v3.74.361 — Multi-staff bookings (DB + API layer).
--
-- The owner clarified the rules:
--   * Owner / general_manager / branch manager attach one OR more
--     staff members to a service.
--   * The booking officer can pick 0, 1 or many of those staff on a
--     booking. 0 = open queue (anyone linked to the service).
--   * The "تنفيذ الخدمة" button must appear only for the assigned
--     staff, plus owner + general_manager (who never earn commission
--     when they execute themselves).
--
-- bookings.staff_user_id is a single uuid so it cannot represent
-- "Ahmed + Khaled". We add a junction table for the full set and
-- keep staff_user_id as a legacy mirror (= first assigned user) so
-- existing SELECTs keep working.

-- ============================================================
-- 1. Junction table + RLS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.booking_staff_assignments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id   UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL,
  company_id   UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  branch_id    UUID NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (booking_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_booking_staff_assignments_booking
  ON public.booking_staff_assignments (booking_id);

CREATE INDEX IF NOT EXISTS idx_booking_staff_assignments_user
  ON public.booking_staff_assignments (company_id, user_id);

COMMENT ON TABLE public.booking_staff_assignments IS
  'v3.74.361 - One row per (booking, staff member). bookings.staff_user_id is kept as a legacy mirror = first assigned user.';

-- Backfill from existing single-staff bookings.
INSERT INTO public.booking_staff_assignments (booking_id, user_id, company_id, branch_id)
SELECT b.id, b.staff_user_id, b.company_id, b.branch_id
  FROM public.bookings b
 WHERE b.staff_user_id IS NOT NULL
ON CONFLICT (booking_id, user_id) DO NOTHING;

ALTER TABLE public.booking_staff_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY booking_staff_assignments_select ON public.booking_staff_assignments
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
        FROM public.bookings b
       WHERE b.id = booking_staff_assignments.booking_id
         AND b.company_id = booking_staff_assignments.company_id
    )
  );

CREATE POLICY booking_staff_assignments_insert ON public.booking_staff_assignments
  FOR INSERT
  WITH CHECK (
    company_id IN (SELECT get_user_company_ids())
  );

CREATE POLICY booking_staff_assignments_delete ON public.booking_staff_assignments
  FOR DELETE
  USING (
    company_id IN (SELECT get_user_company_ids())
  );

-- ============================================================
-- 2. create_booking_atomic accepts p_staff_user_ids uuid[]
-- ============================================================
DROP FUNCTION IF EXISTS public.create_booking_atomic(
  uuid, uuid, uuid, uuid, uuid, date, time without time zone,
  numeric, uuid, numeric, text, text, uuid, boolean
);

CREATE OR REPLACE FUNCTION public.create_booking_atomic(
  p_company_id          uuid,
  p_branch_id           uuid,
  p_service_id          uuid,
  p_customer_id         uuid,
  p_created_by          uuid,
  p_booking_date        date,
  p_start_time          time without time zone,
  p_quantity            numeric  DEFAULT 1,
  p_staff_user_id       uuid     DEFAULT NULL::uuid,
  p_discount_amount     numeric  DEFAULT 0,
  p_booking_source      text     DEFAULT 'manual'::text,
  p_notes               text     DEFAULT NULL::text,
  p_cost_center_id      uuid     DEFAULT NULL::uuid,
  p_skip_schedule_check boolean  DEFAULT false,
  p_staff_user_ids      uuid[]   DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_service       public.services;
  v_booking_id    UUID;
  v_booking_no    TEXT;
  v_end_time      TIME;
  v_totals        RECORD;
  v_staff_arr     UUID[];
  v_legacy_staff  UUID;
BEGIN
  v_service  := public.svc_assert_service_bookable(p_service_id, p_company_id);
  v_end_time := (p_start_time + (v_service.duration_minutes || ' minutes')::INTERVAL)::TIME;

  PERFORM public.bkg_validate_advance_booking(p_service_id, p_booking_date, p_start_time);

  SELECT * INTO v_totals
    FROM public.bkg_compute_totals(
      v_service.unit_price, p_quantity, p_discount_amount,
      v_service.tax_rate, v_service.commission_rate
    );

  v_booking_no := public.bkg_generate_booking_no(p_company_id);

  IF p_staff_user_ids IS NOT NULL AND array_length(p_staff_user_ids, 1) > 0 THEN
    v_staff_arr := p_staff_user_ids;
  ELSIF p_staff_user_id IS NOT NULL THEN
    v_staff_arr := ARRAY[p_staff_user_id];
  ELSE
    v_staff_arr := NULL;
  END IF;

  v_legacy_staff := CASE
    WHEN v_staff_arr IS NULL THEN NULL
    ELSE v_staff_arr[1]
  END;

  INSERT INTO public.bookings (
    company_id, branch_id, cost_center_id, booking_no, service_id, customer_id, staff_user_id,
    booking_date, start_time, end_time, duration_minutes, status,
    unit_price, quantity, discount_amount, tax_amount, total_amount, currency_code, commission_amount,
    payment_status, paid_amount, booking_source, notes, created_by, updated_by
  ) VALUES (
    p_company_id, p_branch_id, p_cost_center_id, v_booking_no, p_service_id, p_customer_id, v_legacy_staff,
    p_booking_date, p_start_time, v_end_time, v_service.duration_minutes, 'draft',
    v_service.unit_price, p_quantity, COALESCE(p_discount_amount, 0), v_totals.tax_amount, v_totals.total_amount,
    v_service.currency_code, v_totals.commission_amount,
    'unpaid', 0, p_booking_source, p_notes, p_created_by, p_created_by
  ) RETURNING id INTO v_booking_id;

  IF v_staff_arr IS NOT NULL THEN
    INSERT INTO public.booking_staff_assignments (booking_id, user_id, company_id, branch_id)
    SELECT v_booking_id, uid, p_company_id, p_branch_id
      FROM unnest(v_staff_arr) AS uid
    ON CONFLICT (booking_id, user_id) DO NOTHING;
  END IF;

  RETURN jsonb_build_object(
    'success',        true,
    'booking_id',     v_booking_id,
    'booking_no',     v_booking_no,
    'end_time',       v_end_time,
    'total_amount',   v_totals.total_amount,
    'staff_user_ids', COALESCE(v_staff_arr, ARRAY[]::uuid[])
  );
END;
$function$;

COMMENT ON FUNCTION public.create_booking_atomic IS
  'v3.74.361 - Accepts p_staff_user_ids array (multi-staff). Legacy p_staff_user_id still works (treated as single-element array).';

-- ============================================================
-- 3. v_bookings_full exposes assigned_staff_user_ids[] + names[]
-- ============================================================
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
  ) AS staff_name,
  (
    SELECT COALESCE(array_agg(bsa.user_id ORDER BY bsa.created_at), ARRAY[]::uuid[])
      FROM public.booking_staff_assignments bsa
     WHERE bsa.booking_id = b.id
  ) AS assigned_staff_user_ids,
  (
    SELECT COALESCE(
             array_agg(
               COALESCE(emp2.full_name, up2.display_name, up2.username, cm2.email)
               ORDER BY bsa.created_at
             ),
             ARRAY[]::text[]
           )
      FROM public.booking_staff_assignments bsa
      LEFT JOIN public.company_members cm2
        ON cm2.user_id = bsa.user_id AND cm2.company_id = bsa.company_id
      LEFT JOIN public.employees emp2
        ON emp2.id = cm2.employee_id
      LEFT JOIN public.user_profiles up2
        ON up2.user_id = bsa.user_id
     WHERE bsa.booking_id = b.id
  ) AS assigned_staff_names
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
