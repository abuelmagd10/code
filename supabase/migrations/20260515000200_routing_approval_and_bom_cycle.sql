-- ============================================================
-- Phase R3 — BOM cycle_no + Routing Approval Workflow
-- ============================================================

-- ── 1. إضافة cycle_no لـ manufacturing_bom_versions ─────────
-- يزيد بـ 1 عند كل إعادة دورة اعتماد بسبب تعديل بعد الموافقة

ALTER TABLE public.manufacturing_bom_versions
  ADD COLUMN IF NOT EXISTS cycle_no INTEGER NOT NULL DEFAULT 1;

-- ── 2. إضافة approval workflow لـ manufacturing_routing_versions
-- الـ status الحالي يعبّر عن دورة حياة التشغيل (draft/active/deactivated/archived)
-- approval_status يعبّر عن دورة الاعتماد (draft/pending_approval/approved/rejected)
-- يجب أن تكون approval_status = 'approved' قبل السماح بـ activate

ALTER TABLE public.manufacturing_routing_versions
  ADD COLUMN IF NOT EXISTS approval_status TEXT NOT NULL DEFAULT 'draft'
    CHECK (approval_status IN ('draft', 'pending_approval', 'approved', 'rejected')),
  ADD COLUMN IF NOT EXISTS cycle_no       INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS submitted_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS submitted_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_by    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejected_by    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rejected_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

-- ── 3. Index لتسريع جلب routing versions الانتظار الاعتماد ──

CREATE INDEX IF NOT EXISTS idx_routing_versions_approval_status
  ON public.manufacturing_routing_versions (company_id, approval_status)
  WHERE approval_status = 'pending_approval';

-- ── 4. Index مماثل لـ BOM versions ───────────────────────────

CREATE INDEX IF NOT EXISTS idx_bom_versions_pending_approval
  ON public.manufacturing_bom_versions (company_id, status)
  WHERE status = 'pending_approval';

-- ── 5. RPC: تقديم routing version للاعتماد ──────────────────

CREATE OR REPLACE FUNCTION public.submit_routing_version_for_approval_atomic(
  p_company_id        UUID,
  p_routing_version_id UUID,
  p_submitted_by      UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_version RECORD;
  v_op_count INTEGER;
BEGIN
  -- جلب النسخة
  SELECT * INTO v_version
  FROM public.manufacturing_routing_versions
  WHERE id = p_routing_version_id AND company_id = p_company_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'routing_version_not_found';
  END IF;

  -- يجب أن تكون في حالة draft أو rejected
  IF v_version.approval_status NOT IN ('draft', 'rejected') THEN
    RAISE EXCEPTION 'routing_version_not_submittable: current status is %', v_version.approval_status;
  END IF;

  -- يجب أن يكون هناك عمليات مضافة
  SELECT COUNT(*) INTO v_op_count
  FROM public.manufacturing_routing_operations
  WHERE routing_version_id = p_routing_version_id AND company_id = p_company_id;

  IF v_op_count = 0 THEN
    RAISE EXCEPTION 'routing_version_no_operations';
  END IF;

  -- تحديث الحالة
  UPDATE public.manufacturing_routing_versions SET
    approval_status = 'pending_approval',
    submitted_by    = p_submitted_by,
    submitted_at    = NOW(),
    -- إعادة تعيين حقول الرفض إذا كانت موجودة
    rejected_by     = NULL,
    rejected_at     = NULL,
    rejection_reason = NULL,
    updated_at      = NOW()
  WHERE id = p_routing_version_id AND company_id = p_company_id;

  RETURN jsonb_build_object(
    'routing_version_id', p_routing_version_id,
    'approval_status',    'pending_approval',
    'submitted_by',       p_submitted_by
  );
END;
$$;

-- ── 6. RPC: اعتماد routing version ───────────────────────────

CREATE OR REPLACE FUNCTION public.approve_routing_version_atomic(
  p_company_id        UUID,
  p_routing_version_id UUID,
  p_approved_by       UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_version RECORD;
BEGIN
  SELECT * INTO v_version
  FROM public.manufacturing_routing_versions
  WHERE id = p_routing_version_id AND company_id = p_company_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'routing_version_not_found'; END IF;

  IF v_version.approval_status != 'pending_approval' THEN
    RAISE EXCEPTION 'routing_version_not_pending: current status is %', v_version.approval_status;
  END IF;

  UPDATE public.manufacturing_routing_versions SET
    approval_status = 'approved',
    approved_by     = p_approved_by,
    approved_at     = NOW(),
    updated_at      = NOW()
  WHERE id = p_routing_version_id AND company_id = p_company_id;

  RETURN jsonb_build_object(
    'routing_version_id', p_routing_version_id,
    'approval_status',    'approved',
    'approved_by',        p_approved_by
  );
END;
$$;

-- ── 7. RPC: رفض routing version ──────────────────────────────

CREATE OR REPLACE FUNCTION public.reject_routing_version_atomic(
  p_company_id        UUID,
  p_routing_version_id UUID,
  p_rejected_by       UUID,
  p_rejection_reason  TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_version RECORD;
BEGIN
  SELECT * INTO v_version
  FROM public.manufacturing_routing_versions
  WHERE id = p_routing_version_id AND company_id = p_company_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'routing_version_not_found'; END IF;

  IF v_version.approval_status != 'pending_approval' THEN
    RAISE EXCEPTION 'routing_version_not_pending: current status is %', v_version.approval_status;
  END IF;

  IF p_rejection_reason IS NULL OR trim(p_rejection_reason) = '' THEN
    RAISE EXCEPTION 'rejection_reason_required';
  END IF;

  UPDATE public.manufacturing_routing_versions SET
    approval_status  = 'rejected',
    rejected_by      = p_rejected_by,
    rejected_at      = NOW(),
    rejection_reason = p_rejection_reason,
    updated_at       = NOW()
  WHERE id = p_routing_version_id AND company_id = p_company_id;

  RETURN jsonb_build_object(
    'routing_version_id', p_routing_version_id,
    'approval_status',    'rejected',
    'rejection_reason',   p_rejection_reason
  );
END;
$$;
