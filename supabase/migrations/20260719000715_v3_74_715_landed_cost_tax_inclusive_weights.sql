-- v3.74.715 — landed-cost allocation weights must be NET OF TAX.
-- ------------------------------------------------------------------
-- Found by following up the owner's question about line-level discount on a
-- purchase order. The discount itself was already handled end to end — the PO
-- form stores discount_percent, buildBillItemRow carries it onto the bill, and
-- fn_bill_item_landed_unit_cost reads it in both the line figure and the
-- allocation base. BILL-0001 carries line discounts of 10% and 5% and the engine
-- reproduces its ledger entry to the piastre.
--
-- What the question surfaced was different. The order's totals only reconciled
-- under TAX-INCLUSIVE pricing (21.00 / 1.14 * 0.90 = 16.58 exactly), and the
-- owner confirmed that mode is deliberate. That makes the following a live path
-- rather than a hypothetical one:
--
--   bills.subtotal is ALWAYS stored excluding tax.
--   The weights were taken from unit_price, which on a tax-inclusive bill still
--   contains the tax.
--
-- With a single tax rate this is harmless — every weight is inflated by the same
-- factor and the ratio survives. With DIFFERENT rates on different lines it
-- silently skews the split: a 14% line is weighted 1.14x against a 0% line and
-- absorbs cost belonging to the other product.
--
--   two lines, true cost 100 each:
--     before   A (14%) = 106.54    B (0%) = 93.46
--     after    A        = 100.00    B      = 100.00
--
-- The bill TOTAL was right either way, which is precisely why no integrity check
-- could see it. Only the per-product cost was wrong — and therefore per-product
-- profit, and the FIFO lot each product carries forward.
--
-- Fix: divide each weight by (1 + tax_rate/100) when the bill is tax-inclusive,
-- so the allocation base is expressed in the same terms as the stored subtotal.
-- Tax-exclusive bills are untouched: the divisor is 1.
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
  v_tax_rate    numeric;
  v_line_net    numeric;
  v_base        numeric;
  v_allocatable numeric;
  v_tax_incl    boolean;
BEGIN
  SELECT COALESCE(b.tax_inclusive, false),
         COALESCE(b.subtotal, 0) + COALESCE(b.shipping, 0)
    INTO v_tax_incl, v_allocatable
  FROM bills b WHERE b.id = p_bill_id;

  SELECT bi.quantity, bi.unit_price, COALESCE(bi.discount_percent, 0), COALESCE(bi.tax_rate, 0)
    INTO v_qty, v_unit_price, v_disc_pct, v_tax_rate
  FROM bill_items bi
  WHERE bi.bill_id = p_bill_id AND bi.product_id = p_product_id
  LIMIT 1;

  IF v_qty IS NULL OR v_qty <= 0 THEN RETURN NULL; END IF;

  v_line_net := v_qty * COALESCE(v_unit_price, 0) * (1 - v_disc_pct / 100.0);
  IF v_tax_incl THEN
    v_line_net := v_line_net / (1 + v_tax_rate / 100.0);
  END IF;

  SELECT COALESCE(SUM(
           (bi.quantity * COALESCE(bi.unit_price,0) * (1 - COALESCE(bi.discount_percent,0) / 100.0))
           / CASE WHEN v_tax_incl THEN (1 + COALESCE(bi.tax_rate,0) / 100.0) ELSE 1 END
         ), 0)
    INTO v_base
  FROM bill_items bi
  WHERE bi.bill_id = p_bill_id;

  -- No usable basis to allocate against: fall back to the list price rather than
  -- risk a zero-cost lot — that failure mode is exactly what produced the
  -- zero-cost COGS bug fixed in v3.74.702.
  IF v_base IS NULL OR v_base <= 0 OR v_allocatable IS NULL OR v_allocatable <= 0 THEN
    RETURN COALESCE(v_unit_price, 0);
  END IF;

  RETURN ROUND((v_allocatable * (v_line_net / v_base)) / v_qty, 6);
END;
$function$;

-- Restate any existing lot whose cost changes under the corrected weights.
-- Every bill in the database today is tax-exclusive, so this is expected to
-- touch nothing — it exists for installations that already use tax-inclusive
-- pricing. Idempotent: only rows whose cost actually differs are updated.
UPDATE fifo_cost_lots l
   SET unit_cost = v.landed,
       updated_at = CURRENT_TIMESTAMP,
       notes = COALESCE(l.notes,'') || ' [v3.74.715: وزن التوزيع بلا ضريبة]'
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
