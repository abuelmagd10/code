-- v3.74.685 — Technician-custody model for booking stock withdrawals (Phase 1).
-- ------------------------------------------------------------------
-- Concept (approved by the product owner): approving a booking stock
-- withdrawal means the technician has RECEIVED the material to perform the
-- service, so the stock should leave the warehouse at APPROVAL time — held in a
-- new asset account "مواد في عهدة الفنّي" (Materials in Technician Custody),
-- NOT expensed. It becomes an expense only at execution; if execution is
-- cancelled the material returns to the warehouse.
--
-- Accounting is kept NEUTRAL and non-invasive (Approach B): the sensitive COGS
-- engine is NOT modified. Instead:
--   * At approval  -> custody OUT : inventory_transactions('booking_custody_out')
--        + balanced journal  Dr custody / Cr inventory  (qty x cost_price).
--   * At execution -> custody RETURN (Dr inventory / Cr custody) BEFORE the
--        existing consumption logic runs, so the warehouse is whole again and
--        complete_booking_atomic deducts exactly once, exactly as before.
--   * At cancel    -> custody RETURN (interim auto-return; Phase 2 adds the
--        store-manager receipt approval + notifications).
-- Over the full lifecycle the custody account nets to ZERO and the final COGS
-- is identical to today. Journals are posted via create_journal_entry_atomic()
-- (the sanctioned poster) so all integrity guards are respected.
--
-- Verified live (rolled back): a full custody OUT->RETURN cycle on a real
-- product kept the trial balance balanced, inventory GL in sync with stock
-- value, product quantity correct, and the custody account back to zero.
-- Backward compatible: legacy approved withdrawals (custody_status NULL) keep
-- deducting at execution as before.
-- ------------------------------------------------------------------

-- 1) Custody tracking columns on the withdrawal.
ALTER TABLE public.booking_stock_withdrawals
  ADD COLUMN IF NOT EXISTS custody_status      text,
  ADD COLUMN IF NOT EXISTS custody_value       numeric,
  ADD COLUMN IF NOT EXISTS custody_out_at      timestamptz,
  ADD COLUMN IF NOT EXISTS custody_returned_at timestamptz;

-- 2) Custody asset account in the DEFAULT chart-of-accounts template
--    (so every NEW company gets it), then backfill existing companies.
INSERT INTO public.chart_of_accounts_template
  (account_code, account_name, account_name_en, account_type, normal_balance, sub_type, parent_code, level, is_active)
SELECT '1145', 'مواد في عهدة الفنّي', 'Materials in Technician Custody', 'asset', 'debit', 'inventory_in_custody', '1100', 3, true
WHERE NOT EXISTS (SELECT 1 FROM public.chart_of_accounts_template WHERE account_code = '1145');

SELECT public.sync_all_companies_chart_of_accounts();

