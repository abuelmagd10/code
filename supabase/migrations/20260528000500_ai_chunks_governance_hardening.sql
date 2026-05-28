-- v3.58.5 — Defense in Depth: DB-level governance on ai_knowledge_chunks
-- =====================================================================
-- Previously, governance was enforced only client-side in /api/ai/find-page.
-- An authenticated user could bypass the API and query the chunks table
-- directly via Supabase REST, exposing titles/descriptions of admin pages
-- they shouldn't even know exist.
--
-- This migration adds:
--   1. ai_resource_for_page_key(text)           — page_key -> resource mapper
--   2. ai_current_user_is_full_access()         — owner/admin/general_manager check
--   3. ai_current_user_allowed_resources()      — full resource set for the user
--   4. populates resource column on existing chunks
--   5. tightens the SELECT RLS policy
-- =====================================================================

-- 1. Pure mapping from page_key -> resource.
CREATE OR REPLACE FUNCTION public.ai_resource_for_page_key(p_page_key TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT CASE LOWER(COALESCE(p_page_key, ''))
    WHEN 'dashboard' THEN 'dashboard'
    WHEN 'dashboard_reports' THEN 'dashboard'
    WHEN 'invoices' THEN 'invoices'
    WHEN 'sales_orders' THEN 'sales_orders'
    WHEN 'sales_return_requests' THEN 'sales_return_requests'
    WHEN 'sales_returns' THEN 'sales_returns'
    WHEN 'sent_invoice_returns' THEN 'sent_invoice_returns'
    WHEN 'estimates' THEN 'estimates'
    WHEN 'customer_debit_notes' THEN 'customer_debit_notes'
    WHEN 'customer_credits' THEN 'customer_credits'
    WHEN 'customer_refund_requests' THEN 'customer_credits'
    WHEN 'sales_reports' THEN 'reports'
    WHEN 'sales_bonus_reports' THEN 'payroll'
    WHEN 'shipping_reports' THEN 'reports'
    WHEN 'bills' THEN 'bills'
    WHEN 'purchase_orders' THEN 'purchase_orders'
    WHEN 'purchase_returns' THEN 'purchase_returns'
    WHEN 'vendor_credits' THEN 'vendor_credits'
    WHEN 'purchase_reports' THEN 'reports'
    WHEN 'supplier_price_comparison' THEN 'reports'
    WHEN 'customers' THEN 'customers'
    WHEN 'suppliers' THEN 'suppliers'
    WHEN 'shareholders' THEN 'shareholders'
    WHEN 'employees' THEN 'employees'
    WHEN 'products' THEN 'products'
    WHEN 'inventory' THEN 'inventory'
    WHEN 'inventory_transfers' THEN 'inventory_transfers'
    WHEN 'inventory_goods_receipt' THEN 'inventory_goods_receipt'
    WHEN 'inventory_dispatch_approvals' THEN 'dispatch_approvals'
    WHEN 'product_availability' THEN 'product_availability'
    WHEN 'third_party_inventory' THEN 'third_party_inventory'
    WHEN 'write_offs' THEN 'write_offs'
    WHEN 'inventory_reports' THEN 'reports'
    WHEN 'product_reports' THEN 'reports'
    WHEN 'journal' THEN 'journal_entries'
    WHEN 'chart_of_accounts' THEN 'chart_of_accounts'
    WHEN 'accounting_periods' THEN 'accounting_periods'
    WHEN 'annual_closing' THEN 'annual_closing'
    WHEN 'drawings' THEN 'drawings'
    WHEN 'payments' THEN 'payments'
    WHEN 'expenses' THEN 'expenses'
    WHEN 'banking' THEN 'banking'
    WHEN 'income_statement' THEN 'reports'
    WHEN 'balance_sheet' THEN 'reports'
    WHEN 'accounting_validation' THEN 'reports'
    WHEN 'trial_balance' THEN 'reports'
    WHEN 'cash_flow' THEN 'reports'
    WHEN 'vat_reports' THEN 'reports'
    WHEN 'financial_trace_reports' THEN 'reports'
    WHEN 'equity_changes' THEN 'reports'
    WHEN 'aging_ar' THEN 'customers'
    WHEN 'aging_ap' THEN 'suppliers'
    WHEN 'daily_payments_receipts' THEN 'payments'
    WHEN 'update_account_balances' THEN 'chart_of_accounts'
    WHEN 'simple_summary_reports' THEN 'reports'
    WHEN 'reports' THEN 'reports'
    WHEN 'payroll' THEN 'payroll'
    WHEN 'attendance' THEN 'attendance'
    WHEN 'attendance_daily' THEN 'attendance'
    WHEN 'attendance_devices' THEN 'attendance'
    WHEN 'attendance_reports' THEN 'attendance'
    WHEN 'attendance_settings' THEN 'attendance'
    WHEN 'attendance_shifts' THEN 'attendance'
    WHEN 'attendance_anomalies' THEN 'attendance'
    WHEN 'fixed_assets' THEN 'fixed_assets'
    WHEN 'asset_categories' THEN 'asset_categories'
    WHEN 'fixed_assets_reports' THEN 'fixed_assets_reports'
    WHEN 'branches' THEN 'branches'
    WHEN 'warehouses' THEN 'warehouses'
    WHEN 'cost_centers' THEN 'cost_centers'
    WHEN 'cost_center_reports' THEN 'cost_centers'
    WHEN 'login_activity' THEN 'settings'
    WHEN 'settings_users' THEN 'users'
    WHEN 'settings_taxes' THEN 'taxes'
    WHEN 'settings_exchange_rates' THEN 'exchange_rates'
    WHEN 'settings_shipping' THEN 'shipping'
    WHEN 'settings_audit_log' THEN 'audit_log'
    WHEN 'settings_backup' THEN 'backup'
    WHEN 'settings_orders_rules' THEN 'orders_rules'
    WHEN 'settings_profile' THEN 'profile'
    WHEN 'settings_tooltips' THEN 'settings'
    WHEN 'settings_commissions' THEN 'settings'
    WHEN 'settings_accounting_maintenance' THEN 'accounting_maintenance'
    WHEN 'settings' THEN 'settings'
    WHEN 'manufacturing_boms' THEN 'manufacturing_boms'
    WHEN 'manufacturing_routings' THEN 'manufacturing_boms'
    WHEN 'manufacturing_production_orders' THEN 'manufacturing_boms'
    WHEN 'manufacturing_bom_detail' THEN 'manufacturing_boms'
    WHEN 'manufacturing_routing_detail' THEN 'manufacturing_boms'
    WHEN 'manufacturing_production_order_detail' THEN 'manufacturing_boms'
    ELSE NULL
  END;
$$;

-- 2. Is the current user a full-access role anywhere?
CREATE OR REPLACE FUNCTION public.ai_current_user_is_full_access()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.company_members cm
    WHERE cm.user_id = auth.uid()
      AND LOWER(TRIM(cm.role)) IN ('owner', 'admin', 'general_manager')
  );
