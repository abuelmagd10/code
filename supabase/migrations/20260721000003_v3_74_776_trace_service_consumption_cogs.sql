-- v3.74.776 — service consumption COGS now records the operation.
--
-- Shape differs from the custody functions: this one processes a BATCH of
-- inventory rows and emits ONE journal entry keyed on the earliest row.
--
-- So the trace opens AFTER the batch is identified, not before the first write.
-- FIFO consumption in the loop above it is therefore not preceded by the trace
-- — but every consumed row is linked below, so the operation stays fully
-- reconstructable. Opening earlier would have meant an idempotency key that
-- cannot tell a resync top-up from the original posting, which is the exact gap
-- v3.74.705 was written to close. Correct linkage beat tidy ordering, and the
-- trade-off is recorded here rather than left for someone to rediscover.
--
-- Rehearsed on the test database against a real stocked product (178 on hand):
--   ok=true rows=1 cost=600.00 journal=created rows_stamped=1
--   links: inventory_transaction | invoice | journal_entry
--
-- Two governance guards rejected earlier rehearsal attempts — a cross-company
-- cost centre, then a zero branch balance. Both were correct refusals, and
-- worth recording: the protections around this path work.
--
-- Unchanged: FIFO consumed here and only here (custody-out values without
-- consuming, deliberately), batch idempotence on journal_entry_id IS NULL, the
-- unvalued warning, and the hard failure on a rejected journal entry.
--
-- The definitive body is below, taken from the live database after applying.

