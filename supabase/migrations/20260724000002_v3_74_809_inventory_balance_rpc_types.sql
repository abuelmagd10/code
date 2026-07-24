-- ============================================================================
-- v3.74.809 — دالة الرصيد المتاح: أنواع الإرجاع تطابق الـview + تأمين
-- ============================================================================
-- Owner-reported 400s in the booking addons panel:
--   POST /rest/v1/rpc/get_inventory_available_balance -> 400
-- Root cause: the function declared available_quantity as INTEGER while
-- the inventory_available_balance view returns BIGINT (SUM) -> 42804 at
-- runtime on every call. The invoices API had already worked around it
-- by querying the view directly (documented in app/api/invoices/route.ts);
-- the booking panel still called the broken RPC and silently degraded.
--
-- Fix (return type changed => DROP + CREATE):
--   * available_quantity: integer -> bigint (matches the view exactly)
--   * SECURITY DEFINER + assert_company_access(p_company_id) + REVOKE
--     PUBLIC/anon (the 805 hardening pattern for reader functions)
--
-- Verified (test first, then production, impersonated JWT):
--   * own company: rows returned, new purchase stock visible (زيت=2, booto=2)
--   * foreign company: blocked with «غير مصرح: هذه العملية تخص شركة أخرى»
-- ============================================================================

DROP FUNCTION IF EXISTS public.get_inventory_available_balance(uuid, uuid, uuid, uuid, uuid);

CREATE FUNCTION public.get_inventory_available_balance(
  p_company_id uuid,
  p_branch_id uuid DEFAULT NULL::uuid,
  p_warehouse_id uuid DEFAULT NULL::uuid,
  p_cost_center_id uuid DEFAULT NULL::uuid,
  p_product_id uuid DEFAULT NULL::uuid
)
RETURNS TABLE(
  company_id uuid, branch_id uuid, warehouse_id uuid, cost_center_id uuid,
  product_id uuid, available_quantity bigint, transaction_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM assert_company_access(p_company_id);

  RETURN QUERY
  SELECT
    iab.company_id, iab.branch_id, iab.warehouse_id, iab.cost_center_id,
    iab.product_id, iab.available_quantity, iab.transaction_count
  FROM inventory_available_balance iab
  WHERE iab.company_id = p_company_id
    AND (p_branch_id IS NULL OR iab.branch_id = p_branch_id)
    AND (p_warehouse_id IS NULL OR iab.warehouse_id = p_warehouse_id)
    AND (p_cost_center_id IS NULL OR iab.cost_center_id = p_cost_center_id)
    AND (p_product_id IS NULL OR iab.product_id = p_product_id);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_inventory_available_balance(uuid, uuid, uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_inventory_available_balance(uuid, uuid, uuid, uuid, uuid) TO authenticated;
