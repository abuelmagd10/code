-- v3.74.634 — Completion gate helper for the stock-withdrawal approval workflow.
--
-- Returns true when the booking still has a SELECTED attached (consumed) item
-- whose product is flagged requires_withdrawal_approval but has NO approved
-- withdrawal yet. The complete route calls this and blocks completion (409)
-- until the branch warehouse manager approves (or the executor unchecks the
-- item). Only flagged products can block; the default (false) never does.

CREATE OR REPLACE FUNCTION public.booking_blocking_withdrawals_exist(p_company_id uuid, p_booking_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
      FROM public.get_booking_line_additions(p_booking_id) gla
      JOIN public.products p ON p.id = gla.product_id
      LEFT JOIN public.booking_stock_withdrawals w
        ON w.booking_id = p_booking_id
       AND w.bundle_item_id = gla.bundle_item_id
       AND w.status = 'approved'
     WHERE gla.kind <> 'extra'
       AND COALESCE(p.requires_withdrawal_approval, false) = true
       AND w.id IS NULL
  );
$function$;

GRANT EXECUTE ON FUNCTION public.booking_blocking_withdrawals_exist(uuid, uuid) TO authenticated;
