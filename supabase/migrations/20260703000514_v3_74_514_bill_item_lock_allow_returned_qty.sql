-- v3.74.514: bill_item_protect_posted_trg blocked the purchase-return
-- delivery confirmation (confirm_purchase_return_delivery_v2 records
-- returned_quantity on bill_items of a received bill). Recording returned
-- quantities is a legitimate SYSTEM mutation — allow an UPDATE that changes
-- NOTHING except returned_quantity (+updated_at). Every other edit on a
-- posted bill's items stays blocked exactly as before.
-- Applied to production on 2026-07-03 via Supabase MCP.
CREATE OR REPLACE FUNCTION public.bill_item_protect_posted_trg()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_bill_status text;
  v_bill_id uuid;
BEGIN
  v_bill_id := COALESCE(NEW.bill_id, OLD.bill_id);
  SELECT status INTO v_bill_status FROM public.bills WHERE id = v_bill_id;
  IF NOT FOUND THEN RETURN COALESCE(NEW, OLD); END IF;
  IF v_bill_status IN ('draft', 'voided', 'pending_approval', 'rejected') THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  IF COALESCE(current_setting('app.skip_po_lock', true), '') <> '' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  -- v3.74.514: returned_quantity bookkeeping from the returns workflow
  IF TG_OP = 'UPDATE'
     AND (to_jsonb(NEW) - 'returned_quantity' - 'updated_at')
       = (to_jsonb(OLD) - 'returned_quantity' - 'updated_at') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'لا يمكن تعديل بنود فاتورة منشورة. اعمل void للفاتورة أولاً.'
    USING ERRCODE = 'P0001';
END;
$function$;
