-- v3.74.632 — Auto-select ALL optional attached (bundle) items on booking creation.
--
-- Owner decision: when a booking is created, every OPTIONAL item attached to
-- the service's product should appear pre-selected ("checked by default") for
-- the executor, who then unchecks whatever wasn't actually used or sold.
-- Mandatory items (is_optional=false) are already auto-included by
-- get_booking_line_additions, so we only seed the optional ones here.
--
-- Implemented inside create_booking_atomic (SECURITY DEFINER) so the selection
-- rows exist from creation regardless of who created the booking. The executor
-- (and management) can still toggle them via add/remove_booking_bundle_selection;
-- pricing/consumption are computed at completion from the selected set.

CREATE OR REPLACE FUNCTION public.create_booking_atomic(p_company_id uuid, p_branch_id uuid, p_service_id uuid, p_customer_id uuid, p_created_by uuid, p_booking_date date, p_start_time time without time zone, p_quantity numeric DEFAULT 1, p_staff_user_id uuid DEFAULT NULL::uuid, p_discount_amount numeric DEFAULT 0, p_booking_source text DEFAULT 'manual'::text, p_notes text DEFAULT NULL::text, p_cost_center_id uuid DEFAULT NULL::uuid, p_skip_schedule_check boolean DEFAULT false, p_staff_user_ids uuid[] DEFAULT NULL::uuid[])
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

  -- v3.74.632 — auto-select ALL optional attached (bundle) items by default.
  IF v_service.product_catalog_id IS NOT NULL THEN
    INSERT INTO public.booking_bundle_selections
      (company_id, booking_id, bundle_item_id, quantity_override, selected_by)
    SELECT p_company_id, v_booking_id, pbi.id, NULL, p_created_by
      FROM public.product_bundle_items pbi
     WHERE pbi.parent_product_id = v_service.product_catalog_id
       AND pbi.company_id = p_company_id
       AND COALESCE(pbi.is_optional, false) = true
    ON CONFLICT (booking_id, bundle_item_id) DO NOTHING;
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
