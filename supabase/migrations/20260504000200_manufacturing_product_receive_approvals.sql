-- =============================================================================
-- Manufacturing Product Receive Approvals
-- نظام اعتماد استلام المنتج النهائي من التصنيع
-- يتبع نفس نمط material_issue_approvals واعتماد استلام المشتريات
-- =============================================================================

-- 1. إضافة عمود حالة الاعتماد لجدول أوامر الإنتاج
ALTER TABLE public.manufacturing_production_orders
  ADD COLUMN IF NOT EXISTS product_receive_approval_status TEXT NOT NULL DEFAULT 'none'
    CHECK (product_receive_approval_status IN ('none', 'pending', 'approved', 'rejected'));

-- 2. إنشاء جدول طلبات اعتماد استلام المنتج النهائي
CREATE TABLE IF NOT EXISTS public.manufacturing_product_receive_approvals (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  production_order_id UUID NOT NULL REFERENCES public.manufacturing_production_orders(id) ON DELETE CASCADE,
  warehouse_id        UUID REFERENCES public.warehouses(id) ON DELETE RESTRICT,
  branch_id           UUID REFERENCES public.branches(id) ON DELETE RESTRICT,

  -- الكمية المقترحة للاستلام
  proposed_quantity   NUMERIC(18,4) NOT NULL,

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

-- 3. فهارس لتسريع الاستعلامات
CREATE INDEX IF NOT EXISTS idx_mpra_company_status
  ON public.manufacturing_product_receive_approvals(company_id, status);

CREATE INDEX IF NOT EXISTS idx_mpra_production_order
  ON public.manufacturing_product_receive_approvals(production_order_id);

CREATE INDEX IF NOT EXISTS idx_mpra_warehouse_branch
  ON public.manufacturing_product_receive_approvals(warehouse_id, branch_id);

-- 4. تفعيل RLS
ALTER TABLE public.manufacturing_product_receive_approvals ENABLE ROW LEVEL SECURITY;

-- 5. سياسات RLS
CREATE POLICY "mpra_company_members_can_read"
  ON public.manufacturing_product_receive_approvals FOR SELECT
  USING (
    company_id IN (
      SELECT company_id FROM public.company_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "mpra_company_members_can_insert"
  ON public.manufacturing_product_receive_approvals FOR INSERT
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM public.company_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "mpra_company_members_can_update"
  ON public.manufacturing_product_receive_approvals FOR UPDATE
  USING (
    company_id IN (
      SELECT company_id FROM public.company_members WHERE user_id = auth.uid()
    )
  );

-- 6. Trigger لتحديث updated_at تلقائياً
CREATE OR REPLACE FUNCTION public.update_mpra_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_mpra_updated_at
  BEFORE UPDATE ON public.manufacturing_product_receive_approvals
  FOR EACH ROW EXECUTE FUNCTION public.update_mpra_updated_at();

-- 7. تعليق توضيحي
COMMENT ON TABLE public.manufacturing_product_receive_approvals IS
  'طلبات اعتماد استلام المنتج النهائي من التصنيع - تتطلب موافقة مسؤول المخزن قبل إضافة المنتج للمستودع';
