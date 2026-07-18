-- v3.74.705 — cost the materials consumed while performing a service.
-- ------------------------------------------------------------------
-- THE GAP
-- Executing a booking wrote 'service_consumption' inventory rows and NOTHING
-- else. Two mechanisms could have costed them and neither did:
--   auto_create_cogs_journal        fires only on transaction_type = 'sale'
--   auto_link_inventory_to_journal  maps only sale / sale_reversal /
--                                   purchase / purchase_reversal; anything else
--                                   falls into its ELSE branch and gets NULL
--
-- So the stock left the warehouse with no journal and no FIFO consumption:
--   * the invoice booked the REVENUE while the material COST never reached the
--     P&L — profit overstated on every executed service;
--   * the inventory account stayed inflated against stock that was physically
--     gone;
--   * the FIFO batches were never depleted, so phantom quantity accumulated and
--     later sales would have drawn cost from batches already used up.
--
-- Never observed in production only because no booking had been executed yet.
-- The custody model (v3.74.685) returns custody to the warehouse at execution
-- "so the existing consumption logic deducts exactly once" — but that existing
-- logic moved quantity only. It never costed anything.
--
-- IDEMPOTENCE IS KEYED ON THE ROWS, NOT THE INVOICE
-- resync_booking_invoice can append consumption rows to an invoice that was
-- already costed. An invoice-level "already posted" guard would silently leave
-- those top-up rows uncosted — the very class of silent gap this fixes. The
-- guard is therefore journal_entry_id IS NULL on each inventory row.
--
-- ONE JOURNAL PER BATCH OF UNPOSTED ROWS
-- Not per line: ic_duplicate_journals flags any reference_type + reference_id
-- appearing twice, so a service using two materials would raise a false HIGH
-- double-booking alert. Not per invoice either: a resync top-up would then
-- collide with the first journal on that same key, and
-- create_journal_entry_atomic rejects it as DUPLICATE_JE. The journal is keyed
-- on the earliest unposted row of the batch, which is unique by construction.
--
-- WHERE FIFO IS CONSUMED
-- Here, and only here. fn_post_booking_custody_out deliberately VALUES the
-- batches without consuming them (calculate_fifo_cost), because material in a
-- technician's hands is still owned — it is used up at execution, not at
-- hand-over. Consuming in both places would double-count.
-- ------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_post_service_consumption_cogs(
  p_company_id uuid,
  p_invoice_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_catalog'
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

  v_total := ROUND(v_total, 2);
  IF v_total <= 0 THEN
    RAISE WARNING 'SERVICE_CONSUMPTION_UNVALUED: invoice % consumed % row(s) with no cost basis',
      p_invoice_id, v_rows;
    RETURN jsonb_build_object('ok',true,'reason','unvalued','rows',v_rows);
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
  END IF;

  RETURN jsonb_build_object('ok',true,'rows',v_rows,'cost',v_total,'journal_entry_id',v_je_id);
END;
$function$;

-- ------------------------------------------------------------------
-- Wire it into the execution path. Fetch-and-patch so the large surrounding
-- function is not restated here and cannot silently regress.
-- ------------------------------------------------------------------
DO $do$
DECLARE d text;
BEGIN
  SELECT pg_get_functiondef('public.complete_booking_atomic'::regproc) INTO d;
  IF d NOT LIKE '%fn_post_service_consumption_cogs%' THEN
    d := replace(d,
      $a$  IF v_has_sale_products THEN
    UPDATE public.invoices
       SET warehouse_status = 'pending'
     WHERE id = v_invoice_id;$a$,
      $a$  -- v3.74.705 — cost the consumed materials. Without this the stock left
  -- the warehouse with no journal and no FIFO consumption: revenue booked, cost
  -- never booked, inventory account inflated against stock that was gone.
  -- One consolidated journal, posted after every consumption row exists.
  IF v_deducted > 0 THEN
    PERFORM public.fn_post_service_consumption_cogs(p_company_id, v_invoice_id);
  END IF;

  IF v_has_sale_products THEN
    UPDATE public.invoices
       SET warehouse_status = 'pending'
     WHERE id = v_invoice_id;$a$);
    EXECUTE d;
  END IF;
END $do$;

-- Same for the resync path, which can append consumption rows after execution.
-- The call must sit immediately before the FINAL return: anchoring on the first
-- `RETURN jsonb_build_object(` instead lands it inside the early-exit guard,
-- before v_invoice is loaded and before any consumption row exists.
DO $do$
DECLARE d text; v_block text; v_anchor text;
BEGIN
  SELECT pg_get_functiondef('public.resync_booking_invoice'::regproc) INTO d;

  v_block := E'  -- v3.74.705 — cost any consumption rows this resync added. Keyed on the\n  -- rows themselves, so top-ups on an already-costed invoice are picked up.\n  IF v_deducted > 0 THEN\n    PERFORM public.fn_post_service_consumption_cogs(p_company_id, v_invoice.id);\n  END IF;\n\n';

  IF position(v_block in d) > 0 THEN
    RETURN; -- already patched
  END IF;

  v_anchor := E'  RETURN jsonb_build_object(\n    ''success'', true, ''invoice_id'', v_invoice.id, ''new_total'', v_new_total,';

  IF position(v_anchor in d) = 0 THEN
    RAISE EXCEPTION 'v3.74.705: anchor for the final RETURN of resync_booking_invoice not found';
  END IF;

  d := replace(d, v_anchor, v_block || v_anchor);
  EXECUTE d;
END $do$;
