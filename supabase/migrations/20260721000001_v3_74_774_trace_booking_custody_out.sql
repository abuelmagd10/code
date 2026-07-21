-- v3.74.774 — booking custody-out now records who did it.
--
-- Six journal entries in the booking-custody family had no financial operation
-- trace. An auditor asking "who moved this stock into a technician's custody,
-- when, and under whose approval" had no answer in the data. This closes the
-- first of them; _return and _adjust follow the same shape.
--
-- WHERE THE TRACE GOES, AND WHY
-- -----------------------------
-- Inside the posting function, not in its callers.
--
-- fn_post_booking_custody_out is reached from at least two places: the
-- store-manager decision path (decide_booking_stock_withdrawal) and an
-- auto-approve path that fires when a branch has no store manager. Tracing at
-- the posting site covers every caller, including ones added later, and cannot
-- be forgotten by a new call site. Tracing at the callers would have meant
-- finding all of them correctly — and this session has repeatedly shown that
-- "find all the callers" is where I make mistakes.
--
-- ACTOR
-- -----
-- auth.uid(), which is genuinely NULL on the auto-approve path: no human
-- decided. Recording NULL there is honest, and audit_flags carries
-- 'auto_approved_no_store_manager' so the two cases stay distinguishable
-- instead of being flattened into an invented actor. An audit trail that
-- fabricates an actor is worse than one that admits there wasn't one.
--
-- FAILURE POLICY
-- --------------
-- Every trace call is wrapped. If the audit write fails, the stock movement and
-- the journal entry still happen and a WARNING is raised. An audit trail that
-- can block a physical operation is a worse problem than a missing audit row —
-- the technician is standing there holding the part.
--
-- Idempotency key is deterministic on the withdrawal id. The function already
-- refuses to post twice (custody_status = 'out' returns early).
--
-- UNCHANGED
-- ---------
-- The v3.74.703 behaviour is preserved exactly: FIFO valuation, unconditional
-- physical movement, journal only when valued, and the company guard from
-- v3.74.749. Verified after applying: security_definer true, company guard
-- intact, FIFO intact, 2 callers, anon cannot execute.
--
-- REHEARSED FIRST
-- ---------------
-- Applied to the test database and run against a synthetic withdrawal before
-- production saw it:
--
--   ok=true  valued=true  stock_rows_added=1
--   trace: source=booking_stock_withdrawal event=booking_custody_out
--          actor=NULL (auto-approve)  key=booking_custody_out:<id>
--   links: booking | booking_stock_withdrawal/source |
--          inventory_transaction | journal_entry
--
-- The test database exists because of the backup work in v3.74.768-772. This is
-- the first change in this project rehearsed on a real copy of production
-- before being applied to it.
--
-- The 6 historical untraced custody entries are NOT backfilled. A trace records
-- who performed an operation; inventing one for a past event would be a lie in
-- the audit trail. They stay visible as findings.
CREATE OR REPLACE FUNCTION public.fn_post_booking_custody_out(p_withdrawal_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  w public.booking_stock_withdrawals;
  v_booking public.bookings;
  v_service public.services;
  v_branch public.branches;
  v_tracked boolean; v_cost numeric; v_qty int; v_value numeric; v_fifo numeric;
  v_custody_acct uuid; v_inv_acct uuid; v_cc uuid; v_je jsonb;
  v_valued boolean;
  v_trace uuid;
  v_inv_txn uuid;
  v_entry uuid;
BEGIN
  -- v3.74.749 — reject a caller acting on another company's data.
  PERFORM public.assert_company_access_by_row('booking_stock_withdrawals', p_withdrawal_id);

  SELECT * INTO w FROM public.booking_stock_withdrawals WHERE id = p_withdrawal_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','not_found'); END IF;
  IF w.status <> 'approved' THEN RETURN jsonb_build_object('ok',false,'reason','not_approved'); END IF;
  IF COALESCE(w.custody_status,'none') = 'out' THEN RETURN jsonb_build_object('ok',true,'reason','already_out'); END IF;

  SELECT COALESCE(track_inventory,false), COALESCE(cost_price,0)
    INTO v_tracked, v_cost FROM public.products WHERE id = w.product_id;
  v_qty := CEIL(COALESCE(w.quantity,0))::int;

  -- Only a non-stocked item or a zero quantity may legitimately move nothing.
  IF NOT COALESCE(v_tracked,false) OR v_qty <= 0 THEN
    UPDATE public.booking_stock_withdrawals SET custody_status='none' WHERE id = p_withdrawal_id;
    RETURN jsonb_build_object('ok',true,'reason','not_tracked_or_zero_qty');
  END IF;

  -- v3.74.774 — open the audit trace before anything moves, so the links below
  -- have something to attach to. Failure here must not stop the operation.
  BEGIN
    v_trace := public.create_financial_operation_trace(
      w.company_id,
      'booking_stock_withdrawal',
      w.id,
      'booking_custody_out',
      auth.uid(),
      'booking_custody_out:' || w.id::text,
      NULL,
      jsonb_build_object('withdrawal_id', w.id, 'booking_id', w.booking_id,
                         'product_id', w.product_id, 'quantity', v_qty),
      CASE WHEN auth.uid() IS NULL
           THEN jsonb_build_array('auto_approved_no_store_manager')
           ELSE NULL END
    );
    PERFORM public.link_financial_operation_trace(
      v_trace, 'booking_stock_withdrawal', w.id, 'source', 'booking_custody_out');
    PERFORM public.link_financial_operation_trace(
      v_trace, 'booking', w.booking_id, 'booking', 'booking_custody_out');
  EXCEPTION WHEN OTHERS THEN
    v_trace := NULL;
    RAISE WARNING 'CUSTODY_OUT_TRACE_FAILED: withdrawal % — %', p_withdrawal_id, SQLERRM;
  END;

  -- Value the custody from the FIFO batches. calculate_fifo_cost COMPUTES ONLY —
  -- it does not consume. The batches must stay intact until the service is really
  -- executed, otherwise custody-out would deplete stock it has not consumed.
  v_fifo := public.calculate_fifo_cost(w.product_id, w.warehouse_id, v_qty);
  IF COALESCE(v_fifo, 0) > 0 THEN
    v_value := v_fifo;
  ELSE
    v_value := v_qty * COALESCE(v_cost, 0);
  END IF;

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

  -- Physical movement: unconditional once the item is stocked and the quantity real.
  INSERT INTO public.inventory_transactions (
    company_id, branch_id, warehouse_id, cost_center_id, product_id,
    transaction_type, quantity_change, reference_type, reference_id, notes
  ) VALUES (
    w.company_id, w.branch_id, w.warehouse_id, v_cc, w.product_id,
    'booking_custody_out', -v_qty, 'booking_stock_withdrawal', w.id,
    'خروج عهدة للفنّي — حجز ' || COALESCE(v_booking.booking_no,'')
  )
  RETURNING id INTO v_inv_txn;

  v_valued := (v_value > 0 AND v_custody_acct IS NOT NULL AND v_inv_acct IS NOT NULL);

  IF v_valued THEN
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
    v_entry := (v_je->>'entry_id')::uuid;
  ELSE
    -- Stock moved but could not be valued. Never silent: this surfaces in the logs
    -- and in the returned payload so it can be corrected, instead of the old
    -- behaviour where the whole movement vanished behind ok=true.
    RAISE WARNING 'CUSTODY_OUT_UNVALUED: withdrawal % moved % unit(s) of product % with no cost basis',
      p_withdrawal_id, v_qty, w.product_id;
  END IF;

  -- v3.74.774 — attach what was actually produced. Wrapped for the same reason
  -- as above: the movement and the entry are already committed facts.
  IF v_trace IS NOT NULL THEN
    BEGIN
      IF v_inv_txn IS NOT NULL THEN
        PERFORM public.link_financial_operation_trace(
          v_trace, 'inventory_transaction', v_inv_txn, 'inventory_transaction', 'booking_custody_out');
      END IF;
      IF v_entry IS NOT NULL THEN
        PERFORM public.link_financial_operation_trace(
          v_trace, 'journal_entry', v_entry, 'journal_entry', 'booking_custody_out');
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'CUSTODY_OUT_TRACE_LINK_FAILED: withdrawal % — %', p_withdrawal_id, SQLERRM;
    END;
  END IF;

  UPDATE public.booking_stock_withdrawals
     SET custody_status='out', custody_value=v_value, custody_out_at=now()
   WHERE id = p_withdrawal_id;

  RETURN jsonb_build_object('ok',true,'value',v_value,'qty',v_qty,'valued',v_valued,
                            'trace_id', v_trace);
END;
$function$;
