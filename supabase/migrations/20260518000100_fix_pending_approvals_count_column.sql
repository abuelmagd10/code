-- ============================================================
-- Migration: 20260518000100_fix_pending_approvals_count_column.sql
-- Fix: get_pending_approvals_count references 'approval_status'
--       on manufacturing_production_orders, but the column is 'status'.
--       PostgreSQL error 42703 (undefined column).
-- ============================================================

DROP FUNCTION IF EXISTS public.get_pending_approvals_count(uuid, uuid);

CREATE OR REPLACE FUNCTION public.get_pending_approvals_count(
  p_company_id uuid,
  p_user_id    uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_role        text;
  v_bom_count   integer := 0;
  v_rv_count    integer := 0;
  v_po_count    integer := 0;
  v_mi_count    integer := 0;
BEGIN
  -- التحقق من الدور
  SELECT role INTO v_role
  FROM public.company_members
  WHERE company_id = p_company_id
    AND user_id    = p_user_id
  LIMIT 1;

  -- يُعيد 0 لغير الأدوار الإدارية العليا
  IF v_role NOT IN ('admin', 'owner', 'general_manager', 'manager') THEN
    RETURN 0;
  END IF;

  -- BOM versions بانتظار الاعتماد
  SELECT COUNT(*) INTO v_bom_count
  FROM public.manufacturing_bom_versions
  WHERE company_id = p_company_id
    AND status     = 'pending_approval';

  -- Routing versions بانتظار الاعتماد (uses approval_status column)
  SELECT COUNT(*) INTO v_rv_count
  FROM public.manufacturing_routing_versions
  WHERE company_id      = p_company_id
    AND approval_status = 'pending_approval';

  -- Production orders بانتظار الاعتماد (uses status column, NOT approval_status)
  SELECT COUNT(*) INTO v_po_count
  FROM public.manufacturing_production_orders
  WHERE company_id = p_company_id
    AND status     = 'pending_approval';

  -- Material issues — Stage 1 فقط (انتظار موافقة الإدارة)
  SELECT COUNT(*) INTO v_mi_count
  FROM public.manufacturing_material_issue_approvals
  WHERE company_id = p_company_id
    AND status     = 'pending';

  RETURN v_bom_count + v_rv_count + v_po_count + v_mi_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_pending_approvals_count(uuid, uuid)
  TO authenticated, anon;
