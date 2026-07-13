-- v3.74.630 — Booking add-ons / sale products are the ASSIGNED EXECUTOR's job.
--
-- Business rule (owner decision): the booking officer (call center) only
-- CREATES and CONFIRMS a booking. Selecting the service's attached bundle
-- items and adding walk-in sale products is done by the employee who executes
-- the service — not the booking officer. Management (owner/admin/general_manager)
-- keeps oversight. The previous booking_officer allowance is removed here.
--
-- Enforced at the DB layer so it holds regardless of the UI. The booking
-- officer can still create/confirm (those RPCs don't call this guard).

CREATE OR REPLACE FUNCTION public.assert_booking_addons_permission(p_company_id uuid, p_booking_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_role text;
  v_booking public.bookings;
BEGIN
  IF v_uid IS NULL THEN RETURN; END IF;

  SELECT cm.role INTO v_role
  FROM public.company_members cm
  WHERE cm.company_id = p_company_id AND cm.user_id = v_uid
  LIMIT 1;

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'ADDONS_FORBIDDEN: لست عضواً فى هذه الشركة';
  END IF;

  -- Management always allowed (oversight).
  IF v_role IN ('owner','admin','general_manager') THEN RETURN; END IF;

  SELECT * INTO v_booking FROM public.bookings b
  WHERE b.id = p_booking_id AND b.company_id = p_company_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'BOOKING_NOT_FOUND'; END IF;

  -- Only the assigned executor (single staff_user_id or a multi-staff
  -- assignment row). booking_officer is intentionally NOT allowed.
  IF v_booking.staff_user_id = v_uid
     OR EXISTS (
       SELECT 1 FROM public.booking_staff_assignments bsa
       WHERE bsa.booking_id = p_booking_id AND bsa.user_id = v_uid
     ) THEN
    RETURN;
  END IF;

  RAISE EXCEPTION 'ADDONS_FORBIDDEN: تعديل أصناف/منتجات الحجز متاح فقط للمالك/الإدارة والموظف المكلّف بتنفيذ هذا الحجز';
END;
$function$;
