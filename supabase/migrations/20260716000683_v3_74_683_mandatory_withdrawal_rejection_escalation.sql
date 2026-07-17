-- v3.74.683 — Clear path + escalation when a MANDATORY withdrawal is rejected.
-- ------------------------------------------------------------------
-- Gap: rejecting a booking stock withdrawal always told the executor to
-- "deselect the item and complete without it". But a MANDATORY service item
-- cannot be deselected, so that advice is wrong and the booking deadlocks.
--
-- Fix: decide_booking_stock_withdrawal now checks whether the withdrawn bundle
-- item is optional. On rejection:
--   * OPTIONAL  -> message stays "deselect the item and complete without it".
--   * MANDATORY -> message says the booking cannot be executed without the item
--     (provide stock or cancel), AND management (owner/admin/GM + branch
--     manager) is notified so they can intervene.
-- Applied live via MCP; captured in supabase/schema/functions.sql by the dump.
-- ------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.decide_booking_stock_withdrawal(p_withdrawal_id uuid, p_approve boolean, p_notes text DEFAULT NULL::text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_w    public.booking_stock_withdrawals;
  v_role text;
  v_mbranch uuid;
  v_booking public.bookings;
  v_new  text;
  v_is_optional boolean;
  v_msg text;
  v_mgr uuid;
BEGIN
  SELECT * INTO v_w FROM public.booking_stock_withdrawals WHERE id = p_withdrawal_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'WITHDRAWAL_NOT_FOUND'; END IF;

  SELECT cm.role, cm.branch_id INTO v_role, v_mbranch
    FROM public.company_members cm
   WHERE cm.company_id = v_w.company_id AND cm.user_id = auth.uid()
   LIMIT 1;
  IF v_role IS NULL THEN RAISE EXCEPTION 'WITHDRAWAL_FORBIDDEN: لست عضواً فى هذه الشركة'; END IF;

  IF NOT (
    v_role IN ('owner','admin','general_manager')
    OR (v_role = 'store_manager' AND (v_mbranch IS NULL OR v_mbranch = v_w.branch_id))
  ) THEN
    RAISE EXCEPTION 'WITHDRAWAL_FORBIDDEN: اعتماد سحب المنتج من اختصاص مسؤول مخزن الفرع (أو الإدارة)';
  END IF;

  IF v_w.status <> 'pending' THEN
    RAISE EXCEPTION 'WITHDRAWAL_ALREADY_DECIDED: تم البت في هذا الطلب مسبقاً (%).', v_w.status;
  END IF;

  v_new := CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END;

  UPDATE public.booking_stock_withdrawals
     SET status = v_new, decided_by = auth.uid(), decided_at = now(), decision_notes = p_notes
   WHERE id = p_withdrawal_id;

  SELECT * INTO v_booking FROM public.bookings WHERE id = v_w.booking_id;

  SELECT COALESCE(is_optional, false) INTO v_is_optional
    FROM public.product_bundle_items WHERE id = v_w.bundle_item_id;

  IF p_approve THEN
    v_msg := 'اعتمد مسؤول المخزن سحب المنتج للحجز ' || COALESCE(v_booking.booking_no,'') || ' — يمكنك استخدامه.';
  ELSIF v_is_optional THEN
    v_msg := 'رفض مسؤول المخزن سحب المنتج للحجز ' || COALESCE(v_booking.booking_no,'') || COALESCE(' — السبب: ' || p_notes, '') || '. ألغِ تحديد الصنف وأكمل بدونه.';
  ELSE
    v_msg := 'رفض مسؤول المخزن سحب صنف إلزامي للحجز ' || COALESCE(v_booking.booking_no,'') || COALESCE(' — السبب: ' || p_notes, '') || '. لا يمكن تنفيذ الحجز بدونه — يلزم توفير الصنف أو إلغاء الحجز.';
  END IF;

  BEGIN
    PERFORM public.create_notification(
      v_w.company_id, 'booking_stock_withdrawal', v_w.id,
      CASE WHEN p_approve THEN 'تم اعتماد سحب المنتج' ELSE 'تم رفض سحب المنتج' END,
      v_msg,
      auth.uid(), v_w.branch_id, NULL, v_w.warehouse_id,
      NULL, v_w.requested_by, 'high',
      'booking_withdrawal_decided:' || v_w.id::text || ':' || v_new || ':' || v_w.booking_id::text,
      CASE WHEN p_approve THEN 'info' ELSE 'error' END, 'inventory');
  EXCEPTION WHEN OTHERS THEN NULL; END;

  IF NOT p_approve AND NOT v_is_optional THEN
    FOR v_mgr IN
      SELECT DISTINCT u FROM (
        SELECT user_id AS u FROM public.companies WHERE id = v_w.company_id
        UNION
        SELECT user_id FROM public.company_members
         WHERE company_id = v_w.company_id AND role IN ('owner','admin','general_manager')
        UNION
        SELECT user_id FROM public.company_members
         WHERE company_id = v_w.company_id AND role = 'manager' AND branch_id = v_w.branch_id
      ) x WHERE u IS NOT NULL AND u <> COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid)
    LOOP
      BEGIN
        PERFORM public.create_notification(
          v_w.company_id, 'booking_stock_withdrawal', v_w.id,
          'رفض سحب صنف إلزامي — يلزم تدخّل',
          'رُفض سحب صنف إلزامي للحجز ' || COALESCE(v_booking.booking_no,'') || COALESCE(' — السبب: ' || p_notes, '') || '. لا يمكن تنفيذ الحجز بدونه — وفّروا الصنف أو ألغوا الحجز.',
          auth.uid(), v_w.branch_id, NULL, v_w.warehouse_id,
          NULL, v_mgr, 'high',
          'booking_withdrawal_mandatory_reject:' || v_w.id::text || ':' || v_mgr::text,
          'error', 'inventory');
      EXCEPTION WHEN OTHERS THEN NULL; END;
    END LOOP;
  END IF;

  RETURN jsonb_build_object('success', true, 'withdrawal_id', v_w.id, 'status', v_new, 'mandatory', NOT v_is_optional);
END;
$function$;
