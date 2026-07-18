-- v3.74.700 — A SELECTED optional service item is governed exactly like a
-- mandatory one.
-- ------------------------------------------------------------------
-- Owner's rule: "optional" only means the executor may choose whether to
-- include the item while performing the service. Once selected, it must be
-- treated exactly like a mandatory service-linked item — including the store
-- manager's withdrawal approval.
--
-- What was wrong: the execution gate required an approved withdrawal only when
-- the PRODUCT carried requires_withdrawal_approval = true. So a bundle item with
-- stock deduction enabled but that flag off (e.g. "booto") was consumed from the
-- warehouse at execution with NO approval request and NO notification to the
-- store manager — stock left the branch silently. Note this was never about
-- optional vs mandatory: the gate already ignored is_optional. The hole was that
-- a single per-product checkbox could exempt an item that really does leave the
-- warehouse.
--
-- New rule: any service-linked item (kind <> 'extra') that will actually be
-- deducted (auto_deduct_inventory = true) requires an approved withdrawal —
-- regardless of the per-product flag. The product flag still works as an
-- additional trigger for items that need approval without auto-deduction.
--
-- Selection is honoured automatically: get_booking_line_additions only returns
-- optional items the executor actually selected (via booking_bundle_selections),
-- so an unselected optional item never blocks anything.
--
-- Sold products (kind = 'extra') are untouched — they leave the warehouse through
-- the invoice dispatch cycle ("مرسل"), not through this gate.
-- ------------------------------------------------------------------

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
       -- v3.74.700 — ANY service-linked item that will actually leave the
       -- warehouse requires the store manager's approval, whether it is
       -- mandatory or a SELECTED optional one.
       AND (
         COALESCE(gla.auto_deduct_inventory, false) = true
         OR COALESCE(p.requires_withdrawal_approval, false) = true
       )
       AND w.id IS NULL
  );
$function$;
