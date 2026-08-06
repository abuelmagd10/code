-- v3.74.970 — فاتورةُ الشراء تسأل شاشةَ الصلاحيات
-- ============================================================================
-- هذا هو البابُ الذى بدأنا منه: «مسؤولُ المشتريات لا يرى فواتيرَ الشراء».
-- كان المنعُ فى الشاشة وحدَها؛ وقاعدةُ البيانات لا تعرف عنه شيئاً.
--
-- وضبط المالكُ المفتاحين بيده فى شاشة صلاحيات الأدوار:
--   مسؤولُ المخزن   → إظهار ✓ قراءة ✓ (يعتمد الاستلام ولا يُعدّل)
--   مسؤولُ المشتريات → كلُّ المفاتيح مطفأة (منعٌ صريحٌ لا غياب)
--
-- وثلاثةُ أشياء فى هذه الهجرة:
--
-- (١) دالّةٌ واحدة can_view_resource(company, resource) تسأل الجدولَ نفسَه.
--     المالكُ والإدارىُّ والمديرُ العامّ يتجاوزون؛ ومَن سواهم يحتاج سطراً
--     ظاهراً بقراءة. ولا سطرَ = منع — وهو نفسُ ما يفعله التطبيق سلفاً.
--
-- (٢) **وعلاجُ ٩٥٢ لفاتورة الشراء**: كانت سياسةُ الرؤية
--     «USING (can_access_bill(id))» — أى تبحث عن صفِّها بمفتاحه. وهى نفسُ
--     الصياغة التى عطّلت إنشاءَ أوامر الشراء فى ٩٥٢، ولم تنفجر هنا فقط
--     لأنّ الفواتيرَ تُنشأ بدوالَّ مرتفعةِ الصلاحية. فصارت تقرأ
--     company_id و branch_id من الصفِّ نفسِه. لغمٌ نُزع قبل أن ينفجر.
--
-- (٣) **والبندُ كالرأس**: can_access_bill_items كان يفحص الفرعَ وحدَه،
--     فبقيت بنودُ الفاتورة مرئيةً بعد حجب رأسِها — قِيس ذلك على قاعدة
--     الاختبار قبل الشحن: الرأسُ صار صفراً والبنودُ بقيت أربعة. فصار
--     البندُ يسأل نفسَ سؤالِ الرأس. **بابٌ واحدٌ لا نصفُ باب.**
--
-- والأثرُ مقيسٌ على الاختبار ثمّ على الإنتاج (شركة «تست»):
--     المحاسب ٦→٦ · المدير ٦→٦ · مسؤولُ المخزن ٦→٦ · المالك ٨→٨
--     مسؤولُ المشتريات ٦→٠ · الموظّف ٦→٠ · مسؤولُ التصنيع ٦→٠
--   وكلُّ مَن فقد الرؤيةَ فقدها **بنصِّ ما فى الشاشة**، لا بقرارٍ منّى.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.can_view_resource(p_company_id uuid, p_resource text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $$
DECLARE v_role text; v_access boolean; v_read boolean; v_all boolean;
BEGIN
  IF p_company_id IS NULL OR p_resource IS NULL THEN RETURN false; END IF;
  IF EXISTS (SELECT 1 FROM public.companies c WHERE c.id=p_company_id AND c.user_id=auth.uid()) THEN
    RETURN true;
  END IF;
  SELECT lower(cm.role) INTO v_role FROM public.company_members cm
   WHERE cm.company_id=p_company_id AND cm.user_id=auth.uid() LIMIT 1;
  IF v_role IS NULL THEN RETURN false; END IF;
  IF v_role IN ('owner','admin','general_manager') THEN RETURN true; END IF;
  SELECT crp.can_access, crp.can_read, crp.all_access INTO v_access, v_read, v_all
    FROM public.company_role_permissions crp
   WHERE crp.company_id=p_company_id AND crp.role=v_role AND crp.resource=p_resource LIMIT 1;
  IF NOT FOUND THEN RETURN false; END IF;
  IF v_access IS NOT TRUE THEN RETURN false; END IF;
  RETURN coalesce(v_all,false) OR coalesce(v_read,false);
END $$;

COMMENT ON FUNCTION public.can_view_resource(uuid, text) IS
  'v3.74.970: هل يرى دورُ المستخدمِ هذا الموردَ حسب شاشة صلاحيات الأدوار؟ المالك/الإدارى/المدير العام يتجاوزون. ولا سطرَ = منع.';

CREATE OR REPLACE FUNCTION public.can_access_bill_row(p_company_id uuid, p_branch_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $$
  SELECT p_company_id IN (SELECT public.get_user_company_ids())
     AND public.can_access_record_branch(p_company_id, p_branch_id)
     AND public.can_view_resource(p_company_id, 'bills');
$$;

CREATE OR REPLACE FUNCTION public.can_access_bill(p_bill_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $$
  SELECT EXISTS (SELECT 1 FROM public.bills b
     WHERE b.id = p_bill_id AND public.can_access_bill_row(b.company_id, b.branch_id));
$$;

CREATE OR REPLACE FUNCTION public.can_access_bill_items(p_bill_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $$
  SELECT public.can_access_bill(p_bill_id);
$$;

DROP POLICY IF EXISTS bills_select_branch_isolation ON public.bills;
CREATE POLICY bills_select_branch_isolation ON public.bills
  FOR SELECT USING (public.can_access_bill_row(company_id, branch_id));

DO $do$
DECLARE v_qual text;
BEGIN
  SELECT qual INTO v_qual FROM pg_policies
   WHERE schemaname='public' AND tablename='bills' AND policyname='bills_select_branch_isolation';
  IF v_qual IS NULL OR v_qual LIKE '%can_access_bill(id)%' THEN
    RAISE EXCEPTION 'v3.74.970: سياسةُ رؤية الفاتورة ما زالت تبحث عن صفِّها بمفتاحه.';
  END IF;
  IF v_qual NOT LIKE '%can_access_bill_row%' THEN
    RAISE EXCEPTION 'v3.74.970: سياسةُ الرؤية لا تقرأ أعمدةَ الصفّ.';
  END IF;
END $do$;

COMMIT;
