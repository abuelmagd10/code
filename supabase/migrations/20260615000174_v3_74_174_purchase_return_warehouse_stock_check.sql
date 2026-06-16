-- v3.74.174 — Block creation of a purchase return whose quantity exceeds
-- what is actually available at the warehouse the return is drawn from.
--
-- Gap before this migration:
--   process_purchase_return_atomic only checks stock when called for a
--   non-pending status (i.e., NOT v_is_pending). The normal create path
--   submits with workflow_status='pending_admin_approval', so the stock
--   guard never fires. confirm_purchase_return_delivery_v2 also writes
--   the negative inventory_transaction blindly. End result: a branch
--   accountant can request 3 units even when the warehouse holds 0, the
--   workflow runs to completion, and inventory_transactions ends up
--   negative.
--
-- Fix: BEFORE INSERT/UPDATE trigger on purchase_return_items that:
--   1. Resolves the warehouse - prefer the item-level warehouse_id, fall
--      back to the parent purchase_returns.warehouse_id. If neither is
--      set, the check is skipped (multi-warehouse master row - each
--      allocation row has its own warehouse_id and is checked separately).
--   2. Takes pg_advisory_xact_lock keyed by (warehouse_id, product_id)
--      so concurrent returns on the same product/warehouse can't both
--      pass the check.
--   3. Reads current physical stock from inventory_transactions.
--   4. Sums quantities of OTHER active purchase_return_items pointing at
--      the same product+warehouse where the parent workflow_status is
--      one of the "pending" states (pre-confirm).
--   5. available = current_stock - pending_sum. If requested > available,
--      raises a check_violation with an Arabic message listing all four
--      numbers so the accountant can adjust.
--
-- "Active pending" statuses that reserve stock:
--   pending_admin_approval, pending_approval, pending_warehouse,
--   partial_approval. (completed/confirmed/closed are already in
--   inventory_transactions; rejected/warehouse_rejected/cancelled
--   released the reservation.)
--
-- Production smoke test (applied via apply_migration):
--   Inserted a TEST purchase_return on BILL-0002 for VitaSlims (warehouse
--   stock = 0). Attempted to insert a 1-unit return item. Trigger raised
--   the expected Arabic check_violation. Test row cleaned up.

CREATE OR REPLACE FUNCTION public.check_purchase_return_item_warehouse_stock()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  v_warehouse_id UUID;
  v_company_id   UUID;
  v_current_stock NUMERIC;
  v_pending_sum   NUMERIC;
  v_available     NUMERIC;
BEGIN
  IF NEW.product_id IS NULL OR NEW.quantity IS NULL OR NEW.quantity <= 0 THEN
    RETURN NEW;
  END IF;

  v_warehouse_id := NEW.warehouse_id;
  IF v_warehouse_id IS NULL THEN
    SELECT warehouse_id, company_id
      INTO v_warehouse_id, v_company_id
    FROM purchase_returns
    WHERE id = NEW.purchase_return_id;
  ELSE
    SELECT company_id INTO v_company_id
    FROM purchase_returns
    WHERE id = NEW.purchase_return_id;
  END IF;

  IF v_warehouse_id IS NULL OR v_company_id IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtext('purchase_return_warehouse_stock:' || v_warehouse_id::text || ':' || NEW.product_id::text)
  );

  SELECT COALESCE(SUM(quantity_change), 0)
  INTO v_current_stock
  FROM inventory_transactions
  WHERE company_id = v_company_id
    AND product_id = NEW.product_id
    AND warehouse_id = v_warehouse_id
    AND COALESCE(is_deleted, false) = false;

  SELECT COALESCE(SUM(pri.quantity), 0)
  INTO v_pending_sum
  FROM purchase_return_items pri
  JOIN purchase_returns pr ON pr.id = pri.purchase_return_id
  WHERE pri.product_id = NEW.product_id
    AND COALESCE(pri.warehouse_id, pr.warehouse_id) = v_warehouse_id
    AND pr.workflow_status IN (
      'pending_admin_approval', 'pending_approval',
      'pending_warehouse', 'partial_approval'
    )
    AND pri.id IS DISTINCT FROM NEW.id;

  v_available := v_current_stock - v_pending_sum;

  IF NEW.quantity > v_available THEN
    RAISE EXCEPTION
      'لا يَكفى المَخزون لِتَنفيذ هذا المَرتَجَع. المُتَوَفِّر فِعلياً فى المَخزَن: %، المَحجوز فى مَرتَجَعات قَيد الاعتماد: %، الكَمية المُتاحَة للمَرتَجَع: %، الكَمية المَطلوبَة: %.',
      v_current_stock, v_pending_sum,
      GREATEST(v_available, 0), NEW.quantity
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_check_purchase_return_warehouse_stock
  ON public.purchase_return_items;

CREATE TRIGGER trg_check_purchase_return_warehouse_stock
BEFORE INSERT OR UPDATE OF product_id, quantity, warehouse_id, purchase_return_id
ON public.purchase_return_items
FOR EACH ROW
EXECUTE FUNCTION public.check_purchase_return_item_warehouse_stock();

COMMENT ON FUNCTION public.check_purchase_return_item_warehouse_stock() IS
  'v3.74.174: blocks a purchase return whose qty exceeds the available '
  'stock at the chosen warehouse (current inventory minus quantities '
  'reserved by other pending returns). Serializes per (warehouse_id, '
  'product_id) via pg_advisory_xact_lock.';