$$;

-- 3. Union of allowed_resources across all the user's memberships.
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

  RETURN ARRAY(SELECT DISTINCT unnest(v_set) WHERE unnest IS NOT NULL);
END;
$$;

-- 4. Indexer now populates the resource column.
CREATE OR REPLACE FUNCTION public.ai_reindex_page_guides()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count INTEGER := 0;
  v_guide RECORD;
  v_max INTEGER;
  v_i INTEGER;
  v_txt_ar TEXT;
  v_txt_en TEXT;
  v_res TEXT;
BEGIN
  DELETE FROM public.ai_knowledge_chunks
  WHERE source_type LIKE 'page_guide%' AND company_id IS NULL;

  FOR v_guide IN
    SELECT page_key,
           COALESCE(title_ar,'') AS title_ar,
           COALESCE(title_en,'') AS title_en,
           COALESCE(description_ar,'') AS description_ar,
           COALESCE(description_en,'') AS description_en,
           COALESCE(steps_ar,'[]'::jsonb) AS steps_ar,
           COALESCE(steps_en,'[]'::jsonb) AS steps_en,
           COALESCE(tips_ar,ARRAY[]::text[]) AS tips_ar,
           COALESCE(tips_en,ARRAY[]::text[]) AS tips_en
    FROM public.page_guides WHERE is_active = TRUE
  LOOP
    v_res := public.ai_resource_for_page_key(v_guide.page_key);

    INSERT INTO public.ai_knowledge_chunks (source_type,source_key,source_field,content_ar,content_en,resource,company_id,metadata)
    VALUES ('page_guide_title',v_guide.page_key,NULL,v_guide.title_ar,v_guide.title_en,v_res,NULL,
            jsonb_build_object('page_key',v_guide.page_key));
    v_count := v_count + 1;

    IF length(v_guide.description_ar)>0 OR length(v_guide.description_en)>0 THEN
      INSERT INTO public.ai_knowledge_chunks (source_type,source_key,source_field,content_ar,content_en,resource,company_id,metadata)
      VALUES ('page_guide_description',v_guide.page_key,NULL,v_guide.description_ar,v_guide.description_en,v_res,NULL,
              jsonb_build_object('page_key',v_guide.page_key));
      v_count := v_count + 1;
    END IF;

    v_max := GREATEST(jsonb_array_length(v_guide.steps_ar), jsonb_array_length(v_guide.steps_en));
    FOR v_i IN 0..(v_max-1) LOOP
      v_txt_ar := COALESCE(v_guide.steps_ar ->> v_i,'');
      v_txt_en := COALESCE(v_guide.steps_en ->> v_i,'');
      IF length(v_txt_ar)>0 OR length(v_txt_en)>0 THEN
        INSERT INTO public.ai_knowledge_chunks (source_type,source_key,source_field,content_ar,content_en,resource,company_id,metadata)
        VALUES ('page_guide_step',v_guide.page_key,'step:'||v_i::TEXT,v_txt_ar,v_txt_en,v_res,NULL,
                jsonb_build_object('page_key',v_guide.page_key,'index',v_i));
        v_count := v_count + 1;
      END IF;
    END LOOP;

    v_max := GREATEST(
      COALESCE(array_length(v_guide.tips_ar,1),0),
      COALESCE(array_length(v_guide.tips_en,1),0)
    );
    FOR v_i IN 1..v_max LOOP
      v_txt_ar := COALESCE(v_guide.tips_ar[v_i],'');
      v_txt_en := COALESCE(v_guide.tips_en[v_i],'');
      IF length(v_txt_ar)>0 OR length(v_txt_en)>0 THEN
        INSERT INTO public.ai_knowledge_chunks (source_type,source_key,source_field,content_ar,content_en,resource,company_id,metadata)
        VALUES ('page_guide_tip',v_guide.page_key,'tip:'||(v_i-1)::TEXT,v_txt_ar,v_txt_en,v_res,NULL,
                jsonb_build_object('page_key',v_guide.page_key,'index',v_i-1));
        v_count := v_count + 1;
      END IF;
    END LOOP;
  END LOOP;

  RETURN v_count;
END;
$$;

-- 5. Run the indexer.
SELECT public.ai_reindex_page_guides() AS rows_after_resource_fill;

-- 6. Tighten SELECT RLS.
DROP POLICY IF EXISTS "ai_knowledge_chunks_select" ON public.ai_knowledge_chunks;

CREATE POLICY "ai_knowledge_chunks_select" ON public.ai_knowledge_chunks
  FOR SELECT
  USING (
    (company_id IS NULL AND (
      resource IS NULL
      OR public.ai_current_user_is_full_access()
      OR resource = ANY(public.ai_current_user_allowed_resources())
    ))
    OR
    (company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid())
     AND (
       resource IS NULL
       OR public.ai_current_user_is_full_access()
       OR resource = ANY(public.ai_current_user_allowed_resources())
     ))
  );
