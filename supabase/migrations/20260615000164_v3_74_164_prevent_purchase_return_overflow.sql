-- v3.74.164 — Defense-in-depth at the bill_item level: a single trigger on
-- purchase_return_items prevents the sum of "active" return quantities
-- (pending or posted, from any user) from exceeding bill_items.quantity.
--
-- Why this exists:
--   The previous purchase-return creation path validated quantity only when
--   posting (i.e., during warehouse confirmation). Two accountants could each
--   create a partial return that, individually, fit under the bill_item
--   quantity, but whose combined pending quantities exceeded it. Admin would
--   approve both; warehouse would post the first; the second would explode
--   inside `confirm_purchase_return_delivery_v3` with a confusing
--   "Cannot return X units" error blamed on the warehouse user.
--
-- How it works:
--   The trigger fires BEFORE INSERT/UPDATE on purchase_return_items. It:
--     1. Takes pg_advisory_xact_lock keyed by bill_item_id, serializing all
--        concurrent inserts on the same bill_item so two transactions cannot
--        each pass the check before either commits.
--     2. SELECT ... FOR UPDATE on bill_items to read the authoritative quantity.
--     3. Sums quantity from every OTHER purchase_return_item pointing at
--        this bill_item whose parent purchase_return is NOT in
--        ('rejected', 'warehouse_rejected', 'cancelled'). Self-row excluded
--        via pri.id IS DISTINCT FROM NEW.id (matters for UPDATEs).
--     4. If (active_sum + NEW.quantity) > bill_item.quantity, raises a
--        check_violation with an Arabic message that tells the user the
--        exact available quantity.
--
-- Covered paths:
--   - process_purchase_return_atomic (single-warehouse): items inserted
--     after parent → trigger fires.
--   - process_purchase_return_multi_warehouse: same.
--   - resubmit_purchase_return: deletes old items then inserts new ones →
--     trigger fires on each new item. Old items are gone so they don't
--     count; new items count against bill_item.quantity correctly.
--
-- Tested in production migration: A=2 (OK), B=4 on top of A (BLOCKED),
-- C=3 on top of A (OK, sum equals quantity).
--
-- Safe to re-apply: CREATE OR REPLACE on the function, DROP IF EXISTS +
-- CREATE on the trigger.

CREATE OR REPLACE FUNCTION public.check_purchase_return_item_quantity()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  v_bill_item_qty NUMERIC;
  v_active_sum    NUMERIC;
BEGIN
  -- No bill_item → can't validate against a specific line; let it through.
  IF NEW.bill_item_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.quantity IS NULL OR NEW.quantity <= 0 THEN
    RETURN NEW;
  END IF;

  -- Serialize concurrent return-item inserts on this bill_item so two
  -- transactions can't both pass the check before either commits.
  PERFORM pg_advisory_xact_lock(
    hashtext('purchase_return_item_qty_check:' || NEW.bill_item_id::text)
  );

  -- Lock the bill_item too — both for the quantity read and because the
  -- existing trigger pipeline expects rows to be reservable.
  SELECT quantity INTO v_bill_item_qty
  FROM bill_items
  WHERE id = NEW.bill_item_id
  FOR UPDATE;

  IF NOT FOUND THEN
    -- Don't block: the FK will fail elsewhere with a clearer error.
    RETURN NEW;
  END IF;

  -- Sum the quantity of every *other* active purchase_return_item on this
  -- bill_item. "Active" = parent return is not rejected/cancelled.
  SELECT COALESCE(SUM(pri.quantity), 0)
  INTO v_active_sum
  FROM purchase_return_items pri
  JOIN purchase_returns pr ON pr.id = pri.purchase_return_id
  WHERE pri.bill_item_id = NEW.bill_item_id
    AND pr.workflow_status NOT IN ('rejected', 'warehouse_rejected', 'cancelled')
    AND pri.id IS DISTINCT FROM NEW.id;

  IF (v_active_sum + NEW.quantity) > v_bill_item_qty THEN
    RAISE EXCEPTION
      'لا يُمكِن إِنشاء مَرتَجَع بكَمية % لِهَذا الصِّنف. كَمية الفاتورَة: %، وَمَجموع المَرتَجَعات السَّابِقَة (المُعتَمَدَة وَالتى قَيد الاعتماد): %. الكَمية المُتاحَة لِلمَرتَجَع: %.',
      NEW.quantity, v_bill_item_qty, v_active_sum,
      GREATEST(v_bill_item_qty - v_active_sum, 0)
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_check_purchase_return_item_quantity
  ON public.purchase_return_items;

CREATE TRIGGER trg_check_purchase_return_item_quantity
BEFORE INSERT OR UPDATE OF quantity, bill_item_id, purchase_return_id
ON public.purchase_return_items
FOR EACH ROW
EXECUTE FUNCTION public.check_purchase_return_item_quantity();

COMMENT ON FUNCTION public.check_purchase_return_item_quantity() IS
  'v3.74.164: prevents the sum of active purchase_return_items quantities '
  'on a bill_item from exceeding bill_item.quantity. Active = parent return '
  'workflow_status NOT IN (rejected, warehouse_rejected, cancelled). '
  'Serializes concurrent inserts via pg_advisory_xact_lock keyed by bill_item_id.';
