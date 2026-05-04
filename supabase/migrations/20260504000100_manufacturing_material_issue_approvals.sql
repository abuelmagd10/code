-- =============================================================================
-- Manufacturing Material Issue Approvals
-- نظام اعتماد صرف المواد الخام للتصنيع
-- يتبع نفس نمط dispatch-approvals الموجود في المخزن
-- =============================================================================

-- 1. إضافة عمود حالة الاعتماد لجدول أوامر الإنتاج
ALTER TABLE public.manufacturing_production_orders
  ADD COLUMN IF NOT EXISTS material_issue_approval_status TEXT NOT NULL DEFAULT 'none'
    CHECK (material_issue_approval_status IN ('none', 'pending', 'approved', 'rejected'));

-- 2. إنشاء جدول طلبات اعتماد صرف المواد
CREATE TABLE IF NOT EXISTS public.manufacturing_material_issue_approvals (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  production_order_id UUID NOT NULL REFERENCES public.manufacturing_production_orders(id) ON DELETE CASCADE,
  warehouse_id        UUID REFERENCES public.warehouses(id) ON DELETE RESTRICT,
  branch_id           UUID REFERENCES public.branches(id) ON DELETE RESTRICT,

  -- من طلب الاعتماد
  requested_by        UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  requested_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes               TEXT,

  -- من وافق
  approved_by         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at         TIMESTAMPTZ,

  -- من رفض
  rejected_by         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  rejected_at         TIMESTAMPTZ,
  rejection_reason    TEXT,

  -- الحالة
  status              TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),

  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. فهرس لتسريع الاستعلامات
CREATE INDEX IF NOT EXISTS idx_mmia_company_status
  ON public.manufacturing_material_issue_approvals(company_id, status);

CREATE INDEX IF NOT EXISTS idx_mmia_production_order
  ON public.manufacturing_material_issue_approvals(production_order_id);

CREATE INDEX IF NOT EXISTS idx_mmia_warehouse_branch
  ON public.manufacturing_material_issue_approvals(warehouse_id, branch_id);

-- 4. تفعيل RLS
ALTER TABLE public.manufacturing_material_issue_approvals ENABLE ROW LEVEL SECURITY;

-- 5. سياسات RLS

-- القراءة: كل أعضاء الشركة
CREATE POLICY "mmia_company_members_can_read"
  ON public.manufacturing_material_issue_approvals FOR SELECT
  USING (
    company_id IN (
      SELECT company_id FROM public.company_members WHERE user_id = auth.uid()
    )
  );

-- الإدراج: أعضاء الشركة
CREATE POLICY "mmia_company_members_can_insert"
  ON public.manufacturing_material_issue_approvals FOR INSERT
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM public.company_members WHERE user_id = auth.uid()
    )
  );

-- التحديث: service_role فقط (عبر RPCs) أو الأعضاء
CREATE POLICY "mmia_company_members_can_update"
  ON public.manufacturing_material_issue_approvals FOR UPDATE
  USING (
    company_id IN (
      SELECT company_id FROM public.company_members WHERE user_id = auth.uid()
    )
  );

-- 6. Trigger لتحديث updated_at تلقائياً
CREATE OR REPLACE FUNCTION public.update_mmia_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_mmia_updated_at
  BEFORE UPDATE ON public.manufacturing_material_issue_approvals
  FOR EACH ROW EXECUTE FUNCTION public.update_mmia_updated_at();

-- 7. إضافة تعليق توضيحي
COMMENT ON TABLE public.manufacturing_material_issue_approvals IS
  'طلبات اعتماد صرف المواد الخام للتصنيع - تتطلب موافقة مسؤول المخزن قبل تنفيذ الصرف الفعلي';