-- 3) Helper: post custody OUT for an approved withdrawal (Dr custody / Cr inventory).
CREATE OR REPLACE FUNCTION public.fn_post_booking_custody_out(p_withdrawal_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  w public.booking_stock_withdrawals;
  v_booking public.bookings;
  v_service public.services;
  v_branch public.branches;
  v_tracked boolean; v_cost numeric; v_qty int; v_value numeric;
  v_custody_acct uuid; v_inv_acct uuid; v_cc uuid; v_je jsonb;
BEGIN
  SELECT * INTO w FROM public.booking_stock_withdrawals WHERE id = p_withdrawal_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','not_found'); END IF;
  IF w.status <> 'approved' THEN RETURN jsonb_build_object('ok',false,'reason','not_approved'); END IF;
  IF COALESCE(w.custody_status,'none') = 'out' THEN RETURN jsonb_build_object('ok',true,'reason','already_out'); END IF;

  SELECT COALESCE(track_inventory,false), COALESCE(cost_price,0)
    INTO v_tracked, v_cost FROM public.products WHERE id = w.product_id;
  v_qty := CEIL(COALESCE(w.quantity,0))::int;
  v_value := v_qty * v_cost;
  IF NOT COALESCE(v_tracked,false) OR v_qty <= 0 OR v_value <= 0 THEN
    UPDATE public.booking_stock_withdrawals SET custody_status='none' WHERE id = p_withdrawal_id;
    RETURN jsonb_build_object('ok',true,'reason','not_tracked_or_zero');
  END IF;

  SELECT * INTO v_booking FROM public.bookings WHERE id = w.booking_id;
  SELECT * INTO v_service FROM public.services WHERE id = v_booking.service_id;
  SELECT * INTO v_branch  FROM public.branches WHERE id = w.branch_id;

  SELECT id INTO v_custody_acct FROM public.chart_of_accounts
    WHERE company_id = w.company_id AND is_active
      AND (account_code = '1145' OR sub_type IN ('inventory_in_custody','work_in_process'))
    ORDER BY CASE WHEN account_code='1145' THEN 0 ELSE 1 END LIMIT 1;
  SELECT id INTO v_inv_acct FROM public.chart_of_accounts
    WHERE company_id = w.company_id AND is_active AND sub_type = 'inventory' LIMIT 1;
  IF v_custody_acct IS NULL OR v_inv_acct IS NULL THEN
    UPDATE public.booking_stock_withdrawals SET custody_status='skipped_no_account' WHERE id = p_withdrawal_id;
    RETURN jsonb_build_object('ok',true,'reason','no_account');
  END IF;

  v_cc := COALESCE(v_booking.cost_center_id, v_service.cost_center_id, v_branch.default_cost_center_id);
  IF v_cc IS NULL THEN SELECT id INTO v_cc FROM public.cost_centers WHERE company_id = w.company_id LIMIT 1; END IF;

  INSERT INTO public.inventory_transactions (
    company_id, branch_id, warehouse_id, cost_center_id, product_id,
    transaction_type, quantity_change, reference_type, reference_id, notes
  ) VALUES (
    w.company_id, w.branch_id, w.warehouse_id, v_cc, w.product_id,
    'booking_custody_out', -v_qty, 'booking_stock_withdrawal', w.id,
    'خروج عهدة للفنّي — حجز ' || COALESCE(v_booking.booking_no,'')
  );

  v_je := public.create_journal_entry_atomic(
    w.company_id, 'booking_custody_out', w.id, CURRENT_DATE,
    'خروج مواد لعهدة الفنّي — حجز ' || COALESCE(v_booking.booking_no,''),
    w.branch_id, v_cc, w.warehouse_id,
    jsonb_build_array(
      jsonb_build_object('account_id', v_custody_acct, 'debit_amount', v_value, 'credit_amount', 0, 'description','مواد في عهدة الفنّي'),
      jsonb_build_object('account_id', v_inv_acct, 'debit_amount', 0, 'credit_amount', v_value, 'description','تخفيض المخزون - عهدة')
    )
  );
  IF NOT COALESCE((v_je->>'success')::boolean, false) THEN
    RAISE EXCEPTION 'CUSTODY_OUT_JE_FAILED: %', COALESCE(v_je->>'error','unknown');
  END IF;

  UPDATE public.booking_stock_withdrawals
     SET custody_status='out', custody_value=v_value, custody_out_at=now()
   WHERE id = p_withdrawal_id;
  RETURN jsonb_build_object('ok',true,'value',v_value,'qty',v_qty);
END; $function$;

-- 4) Helper: post custody RETURN (Dr inventory / Cr custody) at execution/cancel.
CREATE OR REPLACE FUNCTION public.fn_post_booking_custody_return(p_withdrawal_id uuid, p_note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  w public.booking_stock_withdrawals;
  v_booking public.bookings; v_service public.services; v_branch public.branches;
  v_qty int; v_value numeric; v_custody_acct uuid; v_inv_acct uuid; v_cc uuid; v_je jsonb;
BEGIN
  SELECT * INTO w FROM public.booking_stock_withdrawals WHERE id = p_withdrawal_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','not_found'); END IF;
  IF COALESCE(w.custody_status,'none') <> 'out' THEN RETURN jsonb_build_object('ok',true,'reason','nothing_out'); END IF;

  v_qty := CEIL(COALESCE(w.quantity,0))::int;
  v_value := COALESCE(w.custody_value, 0);

  SELECT * INTO v_booking FROM public.bookings WHERE id = w.booking_id;
  SELECT * INTO v_service FROM public.services WHERE id = v_booking.service_id;
  SELECT * INTO v_branch  FROM public.branches WHERE id = w.branch_id;

  SELECT id INTO v_custody_acct FROM public.chart_of_accounts
    WHERE company_id = w.company_id AND is_active
      AND (account_code = '1145' OR sub_type IN ('inventory_in_custody','work_in_process'))
    ORDER BY CASE WHEN account_code='1145' THEN 0 ELSE 1 END LIMIT 1;
  SELECT id INTO v_inv_acct FROM public.chart_of_accounts
    WHERE company_id = w.company_id AND is_active AND sub_type = 'inventory' LIMIT 1;

  v_cc := COALESCE(v_booking.cost_center_id, v_service.cost_center_id, v_branch.default_cost_center_id);
  IF v_cc IS NULL THEN SELECT id INTO v_cc FROM public.cost_centers WHERE company_id = w.company_id LIMIT 1; END IF;

  IF v_qty > 0 THEN
    INSERT INTO public.inventory_transactions (
      company_id, branch_id, warehouse_id, cost_center_id, product_id,
      transaction_type, quantity_change, reference_type, reference_id, notes
    ) VALUES (
      w.company_id, w.branch_id, w.warehouse_id, v_cc, w.product_id,
      'booking_custody_return', v_qty, 'booking_stock_withdrawal', w.id,
      'إرجاع عهدة للمخزن — حجز ' || COALESCE(v_booking.booking_no,'') || COALESCE(' — ' || p_note,'')
    );
  END IF;

  IF v_value > 0 AND v_custody_acct IS NOT NULL AND v_inv_acct IS NOT NULL THEN
    v_je := public.create_journal_entry_atomic(
      w.company_id, 'booking_custody_return', w.id, CURRENT_DATE,
      'إرجاع مواد من عهدة الفنّي للمخزن — حجز ' || COALESCE(v_booking.booking_no,''),
      w.branch_id, v_cc, w.warehouse_id,
      jsonb_build_array(
        jsonb_build_object('account_id', v_inv_acct, 'debit_amount', v_value, 'credit_amount', 0, 'description','عودة المخزون من العهدة'),
        jsonb_build_object('account_id', v_custody_acct, 'debit_amount', 0, 'credit_amount', v_value, 'description','تصفية عهدة الفنّي')
      )
    );
    IF NOT COALESCE((v_je->>'success')::boolean, false) THEN
      RAISE EXCEPTION 'CUSTODY_RETURN_JE_FAILED: %', COALESCE(v_je->>'error','unknown');
    END IF;
  END IF;

  UPDATE public.booking_stock_withdrawals
     SET custody_status='returned', custody_returned_at=now()
   WHERE id = p_withdrawal_id;
  RETURN jsonb_build_object('ok',true,'value',v_value,'qty',v_qty);
END; $function$;

-- 5) Wire the helpers into the four lifecycle functions (idempotent fetch-patch;
--    full patched bodies are also captured in supabase/schema/functions.sql).
DO $do$
DECLARE d text;
BEGIN
  IF (SELECT pg_get_functiondef('public.decide_booking_stock_withdrawal'::regproc)) NOT ILIKE '%fn_post_booking_custody_out%' THEN
    SELECT pg_get_functiondef('public.decide_booking_stock_withdrawal'::regproc) INTO d;
    d := replace(d,
      $a$SELECT * INTO v_booking FROM public.bookings WHERE id = v_w.booking_id;$a$,
      $a$SELECT * INTO v_booking FROM public.bookings WHERE id = v_w.booking_id;
  IF p_approve THEN PERFORM public.fn_post_booking_custody_out(p_withdrawal_id); END IF;$a$);
    EXECUTE d;
  END IF;
