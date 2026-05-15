-- ============================================================
-- Phase R7 — Purchasing Officer Default Permissions
-- ============================================================
-- purchasing_officer يرث صلاحيات المحاسب + إدارة المشتريات
-- مع رؤية الفواتير عبر الفروع (cross-branch Bills visibility)
-- ============================================================

CREATE OR REPLACE FUNCTION public.seed_purchasing_officer_permissions(p_company_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.company_role_permissions
    (company_id, role, resource, can_access, can_read, can_write, can_update, can_delete, all_access, allowed_actions)
  VALUES
    -- ── المشتريات: كل الصلاحيات ─────────────────────────────
    (p_company_id, 'purchasing_officer', 'bills',             true, true, true,  true,  false, false, ARRAY[]::TEXT[]),
    (p_company_id, 'purchasing_officer', 'suppliers',         true, true, true,  true,  false, false, ARRAY[]::TEXT[]),
    (p_company_id, 'purchasing_officer', 'purchase_orders',   true, true, true,  true,  false, false, ARRAY[]::TEXT[]),
    (p_company_id, 'purchasing_officer', 'purchase_returns',  true, true, true,  true,  false, false, ARRAY[]::TEXT[]),
    (p_company_id, 'purchasing_officer', 'vendor_credits',    true, true, true,  true,  false, false, ARRAY[]::TEXT[]),
    -- ── المحاسبة (موروثة من المحاسب): قراءة فقط بشكل افتراضي ─
    (p_company_id, 'purchasing_officer', 'payments',          true, true, true,  false, false, false, ARRAY[]::TEXT[]),
    (p_company_id, 'purchasing_officer', 'expenses',          true, true, true,  true,  false, false, ARRAY[]::TEXT[]),
    (p_company_id, 'purchasing_officer', 'journal_entries',   true, true, false, false, false, false, ARRAY[]::TEXT[]),
    (p_company_id, 'purchasing_officer', 'chart_of_accounts', true, true, false, false, false, false, ARRAY[]::TEXT[]),
    (p_company_id, 'purchasing_officer', 'banking',           true, true, false, false, false, false, ARRAY[]::TEXT[]),
    (p_company_id, 'purchasing_officer', 'fixed_assets',      true, true, false, false, false, false, ARRAY[]::TEXT[]),
    (p_company_id, 'purchasing_officer', 'reports',           true, true, false, false, false, false, ARRAY[]::TEXT[]),
    -- ── المخزون (مرتبط بالمشتريات) ──────────────────────────
    (p_company_id, 'purchasing_officer', 'products',          true, true, false, false, false, false, ARRAY[]::TEXT[]),
    (p_company_id, 'purchasing_officer', 'inventory',         true, true, false, false, false, false, ARRAY[]::TEXT[]),
    (p_company_id, 'purchasing_officer', 'inventory_goods_receipt', true, true, true, true, false, false, ARRAY[]::TEXT[]),
    -- ── لوحة التحكم ──────────────────────────────────────────
    (p_company_id, 'purchasing_officer', 'dashboard',         true, true, false, false, false, false, ARRAY[]::TEXT[])
  ON CONFLICT (company_id, role, resource) DO NOTHING;
END;
$$;

-- تشغيل تلقائي للشركات التي لديها purchasing_officer بالفعل ولا تملك صلاحيات له
DO $$
DECLARE
  v_company_id UUID;
BEGIN
  FOR v_company_id IN
    SELECT DISTINCT cm.company_id
    FROM public.company_members cm
    WHERE cm.role = 'purchasing_officer'
    AND NOT EXISTS (
      SELECT 1 FROM public.company_role_permissions crp
      WHERE crp.company_id = cm.company_id
      AND crp.role = 'purchasing_officer'
    )
  LOOP
    PERFORM public.seed_purchasing_officer_permissions(v_company_id);
  END LOOP;
END;
$$;
