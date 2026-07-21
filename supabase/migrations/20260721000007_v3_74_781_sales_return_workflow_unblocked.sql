-- v3.74.781 (part 2) — unblock the sales-return workflow and close its gaps.
--
-- DEFECT 0: NO SALES RETURN COULD EVER COMPLETE.
-- ----------------------------------------------------------------------------
-- sales_returns is empty in production, and this is why. Two facts collided:
--
--   * sales_return_approval_insert_trg refuses any status other than
--     'draft'/'pending_approval' unless NEW.created_by_user_id belongs to an
--     owner or general_manager;
--   * post_accounting_event's INSERT INTO sales_returns never listed
--     created_by_user_id at all, and the workflow inserts status='completed'.
--
-- So v_role was always NULL, the status check always fired, and the whole
-- transaction rolled back. Every attempt. The person executing the final step
-- is the warehouse keeper, so even populating the column would not have been
-- enough — the guard cannot tell the approved workflow apart from someone
-- creating a finished return by hand.
--
-- Proven, not inferred: running the workflow's exact insert against a restored
-- copy of production reproduces the refusal.
--
-- The workflow now announces itself with app.sales_return_workflow, set inside
-- post_accounting_event for the life of its transaction. It cannot be set from
-- the browser and dies with the transaction. Same mechanism this codebase
-- already uses for app.allow_direct_post. Direct creation of a 'completed'
-- return stays blocked — verified in the same rehearsal.
--
-- AND THREE LINKS THAT WERE NEVER WRITTEN
-- ----------------------------------------------------------------------------
-- sales_return_items.invoice_item_id — never populated, which silently killed
--   the committed-quantity half of check_sales_return_request_quantity. That
--   guard sums this column, always got zero, and so only PENDING requests ever
--   constrained a return: sequential returns could exceed the quantity sold.
--   The id was already flowing through every layer; only the insert omitted it.
--
-- sales_returns.journal_entry_id — never set, so trg_ensure_sales_return_has_entry
--   warns on every return and audit_journal_entries_integrity() reports each one
--   as RETURN_WITHOUT_ENTRY. The entry existed; nothing pointed at it.
--
-- invoice_items.returned_quantity — never updated, so per-line return tracking
--   was blank and app/api/fix-inventory, which reconciles against it, would have
--   reported a false discrepancy on every returned line.
-- ----------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. The gate learns to recognise the approved workflow.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sales_return_approval_insert_trg()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE v_role text;
BEGIN
  -- Set only by post_accounting_event, only for the life of its transaction.
  IF COALESCE(current_setting('app.sales_return_workflow', true), '') = 'true' THEN
    RETURN NEW;
  END IF;

  IF NEW.created_by_user_id IS NOT NULL THEN
    SELECT role INTO v_role FROM public.company_members
     WHERE company_id = NEW.company_id AND user_id = NEW.created_by_user_id LIMIT 1;
  END IF;

  IF v_role IN ('owner', 'general_manager') THEN
    IF NEW.status = 'approved' THEN
      IF NEW.approved_by IS NULL THEN NEW.approved_by := NEW.created_by_user_id; END IF;
      IF NEW.approved_at IS NULL THEN NEW.approved_at := NOW(); END IF;
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.status IS NOT NULL AND NEW.status NOT IN ('draft', 'pending_approval') THEN
    RAISE EXCEPTION
      'مرتجع المبيعات يحتاج اعتماد المالك / المدير العام. لا يجوز إنشاء مرتجع بحالة "%" مباشرة. ابدأ بحالة pending_approval.', NEW.status
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$fn$;

