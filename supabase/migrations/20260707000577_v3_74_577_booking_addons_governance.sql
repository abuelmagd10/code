-- =====================================================================
-- v3.74.577 — Booking addons governance + staff-from-service validation
-- (applied to production via Supabase MCP on 2026-07-07; mirrored here)
--
-- (1) assert_booking_addons_permission(company, booking):
--     who may add/remove bundle selections & walk-in extras:
--       * owner / admin / general_manager          → always
--       * booking_officer                          → own branch only
--                                                    (unbranched officer = any branch)
--       * the staff assigned to THIS booking       → his own booking only
--                                                    (bookings.staff_user_id or
--                                                     booking_staff_assignments)
--       * everyone else (manager view-only, accountant, …) → denied
--     auth.uid() IS NULL (service-role / server API) → allowed; those
--     paths carry their own guards.
--
-- (2) booking staff must belong to the service's registered staff
--     (service_staff), enforced at INSERT / staff change. Services with
--     no registered staff keep free choice (nothing configured = no rule).
-- =====================================================================

CREATE OR REPLACE FUNCTION public.assert_booking_addons_permission(
  p_company_id uuid,
  p_booking_id uuid
) RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role text;
  v_member_branch uuid;
  v_booking_branch uuid;
  v_booking_staff uuid;
BEGIN
  -- Server-side (service role) callers keep their own guards.
  IF v_uid IS NULL THEN RETURN; END IF;

  SELECT cm.role, cm.branch_id INTO v_role, v_member_branch
  FROM public.company_members cm
  WHERE cm.company_id = p_company_id AND cm.user_id = v_uid
  LIMIT 1;

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'ADDONS_FORBIDDEN: لست عضواً فى هذه الشركة';
  END IF;

  IF v_role IN ('owner','admin','general_manager') THEN RETURN; END IF;

  SELECT b.branch_id, b.staff_user_id INTO v_booking_branch, v_booking_staff
  FROM public.bookings b
  WHERE b.id = p_booking_id AND b.company_id = p_company_id;

  IF v_booking_branch IS NULL AND v_booking_staff IS NULL THEN
    RAISE EXCEPTION 'BOOKING_NOT_FOUND';
  END IF;

  -- Booking officer: full addon rights inside his branch scope.
  IF v_role = 'booking_officer'
     AND (v_member_branch IS NULL OR v_member_branch = v_booking_branch) THEN
    RETURN;
  END IF;

  -- The staff member assigned to THIS booking (single or multi-assign).
  IF v_booking_staff = v_uid
     OR EXISTS (
       SELECT 1 FROM public.booking_staff_assignments bsa
       WHERE bsa.booking_id = p_booking_id AND bsa.user_id = v_uid
     ) THEN
    RETURN;
  END IF;

  RAISE EXCEPTION 'ADDONS_FORBIDDEN: تعديل إضافات الحجز متاح فقط للمالك/الإدارة، مسئول الحجز فى فرعه، والموظف المكلف بهذا الحجز';
END;
$$;

