-- ============================================================
-- Phase R5 — Material Issue Two-Stage Approval Workflow
-- ============================================================
-- Stage 1 (Management): pending → management_approved
-- Stage 2 (Warehouse):  management_approved → approved (issues materials)
-- Backward compat: warehouse can still approve from pending directly
-- ============================================================

-- ── 1. توسيع CHECK constraint ليشمل management_approved ──────

DO $$
DECLARE
  v_constraint_name TEXT;
BEGIN
  -- حذف الـ constraint القديم بأي اسم
  SELECT conname INTO v_constraint_name
  FROM pg_constraint
  WHERE conrelid = 'public.manufacturing_material_issue_approvals'::regclass
    AND contype = 'c'
    AND conname ILIKE '%status%'
  LIMIT 1;

  IF v_constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.manufacturing_material_issue_approvals DROP CONSTRAINT %I', v_constraint_name);
  END IF;

  -- إضافة constraint جديد يشمل جميع الحالات المعروفة
  ALTER TABLE public.manufacturing_material_issue_approvals
    ADD CONSTRAINT mmia_status_check
    CHECK (status IN (
      'pending',
      'management_approved',
      'partially_approved',
      'approved',
      'rejected',
      'cancelled'
    ));

EXCEPTION WHEN others THEN
  RAISE NOTICE 'Status constraint update note: %', SQLERRM;
END;
$$;

-- ── 2. أعمدة تتبع اعتماد الإدارة ─────────────────────────────

ALTER TABLE public.manufacturing_material_issue_approvals
  ADD COLUMN IF NOT EXISTS management_approved_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS management_approved_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS management_approved_notes TEXT;

-- ── 3. Index لتسريع جلب الطلبات المنتظرة لكل مرحلة ──────────

CREATE INDEX IF NOT EXISTS idx_mmia_management_pending
  ON public.manufacturing_material_issue_approvals (company_id, status)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_mmia_warehouse_pending
  ON public.manufacturing_material_issue_approvals (company_id, status)
  WHERE status = 'management_approved';
