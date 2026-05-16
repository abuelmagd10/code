-- ============================================================
-- Migration: 20260516000200_fix_approval_count_rpcs.sql
-- Stage 2 — Dual-badge fix for Material Issue two-stage workflow
--
-- المشكلة:
--   get_pending_approvals_count كانت تحسب MI بحالتي pending + management_approved
--   بعد الإصلاح: pending فقط للإدارة، management_approved للمخزن
--
-- التغييرات:
--   1. إعادة إنشاء get_pending_approvals_count → يحسب MI.pending فقط
--   2. إضافة get_pending_dispatch_count → يحسب MI.management_approved للمخزن
-- ============================================================

-- ── 1. تحديث get_pending_approvals_count ─────────────────────────────────────

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

  -- Routing versions بانتظار الاعتماد
  SELECT COUNT(*) INTO v_rv_count
  FROM public.manufacturing_routing_versions
  WHERE company_id      = p_company_id
    AND approval_status = 'pending_approval';

  -- Production orders بانتظار الاعتماد
  SELECT COUNT(*) INTO v_po_count
  FROM public.manufacturing_production_orders
  WHERE company_id      = p_company_id
    AND approval_status = 'pending_approval';

  -- Material issues — Stage 1 فقط (انتظار موافقة الإدارة)
  -- management_approved تذهب لـ get_pending_dispatch_count (مسؤول المخزن)
  SELECT COUNT(*) INTO v_mi_count
  FROM public.manufacturing_material_issue_approvals
  WHERE company_id = p_company_id
    AND status     = 'pending';

  RETURN v_bom_count + v_rv_count + v_po_count + v_mi_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_pending_approvals_count(uuid, uuid)
  TO authenticated, anon;

-- ── 2. إضافة get_pending_dispatch_count (جديدة للمخزن) ───────────────────────

DROP FUNCTION IF EXISTS public.get_pending_dispatch_count(uuid, uuid);

CREATE OR REPLACE FUNCTION public.get_pending_dispatch_count(
  p_company_id uuid,
  p_user_id    uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_role            text;
  v_warehouse_id    uuid;
  v_dispatch_count  integer := 0;
BEGIN
  -- جلب الدور والمخزن
  SELECT role, warehouse_id
  INTO   v_role, v_warehouse_id
  FROM   public.company_members
  WHERE  company_id = p_company_id
    AND  user_id    = p_user_id
  LIMIT 1;

  -- فقط مسؤولو المخازن والإدارة
  IF v_role NOT IN ('store_manager', 'warehouse_manager', 'admin', 'owner', 'general_manager', 'manager') THEN
    RETURN 0;
  END IF;

  -- Material issues — Stage 2 (وافقت الإدارة، بانتظار المخزن)
  IF v_role IN ('store_manager', 'warehouse_manager') AND v_warehouse_id IS NOT NULL THEN
    -- مسؤول المخزن يرى طلبات مخزنه فقط
    SELECT COUNT(*) INTO v_dispatch_count
    FROM public.manufacturing_material_issue_approvals
    WHERE company_id = p_company_id
      AND status     = 'management_approved'
      AND warehouse_id = v_warehouse_id;
  ELSE
    -- الإدارة العليا ترى كل الطلبات
    SELECT COUNT(*) INTO v_dispatch_count
    FROM public.manufacturing_material_issue_approvals
    WHERE company_id = p_company_id
      AND status     = 'management_approved';
  END IF;

  RETURN v_dispatch_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_pending_dispatch_count(uuid, uuid)
  TO authenticated, anon;

-- ── Verification ──────────────────────────────────────────────────────────────
-- SELECT get_pending_approvals_count('company-uuid', 'user-uuid');  -- يعيد BOMs+RVs+POs+MI.pending
-- SELECT get_pending_dispatch_count('company-uuid', 'user-uuid');   -- يعيد MI.management_approved
