-- =============================================================================
-- ربط شركات الشحن بالفروع (Branch-Based Shipping Providers)
-- جدول وسيط: أي شركة شحن تعمل في أي فرع
-- =============================================================================

-- 1) جدول الربط branch_shipping_providers
CREATE TABLE IF NOT EXISTS public.branch_shipping_providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  shipping_provider_id UUID NOT NULL REFERENCES public.shipping_providers(id) ON DELETE CASCADE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(branch_id, shipping_provider_id)
);

CREATE INDEX IF NOT EXISTS idx_branch_shipping_providers_branch
  ON public.branch_shipping_providers(branch_id);
CREATE INDEX IF NOT EXISTS idx_branch_shipping_providers_provider
  ON public.branch_shipping_providers(shipping_provider_id);

COMMENT ON TABLE public.branch_shipping_providers IS
  'ربط شركات الشحن بالفروع: تحديد أي شركة شحن تعمل في أي فرع للتحكم بالصلاحيات وتقارير الشحن';

-- 2) دالة التحقق: هل شركة الشحن مسموحة للفرع؟
-- إذا لم يكن هناك أي ربط للشركة (جدول فارغ لهذه الشركة) → نسمح لأي provider (توافق رجعي)
-- إذا وجد ربط → نسمح فقط إذا (branch_id, shipping_provider_id) موجود
CREATE OR REPLACE FUNCTION public.is_shipping_provider_allowed_for_branch(
  p_branch_id UUID,
  p_shipping_provider_id UUID,
  p_company_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_has_any_mapping BOOLEAN;
BEGIN
  IF p_shipping_provider_id IS NULL THEN
    RETURN TRUE;
  END IF;
  IF p_branch_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- هل الشركة لديها أي ربط فرع–شركة شحن؟
  SELECT EXISTS (
    SELECT 1
    FROM public.branch_shipping_providers bsp
    JOIN public.branches b ON b.id = bsp.branch_id
    WHERE b.company_id = p_company_id
  ) INTO v_has_any_mapping;

  IF NOT v_has_any_mapping THEN
    RETURN TRUE; -- توافق رجعي: لا ربط بعد → نسمح بأي provider
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.branch_shipping_providers bsp
    JOIN public.branches b ON b.id = bsp.branch_id
    WHERE bsp.branch_id = p_branch_id
      AND bsp.shipping_provider_id = p_shipping_provider_id
      AND b.company_id = p_company_id
      AND (bsp.is_active IS NULL OR bsp.is_active = TRUE)
  );
END;
$$;

COMMENT ON FUNCTION public.is_shipping_provider_allowed_for_branch(UUID, UUID, UUID) IS
  'التحقق من أن شركة الشحن مسموحة للفرع حسب branch_shipping_providers. إذا لا يوجد ربط للشركة يُسمح بأي provider.';

-- 3) RLS للجدول (اختياري: فقط الأدوار العليا تدير الربط)
ALTER TABLE public.branch_shipping_providers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "branch_shipping_providers_select" ON public.branch_shipping_providers;
CREATE POLICY "branch_shipping_providers_select" ON public.branch_shipping_providers
  FOR SELECT
  USING (
    branch_id IN (
      SELECT b.id FROM public.branches b
      WHERE b.company_id IN (
        SELECT company_id FROM public.company_members WHERE user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "branch_shipping_providers_insert" ON public.branch_shipping_providers;
CREATE POLICY "branch_shipping_providers_insert" ON public.branch_shipping_providers
  FOR INSERT
  WITH CHECK (
    branch_id IN (
      SELECT b.id FROM public.branches b
      JOIN public.company_members cm ON cm.company_id = b.company_id AND cm.user_id = auth.uid()
      WHERE b.company_id = cm.company_id
        AND cm.role IN ('owner', 'admin', 'general_manager', 'gm', 'super_admin', 'superadmin', 'generalmanager')
    )
  );

DROP POLICY IF EXISTS "branch_shipping_providers_update" ON public.branch_shipping_providers;
CREATE POLICY "branch_shipping_providers_update" ON public.branch_shipping_providers
  FOR UPDATE
  USING (
    branch_id IN (
      SELECT b.id FROM public.branches b
      JOIN public.company_members cm ON cm.company_id = b.company_id AND cm.user_id = auth.uid()
      WHERE cm.role IN ('owner', 'admin', 'general_manager', 'gm', 'super_admin', 'superadmin', 'generalmanager')
    )
  );

DROP POLICY IF EXISTS "branch_shipping_providers_delete" ON public.branch_shipping_providers;
CREATE POLICY "branch_shipping_providers_delete" ON public.branch_shipping_providers
  FOR DELETE
  USING (
    branch_id IN (
      SELECT b.id FROM public.branches b
      JOIN public.company_members cm ON cm.company_id = b.company_id AND cm.user_id = auth.uid()
      WHERE cm.role IN ('owner', 'admin', 'general_manager', 'gm', 'super_admin', 'superadmin', 'generalmanager')
    )
  );

-- 4) Trigger: منع إدخال shipping_provider_id غير مرتبط بالفرع (invoices + sales_orders)
CREATE OR REPLACE FUNCTION public.check_shipping_provider_branch()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.shipping_provider_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.branch_id IS NULL THEN
    RAISE EXCEPTION 'SHIPPING_PROVIDER_BRANCH: branch_id مطلوب عند تحديد شركة الشحن';
  END IF;
  IF NOT public.is_shipping_provider_allowed_for_branch(NEW.branch_id, NEW.shipping_provider_id, NEW.company_id) THEN
    RAISE EXCEPTION 'SHIPPING_PROVIDER_BRANCH: شركة الشحن المختارة غير مرتبطة بهذا الفرع';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_invoice_shipping_provider_branch ON public.invoices;
CREATE TRIGGER trg_check_invoice_shipping_provider_branch
  BEFORE INSERT OR UPDATE OF shipping_provider_id, branch_id
  ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.check_shipping_provider_branch();

DROP TRIGGER IF EXISTS trg_check_sales_order_shipping_provider_branch ON public.sales_orders;
CREATE TRIGGER trg_check_sales_order_shipping_provider_branch
  BEFORE INSERT OR UPDATE OF shipping_provider_id, branch_id
  ON public.sales_orders
  FOR EACH ROW EXECUTE FUNCTION public.check_shipping_provider_branch();

-- bills: نفس التحقق إن كان الجدول يحتوي shipping_provider_id
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'bills' AND column_name = 'shipping_provider_id') THEN
    DROP TRIGGER IF EXISTS trg_check_bill_shipping_provider_branch ON public.bills;
    EXECUTE 'CREATE TRIGGER trg_check_bill_shipping_provider_branch BEFORE INSERT OR UPDATE OF shipping_provider_id, branch_id ON public.bills FOR EACH ROW EXECUTE FUNCTION public.check_shipping_provider_branch()';
  END IF;
END $$;
