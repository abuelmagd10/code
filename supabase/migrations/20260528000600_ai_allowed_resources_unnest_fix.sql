-- v3.58.6 hotfix — Fix syntax error in ai_current_user_allowed_resources
-- =====================================================================
-- The previous version used:
--   RETURN ARRAY(SELECT DISTINCT unnest(v_set) WHERE unnest IS NOT NULL);
-- which fails with: column "unnest" does not exist
--
-- The correct PostgreSQL idiom is to alias the unnest output:
--   RETURN ARRAY(SELECT DISTINCT x FROM unnest(v_set) AS x WHERE x IS NOT NULL);
--
-- Symptom: /api/ai/find-page returned matches=[] for ALL users (even
-- owner) because the RLS policy's OR chain forced both branches to
-- evaluate, and the broken function bubbled up the error which caused
-- the RPC to silently fall through to zero rows.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.ai_current_user_allowed_resources()
RETURNS TEXT[]
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_set TEXT[] := ARRAY[]::TEXT[];
  v_role TEXT;
  v_default TEXT[];
  v_perm RECORD;
BEGIN
  FOR v_role IN
    SELECT DISTINCT LOWER(TRIM(role))
    FROM public.company_members
    WHERE user_id = auth.uid()
  LOOP
    v_default := CASE v_role
      WHEN 'manager' THEN ARRAY[
        'dashboard','reports','invoices','customers','estimates',
        'sales_orders','sales_returns','sent_invoice_returns',
        'customer_debit_notes','bills','suppliers','purchase_orders',
        'purchase_returns','vendor_credits','manufacturing_boms',
        'products','inventory','inventory_transfers','write_offs',
        'third_party_inventory','product_availability',
        'inventory_goods_receipt','payments','expenses','drawings',
        'journal_entries','banking','chart_of_accounts','fixed_assets',
        'asset_categories','fixed_assets_reports','annual_closing',
        'hr','employees','attendance','payroll','instant_payouts',
        'branches','cost_centers','warehouses']
      WHEN 'accountant' THEN ARRAY[
        'dashboard','reports','invoices','customers','sales_returns',
        'customer_debit_notes','bills','suppliers','purchase_returns',
        'vendor_credits','payments','expenses','drawings',
        'journal_entries','chart_of_accounts','banking','annual_closing',
        'accounting_periods','shareholders','fixed_assets',
        'asset_categories','fixed_assets_reports','taxes',
        'exchange_rates','accounting_maintenance','products','inventory',
        'inventory_transfers','write_offs','third_party_inventory',
        'product_availability','inventory_goods_receipt']
      WHEN 'store_manager' THEN ARRAY[
        'dashboard','manufacturing_boms','products','inventory',
        'product_availability','inventory_transfers',
        'third_party_inventory','write_offs','inventory_goods_receipt',
        'purchase_orders','sales_orders','shipping']
      WHEN 'manufacturing_officer' THEN ARRAY[
        'dashboard','manufacturing_boms','products','inventory',
        'product_availability','reports']
      WHEN 'booking_officer' THEN ARRAY[
        'dashboard','bookings','services','customers','payments','reports']
      WHEN 'purchasing_officer' THEN ARRAY[
        'dashboard','reports','bills','suppliers','purchase_orders',
        'purchase_returns','vendor_credits','payments','expenses',
        'drawings','journal_entries','chart_of_accounts','banking',
        'annual_closing','accounting_periods','shareholders',
        'fixed_assets','asset_categories','fixed_assets_reports',
        'taxes','exchange_rates','accounting_maintenance','products',
        'inventory','inventory_transfers','inventory_goods_receipt',
        'product_availability','write_offs','third_party_inventory']
      WHEN 'staff' THEN ARRAY[
        'dashboard','customers','estimates','sales_orders','invoices',
        'inventory','product_availability','attendance']
      WHEN 'sales' THEN ARRAY[
        'dashboard','customers','estimates','sales_orders','invoices',
        'product_availability']
      WHEN 'employee' THEN ARRAY['dashboard','attendance']
      WHEN 'viewer' THEN ARRAY['dashboard','reports']
      ELSE ARRAY[]::TEXT[]
    END;
    v_set := v_set || v_default;
  END LOOP;

  FOR v_perm IN
    SELECT crp.resource, crp.can_access
    FROM public.company_role_permissions crp
    JOIN public.company_members cm
      ON cm.company_id = crp.company_id
     AND LOWER(TRIM(cm.role)) = LOWER(TRIM(crp.role))
    WHERE cm.user_id = auth.uid()
  LOOP
    IF v_perm.can_access IS FALSE THEN
      v_set := array_remove(v_set, v_perm.resource);
    ELSIF v_perm.can_access IS TRUE AND v_perm.resource IS NOT NULL THEN
      v_set := v_set || ARRAY[v_perm.resource];
    END IF;
  END LOOP;

  v_set := v_set || ARRAY['dashboard'];

  -- FIXED: proper unnest aliasing
  RETURN ARRAY(SELECT DISTINCT x FROM unnest(v_set) AS x WHERE x IS NOT NULL);
END;
$$;