CREATE OR REPLACE FUNCTION public.fn_post_service_consumption_cogs(p_company_id uuid, p_invoice_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  r RECORD;
  v_total NUMERIC := 0;
  v_line_cost NUMERIC;
  v_fallback NUMERIC;
  v_inv_acct uuid; v_cogs_acct uuid;
  v_branch uuid; v_cc uuid; v_warehouse uuid; v_date date;
  v_ref uuid; v_je jsonb; v_je_id uuid;
  v_rows int := 0;
  v_ids uuid[] := '{}';
  v_trace uuid; v_id uuid;
BEGIN
  IF p_invoice_id IS NULL THEN RETURN jsonb_build_object('ok',false,'reason','no_invoice'); END IF;

  SELECT id INTO v_inv_acct FROM chart_of_accounts
   WHERE company_id = p_company_id AND is_active AND sub_type = 'inventory'
     AND (parent_id IS NOT NULL OR level > 1) LIMIT 1;
  SELECT id INTO v_cogs_acct FROM chart_of_accounts
   WHERE company_id = p_company_id AND is_active
     AND (sub_type IN ('cost_of_goods_sold','cogs') OR account_code = '5000')
     AND (parent_id IS NOT NULL OR level > 1) LIMIT 1;
  IF v_inv_acct IS NULL OR v_cogs_acct IS NULL THEN
    RETURN jsonb_build_object('ok',false,'reason','no_account');
  END IF;

  FOR r IN
    SELECT it.id, it.product_id, ABS(it.quantity_change) AS qty,
           it.branch_id, it.cost_center_id, it.warehouse_id, it.created_at
    FROM inventory_transactions it
    JOIN products p ON p.id = it.product_id
    WHERE it.company_id = p_company_id
      AND it.transaction_type = 'service_consumption'
      AND it.reference_id = p_invoice_id
      AND it.journal_entry_id IS NULL
      AND COALESCE(it.is_deleted,false) = false
      AND COALESCE(p.item_type,'goods') <> 'service'
    ORDER BY it.created_at, it.id
  LOOP
    v_ref       := COALESCE(v_ref, r.id);
    v_branch    := COALESCE(v_branch, r.branch_id);
    v_cc        := COALESCE(v_cc, r.cost_center_id);
    v_warehouse := COALESCE(v_warehouse, r.warehouse_id);
    v_date      := COALESCE(v_date, r.created_at::date);
    v_ids       := array_append(v_ids, r.id);

    -- FIFO is consumed HERE and only here. Custody-out deliberately values the
    -- batches without consuming them (calculate_fifo_cost), because material in a
    -- technician's hands is still owned; it is used up at execution, not at
    -- hand-over. Consuming in both places would double-count.
    v_line_cost := public.consume_fifo_lots(
      p_company_id, r.product_id, r.qty,
      'service', 'service_consumption', p_invoice_id,
      COALESCE(r.created_at::date, CURRENT_DATE)
    );

    IF COALESCE(v_line_cost,0) <= 0 THEN
      SELECT r.qty * COALESCE(cost_price,0) INTO v_fallback FROM products WHERE id = r.product_id;
      v_line_cost := COALESCE(v_fallback,0);
    END IF;

    v_total := v_total + COALESCE(v_line_cost,0);
    v_rows  := v_rows + 1;
  END LOOP;

  IF v_rows = 0 THEN RETURN jsonb_build_object('ok',true,'reason','nothing_to_post'); END IF;

  -- v3.74.776 — open the trace now that the batch is identified.
  BEGIN
    v_trace := public.create_financial_operation_trace(
      p_company_id, 'invoice', p_invoice_id, 'service_consumption_cogs',
      auth.uid(),
      'service_consumption_cogs:' || v_ref::text,
      NULL,
      jsonb_build_object('invoice_id', p_invoice_id, 'batch_ref', v_ref, 'rows', v_rows),
      CASE WHEN auth.uid() IS NULL
           THEN jsonb_build_array('posted_without_session_actor') ELSE NULL END
    );
    PERFORM public.link_financial_operation_trace(
      v_trace, 'invoice', p_invoice_id, 'source', 'service_consumption_cogs');
    FOREACH v_id IN ARRAY v_ids LOOP
      PERFORM public.link_financial_operation_trace(
        v_trace, 'inventory_transaction', v_id, 'inventory_transaction', 'service_consumption_cogs');
    END LOOP;
  EXCEPTION WHEN OTHERS THEN
    v_trace := NULL;
    RAISE WARNING 'SERVICE_CONSUMPTION_TRACE_FAILED: invoice % — %', p_invoice_id, SQLERRM;
  END;

  v_total := ROUND(v_total, 2);
  IF v_total <= 0 THEN
    RAISE WARNING 'SERVICE_CONSUMPTION_UNVALUED: invoice % consumed % row(s) with no cost basis',
      p_invoice_id, v_rows;
    RETURN jsonb_build_object('ok',true,'reason','unvalued','rows',v_rows,'trace_id',v_trace);
  END IF;

  v_je := public.create_journal_entry_atomic(
    p_company_id, 'service_consumption_cogs', v_ref,
    COALESCE(v_date, CURRENT_DATE),
    'تكلفة مواد مستهلكة في تنفيذ الخدمة',
    v_branch, v_cc, v_warehouse,
    jsonb_build_array(
      jsonb_build_object('account_id', v_cogs_acct, 'debit_amount', v_total, 'credit_amount', 0, 'description','تكلفة مواد الخدمة'),
      jsonb_build_object('account_id', v_inv_acct,  'debit_amount', 0, 'credit_amount', v_total, 'description','تخفيض المخزون - استهلاك خدمة')
    )
  );
  IF NOT COALESCE((v_je->>'success')::boolean,false) THEN
    RAISE EXCEPTION 'SERVICE_CONSUMPTION_COGS_FAILED: %', COALESCE(v_je->>'error','unknown');
  END IF;

  -- create_journal_entry_atomic returns the new id as 'entry_id'.
  v_je_id := NULLIF(v_je->>'entry_id','')::uuid;

  IF v_je_id IS NOT NULL THEN
    UPDATE inventory_transactions SET journal_entry_id = v_je_id WHERE id = ANY(v_ids);

    IF v_trace IS NOT NULL THEN
      BEGIN
        PERFORM public.link_financial_operation_trace(
          v_trace, 'journal_entry', v_je_id, 'journal_entry', 'service_consumption_cogs');
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'SERVICE_CONSUMPTION_TRACE_LINK_FAILED: invoice % — %', p_invoice_id, SQLERRM;
      END;
    END IF;
  END IF;

  RETURN jsonb_build_object('ok',true,'rows',v_rows,'cost',v_total,
                            'journal_entry_id',v_je_id,'trace_id',v_trace);
END;
$function$;