-- ---------------------------------------------------------------------------
-- 2. Patch post_accounting_event by substitution on its LIVE definition.
--
-- It is a 10 KB function and only four small things change. Retyping it is the
-- transcription risk that scripts/append-function-to-migration.js exists to
-- avoid, so the definition is read from the database, edited, and re-executed.
-- Every anchor must match EXACTLY once or the migration aborts — a zero-match
-- replace would report success and change nothing, which is the failure mode
-- this whole project keeps meeting.
-- ---------------------------------------------------------------------------
DO $patch$
DECLARE
  d text;
  a_sr_cols  text := 'refund_amount, refund_method, status, reason, notes';
  a_sr_vals  text := E'v_sr->>''reason'', v_sr->>''notes''';
  a_sr_loop  text := 'IF p_sales_returns IS NOT NULL';
  a_sri_cols text := E'sales_return_id, product_id, quantity,\n        unit_price, tax_rate, discount_percent, line_total';
  a_sri_vals text := E'(v_sri->>''line_total'')::NUMERIC\n      );';
  a_return   text := E'  RETURN jsonb_build_object(\n    ''success'',           true,';
  n int;
BEGIN
  SELECT pg_get_functiondef(oid) INTO d FROM pg_proc
   WHERE oid::regprocedure::text =
     'post_accounting_event(text,uuid,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb)';
  IF d IS NULL THEN
    RAISE EXCEPTION 'post_accounting_event/12 not found — refusing to guess';
  END IF;

  -- Idempotent: a migration may be replayed. Without this, a second run would
  -- append every edit a second time and corrupt the function. Checked against
  -- a marker that only this patch introduces.
  IF d LIKE '%app.sales_return_workflow%' THEN
    RAISE NOTICE 'post_accounting_event already patched — nothing to do';
    RETURN;
  END IF;

  n := (length(d) - length(replace(d, a_sr_cols, ''))) / length(a_sr_cols);
  IF n <> 1 THEN RAISE EXCEPTION 'sales_returns column anchor matched % times', n; END IF;
  n := (length(d) - length(replace(d, a_sr_vals, ''))) / length(a_sr_vals);
  IF n <> 1 THEN RAISE EXCEPTION 'sales_returns values anchor matched % times', n; END IF;
  n := (length(d) - length(replace(d, a_sr_loop, ''))) / length(a_sr_loop);
  IF n <> 1 THEN RAISE EXCEPTION 'sales_returns loop anchor matched % times', n; END IF;
  n := (length(d) - length(replace(d, a_sri_cols, ''))) / length(a_sri_cols);
  IF n <> 1 THEN RAISE EXCEPTION 'items column anchor matched % times', n; END IF;
  n := (length(d) - length(replace(d, a_sri_vals, ''))) / length(a_sri_vals);
  IF n <> 1 THEN RAISE EXCEPTION 'items values anchor matched % times', n; END IF;
  n := (length(d) - length(replace(d, a_return, ''))) / length(a_return);
  IF n <> 1 THEN RAISE EXCEPTION 'final return anchor matched % times', n; END IF;

  -- who created the return
  d := replace(d, a_sr_cols, a_sr_cols || ', created_by_user_id');
  d := replace(d, a_sr_vals, a_sr_vals || E', (v_sr->>''created_by_user_id'')::UUID');
  -- tell the gate this is the approved workflow
  d := replace(d, a_sr_loop,
        E'PERFORM set_config(''app.sales_return_workflow'', ''true'', true);\n  ' || a_sr_loop);
  -- the invoice line each returned item came from
  d := replace(d, a_sri_cols, a_sri_cols || ', invoice_item_id');
  d := replace(d, a_sri_vals,
        E'(v_sri->>''line_total'')::NUMERIC, (v_sri->>''invoice_item_id'')::UUID\n      );');
  -- and the two links nothing ever wrote
  d := replace(d, a_return,
E'  IF array_length(v_return_ids, 1) > 0 THEN\n'
'    UPDATE sales_returns sr\n'
'       SET journal_entry_id = je.id\n'
'      FROM journal_entries je\n'
'     WHERE sr.id = ANY(v_return_ids)\n'
'       AND je.reference_type = ''sales_return''\n'
'       AND je.reference_id = sr.id\n'
'       AND sr.journal_entry_id IS NULL;\n'
'\n'
'    UPDATE invoice_items ii\n'
'       SET returned_quantity = COALESCE(ii.returned_quantity, 0) + agg.qty\n'
'      FROM (SELECT sri.invoice_item_id AS iid, SUM(sri.quantity) AS qty\n'
'              FROM sales_return_items sri\n'
'             WHERE sri.sales_return_id = ANY(v_return_ids)\n'
'               AND sri.invoice_item_id IS NOT NULL\n'
'             GROUP BY sri.invoice_item_id) agg\n'
'     WHERE ii.id = agg.iid;\n'
'  END IF;\n'
'\n' || a_return);

  EXECUTE d;
