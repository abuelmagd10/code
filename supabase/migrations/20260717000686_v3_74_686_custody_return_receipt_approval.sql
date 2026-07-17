-- v3.74.686 — Technician-custody model (Phase 2): return-on-cancel becomes a
-- store-manager RECEIPT APPROVAL, with notifications.
-- ------------------------------------------------------------------
-- Phase 1 auto-returned custody to the warehouse on booking cancellation.
-- Phase 2 makes that a proper receipt approval: when a booking with materials
-- out on custody is cancelled, a return is REQUESTED (custody_status =
-- 'return_pending') and the branch store manager is notified to confirm receipt
-- in the approvals inbox (bcr tab). Approving posts the return to the warehouse
-- (Dr inventory / Cr custody) and notifies the requester. If the branch has no
-- store manager, the return is auto-approved (mirrors v3.74.682) and the
-- requester is notified. Rejecting ("materials not received") keeps the custody
-- out and escalates to management for settlement (write-off / accountability).
--
-- No accounting-engine changes: the actual return still goes through the
-- Phase-1 helper fn_post_booking_custody_return (verified balanced + in-sync).
-- ------------------------------------------------------------------

-- A) Request the custody return on cancel (pending receipt approval, or auto).
CREATE OR REPLACE FUNCTION public.fn_request_booking_custody_return(p_withdrawal_id uuid, p_reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  w public.booking_stock_withdrawals;
  v_booking public.bookings;
  v_has_mgr boolean;
BEGIN
  SELECT * INTO w FROM public.booking_stock_withdrawals WHERE id = p_withdrawal_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','not_found'); END IF;
  IF COALESCE(w.custody_status,'none') <> 'out' THEN RETURN jsonb_build_object('ok',true,'reason','nothing_out'); END IF;

  SELECT * INTO v_booking FROM public.bookings WHERE id = w.booking_id;

  SELECT EXISTS(
    SELECT 1 FROM public.company_members cm
     WHERE cm.company_id = w.company_id AND cm.branch_id = w.branch_id
       AND cm.user_id IS NOT NULL AND lower(cm.role) IN ('store_manager','warehouse_manager')
  ) INTO v_has_mgr;

  IF v_has_mgr THEN
    UPDATE public.booking_stock_withdrawals SET custody_status='return_pending' WHERE id = p_withdrawal_id;
    BEGIN
      PERFORM public.create_notification(
        w.company_id, 'booking_custody_return', w.id,
        'مطلوب اعتماد استلام مواد مرتجعة',
        'أُلغِيَ الحجز ' || COALESCE(v_booking.booking_no,'') || ' — يلزم اعتماد استلام مواد العهدة المرتجعة للمخزن.',
        auth.uid(), w.branch_id, NULL, w.warehouse_id,
        'store_manager', NULL, 'high',
        'booking_custody_return_request:' || w.id::text,
        'warning', 'inventory');
    EXCEPTION WHEN OTHERS THEN NULL; END;
    RETURN jsonb_build_object('ok',true,'status','return_pending');
  ELSE
    PERFORM public.fn_post_booking_custody_return(p_withdrawal_id, 'إرجاع تلقائي — لا يوجد مسؤول مخزن للفرع');
    BEGIN
      PERFORM public.create_notification(
        w.company_id, 'booking_custody_return', w.id,
        'تم إرجاع مواد العهدة للمخزن',
        'أُلغِيَ الحجز ' || COALESCE(v_booking.booking_no,'') || ' — أُعيدت مواد العهدة للمخزن تلقائيًا (لا يوجد مسؤول مخزن للفرع).',
        auth.uid(), w.branch_id, NULL, w.warehouse_id,
        NULL, w.requested_by, 'high',
        'booking_custody_return_auto:' || w.id::text,
        'info', 'inventory');
    EXCEPTION WHEN OTHERS THEN NULL; END;
    RETURN jsonb_build_object('ok',true,'status','returned_auto');
  END IF;
END; $function$;

-- B) Decide the receipt of returned custody materials.
CREATE OR REPLACE FUNCTION public.decide_booking_custody_return(p_withdrawal_id uuid, p_approve boolean, p_notes text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  w public.booking_stock_withdrawals;
  v_role text; v_mbranch uuid; v_booking public.bookings; v_mgr uuid;
BEGIN
  SELECT * INTO w FROM public.booking_stock_withdrawals WHERE id = p_withdrawal_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'RETURN_NOT_FOUND'; END IF;
  IF COALESCE(w.custody_status,'none') <> 'return_pending' THEN
    RAISE EXCEPTION 'RETURN_ALREADY_DECIDED: الحالة الحالية (%).', COALESCE(w.custody_status,'none');
  END IF;

  SELECT cm.role, cm.branch_id INTO v_role, v_mbranch
    FROM public.company_members cm
   WHERE cm.company_id = w.company_id AND cm.user_id = auth.uid() LIMIT 1;
  IF v_role IS NULL THEN RAISE EXCEPTION 'RETURN_FORBIDDEN: لست عضواً فى هذه الشركة'; END IF;
  IF NOT (
    v_role IN ('owner','admin','general_manager')
    OR (v_role IN ('store_manager','warehouse_manager') AND (v_mbranch IS NULL OR v_mbranch = w.branch_id))
  ) THEN
    RAISE EXCEPTION 'RETURN_FORBIDDEN: اعتماد استلام المرتجع من اختصاص مسؤول مخزن الفرع (أو الإدارة)';
  END IF;

  SELECT * INTO v_booking FROM public.bookings WHERE id = w.booking_id;

  IF p_approve THEN
    PERFORM public.fn_post_booking_custody_return(p_withdrawal_id, COALESCE(p_notes,'اعتماد استلام المرتجع'));
    BEGIN
      PERFORM public.create_notification(
        w.company_id, 'booking_custody_return', w.id,
        'تم استلام المواد المرتجعة',
        'اعتمد مسؤول المخزن استلام مواد العهدة للحجز الملغى ' || COALESCE(v_booking.booking_no,'') || ' وأُعيدت للمخزن.',
        auth.uid(), w.branch_id, NULL, w.warehouse_id,
        NULL, w.requested_by, 'high',
        'booking_custody_return_decided:' || w.id::text || ':approved',
        'info', 'inventory');
    EXCEPTION WHEN OTHERS THEN NULL; END;
    RETURN jsonb_build_object('success', true, 'withdrawal_id', w.id, 'status', 'returned');
  ELSE
    UPDATE public.booking_stock_withdrawals SET custody_status='return_rejected' WHERE id = p_withdrawal_id;
    FOR v_mgr IN
      SELECT DISTINCT u FROM (
        SELECT user_id AS u FROM public.companies WHERE id = w.company_id
        UNION SELECT user_id FROM public.company_members WHERE company_id = w.company_id AND role IN ('owner','admin','general_manager')
        UNION SELECT user_id FROM public.company_members WHERE company_id = w.company_id AND role = 'manager' AND branch_id = w.branch_id
      ) x WHERE u IS NOT NULL AND u <> COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid)
    LOOP
      BEGIN
        PERFORM public.create_notification(
          w.company_id, 'booking_custody_return', w.id,
          'لم تُستلَم مواد العهدة المرتجعة — يلزم تسوية',
          'أفاد مسؤول المخزن بعدم استلام مواد العهدة للحجز الملغى ' || COALESCE(v_booking.booking_no,'') || COALESCE(' — السبب: ' || p_notes,'') || '. المواد ما زالت خارج المخزن — يلزم تسوية (هالك/مساءلة).',
          auth.uid(), w.branch_id, NULL, w.warehouse_id,
          NULL, v_mgr, 'high',
          'booking_custody_return_rejected:' || w.id::text || ':' || v_mgr::text,
          'error', 'inventory');
      EXCEPTION WHEN OTHERS THEN NULL; END;
    END LOOP;
    RETURN jsonb_build_object('success', true, 'withdrawal_id', w.id, 'status', 'return_rejected');
  END IF;
END; $function$;

-- C) Cancel now REQUESTS the return (approval flow) instead of auto-returning.
DO $do$
DECLARE d text;
BEGIN
  IF (SELECT pg_get_functiondef('public.cancel_booking_atomic'::regproc)) NOT ILIKE '%fn_request_booking_custody_return%' THEN
    SELECT pg_get_functiondef('public.cancel_booking_atomic'::regproc) INTO d;
    d := replace(d, 'public.fn_post_booking_custody_return(id, ''إرجاع عند إلغاء الحجز'')',
                    'public.fn_request_booking_custody_return(id, ''إلغاء الحجز'')');
    EXECUTE d;
  END IF;
END $do$;
