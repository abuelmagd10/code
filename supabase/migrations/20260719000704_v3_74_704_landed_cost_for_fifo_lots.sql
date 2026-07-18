-- v3.74.704 — FIFO batches are costed at what we ACTUALLY paid (landed cost).
-- ------------------------------------------------------------------
-- Surfaced while investigating the custody drift in v3.74.703.
--
-- THE DEFECT
-- create_fifo_lot_on_purchase created every batch at bill_items.unit_price — the
-- gross list price — while the ledger debited inventory with the amount actually
-- payable. Every purchase discount and every freight charge therefore drove FIFO
-- and the GL apart, permanently and cumulatively:
--
--   BILL-0001 (تست)   ledger 6.44      FIFO 7.00      gap 0.56
--   BILL-0002 (تست)   ledger 19.90     FIFO 21.00     gap 1.10
--
-- Since v3.74.702 made FIFO the basis for cost of sales, this is not cosmetic:
-- cost of sales was OVERSTATED and reported profit UNDERSTATED by the whole
-- purchase discount, on every single sale. The gap scales with purchase volume,
-- which is why it was still small enough here to sit under the drift tolerance
-- and go unreported.
--
-- IAS 2 / ASC 330: the cost of inventory is the purchase price less trade
-- discounts and rebates, PLUS transport and handling. Both halves were missing.
--
-- THE APPROACH — allocation, not re-derivation
-- Discounts exist at two levels (line discount_percent, and a header discount
-- that may be a percentage or a fixed amount, before or after tax), alongside
-- shipping, per-line tax rates and tax-inclusive pricing. Re-deriving all of
-- that in a second place would be a second source of truth waiting to disagree
-- with the first.
--
-- Instead fn_bill_item_landed_unit_cost allocates the bill's OWN authoritative
-- (subtotal + shipping) across the lines in proportion to their net value.
-- Whatever pricing rules the application applies, the lot costs then sum to the
-- inventory debit EXACTLY, by construction — GL and FIFO cannot drift apart
-- again. Verified against all three existing bills: 60000.00, 6.44, 19.90 — each
-- reproduced to the piastre.
--
-- Recoverable tax is excluded, matching the ledger: tax goes to input VAT, never
-- to inventory.
-- ------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_bill_item_landed_unit_cost(
  p_bill_id uuid,
  p_product_id uuid
) RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public','pg_catalog'
AS $function$
DECLARE
  v_qty         numeric;
  v_unit_price  numeric;
  v_disc_pct    numeric;
  v_line_net    numeric;
  v_base        numeric;
  v_allocatable numeric;
BEGIN
  SELECT bi.quantity, bi.unit_price, COALESCE(bi.discount_percent, 0)
    INTO v_qty, v_unit_price, v_disc_pct
  FROM bill_items bi
  WHERE bi.bill_id = p_bill_id AND bi.product_id = p_product_id
  LIMIT 1;

  IF v_qty IS NULL OR v_qty <= 0 THEN RETURN NULL; END IF;

  v_line_net := v_qty * COALESCE(v_unit_price, 0) * (1 - v_disc_pct / 100.0);

  SELECT COALESCE(SUM(bi.quantity * COALESCE(bi.unit_price,0)
                      * (1 - COALESCE(bi.discount_percent,0) / 100.0)), 0)
    INTO v_base
  FROM bill_items bi
  WHERE bi.bill_id = p_bill_id;

  SELECT COALESCE(b.subtotal, 0) + COALESCE(b.shipping, 0)
    INTO v_allocatable
  FROM bills b WHERE b.id = p_bill_id;

  -- No usable basis to allocate against: fall back to the list price rather than
  -- risk a zero-cost lot — that failure mode is exactly what produced the
  -- zero-cost COGS bug fixed in v3.74.702.
  IF v_base IS NULL OR v_base <= 0 OR v_allocatable IS NULL OR v_allocatable <= 0 THEN
    RETURN COALESCE(v_unit_price, 0);
  END IF;

  RETURN ROUND((v_allocatable * (v_line_net / v_base)) / v_qty, 6);
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_fifo_lot_on_purchase()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_unit_cost NUMERIC;
  v_bill_date DATE;