END;
$patch$;

-- Prove the patch landed. A migration that ran without changing anything is
-- exactly what this project keeps being bitten by.
DO $verify$
DECLARE s text;
BEGIN
  SELECT prosrc INTO s FROM pg_proc
   WHERE oid::regprocedure::text =
     'post_accounting_event(text,uuid,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb)';
  IF s NOT LIKE '%created_by_user_id%'          THEN RAISE EXCEPTION 'creator link missing'; END IF;
  IF s NOT LIKE '%app.sales_return_workflow%'   THEN RAISE EXCEPTION 'workflow flag missing'; END IF;
  IF s NOT LIKE '%invoice_item_id%'             THEN RAISE EXCEPTION 'invoice_item_id missing'; END IF;
  IF s NOT LIKE '%SET journal_entry_id = je.id%' THEN RAISE EXCEPTION 'return-to-entry link missing'; END IF;
  IF s NOT LIKE '%returned_quantity = COALESCE%' THEN RAISE EXCEPTION 'per-line quantity missing'; END IF;
END;
$verify$;

-- ---------------------------------------------------------------------------
-- 3. One open return request per invoice.
--
-- The route read for an existing active request and then inserted, with nothing
-- between. Two concurrent submissions both saw nothing and both inserted. The
-- application check stays for its friendlier message; it is simply no longer
-- the only thing preventing this. Closed states are excluded so a later,
-- legitimate request is never blocked.
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS uniq_open_sales_return_request_per_invoice
  ON public.sales_return_requests (invoice_id)
  WHERE status IN ('pending', 'pending_approval_level_1', 'pending_warehouse_approval', 'approved');

-- ---------------------------------------------------------------------------
-- 4. The six orphaned sales_return_items from December 2025.
--
-- Rows whose parent sales_return no longer exists, left by the browser path
-- that was later commented out. Checked before removal: no journal entries and
-- no inventory movements reference their return ids, so there is no accounting
-- effect to preserve. The DELETE is scoped to genuine orphans only and reports
-- what it removed.
-- ---------------------------------------------------------------------------
DO $cleanup$
DECLARE v_orphans int; v_with_effect int;
BEGIN
  SELECT count(*) INTO v_with_effect
    FROM sales_return_items sri
   WHERE NOT EXISTS (SELECT 1 FROM sales_returns sr WHERE sr.id = sri.sales_return_id)
     AND (EXISTS (SELECT 1 FROM journal_entries je WHERE je.reference_id = sri.sales_return_id)
       OR EXISTS (SELECT 1 FROM inventory_transactions it WHERE it.reference_id = sri.sales_return_id));

  IF v_with_effect > 0 THEN
    RAISE EXCEPTION
      'refusing to delete: % orphaned return item(s) DO have ledger or inventory effects', v_with_effect;
  END IF;

  DELETE FROM sales_return_items sri
   WHERE NOT EXISTS (SELECT 1 FROM sales_returns sr WHERE sr.id = sri.sales_return_id);
  GET DIAGNOSTICS v_orphans = ROW_COUNT;
  RAISE NOTICE 'removed % orphaned sales_return_items', v_orphans;
END;
$cleanup$;