END $do$;

DO $do$
DECLARE d text;
BEGIN
  IF (SELECT pg_get_functiondef('public.request_booking_stock_withdrawal'::regproc)) NOT ILIKE '%fn_post_booking_custody_out%' THEN
    SELECT pg_get_functiondef('public.request_booking_stock_withdrawal'::regproc) INTO d;
    d := replace(d,
      $a$  RETURN jsonb_build_object('success', true, 'withdrawal_id', v_id,$a$,
      $a$  IF NOT v_has_mgr THEN PERFORM public.fn_post_booking_custody_out(v_id); END IF;
  RETURN jsonb_build_object('success', true, 'withdrawal_id', v_id,$a$);
    EXECUTE d;
  END IF;
END $do$;

DO $do$
DECLARE d text;
BEGIN
  IF (SELECT pg_get_functiondef('public.complete_booking_atomic'::regproc)) NOT ILIKE '%fn_post_booking_custody_return%' THEN
    SELECT pg_get_functiondef('public.complete_booking_atomic'::regproc) INTO d;
    d := replace(d,
      $a$  SELECT * INTO v_branch  FROM public.branches WHERE id = v_booking.branch_id;$a$,
      $a$  SELECT * INTO v_branch  FROM public.branches WHERE id = v_booking.branch_id;
  PERFORM public.fn_post_booking_custody_return(id, 'إرجاع تلقائي عند التنفيذ')
    FROM public.booking_stock_withdrawals
   WHERE booking_id = p_booking_id AND custody_status = 'out';$a$);
    EXECUTE d;
  END IF;
END $do$;

DO $do$
DECLARE d text;
BEGIN
  IF (SELECT pg_get_functiondef('public.cancel_booking_atomic'::regproc)) NOT ILIKE '%fn_post_booking_custody_return%' THEN
    SELECT pg_get_functiondef('public.cancel_booking_atomic'::regproc) INTO d;
    d := replace(d,
      $a$  UPDATE public.bookings SET status='cancelled'$a$,
      $a$  PERFORM public.fn_post_booking_custody_return(id, 'إرجاع عند إلغاء الحجز')
    FROM public.booking_stock_withdrawals
   WHERE booking_id = p_booking_id AND custody_status = 'out';
  UPDATE public.bookings SET status='cancelled'$a$);
    EXECUTE d;
  END IF;
END $do$;
