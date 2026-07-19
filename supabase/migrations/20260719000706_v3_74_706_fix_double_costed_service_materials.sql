-- v3.74.706 — a service's materials were costed TWICE. Regression from v3.74.705.
-- ------------------------------------------------------------------
-- WHAT WENT WRONG (my error, not a pre-existing defect)
-- In v3.74.705 I concluded that nothing costed service consumption. I checked
-- auto_create_cogs_journal (fires only on transaction_type='sale') and
-- auto_link_inventory_to_journal (maps only sale/purchase) and stopped there.
-- I never checked execute_sales_invoice_accounting — which is called by
-- complete_booking_atomic a few lines below where I inserted my own call, in the
-- very function I was editing.
--
-- The materials consumed by a service ARE written to the invoice as lines, and
-- that engine costs every non-service product line at products.cost_price. So
-- executing BKG-2026-00006 produced two cost journals for the same two items:
--
--   service_consumption_cogs   19.90   (v3.74.705, FIFO landed cost — correct)
--   invoice_cogs               21.00   (existing engine, products.cost_price)
--
-- 40.90 of cost booked for materials that cost 19.90, and three drift alerts:
-- COGS sub-ledger vs engine GL -21.00, valuation drift -21.23, GL vs FIFO -21.14.
--
-- WHAT v3.74.705 STILL GOT RIGHT
-- The old engine valued those lines at products.cost_price (the gross card
-- price, not the landed cost) and never consumed the FIFO batches — so phantom
-- batch quantity really was accumulating. The FIFO consumption belongs where
-- v3.74.705 put it. What was wrong was leaving the second, cruder valuation in
-- place beside it.
--
-- THE FIX — one cost per line, from the FIFO batches
-- execute_sales_invoice_accounting now skips any line already consumed as
-- service material for that invoice. Ordinary sales invoices are untouched:
-- they carry no service_consumption rows, so the NOT EXISTS never matches.
-- ------------------------------------------------------------------

DO $do$
DECLARE d text;
BEGIN
  SELECT pg_get_functiondef('public.execute_sales_invoice_accounting'::regproc) INTO d;
  IF d NOT LIKE '%v3.74.706%' THEN
    d := replace(d,
      $a$         WHERE ii.invoice_id = p_invoice_id AND p.item_type != 'service'$a$,
      $a$         WHERE ii.invoice_id = p_invoice_id AND p.item_type != 'service'
           -- v3.74.706 — do not cost a line twice. Materials consumed performing
           -- a service appear on the invoice as lines, but they are already
           -- costed by fn_post_service_consumption_cogs from the FIFO batches
           -- (the true landed cost). This block values lines at
           -- products.cost_price, so leaving them in booked the cost a second
           -- time at the wrong basis.
           AND NOT EXISTS (
                 SELECT 1 FROM inventory_transactions sc
                  WHERE sc.reference_id = p_invoice_id
                    AND sc.product_id = ii.product_id
                    AND sc.transaction_type = 'service_consumption'
                    AND COALESCE(sc.is_deleted,false) = false
               )$a$);
    EXECUTE d;
  END IF;
END $do$;

-- ------------------------------------------------------------------
-- Repair: reverse invoice_cogs journals that double-count service materials.
-- Scoped to invoices where EVERY costed line is a consumed service material, so
-- an invoice mixing sold goods with service materials is never touched blindly.
-- Posted journals cannot be edited (enforce_posted_entry_no_edit) and should not
-- be — a reversal is the correct accounting treatment and keeps the audit trail.
-- Idempotent: skips anything already reversed.
-- ------------------------------------------------------------------
DO $repair$
DECLARE
  r RECORD;
  v_lines jsonb;
  v_je jsonb;
BEGIN
  FOR r IN
    SELECT je.id, je.company_id, je.reference_id, je.branch_id, je.cost_center_id, je.warehouse_id
    FROM journal_entries je
    WHERE je.reference_type = 'invoice_cogs'
      AND je.status = 'posted'
      AND COALESCE(je.is_deleted,false) = false
      -- the invoice has consumed service materials
      AND EXISTS (
            SELECT 1 FROM inventory_transactions sc
             WHERE sc.reference_id = je.reference_id
               AND sc.transaction_type = 'service_consumption'
               AND COALESCE(sc.is_deleted,false) = false)
      -- and every costed line on it is one of them
      AND NOT EXISTS (
            SELECT 1 FROM invoice_items ii
              JOIN products p ON p.id = ii.product_id
             WHERE ii.invoice_id = je.reference_id
               AND p.item_type <> 'service'
               AND NOT EXISTS (
                     SELECT 1 FROM inventory_transactions sc2
                      WHERE sc2.reference_id = je.reference_id
                        AND sc2.product_id = ii.product_id
                        AND sc2.transaction_type = 'service_consumption'
                        AND COALESCE(sc2.is_deleted,false) = false))
      -- and it has not been reversed yet
      AND NOT EXISTS (
            SELECT 1 FROM journal_entries rev
             WHERE rev.reference_type = 'invoice_cogs_reversal'
               AND rev.reference_id = je.reference_id
               AND COALESCE(rev.is_deleted,false) = false)
  LOOP
    SELECT jsonb_agg(jsonb_build_object(
             'account_id', jel.account_id,
             'debit_amount', jel.credit_amount,   -- mirrored
             'credit_amount', jel.debit_amount,
             'description', 'عكس: ' || COALESCE(jel.description,'')))
      INTO v_lines
      FROM journal_entry_lines jel
     WHERE jel.journal_entry_id = r.id;

    IF v_lines IS NULL THEN CONTINUE; END IF;

    v_je := public.create_journal_entry_atomic(
      r.company_id, 'invoice_cogs_reversal', r.reference_id, CURRENT_DATE,
      'عكس تكلفة مزدوجة — المواد محمَّلة بالفعل من دفعات FIFO عند تنفيذ الخدمة',
      r.branch_id, r.cost_center_id, r.warehouse_id, v_lines
    );
    IF NOT COALESCE((v_je->>'success')::boolean,false) THEN
      RAISE EXCEPTION 'v3.74.706 reversal failed for %: %', r.id, COALESCE(v_je->>'error','unknown');
    END IF;
  END LOOP;
END $repair$;
