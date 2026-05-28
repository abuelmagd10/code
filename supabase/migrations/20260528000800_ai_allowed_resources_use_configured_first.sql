-- v3.59.1 — Make company_role_permissions the single source of truth
-- =====================================================================
-- Before this change the function started with hardcoded DEFAULT_ROLE_PAGES
-- and then layered company_role_permissions on top. That meant a role like
-- store_manager would see resources from defaults (e.g. "shipping") even
-- when the admin never granted them in /settings/users.
--
-- New behaviour:
--   * If the role has ANY rows in company_role_permissions for this company,
--     use ONLY the explicitly-granted resources (can_access OR can_read OR
--     all_access). Defaults are ignored — the admin has taken control.
--   * If the role has NO rows for this company, fall back to defaults so
--     brand-new companies are not locked out before the admin configures
--     anything.
--   * 'dashboard' is always included (matches sidebar policy).
-- =====================================================================

CREATE OR REPLACE FUNCTION public.ai_current_user_allowed_resources()
RETURNS TEXT[]
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_set        TEXT[] := ARRAY[]::TEXT[];
  v_row        RECORD;
  v_default    TEXT[];
  v_has_config BOOLEAN;
BEGIN
  FOR v_row IN
    SELECT company_id, LOWER(TRIM(role)) AS role
    FROM public.company_members
    WHERE user_id = auth.uid()
  LOOP
    SELECT EXISTS (
      SELECT 1 FROM public.company_role_permissions crp
      WHERE crp.company_id = v_row.company_id
        AND LOWER(TRIM(crp.role)) = v_row.role
    ) INTO v_has_config;

    IF v_has_config THEN
      FOR v_row IN
        SELECT crp.resource
        FROM public.company_role_permissions crp
        WHERE crp.company_id = v_row.company_id
          AND LOWER(TRIM(crp.role)) = v_row.role
          AND (crp.can_access IS TRUE OR crp.can_read IS TRUE OR crp.all_access IS TRUE)
          AND crp.resource IS NOT NULL
      LOOP
        v_set := v_set || ARRAY[v_row.resource];
      END LOOP;
    ELSE
      v_default := CASE v_row.role
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
    END IF;
  END LOOP;

  v_set := v_set || ARRAY['dashboard'];

  RETURN ARRAY(SELECT DISTINCT x FROM unnest(v_set) AS x WHERE x IS NOT NULL);
END;
$$;
