-- v3.74.703 — an approved stock withdrawal must ALWAYS move the stock.
-- ------------------------------------------------------------------
-- FOUND BY THE OWNER while reviewing a booking: two items on the same booking,
-- both shown as "معتمد للسحب من المخزن". One left the warehouse. The other did
-- not, and nothing anywhere said so.
--
-- Booking BKG-2026-00006, both approved 11 seconds apart into the same warehouse:
--   booto (vita-1002)          approved 20:47:12 → custody_status 'out',  value 1.00
--   5 كيلو زيت ماتور (MAIN-PRD-0001) approved 20:47:01 → custody_status 'none', no movement,
--                                                        no journal, no error, no notification.
--
-- ROOT CAUSE — an accounting attribute of zero cancelled a physical movement:
--
--   v_value := v_qty * v_cost;                        -- v_cost = products.cost_price
--   IF NOT tracked OR v_qty <= 0 OR v_value <= 0 THEN
--     UPDATE ... SET custody_status='none';
--     RETURN jsonb_build_object('ok', true, ...);     -- ok=TRUE. Completely silent.
--
-- products.cost_price is only a default that pre-fills a purchase invoice. When
-- the price is typed on the invoice instead of on the product card, the card
-- stays 0 (this is the same root cause as the zero-cost COGS bug fixed in
-- v3.74.702). So value = 0, and the function returned SUCCESS having done
-- nothing: the technician physically held the oil while the books still counted
-- it in the warehouse, stock was overstated by one unit, and account 1145 was
-- short by 20.00.
--
-- Why no integrity checker caught it: stock and ledger AGREED — both believed the
-- oil was in the warehouse. Agreement is not correctness. The checkers compare
-- what was recorded; they cannot ask whether what should have happened did.
--
-- THE FIX — value and movement are different things:
--   1. Value now comes from the FIFO batches (what was actually paid), via
--      calculate_fifo_cost, which COMPUTES ONLY and does not consume. The batches
--      must stay intact until the service is really executed; custody-out must not
--      deplete stock it has not consumed. Falls back to the card for legacy stock.
--   2. The inventory movement is unconditional once the item is stocked and the
--      quantity is real. Only the JOURNAL depends on value — which is exactly how
--      fn_post_booking_custody_return already worked. The two paths are now
--      symmetric; the OUT path was the odd one out.
--   3. A movement that cannot be valued raises a WARNING and reports valued=false
--      instead of disappearing behind ok=true.
--
-- Data repair (owner-approved): the stuck withdrawal is posted at its true FIFO
-- cost of 20.00, so the books match the fact that the technician holds the oil.
-- ------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_post_booking_custody_out(p_withdrawal_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  w public.booking_stock_withdrawals;
  v_booking public.bookings;
  v_service public.services;
  v_branch public.branches;
  v_tracked boolean; v_cost numeric; v_qty int; v_value numeric; v_fifo numeric;
  v_custody_acct uuid; v_inv_acct uuid; v_cc uuid; v_je jsonb;
  v_valued boolean;
BEGIN
  SELECT * INTO w FROM public.booking_stock_withdrawals WHERE id = p_withdrawal_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','not_found'); END IF;
  IF w.status <> 'approved' THEN RETURN jsonb_build_object('ok',false,'reason','not_approved'); END IF;
  IF COALESCE(w.custody_status,'none') = 'out' THEN RETURN jsonb_build_object('ok',true,'reason','already_out'); END IF;

  SELECT COALESCE(track_inventory,false), COALESCE(cost_price,0)
    INTO v_tracked, v_cost FROM public.products WHERE id = w.product_id;
  v_qty := CEIL(COALESCE(w.quantity,0))::int;

  -- Only a non-stocked item or a zero quantity may legitimately move nothing.
  -- Value is deliberately NOT part of this test.
  IF NOT COALESCE(v_tracked,false) OR v_qty <= 0 THEN
    UPDATE public.booking_stock_withdrawals SET custody_status='none' WHERE id = p_withdrawal_id;
    RETURN jsonb_build_object('ok',true,'reason','not_tracked_or_zero_qty');
  END IF;

  -- calculate_fifo_cost COMPUTES ONLY — it does not consume the batches.
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
      AND (account_code = '1145' OR sub_type IN ('inventory_in_custody','work_in_process'))
    ORDER BY CASE WHEN account_code='1145' THEN 0 ELSE 1 END LIMIT 1;
  SELECT id INTO v_inv_acct FROM public.chart_of_accounts
    WHERE company_id = w.company_id AND is_active AND sub_type = 'inventory' LIMIT 1;

  v_cc := COALESCE(v_booking.cost_center_id, v_service.cost_center_id, v_branch.default_cost_center_id);
  IF v_cc IS NULL THEN SELECT id INTO v_cc FROM public.cost_centers WHERE company_id = w.company_id LIMIT 1; END IF;

  -- Physical movement: unconditional.
  INSERT INTO public.inventory_transactions (
    company_id, branch_id, warehouse_id, cost_center_id, product_id,
    transaction_type, quantity_change, reference_type, reference_id, notes
  ) VALUES (
    w.company_id, w.branch_id, w.warehouse_id, v_cc, w.product_id,
    'booking_custody_out', -v_qty, 'booking_stock_withdrawal', w.id,
    'خروج عهدة للفنّي — حجز ' || COALESCE(v_booking.booking_no,'')
  );

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
  ELSE
    RAISE WARNING 'CUSTODY_OUT_UNVALUED: withdrawal % moved % unit(s) of product % with no cost basis',
      p_withdrawal_id, v_qty, w.product_id;
  END IF;

  UPDATE public.booking_stock_withdrawals
     SET custody_status='out', custody_value=v_value, custody_out_at=now()
   WHERE id = p_withdrawal_id;

  RETURN jsonb_build_object('ok',true,'value',v_value,'qty',v_qty,'valued',v_valued);
END; $function$;

-- ------------------------------------------------------------------
-- The GL-vs-FIFO checker must know about custody.
-- Posting the repaired withdrawal immediately raised a new drift alert: stock
-- handed to a technician leaves 1140 for 1145, but it is STILL owned and still
-- sits in the FIFO batches (custody-out values them via calculate_fifo_cost
-- without consuming them — they are consumed only when the service is executed).
-- Comparing FIFO against 1140 alone reported the whole custody balance as drift.
-- Owned inventory is 1140 + 1145.
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ic_inventory_gl_vs_fifo(p_company_id uuid)
 RETURNS TABLE(severity text, detail jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_gl_inventory numeric;
  v_gl_custody   numeric;
  v_fifo_remaining numeric;
  v_diff numeric;
BEGIN
  SELECT COALESCE(SUM(jel.debit_amount - jel.credit_amount), 0)
  INTO v_gl_inventory
  FROM journal_entry_lines jel
  -- v3.74.702 — exclude soft-deleted journals.
  JOIN journal_entries je ON je.id = jel.journal_entry_id AND je.status='posted'
                         AND COALESCE(je.is_deleted, false) = false
  JOIN chart_of_accounts coa ON coa.id = jel.account_id
  WHERE coa.company_id = p_company_id
    AND (coa.account_code = '1140' OR coa.sub_type = 'inventory');

  -- v3.74.703 — custody is owned inventory too.
  SELECT COALESCE(SUM(jel.debit_amount - jel.credit_amount), 0)
  INTO v_gl_custody
  FROM journal_entry_lines jel
  JOIN journal_entries je ON je.id = jel.journal_entry_id AND je.status='posted'
                         AND COALESCE(je.is_deleted, false) = false
  JOIN chart_of_accounts coa ON coa.id = jel.account_id
  WHERE coa.company_id = p_company_id
    AND (coa.account_code = '1145' OR coa.sub_type IN ('inventory_in_custody','work_in_process'));

  SELECT COALESCE(SUM(remaining_quantity * unit_cost), 0)
  INTO v_fifo_remaining
  FROM fifo_cost_lots
  WHERE company_id = p_company_id;

  v_diff := ROUND((v_gl_inventory + v_gl_custody) - v_fifo_remaining, 2);

  IF ABS(v_diff) > GREATEST(5, v_fifo_remaining * 0.01) THEN
    severity := CASE WHEN ABS(v_diff) > 500 THEN 'high' ELSE 'medium' END;
    detail := jsonb_build_object(
      'gl_inventory_1140', v_gl_inventory,
      'gl_custody_1145', v_gl_custody,
      'gl_owned_total', v_gl_inventory + v_gl_custody,
      'fifo_remaining_value', v_fifo_remaining,
      'difference', v_diff,
      'hint','Owned inventory (1140 + 1145 custody) diverges from FIFO remaining value. Possible causes: bill discounts not reflected in the FIFO lot cost, production_issue/production_receipt not journaled, transfer-in cost mismatch, or a missing COGS journal.');
    RETURN NEXT;
  END IF;
EXCEPTION WHEN undefined_table OR undefined_column THEN RETURN;
END $function$;

-- ------------------------------------------------------------------
-- Repair: post every approved withdrawal the old bug left behind.
-- Idempotent — fn_post_booking_custody_out returns 'already_out' for anything
-- already posted, so re-running this migration changes nothing.
-- ------------------------------------------------------------------
DO $repair$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT id FROM public.booking_stock_withdrawals
    WHERE status = 'approved'
      AND COALESCE(custody_status,'none') IN ('none','skipped_no_account')
  LOOP
    PERFORM public.fn_post_booking_custody_out(r.id);
  END LOOP;
END $repair$;
