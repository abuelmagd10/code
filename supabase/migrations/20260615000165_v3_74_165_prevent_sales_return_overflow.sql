-- v3.74.165 — Same defense-in-depth as v3.74.164 but for the sales-return
-- side. Sales-return architecture is different from purchase-return:
--   * sales_return_requests holds the workflow row with items stored
--     directly as a JSONB array column (no separate items table during
--     pending phase).
--   * On warehouse approval, process_sales_return_atomic_v2 creates a
--     sales_returns row + sales_return_items, and flips the request to
--     status='approved_completed'. The JSONB on the request stays.
--
-- The trigger fires BEFORE INSERT/UPDATE OF (items, status) on
-- sales_return_requests. For each item in NEW.items it:
--   1. Locks per-invoice_item via pg_advisory_xact_lock so concurrent
--      requests on the same line are serialized.
--   2. Reads the invoice_items.quantity (the maximum the customer could
--      ever return).
--   3. Sums "committed" returns from sales_return_items.quantity for that
--      invoice_item (every posted return on that line).
--   4. Sums "pending" reservations from items JSONB of OTHER active
--      sales_return_requests pointing at the same invoice_item. Active =
--      status IN (pending, pending_approval_level_1, pending_warehouse_approval).
--      We exclude approved_completed (already counted via sales_return_items)
--      and the rejected_* states.
--   5. If committed + pending_other + this_request_qty > invoice qty,
--      raises an Arabic check_violation with the available quantity.
--
-- "Quantity for this item" = qtyToReturn + qtyCreditOnly. Both reduce the
-- returnable quantity on the invoice line (one returns the physical unit,
-- the other issues credit for keeping it).
--
-- Tested in production migration: invoice line qty=2, A=1 (OK),
-- B=2 stacked on A (BLOCKED with Arabic message), C=1 stacked on A
-- (OK, sum = 2 = limit). Test rows cleaned up.

CREATE OR REPLACE FUNCTION public.check_sales_return_request_quantity()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  v_item             JSONB;
  v_invoice_item_id  UUID;
  v_new_qty          NUMERIC;
  v_invoice_item_qty NUMERIC;
  v_committed_sum    NUMERIC;
  v_pending_sum      NUMERIC;
  v_total            NUMERIC;
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.items IS NOT DISTINCT FROM NEW.items
     AND OLD.status IS NOT DISTINCT FROM NEW.status
  THEN
    RETURN NEW;
  END IF;

  IF NEW.status NOT IN ('pending', 'pending_approval_level_1', 'pending_warehouse_approval') THEN
    RETURN NEW;
  END IF;

  IF NEW.items IS NULL OR jsonb_typeof(NEW.items) <> 'array' THEN
    RETURN NEW;
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(NEW.items) LOOP
    v_invoice_item_id := NULLIF(v_item->>'id', '')::UUID;
    v_new_qty := COALESCE((v_item->>'qtyToReturn')::NUMERIC, 0)
               + COALESCE((v_item->>'qtyCreditOnly')::NUMERIC, 0);

    IF v_invoice_item_id IS NULL OR v_new_qty <= 0 THEN
      CONTINUE;
    END IF;

    PERFORM pg_advisory_xact_lock(
      hashtext('sales_return_request_qty_check:' || v_invoice_item_id::text)
    );

    SELECT quantity INTO v_invoice_item_qty
    FROM invoice_items
    WHERE id = v_invoice_item_id
    FOR UPDATE;

    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    SELECT COALESCE(SUM(sri.quantity), 0)
    INTO v_committed_sum
    FROM sales_return_items sri
    WHERE sri.invoice_item_id = v_invoice_item_id;

    SELECT COALESCE(SUM(
      COALESCE((other_item->>'qtyToReturn')::NUMERIC, 0)
      + COALESCE((other_item->>'qtyCreditOnly')::NUMERIC, 0)
    ), 0)
    INTO v_pending_sum
    FROM sales_return_requests r,
         jsonb_array_elements(r.items) AS other_item
    WHERE r.id IS DISTINCT FROM NEW.id
      AND r.status IN ('pending', 'pending_approval_level_1', 'pending_warehouse_approval')
      AND NULLIF(other_item->>'id', '')::UUID = v_invoice_item_id;

    v_total := v_committed_sum + v_pending_sum + v_new_qty;

    IF v_total > v_invoice_item_qty THEN
      RAISE EXCEPTION
        'لا يُمكِن إِنشاء مَرتَجَع بَيع بكَمية % لِهَذا الصِّنف. كَمية الفاتورَة: %، المَرتَجَعات المُعتَمَدَة: %، المَرتَجَعات قَيد الاعتماد: %. الكَمية المُتاحَة لِلمَرتَجَع: %.',
        v_new_qty, v_invoice_item_qty, v_committed_sum, v_pending_sum,
        GREATEST(v_invoice_item_qty - v_committed_sum - v_pending_sum, 0)
        USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_check_sales_return_request_quantity
  ON public.sales_return_requests;

CREATE TRIGGER trg_check_sales_return_request_quantity
BEFORE INSERT OR UPDATE OF items, status
ON public.sales_return_requests
FOR EACH ROW
EXECUTE FUNCTION public.check_sales_return_request_quantity();

COMMENT ON FUNCTION public.check_sales_return_request_quantity() IS
  'v3.74.165: prevents the sum of qtyToReturn+qtyCreditOnly across active '
  'sales_return_requests JSONB items + committed sales_return_items from '
  'exceeding invoice_items.quantity. Active = status IN (pending, '
  'pending_approval_level_1, pending_warehouse_approval). Serializes '
  'concurrent inserts via pg_advisory_xact_lock keyed by invoice_item_id.';
