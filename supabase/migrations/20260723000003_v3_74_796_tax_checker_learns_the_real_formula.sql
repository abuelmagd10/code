-- ============================================================================
-- v3.74.796 — فاحص الضريبة يتعلم المعادلة الحقيقية + ردم فجوة معدل الشحن
--
-- ic_tax_accuracy compared stored tax to qty*price*rate — blind to FOUR
-- realities of this system: line discounts, tax-inclusive pricing
-- (الأسعار شاملة الضريبة), the before-tax document discount, and shipping
-- tax (قاعدة المالك: الشحن خاضع للضريبة). Every CORRECT invoice carrying
-- any of those looked "wrong" — the 8.11 / 11.2 dashboard false positives
-- that shadowed the owner's live tests for days.
--
-- The new formula: per-line gross after line discount, divided out of the
-- price when the invoice is tax-inclusive, times the line rate; scaled by
-- the before-tax document-discount factor; plus shipping × its persisted
-- rate. Tolerance unchanged (1.00).
--
-- Companion data fix: exactly TWO historical invoices system-wide
-- (تست INV-00001 / INV-00002) had 14% shipping tax INSIDE their stored
-- totals from before shipping_tax_rate was persisted — both verified to
-- imply exactly 14.0% — backfilled under a temporary trigger bypass.
--
-- Verified on the test copy: zero findings across ALL companies' real
-- invoices, AND a deliberately corrupted invoice (tax=99.99) IS caught
-- (diff 95.65). Verified on prod after applying: ic_tax_accuracy,
-- ic_inventory_gl_vs_fifo and ic_booking_no_invoice all report ZERO
-- findings — the first fully clean integrity board.
--
-- APPLIED to test + prod 2026-07-23 via MCP; this file is the repo record.
-- ============================================================================

DO $backfill$
DECLARE v_count int;
BEGIN
  ALTER TABLE public.invoices DISABLE TRIGGER USER;
  UPDATE public.invoices i
     SET shipping_tax_rate = 14
   WHERE i.company_id = '8ef6338c-1713-4202-98ac-863633b76526'
     AND i.invoice_number IN ('INV-00001','INV-00002')
     AND COALESCE(i.shipping_tax_rate, 0) = 0
     AND COALESCE(i.shipping, 0) > 0;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  ALTER TABLE public.invoices ENABLE TRIGGER USER;
  RAISE NOTICE 'backfilled shipping_tax_rate on % invoices', v_count;
END $backfill$;

CREATE OR REPLACE FUNCTION public.ic_tax_accuracy(p_company_id uuid)
RETURNS TABLE(severity text, detail jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE r record;
BEGIN
  FOR r IN
    WITH item_tax AS (
      SELECT ii.invoice_id,
             SUM( (COALESCE(ii.quantity,0) * COALESCE(ii.unit_price,0)
                   * (1 - COALESCE(ii.discount_percent,0)/100.0))
                  / CASE WHEN i2.tax_inclusive
                         THEN (1 + COALESCE(ii.tax_rate,0)/100.0) ELSE 1 END
                  * COALESCE(ii.tax_rate,0)/100.0 ) AS items_tax_full
      FROM invoice_items ii
      JOIN invoices i2 ON i2.id = ii.invoice_id
      GROUP BY ii.invoice_id
    )
    SELECT i.id, i.invoice_number, i.tax_amount AS stored_tax,
           ROUND(
             it.items_tax_full
             * CASE WHEN COALESCE(i.discount_position,'') = 'before_tax'
                         AND COALESCE(i.discount_value,0) > 0
                    THEN CASE WHEN COALESCE(i.discount_type,'amount') = 'percent'
                              THEN 1 - i.discount_value/100.0
                              ELSE GREATEST(1 - i.discount_value
                                     / NULLIF(COALESCE(i.subtotal,0) + i.discount_value, 0), 0)
                         END
                    ELSE 1 END
             + COALESCE(i.shipping,0) * COALESCE(i.shipping_tax_rate,0)/100.0
           , 2) AS expected_tax,
           ROUND(COALESCE(i.tax_amount,0) - (
             it.items_tax_full
             * CASE WHEN COALESCE(i.discount_position,'') = 'before_tax'
                         AND COALESCE(i.discount_value,0) > 0
                    THEN CASE WHEN COALESCE(i.discount_type,'amount') = 'percent'
                              THEN 1 - i.discount_value/100.0
                              ELSE GREATEST(1 - i.discount_value
                                     / NULLIF(COALESCE(i.subtotal,0) + i.discount_value, 0), 0)
                         END
                    ELSE 1 END
             + COALESCE(i.shipping,0) * COALESCE(i.shipping_tax_rate,0)/100.0
           ), 2) AS diff
    FROM invoices i
    JOIN item_tax it ON it.invoice_id = i.id
    WHERE i.company_id = p_company_id
      AND i.status NOT IN ('draft','cancelled')
      AND ABS(COALESCE(i.tax_amount,0) - (
             it.items_tax_full
             * CASE WHEN COALESCE(i.discount_position,'') = 'before_tax'
                         AND COALESCE(i.discount_value,0) > 0
                    THEN CASE WHEN COALESCE(i.discount_type,'amount') = 'percent'
                              THEN 1 - i.discount_value/100.0
                              ELSE GREATEST(1 - i.discount_value
                                     / NULLIF(COALESCE(i.subtotal,0) + i.discount_value, 0), 0)
                         END
                    ELSE 1 END
             + COALESCE(i.shipping,0) * COALESCE(i.shipping_tax_rate,0)/100.0
          )) > 1.00
    LIMIT 20
  LOOP
    severity := CASE WHEN ABS(r.diff) > 100 THEN 'high' ELSE 'medium' END;
    detail := jsonb_build_object('invoice_id', r.id, 'invoice_number', r.invoice_number,
      'stored_tax', r.stored_tax, 'expected_tax', r.expected_tax, 'difference', r.diff,
      'hint','Invoice tax_amount diverges from the discount-aware, inclusive-aware line tax plus shipping tax.');
    RETURN NEXT;
  END LOOP;
END $function$;