-- ---------------------------------------------------------------
-- Re-issue the 4 RPCs with the permission gate (logic unchanged).
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.add_booking_bundle_selection(
  p_company_id uuid, p_booking_id uuid, p_bundle_item_id uuid,
  p_selected_by uuid, p_quantity_override numeric DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_id uuid;
BEGIN
  PERFORM public.assert_booking_editable_for_bundle(p_booking_id);
  PERFORM public.assert_booking_addons_permission(p_company_id, p_booking_id);
  IF NOT EXISTS (
    SELECT 1 FROM public.product_bundle_items pbi
     WHERE pbi.id = p_bundle_item_id AND pbi.company_id = p_company_id
       AND pbi.is_optional = true
  ) THEN
    RAISE EXCEPTION 'BUNDLE_ITEM_NOT_OPTIONAL_OR_NOT_FOUND';
  END IF;
  INSERT INTO public.booking_bundle_selections
    (company_id, booking_id, bundle_item_id, quantity_override, selected_by)
  VALUES (p_company_id, p_booking_id, p_bundle_item_id, p_quantity_override,
          COALESCE(auth.uid(), p_selected_by))
  ON CONFLICT (booking_id, bundle_item_id) DO UPDATE
     SET quantity_override = EXCLUDED.quantity_override,
         selected_by = EXCLUDED.selected_by,
         selected_at = NOW()
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_booking_bundle_selection(
  p_company_id uuid, p_booking_id uuid, p_bundle_item_id uuid
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public.assert_booking_editable_for_bundle(p_booking_id);
  PERFORM public.assert_booking_addons_permission(p_company_id, p_booking_id);
  DELETE FROM public.booking_bundle_selections
   WHERE booking_id = p_booking_id
     AND bundle_item_id = p_bundle_item_id
     AND company_id = p_company_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.add_booking_extra_item(
  p_company_id uuid, p_booking_id uuid, p_product_id uuid,
  p_quantity numeric, p_unit_price numeric, p_added_by uuid,
  p_discount_percent numeric DEFAULT 0, p_tax_rate numeric DEFAULT 0,
  p_notes text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_id uuid;
BEGIN
  PERFORM public.assert_booking_editable_for_bundle(p_booking_id);
  PERFORM public.assert_booking_addons_permission(p_company_id, p_booking_id);
  IF p_quantity IS NULL OR p_quantity <= 0 THEN RAISE EXCEPTION 'QTY_MUST_BE_POSITIVE'; END IF;
  IF p_unit_price IS NULL OR p_unit_price < 0 THEN RAISE EXCEPTION 'PRICE_MUST_BE_NON_NEGATIVE'; END IF;
  INSERT INTO public.booking_extra_items
    (company_id, booking_id, product_id, quantity, unit_price,
     discount_percent, tax_rate, notes, added_by)
  VALUES
    (p_company_id, p_booking_id, p_product_id, p_quantity, p_unit_price,
     COALESCE(p_discount_percent,0), COALESCE(p_tax_rate,0), p_notes,
     COALESCE(auth.uid(), p_added_by))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_booking_extra_item(
  p_company_id uuid, p_booking_id uuid, p_extra_id uuid
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public.assert_booking_editable_for_bundle(p_booking_id);
  PERFORM public.assert_booking_addons_permission(p_company_id, p_booking_id);
  DELETE FROM public.booking_extra_items
   WHERE id = p_extra_id
     AND booking_id = p_booking_id
     AND company_id = p_company_id;
END;
$$;

-- ---------------------------------------------------------------
-- (2) booking staff must be registered on the service.
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validate_booking_staff_from_service()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  -- Only when the staff or the service actually changes.
  IF TG_OP = 'UPDATE'
     AND NEW.staff_user_id IS NOT DISTINCT FROM OLD.staff_user_id
     AND NEW.service_id    IS NOT DISTINCT FROM OLD.service_id THEN
    RETURN NEW;
  END IF;

  IF NEW.staff_user_id IS NULL OR NEW.service_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Rule applies only when the service has registered staff at all.
  IF EXISTS (SELECT 1 FROM public.service_staff ss WHERE ss.service_id = NEW.service_id) THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.service_staff ss
      WHERE ss.service_id = NEW.service_id
        AND ss.employee_user_id = NEW.staff_user_id
        AND (ss.branch_id IS NULL OR ss.branch_id = NEW.branch_id)
    ) THEN
      RAISE EXCEPTION 'STAFF_NOT_ON_SERVICE: الموظف المختار غير مسجل ضمن موظفى هذه الخدمة فى هذا الفرع';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS booking_staff_from_service_trg ON public.bookings;
CREATE TRIGGER booking_staff_from_service_trg
BEFORE INSERT OR UPDATE ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.validate_booking_staff_from_service();
