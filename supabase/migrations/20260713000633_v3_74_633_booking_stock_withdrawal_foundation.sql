-- v3.74.633 — Stock-withdrawal approval for CONSUMED (attached) products — foundation.
--
-- Owner decision (configurable per product): using an attached product in a
-- booking can require the branch warehouse manager to approve its release
-- before completion. Products flagged requires_withdrawal_approval=true need
-- an approved withdrawal; others deduct automatically at completion (default).
--
-- This migration is the DATA + WORKFLOW foundation only (flag, ledger table,
-- RLS, request/decide RPCs, notifications). The booking UI (request button,
-- store-manager decision) and the completion gate ship in the next stage, so
-- nothing here blocks existing completions.

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS requires_withdrawal_approval boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.products.requires_withdrawal_approval IS
  'When true, using this product as an attached (consumed) item in a booking needs the branch warehouse manager to approve its release before completion. When false, it is deducted automatically at completion (default).';

CREATE TABLE IF NOT EXISTS public.booking_stock_withdrawals (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  booking_id     uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  branch_id      uuid,
  warehouse_id   uuid,
  bundle_item_id uuid,
  product_id     uuid NOT NULL,
  quantity       numeric NOT NULL DEFAULT 1,
  status         text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  reason         text,
  requested_by   uuid,
  requested_at   timestamptz NOT NULL DEFAULT now(),
  decided_by     uuid,
  decided_at     timestamptz,
  decision_notes text,
  CONSTRAINT uq_bsw_booking_bundle UNIQUE (booking_id, bundle_item_id)
);

CREATE INDEX IF NOT EXISTS idx_bsw_company_booking ON public.booking_stock_withdrawals (company_id, booking_id);
CREATE INDEX IF NOT EXISTS idx_bsw_status ON public.booking_stock_withdrawals (company_id, status);

ALTER TABLE public.booking_stock_withdrawals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bsw_company_select ON public.booking_stock_withdrawals;
CREATE POLICY bsw_company_select ON public.booking_stock_withdrawals
  FOR SELECT USING (
    company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid())
  );

-- Executor requests release; notifies the branch store manager.
CREATE OR REPLACE FUNCTION public.request_booking_stock_withdrawal(
  p_company_id uuid, p_booking_id uuid, p_bundle_item_id uuid, p_reason text DEFAULT NULL
) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_booking public.bookings;
  v_pbi     public.product_bundle_items;
  v_wh      uuid;
  v_qty     numeric;
  v_id      uuid;
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

  INSERT INTO public.booking_stock_withdrawals
    (company_id, booking_id, branch_id, warehouse_id, bundle_item_id, product_id, quantity,
     status, reason, requested_by, requested_at)
  VALUES
    (p_company_id, p_booking_id, v_booking.branch_id, v_wh, p_bundle_item_id, v_pbi.child_product_id, v_qty,
     'pending', p_reason, auth.uid(), now())
  ON CONFLICT (booking_id, bundle_item_id) DO UPDATE
    SET status = 'pending', reason = EXCLUDED.reason, requested_by = auth.uid(),
        requested_at = now(), decided_by = NULL, decided_at = NULL, decision_notes = NULL
  RETURNING id INTO v_id;

  BEGIN
    PERFORM public.create_notification(
      p_company_id, 'booking_stock_withdrawal', v_id,
      'طلب سحب منتج من المخزن',
      'طلب الموظف سحب منتج من مخزن الفرع لاستخدامه في الحجز ' || v_booking.booking_no || ' — يحتاج اعتمادك.',
      auth.uid(), v_booking.branch_id, NULL, v_wh,
      'store_manager', NULL, 'high',
      'booking_withdrawal_request:' || v_id::text,
      'warning', 'inventory');
  EXCEPTION WHEN OTHERS THEN NULL; END;

  RETURN jsonb_build_object('success', true, 'withdrawal_id', v_id, 'status', 'pending');
END;
$function$;

GRANT EXECUTE ON FUNCTION public.request_booking_stock_withdrawal(uuid, uuid, uuid, text) TO authenticated;

-- Store manager (or management) approves/rejects; notifies the requester.
CREATE OR REPLACE FUNCTION public.decide_booking_stock_withdrawal(
  p_withdrawal_id uuid, p_approve boolean, p_notes text DEFAULT NULL
) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_w    public.booking_stock_withdrawals;
  v_role text;
  v_mbranch uuid;
  v_booking public.bookings;
  v_new  text;
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

  BEGIN
    PERFORM public.create_notification(
      v_w.company_id, 'booking_stock_withdrawal', v_w.id,
      CASE WHEN p_approve THEN 'تم اعتماد سحب المنتج' ELSE 'تم رفض سحب المنتج' END,
      CASE WHEN p_approve
        THEN 'اعتمد مسؤول المخزن سحب المنتج للحجز ' || COALESCE(v_booking.booking_no,'') || ' — يمكنك استخدامه.'
        ELSE 'رفض مسؤول المخزن سحب المنتج للحجز ' || COALESCE(v_booking.booking_no,'') || COALESCE(' — السبب: ' || p_notes, '') || '. ألغِ تحديد الصنف وأكمل بدونه.'
      END,
      auth.uid(), v_w.branch_id, NULL, v_w.warehouse_id,
      NULL, v_w.requested_by, 'high',
      'booking_withdrawal_decided:' || v_w.id::text || ':' || v_new,
      CASE WHEN p_approve THEN 'info' ELSE 'error' END, 'inventory');
  EXCEPTION WHEN OTHERS THEN NULL; END;

  RETURN jsonb_build_object('success', true, 'withdrawal_id', v_w.id, 'status', v_new);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.decide_booking_stock_withdrawal(uuid, boolean, text) TO authenticated;
