-- v3.74.749 — the 16 remaining row-id writers whose table is stated in their
-- own code. Nothing here touches the ledger; these are approvals, discount
-- evaluations, custody movements, period closing and permission transfers.
-- Lower blast radius than the accounting functions, same defect: a logged-in
-- user of one company could act on another's row.
--
-- Tables read from each function's load statement, alias-tolerant this time
-- (v3.74.748's pattern missed four functions purely because they wrote
-- "FROM purchase_returns pr WHERE pr.id = ..."). Every table below was
-- confirmed to carry company_id before anything was written.
--
-- TWO THINGS THE FIRST ATTEMPT GOT WRONG, both caught by checks rather than by
-- me, and both worth keeping in the record:
--
--   1. I inferred parameter names from an earlier query that extracted the
--      first p_<x>_id argument, then wrote them into the mapping by hand.
--      resubmit_purchase_return takes p_return_id, not p_purchase_return_id.
--      The migration aborted instead of injecting a call that would not
--      compile — which is the only reason it did not ship broken.
--
--   2. close_accounting_period has TWO overloads. Selecting the function by
--      name with LIMIT 1 would have patched one and silently left the other
--      unguarded. The loop now iterates over pg_proc rows, so every overload of
--      every listed name is covered.
--
-- THIRTEEN ARE LEFT UNGUARDED ON PURPOSE and are named here rather than
-- quietly dropped: append_financial_audit_flag, approve_sales_delivery,
-- enqueue_notification_outbox_event, link_financial_operation_trace,
-- mark_notification_as_read, process_invoice_return_in_tpi,
-- update_notification_status, update_third_party_on_payment, update_username,
-- batch_mark_notifications_as_read, batch_update_notification_status,
-- restore_fifo_lots_on_return, reverse_fifo_consumption.
--
-- They do not state a table in a form that can be read with confidence, and
-- several are not company-scoped at all: update_username belongs to a user,
-- mark_notification_as_read to a recipient. Guarding those by company would be
-- the wrong check, not merely a missing one. They need reading individually.
--
-- Verified by execution on a real branch via ensure_branch_outlet:
--   server-side call → allowed · member → allowed · other company → rejected
DO $patch$
DECLARE
  m       RECORD;
  f       RECORD;
  v_def   TEXT;
  v_new   TEXT;
  v_start INT;
  v_rel   INT;
  v_abs   INT;
  v_done  INT := 0;
BEGIN
  FOR m IN
    SELECT * FROM (VALUES
      ('close_accounting_period',              'accounting_periods',        'p_period_id'),
      ('approve_bank_voucher',                 'bank_voucher_requests',     'p_request_id'),
      ('reject_bank_voucher',                  'bank_voucher_requests',     'p_request_id'),
      ('bill_evaluate_discount_approval',      'bills',                     'p_bill_id'),
      ('fn_post_booking_custody_out',          'booking_stock_withdrawals', 'p_withdrawal_id'),
      ('fn_post_booking_custody_return',       'booking_stock_withdrawals', 'p_withdrawal_id'),
      ('ensure_branch_outlet',                 'branches',                  'p_branch_id'),
      ('recalculate_asset_depreciation',       'fixed_assets',              'p_asset_id'),
      ('regenerate_asset_schedules',           'fixed_assets',              'p_asset_id'),
      ('inv_evaluate_discount_approval',       'invoices',                  'p_invoice_id'),
      ('reject_sales_delivery',                'invoices',                  'p_invoice_id'),
      ('update_invoice_after_return',          'invoices',                  'p_invoice_id'),
      ('execute_permission_transfer',          'permission_transfers',      'p_transfer_id'),
      ('reject_warehouse_return',              'purchase_returns',          'p_purchase_return_id'),
      ('resubmit_purchase_return',             'purchase_returns',          'p_return_id'),
      ('create_auto_invoice_from_sales_order', 'sales_orders',              'p_sales_order_id')
    ) AS v(fn, tbl, idparam)
  LOOP
    -- Every overload, not just the first one found.
    FOR f IN
      SELECT p.oid, pg_get_function_identity_arguments(p.oid) AS args
      FROM pg_proc p
      WHERE p.pronamespace = 'public'::regnamespace AND p.proname = m.fn
    LOOP
      IF f.args NOT LIKE '%' || m.idparam || ' uuid%' THEN
        RAISE EXCEPTION 'function %(%) has no parameter %', m.fn, f.args, m.idparam;
      END IF;

      v_def := pg_get_functiondef(f.oid);
      IF v_def ILIKE '%assert_company_access%' THEN CONTINUE; END IF;

      v_start := position('$function$' in v_def);
      IF v_start = 0 THEN RAISE EXCEPTION 'no $function$ delimiter in %', m.fn; END IF;
      v_rel := position('BEGIN' in substr(v_def, v_start + 10));
      IF v_rel = 0 THEN RAISE EXCEPTION 'no BEGIN found in %', m.fn; END IF;
      v_abs := v_start + 10 + v_rel - 1;

      v_new := substr(v_def, 1, v_abs + 4)
            || E'\n  -- v3.74.749 — reject a caller acting on another company''s data.'
            || format(E'\n  PERFORM public.assert_company_access_by_row(%L, %s);\n',
                      m.tbl, m.idparam)
            || substr(v_def, v_abs + 5);

      EXECUTE v_new;
      v_done := v_done + 1;
    END LOOP;
  END LOOP;

  RAISE NOTICE 'v3.74.749: guarded % function bodies', v_done;
END;
$patch$;
