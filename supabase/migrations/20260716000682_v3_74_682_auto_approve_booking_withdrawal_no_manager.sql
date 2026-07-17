-- v3.74.682 — Auto-approve a booking stock withdrawal when the branch has no
-- store/warehouse manager (no custodian to approve).
-- ------------------------------------------------------------------
-- Gap: request_booking_stock_withdrawal always created the row as 'pending' and
-- notified the branch store manager. If the booking branch has NO store/
-- warehouse manager, nobody can approve it, so the withdrawal (and therefore
-- the booking execution, via the v3.74.672 gate) stays permanently blocked.
--
-- Fix (mirrors v3.74.664 for invoice dispatch / bill receipt): if the branch
-- has no store/warehouse manager member, auto-approve the withdrawal on request
-- (status='approved', decision note "no store manager") and skip the manager
-- notification. When a manager exists, behaviour is unchanged (pending + notify).
-- Applied live via MCP; captured in supabase/schema/functions.sql by the dump.
-- ------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.request_booking_stock_withdrawal(p_company_id uuid, p_booking_id uuid, p_bundle_item_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_booking public.bookings;
  v_pbi     public.product_bundle_items;
  v_wh      uuid;
  v_qty     numeric;
  v_id      uuid;
  v_has_mgr boolean;
BEGIN
  PERFORM public.assert_booking_addons_permission(p_company_id, p_booking_id);

  SELECT * INTO v_booking FROM public.bookings
   WHERE id = p_booking_id AND company_id = p_company_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'BOOKING_NOT_FOUND'; END IF;

  SELECT * INTO v_pbi FROM public.product_bundle_items
   WHERE id = p_bundle_item_id AND company_id = p_company_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'BUNDLE_ITEM_NOT_FOUND'; END IF;

  SELECT default_warehouse_id INTO v_wh FROM public.branches WHERE id = v_booking.branch_id;
  v_qty := COALESCE(v_pbi.quantity, 1) * COALESCE(v_booking.quantity, 1);

  SELECT EXISTS(
    SELECT 1 FROM public.company_members cm
     WHERE cm.company_id = p_company_id
       AND cm.branch_id  = v_booking.branch_id
       AND cm.user_id IS NOT NULL
       AND lower(cm.role) IN ('store_manager','warehouse_manager')
  ) INTO v_has_mgr;

  INSERT INTO public.booking_stock_withdrawals
    (company_id, booking_id, branch_id, warehouse_id, bundle_item_id, product_id, quantity,
     status, reason, requested_by, requested_at, decided_by, decided_at, decision_notes)
  VALUES
    (p_company_id, p_booking_id, v_booking.branch_id, v_wh, p_bundle_item_id, v_pbi.child_product_id, v_qty,
     CASE WHEN v_has_mgr THEN 'pending' ELSE 'approved' END,
     p_reason, auth.uid(), now(),
     CASE WHEN v_has_mgr THEN NULL ELSE auth.uid() END,
     CASE WHEN v_has_mgr THEN NULL ELSE now() END,
     CASE WHEN v_has_mgr THEN NULL ELSE 'اعتماد تلقائي — لا يوجد مسؤول مخزن لفرع الحجز.' END)
  ON CONFLICT (booking_id, bundle_item_id) DO UPDATE
    SET status = CASE WHEN v_has_mgr THEN 'pending' ELSE 'approved' END,
        reason = EXCLUDED.reason, requested_by = auth.uid(), requested_at = now(),
        decided_by = CASE WHEN v_has_mgr THEN NULL ELSE auth.uid() END,
        decided_at = CASE WHEN v_has_mgr THEN NULL ELSE now() END,
        decision_notes = CASE WHEN v_has_mgr THEN NULL ELSE 'اعتماد تلقائي — لا يوجد مسؤول مخزن لفرع الحجز.' END
  RETURNING id INTO v_id;

  IF v_has_mgr THEN
    BEGIN
      PERFORM public.create_notification(
        p_company_id, 'booking_stock_withdrawal', v_id,
        'طلب سحب منتج من المخزن',
        'طلب الموظف سحب منتج من مخزن الفرع لاستخدامه في الحجز ' || v_booking.booking_no || ' — يحتاج اعتمادك.',
        auth.uid(), v_booking.branch_id, NULL, v_wh,
        'store_manager', NULL, 'high',
        'booking_withdrawal_request:' || v_id::text || ':' || p_booking_id::text,
        'warning', 'inventory');
    EXCEPTION WHEN OTHERS THEN NULL; END;
  END IF;

  RETURN jsonb_build_object('success', true, 'withdrawal_id', v_id,
    'status', CASE WHEN v_has_mgr THEN 'pending' ELSE 'approved' END,
    'auto_approved', NOT v_has_mgr);
END;
$function$;
