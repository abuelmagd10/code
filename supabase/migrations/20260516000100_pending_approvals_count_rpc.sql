-- ============================================================
-- Phase R8 — Pending Approvals Count RPC
-- ============================================================
-- دالة موحّدة لحساب عدد الموافقات المعلقة عبر كل وحدات التصنيع
-- تُستخدم لعرض Badge في الـ Sidebar للأدوار العليا
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_pending_approvals_count(
  p_company_id UUID,
  p_user_id    UUID
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role   TEXT;
  v_total  INTEGER := 0;
  v_count  INTEGER;
BEGIN
  -- جلب دور المستخدم
  SELECT role INTO v_role
  FROM public.company_members
  WHERE user_id = p_user_id
    AND company_id = p_company_id
  LIMIT 1;

  -- فقط الأدوار العليا ترى الـ badge (الأدوار الأخرى → 0)
  IF v_role NOT IN ('admin', 'owner', 'general_manager', 'manager') THEN
    RETURN 0;
  END IF;

  -- BOMs pending_approval
  SELECT COUNT(*) INTO v_count
  FROM public.manufacturing_bom_versions
  WHERE company_id = p_company_id
    AND status = 'pending_approval';
  v_total := v_total + COALESCE(v_count, 0);

  -- Routing versions pending_approval
  SELECT COUNT(*) INTO v_count
  FROM public.manufacturing_routing_versions
  WHERE company_id = p_company_id
    AND approval_status = 'pending_approval';
  v_total := v_total + COALESCE(v_count, 0);

  -- Production orders pending_approval
  SELECT COUNT(*) INTO v_count
  FROM public.manufacturing_production_orders
  WHERE company_id = p_company_id
    AND approval_status = 'pending_approval';
  v_total := v_total + COALESCE(v_count, 0);

  -- Material issue approvals: Stage 1 (management pending) + Stage 2 (warehouse pending)
  SELECT COUNT(*) INTO v_count
  FROM public.manufacturing_material_issue_approvals
  WHERE company_id = p_company_id
    AND status IN ('pending', 'management_approved');
  v_total := v_total + COALESCE(v_count, 0);

  RETURN v_total;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_pending_approvals_count(UUID, UUID)
  TO authenticated, anon;
