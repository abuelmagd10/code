-- v3.74.775 — custody RETURN now records who brought the stock back.
--
-- Same pattern and reasoning as v3.74.774: the trace is written inside the
-- posting function so every caller is covered, the actor is auth.uid() and is
-- honestly NULL on the automatic path, and every trace call is wrapped so an
-- audit failure can never block the physical movement.
--
-- Rehearsed on the test database as a FULL CYCLE — custody out, then return —
-- because a return is meaningless in isolation:
--   out: ok=true
--   return: ok=true value=16.114286 stock_return_rows=1
--   links: booking | booking_stock_withdrawal | inventory_transaction | journal_entry
--
-- Unchanged: the company guard (v3.74.749), the 'nothing_out' early return, the
-- hard failure on a rejected journal entry, and the rule that the journal posts
-- only when the custody carried a value.
--
-- The definitive body is below, taken from the live database after applying.

CREATE OR REPLACE FUNCTION public.fn_post_booking_custody_return(p_withdrawal_id uuid, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  w public.booking_stock_withdrawals;
  v_booking public.bookings; v_service public.services; v_branch public.branches;
  v_qty int; v_value numeric; v_custody_acct uuid; v_inv_acct uuid; v_cc uuid; v_je jsonb;
  v_trace uuid; v_inv_txn uuid; v_entry uuid;
BEGIN
  -- v3.74.749 — reject a caller acting on another company's data.
  PERFORM public.assert_company_access_by_row('booking_stock_withdrawals', p_withdrawal_id);

  SELECT * INTO w FROM public.booking_stock_withdrawals WHERE id = p_withdrawal_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','not_found'); END IF;
  IF COALESCE(w.custody_status,'none') <> 'out' THEN RETURN jsonb_build_object('ok',true,'reason','nothing_out'); END IF;

  v_qty := CEIL(COALESCE(w.quantity,0))::int;
  v_value := COALESCE(w.custody_value, 0);

  -- v3.74.775 — open the trace before anything moves.
  BEGIN
    v_trace := public.create_financial_operation_trace(
      w.company_id, 'booking_stock_withdrawal', w.id, 'booking_custody_return',
      auth.uid(),
      'booking_custody_return:' || w.id::text,
      NULL,
      jsonb_build_object('withdrawal_id', w.id, 'booking_id', w.booking_id,
                         'product_id', w.product_id, 'quantity', v_qty, 'note', p_note),
      CASE WHEN auth.uid() IS NULL
           THEN jsonb_build_array('auto_returned_no_store_manager') ELSE NULL END
    );
    PERFORM public.link_financial_operation_trace(
      v_trace, 'booking_stock_withdrawal', w.id, 'source', 'booking_custody_return');
    PERFORM public.link_financial_operation_trace(
      v_trace, 'booking', w.booking_id, 'booking', 'booking_custody_return');
  EXCEPTION WHEN OTHERS THEN
    v_trace := NULL;
    RAISE WARNING 'CUSTODY_RETURN_TRACE_FAILED: withdrawal % — %', p_withdrawal_id, SQLERRM;
  END;

  SELECT * INTO v_booking FROM public.bookings WHERE id = w.booking_id;
  SELECT * INTO v_service FROM public.services WHERE id = v_booking.service_id;
  SELECT * INTO v_branch  FROM public.branches WHERE id = w.branch_id;

  SELECT id INTO v_custody_acct FROM public.chart_of_accounts
    WHERE company_id = w.company_id AND is_active
      AND (account_code = '1145' OR sub_type = 'inventory_in_custody')
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
    )
    RETURNING id INTO v_inv_txn;
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
    v_entry := (v_je->>'entry_id')::uuid;
  END IF;

  -- v3.74.775 — link what was produced. Wrapped: both are committed facts.
  IF v_trace IS NOT NULL THEN
    BEGIN
      IF v_inv_txn IS NOT NULL THEN
        PERFORM public.link_financial_operation_trace(
          v_trace, 'inventory_transaction', v_inv_txn, 'inventory_transaction', 'booking_custody_return');
      END IF;
      IF v_entry IS NOT NULL THEN
        PERFORM public.link_financial_operation_trace(
          v_trace, 'journal_entry', v_entry, 'journal_entry', 'booking_custody_return');
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'CUSTODY_RETURN_TRACE_LINK_FAILED: withdrawal % — %', p_withdrawal_id, SQLERRM;
    END;
  END IF;

  UPDATE public.booking_stock_withdrawals
     SET custody_status='returned', custody_returned_at=now()
   WHERE id = p_withdrawal_id;
  RETURN jsonb_build_object('ok',true,'value',v_value,'qty',v_qty,'trace_id',v_trace);
END;
$function$;
