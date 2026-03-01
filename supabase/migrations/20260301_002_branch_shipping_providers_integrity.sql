-- =============================================================================
-- سلامة بيانات ربط شركات الشحن بالفروع (نفس الشركة فقط)
-- يضمن أن الفرع وشركة الشحن ينتميان لنفس الشركة
-- =============================================================================

-- دالة ترجر: منع ربط فرع بشركة شحن من شركة أخرى
CREATE OR REPLACE FUNCTION public.check_branch_shipping_provider_same_company()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_branch_company_id UUID;
  v_provider_company_id UUID;
BEGIN
  SELECT company_id INTO v_branch_company_id FROM public.branches WHERE id = NEW.branch_id;
  SELECT company_id INTO v_provider_company_id FROM public.shipping_providers WHERE id = NEW.shipping_provider_id;
  IF v_branch_company_id IS DISTINCT FROM v_provider_company_id THEN
    RAISE EXCEPTION 'BRANCH_SHIPPING_PROVIDER_COMPANY: الفرع وشركة الشحن يجب أن يكونا تابعين لنفس الشركة';
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.check_branch_shipping_provider_same_company() IS
  'يضمن أن الفرع وشركة الشحن من نفس الشركة عند الإدخال أو التحديث';

DROP TRIGGER IF EXISTS trg_branch_shipping_provider_same_company ON public.branch_shipping_providers;
CREATE TRIGGER trg_branch_shipping_provider_same_company
  BEFORE INSERT OR UPDATE OF branch_id, shipping_provider_id
  ON public.branch_shipping_providers
  FOR EACH ROW EXECUTE FUNCTION public.check_branch_shipping_provider_same_company();
