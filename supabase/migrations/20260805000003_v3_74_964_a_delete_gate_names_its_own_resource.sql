-- ============================================================================
-- v3.74.964 — بوّابةُ الحذف تسمّى موردَها
-- ============================================================================
-- المرض:
--   الدالّة public.can_delete_data(p_company_id) كانت تسأل جدولَ الصلاحيات
--   سؤالاً واحداً ثابتاً: «هل لهذا الدور حذفٌ على مورد customers؟» — ثمّ
--   تُستعمل هذه الإجابةُ نفسُها فى أربعةَ عشرَ جدولاً: الفواتير، القيود
--   اليومية، المدفوعات، الموظّفين، المنتجات، المساهمين، مرتجعات البيع،
--   أرصدة الموردين، التسويات البنكية، حصص رأس المال، توزيعات الأرباح…
--
--   فصلاحيةُ حذفِ قيدٍ يومى كان يقرّرها **صفُّ العملاء**. ومَن مُنح حذفَ
--   عميلٍ مُنح — من حيث لا يدرى مانحُه — حذفَ ما فى تلك الجداول.
--
--   وأثرُه مقيسٌ لا مُقدَّر: فى شركة «تست» كان **الموظّف (مندوب المبيعات)**
--   يستطيع حذفَ قيدٍ يومى وفاتورةِ شراءٍ ومدفوعةٍ وموظّف — لأنّه يملك حذفَ
--   العميل. وكذلك مسؤولُ الحجوزات فى الشركات الخمس كلِّها.
--
-- الدواء (جذرىٌّ لا مسكّن):
--   ١) كلُّ سياسة حذفٍ تسأل عن **موردها هى**، عبر الدالّة الموجودة سلفاً
--      public.can_delete_resource(company_id, resource). فلا تُخترع دالّةٌ
--      جديدة، ولا يُفتح بيتٌ جديد لقاعدةٍ لها بيت.
--   ٢) can_delete_data تبقى موجودةً لئلّا ينكسر نداءٌ لم أره، لكنّها تصير
--      غلافاً رفيعاً ينادى can_delete_resource(p_company_id, 'customers').
--      فالمنطقُ يسكن موضعاً واحداً — بيتٌ واحدٌ للقاعدة الواحدة.
--   ٣) حارسٌ فى scripts/ يمنع عودةَ بوّابةِ حذفٍ لا تسمّى موردَها.
--
-- ملاحظةٌ على الاتّساع: التصحيحُ يضيق فى مواضعَ ويتّسع فى أخرى، لأنّه يجعل
--   القاعدةَ تقول ما تقوله شاشةُ الإعدادات بالضبط. الاتّساعُ مقيسٌ ومعروضٌ
--   على المالك قبل التطبيق، ومحميٌّ بحرّاس حالة المستند القائمة
--   (transactional_document_delete_gate، enforce_posted_entry_no_edit،
--    prevent_vendor_credit_deletion، block_bill_delete_with_pending …).
-- ============================================================================

BEGIN;

-- ── (١) بيتٌ واحدٌ للمنطق ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.can_delete_data(p_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $$
  -- v3.74.964 — مهجورة. أُبقيت غلافاً رفيعاً لئلّا ينكسر نداءٌ لم يُرصد.
  -- لا تستعملها فى سياسةٍ جديدة: بوّابةُ الحذف تسمّى موردَها.
  SELECT public.can_delete_resource(p_company_id, 'customers');
$$;

COMMENT ON FUNCTION public.can_delete_data(uuid) IS
  'v3.74.964: مهجورة — غلافٌ على can_delete_resource(company, ''customers''). '
  'كلُّ سياسةِ حذفٍ يجب أن تنادى can_delete_resource باسم موردها هى.';

-- ── (٢) السياساتُ الأربعَ عشرةَ — كلٌّ تسمّى موردَها ───────────────────────

-- التسوياتُ البنكية → banking
DROP POLICY IF EXISTS bank_reconciliations_delete ON public.bank_reconciliations;
CREATE POLICY bank_reconciliations_delete ON public.bank_reconciliations
  FOR DELETE USING (public.can_delete_resource(company_id, 'banking'));

-- فواتيرُ الشراء → bills
DROP POLICY IF EXISTS bills_delete ON public.bills;
CREATE POLICY bills_delete ON public.bills
  FOR DELETE USING (public.can_delete_resource(company_id, 'bills'));

-- حصصُ رأس المال → shareholders
DROP POLICY IF EXISTS capital_contributions_delete ON public.capital_contributions;
CREATE POLICY capital_contributions_delete ON public.capital_contributions
  FOR DELETE USING (public.can_delete_resource(company_id, 'shareholders'));

-- عقودُ الموظّفين → employees (عبر الموظّف صاحبِ العقد، كما كانت)
DROP POLICY IF EXISTS employee_contracts_delete ON public.employee_contracts;
CREATE POLICY employee_contracts_delete ON public.employee_contracts
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = employee_contracts.employee_id
        AND public.can_delete_resource(e.company_id, 'employees')
    ));

