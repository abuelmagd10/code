-- ============================================================
-- Phase R4 — Production Order Approval Workflow
-- ============================================================
-- approval_status يتتبع دورة الاعتماد (منفصل عن status التشغيلي)
-- status التشغيلي: draft → released → in_progress → completed → closed
-- approval_status: draft → pending_approval → approved/rejected
-- يجب أن تكون approval_status = 'approved' قبل السماح بـ release
-- ============================================================

ALTER TABLE public.manufacturing_production_orders
  ADD COLUMN IF NOT EXISTS approval_status   TEXT NOT NULL DEFAULT 'draft'
    CHECK (approval_status IN ('draft','pending_approval','approved','rejected')),
  ADD COLUMN IF NOT EXISTS cycle_no          INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS submitted_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS submitted_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS po_approved_by    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS po_approved_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS po_rejected_by    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS po_rejected_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS po_rejection_reason TEXT;

-- ملاحظة: استخدمنا po_approved_by/po_rejected_by لتجنب تعارض أسماء الأعمدة
-- مع الأعمدة الموجودة مسبقاً (released_by, cancelled_by…)

-- Index لتسريع جلب أوامر الانتظار
CREATE INDEX IF NOT EXISTS idx_production_orders_approval_status
  ON public.manufacturing_production_orders (company_id, approval_status)
  WHERE approval_status = 'pending_approval';

-- ── RPC: تقديم أمر الإنتاج للاعتماد ─────────────────────────

CREATE OR REPLACE FUNCTION public.submit_production_order_for_approval_atomic(
  p_company_id          UUID,
  p_production_order_id UUID,
  p_submitted_by        UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order     RECORD;
  v_bom_status TEXT;
  v_routing_status TEXT;
BEGIN
  SELECT * INTO v_order
  FROM public.manufacturing_production_orders
  WHERE id = p_production_order_id AND company_id = p_company_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'production_order_not_found'; END IF;

  -- يجب أن تكون في draft أو rejected
  IF v_order.approval_status NOT IN ('draft', 'rejected') THEN
    RAISE EXCEPTION 'production_order_not_submittable: approval_status=%', v_order.approval_status;
  END IF;

  -- يجب أن يكون status = draft (لم يُصدَر بعد)
  IF v_order.status != 'draft' THEN
    RAISE EXCEPTION 'production_order_already_released: status=%', v_order.status;
  END IF;

  -- ✅ التحقق من اعتماد BOM version
  SELECT status INTO v_bom_status
  FROM public.manufacturing_bom_versions
  WHERE id = v_order.bom_version_id AND company_id = p_company_id;

  IF v_bom_status IS DISTINCT FROM 'approved' THEN
    RAISE EXCEPTION 'bom_version_not_approved: bom_version_status=%', COALESCE(v_bom_status, 'not_found');
  END IF;

  -- ✅ التحقق من اعتماد Routing version
  SELECT approval_status INTO v_routing_status
  FROM public.manufacturing_routing_versions
  WHERE id = v_order.routing_version_id AND company_id = p_company_id;

  IF v_routing_status IS DISTINCT FROM 'approved' THEN
    RAISE EXCEPTION 'routing_version_not_approved: routing_version_approval_status=%', COALESCE(v_routing_status, 'not_found');
  END IF;

  UPDATE public.manufacturing_production_orders SET
    approval_status    = 'pending_approval',
    submitted_by       = p_submitted_by,
    submitted_at       = NOW(),
    -- تصفير بيانات الرفض السابق
    po_rejected_by     = NULL,
    po_rejected_at     = NULL,
    po_rejection_reason = NULL,
    updated_at         = NOW()
  WHERE id = p_production_order_id AND company_id = p_company_id;

  RETURN jsonb_build_object(
    'production_order_id', p_production_order_id,
    'approval_status',     'pending_approval',
    'submitted_by',        p_submitted_by
  );
END;
$$;

-- ── RPC: اعتماد أمر الإنتاج ──────────────────────────────────

CREATE OR REPLACE FUNCTION public.approve_production_order_atomic(
  p_company_id          UUID,
  p_production_order_id UUID,
  p_approved_by         UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order RECORD;
BEGIN
  SELECT * INTO v_order
  FROM public.manufacturing_production_orders
  WHERE id = p_production_order_id AND company_id = p_company_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'production_order_not_found'; END IF;

  IF v_order.approval_status != 'pending_approval' THEN
    RAISE EXCEPTION 'production_order_not_pending: approval_status=%', v_order.approval_status;
  END IF;

  UPDATE public.manufacturing_production_orders SET
    approval_status  = 'approved',
    po_approved_by   = p_approved_by,
    po_approved_at   = NOW(),
    updated_at       = NOW()
  WHERE id = p_production_order_id AND company_id = p_company_id;

  RETURN jsonb_build_object(
    'production_order_id', p_production_order_id,
    'approval_status',     'approved',
    'approved_by',         p_approved_by
  );
END;
$$;

-- ── RPC: رفض أمر الإنتاج ─────────────────────────────────────

CREATE OR REPLACE FUNCTION public.reject_production_order_atomic(
  p_company_id          UUID,
  p_production_order_id UUID,
  p_rejected_by         UUID,
  p_rejection_reason    TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order RECORD;
BEGIN
  SELECT * INTO v_order
  FROM public.manufacturing_production_orders
  WHERE id = p_production_order_id AND company_id = p_company_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'production_order_not_found'; END IF;

  IF v_order.approval_status != 'pending_approval' THEN
    RAISE EXCEPTION 'production_order_not_pending: approval_status=%', v_order.approval_status;
  END IF;

  IF p_rejection_reason IS NULL OR trim(p_rejection_reason) = '' THEN
    RAISE EXCEPTION 'rejection_reason_required';
  END IF;

  UPDATE public.manufacturing_production_orders SET
    approval_status     = 'rejected',
    po_rejected_by      = p_rejected_by,
    po_rejected_at      = NOW(),
    po_rejection_reason = p_rejection_reason,
    updated_at          = NOW()
  WHERE id = p_production_order_id AND company_id = p_company_id;

  RETURN jsonb_build_object(
    'production_order_id', p_production_order_id,
    'approval_status',     'rejected',
    'rejection_reason',    p_rejection_reason
  );
END;
$$;
