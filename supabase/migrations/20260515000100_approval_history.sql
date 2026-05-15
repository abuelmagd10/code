-- ============================================================
-- Phase R2 — Approval History Infrastructure
-- ============================================================
-- جدول مركزي لتسجيل كل إجراء في دورات الاعتماد عبر كل الـ modules.
-- خاصية: IMMUTABLE — لا يُسمح بـ UPDATE أو DELETE أبداً.
-- ============================================================

-- ── 1. الجدول ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.approval_history (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       UUID        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,

  -- نوع المورد ورقم السجل
  reference_type   TEXT        NOT NULL
    CHECK (reference_type IN (
      'bom_version',        -- نسخة قائمة المواد
      'routing',            -- مسار التصنيع
      'production_order',   -- أمر الإنتاج
      'material_issue',     -- طلب صرف مواد
      'product_receive'     -- طلب استلام منتج نهائي
    )),
  reference_id     UUID        NOT NULL,

  -- رقم دورة الاعتماد (يزيد بـ 1 عند كل إعادة دورة بسبب تعديل)
  cycle_no         INTEGER     NOT NULL DEFAULT 1,

  -- الإجراء المُنفَّذ
  action           TEXT        NOT NULL
    CHECK (action IN (
      'submitted',                   -- أُرسل للاعتماد (أول مرة)
      're_submitted',                -- أُعيد إرساله بعد رفض أو تعديل
      'approved',                    -- مُوافَق عليه (stage 1 أو نهائي)
      'approved_management',         -- مُوافَق عليه من الإدارة (stage 1 في MI)
      'approved_warehouse',          -- مُوافَق عليه من المخزن (stage 2 في MI)
      'rejected',                    -- مرفوض
      'rejected_management',         -- مرفوض من الإدارة (stage 1 في MI)
      'edit_triggered_reapproval',   -- تعديل أعاد دورة الاعتماد
      'cancelled'                    -- ملغى
    )),

  -- من قام بالإجراء
  actor_id         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  actor_role       TEXT        NOT NULL,

  -- سبب الرفض أو ملاحظة
  reason           TEXT,

  -- snapshot للبيانات الجوهرية وقت الإجراء (للـ audit)
  -- مثال: { "status_before": "draft", "status_after": "pending_approval", "bom_code": "BOM-001" }
  snapshot_data    JSONB,

  -- branch_id للفلترة والتتبع (اختياري)
  branch_id        UUID        REFERENCES public.branches(id) ON DELETE SET NULL,

  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 2. Indexes ───────────────────────────────────────────────

-- الأكثر استخداماً: جلب تاريخ سجل معين
CREATE INDEX IF NOT EXISTS idx_approval_history_ref
  ON public.approval_history (company_id, reference_type, reference_id, created_at DESC);

-- جلب كل إجراءات دورة معينة
CREATE INDEX IF NOT EXISTS idx_approval_history_cycle
  ON public.approval_history (reference_id, cycle_no, created_at DESC);

-- جلب كل إجراءات actor معين
CREATE INDEX IF NOT EXISTS idx_approval_history_actor
  ON public.approval_history (company_id, actor_id, created_at DESC);

-- ── 3. RLS ───────────────────────────────────────────────────

ALTER TABLE public.approval_history ENABLE ROW LEVEL SECURITY;

-- SELECT: أعضاء الشركة يرون سجل شركتهم
CREATE POLICY "approval_history_select"
  ON public.approval_history
  FOR SELECT
  USING (
    company_id IN (SELECT public.get_user_company_ids())
  );

-- INSERT: أعضاء الشركة يُدرجون عبر API فقط (لا مباشرة من العميل)
-- ملاحظة: الـ INSERT يتم حصراً من server-side عبر service_role أو RPC
CREATE POLICY "approval_history_insert"
  ON public.approval_history
  FOR INSERT
  WITH CHECK (
    company_id IN (SELECT public.get_user_company_ids())
  );

-- UPDATE: ممنوع تماماً (immutable audit trail)
-- لا نُنشئ policy لـ UPDATE → default deny

-- DELETE: ممنوع تماماً
-- لا نُنشئ policy لـ DELETE → default deny

-- ── 4. Helper RPC: تسجيل إجراء اعتماد ──────────────────────

CREATE OR REPLACE FUNCTION public.record_approval_action(
  p_company_id     UUID,
  p_reference_type TEXT,
  p_reference_id   UUID,
  p_cycle_no       INTEGER,
  p_action         TEXT,
  p_actor_id       UUID,
  p_actor_role     TEXT,
  p_reason         TEXT     DEFAULT NULL,
  p_snapshot_data  JSONB    DEFAULT NULL,
  p_branch_id      UUID     DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO public.approval_history (
    company_id, reference_type, reference_id,
    cycle_no, action, actor_id, actor_role,
    reason, snapshot_data, branch_id
  ) VALUES (
    p_company_id, p_reference_type, p_reference_id,
    p_cycle_no, p_action, p_actor_id, p_actor_role,
    p_reason, p_snapshot_data, p_branch_id
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- ── 5. Helper RPC: جلب التاريخ الكامل لسجل ─────────────────

CREATE OR REPLACE FUNCTION public.get_approval_history(
  p_company_id     UUID,
  p_reference_type TEXT,
  p_reference_id   UUID
)
RETURNS TABLE (
  id             UUID,
  cycle_no       INTEGER,
  action         TEXT,
  actor_id       UUID,
  actor_role     TEXT,
  reason         TEXT,
  snapshot_data  JSONB,
  created_at     TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- التحقق من أن المستخدم ينتمي لهذه الشركة
  IF NOT EXISTS (
    SELECT 1 FROM public.get_user_company_ids() cid
    WHERE cid = p_company_id
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN QUERY
  SELECT
    ah.id, ah.cycle_no, ah.action,
    ah.actor_id, ah.actor_role,
    ah.reason, ah.snapshot_data, ah.created_at
  FROM public.approval_history ah
  WHERE ah.company_id     = p_company_id
    AND ah.reference_type = p_reference_type
    AND ah.reference_id   = p_reference_id
  ORDER BY ah.created_at ASC;
END;
$$;

-- ── 6. Comment ───────────────────────────────────────────────

COMMENT ON TABLE public.approval_history IS
  'Immutable audit trail for all approval workflow actions. '
  'Records every submit/approve/reject/re-submit across BOM versions, '
  'production orders, material issues, and product receives. '
  'Part of Phase R2 — Approval History Infrastructure.';