-- الموظّفون → employees
DROP POLICY IF EXISTS employees_delete ON public.employees;
CREATE POLICY employees_delete ON public.employees
  FOR DELETE USING (public.can_delete_resource(company_id, 'employees'));

-- القيودُ اليومية → journal_entries
DROP POLICY IF EXISTS journal_entries_delete ON public.journal_entries;
CREATE POLICY journal_entries_delete ON public.journal_entries
  FOR DELETE USING (public.can_delete_resource(company_id, 'journal_entries'));

-- المدفوعات → payments
DROP POLICY IF EXISTS payments_delete ON public.payments;
CREATE POLICY payments_delete ON public.payments
  FOR DELETE USING (public.can_delete_resource(company_id, 'payments'));

-- أصنافُ الحزمة → products
DROP POLICY IF EXISTS pbi_delete ON public.product_bundle_items;
CREATE POLICY pbi_delete ON public.product_bundle_items
  FOR DELETE USING (public.can_delete_resource(company_id, 'products'));

-- المنتجات → products
DROP POLICY IF EXISTS products_delete ON public.products;
CREATE POLICY products_delete ON public.products
  FOR DELETE USING (public.can_delete_resource(company_id, 'products'));

-- توزيعاتُ الأرباح → shareholders
DROP POLICY IF EXISTS profit_distributions_delete ON public.profit_distributions;
CREATE POLICY profit_distributions_delete ON public.profit_distributions
  FOR DELETE USING (public.can_delete_resource(company_id, 'shareholders'));

-- مرتجعاتُ البيع → sales_returns
DROP POLICY IF EXISTS sales_returns_delete ON public.sales_returns;
CREATE POLICY sales_returns_delete ON public.sales_returns
  FOR DELETE USING (public.can_delete_resource(company_id, 'sales_returns'));

-- المساهمون → shareholders
DROP POLICY IF EXISTS shareholders_delete ON public.shareholders;
CREATE POLICY shareholders_delete ON public.shareholders
  FOR DELETE USING (public.can_delete_resource(company_id, 'shareholders'));

-- تطبيقاتُ أرصدة الموردين → vendor_credits
DROP POLICY IF EXISTS vendor_credit_applications_delete ON public.vendor_credit_applications;
CREATE POLICY vendor_credit_applications_delete ON public.vendor_credit_applications
  FOR DELETE USING (public.can_delete_resource(company_id, 'vendor_credits'));

-- أرصدةُ الموردين → vendor_credits
DROP POLICY IF EXISTS vendor_credits_delete ON public.vendor_credits;
CREATE POLICY vendor_credits_delete ON public.vendor_credits
  FOR DELETE USING (public.can_delete_resource(company_id, 'vendor_credits'));

-- ── (٣) إثباتٌ داخلَ نفس المعاملة: لم يبقَ نداءٌ واحدٌ للدالّة المهجورة ──
DO $$
DECLARE v_left int;
BEGIN
  SELECT count(*) INTO v_left
  FROM pg_policies
  WHERE schemaname = 'public'
    AND (coalesce(qual,'') || ' ' || coalesce(with_check,'')) LIKE '%can_delete_data%';

  IF v_left > 0 THEN
    RAISE EXCEPTION
      'v3.74.964: ما زالت % سياسةً تنادى can_delete_data — البوّابةُ لم تُسمِّ موردَها.', v_left;
  END IF;
END $$;

COMMIT;