BEGIN
  IF NEW.transaction_type NOT IN ('purchase', 'adjustment_in') THEN
    RETURN NEW;
  END IF;

  IF EXISTS (SELECT 1 FROM products WHERE id = NEW.product_id AND item_type = 'service') THEN
    RETURN NEW;
  END IF;

  IF NEW.transaction_type = 'purchase' AND NEW.reference_id IS NOT NULL THEN
    -- v3.74.704 — the LANDED cost, not the list price.
    SELECT public.fn_bill_item_landed_unit_cost(NEW.reference_id, NEW.product_id),
           b.bill_date
      INTO v_unit_cost, v_bill_date
    FROM bills b
    WHERE b.id = NEW.reference_id
    LIMIT 1;

    IF COALESCE(v_unit_cost, 0) <= 0 THEN
      SELECT bi.unit_price, b.bill_date
        INTO v_unit_cost, v_bill_date
      FROM bill_items bi
      JOIN bills b ON bi.bill_id = b.id
      WHERE bi.bill_id = NEW.reference_id
        AND bi.product_id = NEW.product_id
      LIMIT 1;
    END IF;
  ELSE
    SELECT cost_price INTO v_unit_cost FROM products WHERE id = NEW.product_id;
    v_bill_date := CURRENT_DATE;
  END IF;

  INSERT INTO fifo_cost_lots (
    company_id, product_id, lot_date, lot_type, reference_type, reference_id,
    original_quantity, remaining_quantity, unit_cost, notes, branch_id, warehouse_id
  ) VALUES (
    NEW.company_id,
    NEW.product_id,
    COALESCE(v_bill_date, CURRENT_DATE),
    CASE WHEN NEW.transaction_type = 'purchase' THEN 'purchase' ELSE 'adjustment' END,
    CASE WHEN NEW.transaction_type = 'purchase' THEN 'bill' ELSE 'adjustment' END,
    NEW.reference_id,
    NEW.quantity_change,
    NEW.quantity_change,
    COALESCE(v_unit_cost, 0),
    NEW.notes,
    NEW.branch_id,
    NULL
  );

  RETURN NEW;
END;
$function$;

-- ------------------------------------------------------------------
-- Restate existing batches to landed cost. Idempotent: only rows whose cost
-- actually differs are touched, so re-running changes nothing.
-- ------------------------------------------------------------------
UPDATE fifo_cost_lots l
   SET unit_cost = v.landed,
       updated_at = CURRENT_TIMESTAMP,
       notes = COALESCE(l.notes,'') || ' [v3.74.704: تكلفة فعلية بعد الخصم والشحن]'
  FROM (
    SELECT l2.id,
           public.fn_bill_item_landed_unit_cost(l2.reference_id, l2.product_id) AS landed
    FROM fifo_cost_lots l2
    WHERE l2.reference_type = 'bill' AND l2.reference_id IS NOT NULL
  ) v
 WHERE l.id = v.id
   AND v.landed IS NOT NULL
   AND v.landed > 0
   AND ROUND(v.landed, 6) <> ROUND(l.unit_cost, 6);

-- ------------------------------------------------------------------
-- Knock-on effect: custody already OUT was valued at the old gross cost.
-- Left alone, execution would post the custody RETURN at the gross figure and
-- then consume FIFO at the landed figure, stranding the difference in the
-- inventory account forever. Restate the custody and move the over-stated
-- amount back from 1145 to 1140.
-- Idempotent: a zero delta is skipped.
-- ------------------------------------------------------------------
DO $fix$
DECLARE
  r RECORD;
  v_new numeric; v_delta numeric; v_qty int;
  v_custody_acct uuid; v_inv_acct uuid; v_cc uuid; v_je jsonb;
BEGIN
  FOR r IN
    SELECT w.*, b.booking_no
    FROM booking_stock_withdrawals w
    LEFT JOIN bookings b ON b.id = w.booking_id
    WHERE COALESCE(w.custody_status,'none') = 'out'
  LOOP
    v_qty := CEIL(COALESCE(r.quantity,0))::int;
    v_new := ROUND(public.calculate_fifo_cost(r.product_id, r.warehouse_id, v_qty), 2);
    IF COALESCE(v_new,0) <= 0 THEN CONTINUE; END IF;

    v_delta := ROUND(COALESCE(r.custody_value,0) - v_new, 2);
    IF v_delta = 0 THEN CONTINUE; END IF;

    SELECT id INTO v_custody_acct FROM chart_of_accounts
      WHERE company_id=r.company_id AND is_active
        AND (account_code='1145' OR sub_type IN ('inventory_in_custody','work_in_process'))
      ORDER BY CASE WHEN account_code='1145' THEN 0 ELSE 1 END LIMIT 1;
    SELECT id INTO v_inv_acct FROM chart_of_accounts
      WHERE company_id=r.company_id AND is_active AND sub_type='inventory' LIMIT 1;
    SELECT cost_center_id INTO v_cc FROM inventory_transactions
      WHERE reference_id = r.id AND transaction_type='booking_custody_out' LIMIT 1;

    v_je := public.create_journal_entry_atomic(
      r.company_id, 'booking_custody_adjust', r.id, CURRENT_DATE,
      'تعديل قيمة عهدة للتكلفة الفعلية بعد الخصم والشحن — حجز ' || COALESCE(r.booking_no,''),
      r.branch_id, v_cc, r.warehouse_id,
      jsonb_build_array(
        jsonb_build_object('account_id', v_inv_acct,     'debit_amount', v_delta, 'credit_amount', 0, 'description','تصحيح تكلفة المخزون'),
        jsonb_build_object('account_id', v_custody_acct, 'debit_amount', 0, 'credit_amount', v_delta, 'description','تصحيح قيمة العهدة')
      )
    );
    IF NOT COALESCE((v_je->>'success')::boolean,false) THEN
      RAISE EXCEPTION 'CUSTODY_ADJUST_FAILED: %', COALESCE(v_je->>'error','unknown');
    END IF;

    UPDATE booking_stock_withdrawals SET custody_value = v_new WHERE id = r.id;
  END LOOP;
END $fix$;
