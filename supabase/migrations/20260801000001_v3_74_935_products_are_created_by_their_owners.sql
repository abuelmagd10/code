-- ═══════════════════════════════════════════════════════════════════
-- v3.74.935 — الأصنافُ يُنشئها أصحابُها: حكمٌ واحد، والبابُ الحقيقىُّ يُغلق
-- ═══════════════════════════════════════════════════════════════════
--
-- ═══════════ قرارُ المالك ═══════════
--
-- إنشاءُ الأصناف وتعديلُها **يُقصَر على أصحابه**: المالك · المشرف ·
-- المدير العام · مديرُ الفرع · المحاسب · مديرُ المخزن · مسئولُ المشتريات.
-- **ويُمنع الموظفُ ومسئولُ التصنيع** (ومسئولُ الحجز ومسئولُ الموارد
-- البشرية، وقد كانا يمرّان أيضاً).
--
-- ═══════════ والقياسُ قال إن الباب المكتوب ليس الباب الحقيقى ═══════════
--
-- على `products` **بابان متجاوران للإضافة**: `products_insert_members`
-- تُسمّى ستةَ أدوار، و`products_insert` تُحيل إلى `can_modify_data` التى
-- تمرّ لأحدَ عشرَ دوراً — أى للجميع. ومثلُهما للتعديل. وهو نفسُ شكل
-- الأبواب المتجاورة (921 · 928 · 929 · 930 · 931).
--
-- ⚠️ **لكنّ تضييقَ السياسة وحدَها كان سيكون مسكِّناً**: الشاشةُ لا تُدرج
-- فى `products` أصلاً — قِيس: **صفرُ موضعٍ** فى كل الشجرة يُدرج فيها
-- مباشرةً. الإنشاءُ كلُّه يمرّ بـ`create_product_atomic`، وهى
-- `SECURITY DEFINER` ممنوحةٌ لـ`authenticated`، **فسياسةُ الصف لا تُطبَّق
-- داخلها إطلاقاً**. وكلُّ ما تسأله `assert_company_access`: «أأنت عضوٌ فى
-- هذه الشركة؟» — لا «بأى دور؟».
--
-- **والبرهانُ بالقياس قبل العلاج**: نودى المسارُ الحقيقىُّ بانتحال الأدوار
-- السبعة على الإنتاج، فأنشأ **كلُّ واحدٍ منهم صنفاً بنجاح** — الموظفُ
-- ومسئولُ التصنيع ومديرُ المخزن كغيرهم. فلو غُيّرت السياسةُ وحدها لبقى
-- الباب مفتوحاً على مصراعيه، **ولبدا الإصلاحُ تاماً فى النصّ**.
--
-- ═══════════ فالحكمُ واحدٌ يُنادى من موضعين (درس 934) ═══════════
--
-- تُكتب `can_manage_products` مرةً واحدة، **وتُناديها السياسةُ والدالةُ
-- المخوَّلة معاً**. فمن أغلق أحدَ البابين أغلق الآخر، ولا يبقى نصٌّ يقول
-- شيئاً وأثرٌ يقول غيرَه.
--
-- ⚠️ **ولا تُضيَّق `can_modify_data`**: دالةٌ عامةٌ تُستعمل على جداولَ
-- أخرى، فتضييقُها يقطع ما لم يُقَس. تُترك كما هى، وتخرج `products` من
-- تحتها إلى حكمها الخاص.
--
-- ⚠️ **وللدالة تعريفان** (ستةَ عشرَ وسبعةَ عشرَ بارامتراً)، كلاهما
-- `SECURITY DEFINER` وممنوحٌ لـ`authenticated`. الشاشةُ تنادى الثانى،
-- **والأولُ بابٌ خلفىٌّ نائمٌ مفتوح**. فيُغلقان معاً.
--
-- ولا يُنسخ جسدُ الدالتين هنا (درس 932): تُقرأ كلٌّ منهما من القاعدة،
-- ويُتحقَّق من المرساة، ثم يُدسّ الشرطُ بعدها — **وإن غابت المرساةُ رُفض
-- الإصلاح بخطأٍ صاخب بدل أن يُرقَّع على غير هدى**.
-- ═══════════════════════════════════════════════════════════════════

-- ═══════ (١) الحكمُ الواحد ═══════

CREATE OR REPLACE FUNCTION public.can_manage_products(p_company_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
  SELECT
    -- مالكُ الشركة المسجَّل مالكٌ ولو لم يُذكر عضواً (درس ٨٣٦).
    EXISTS (SELECT 1 FROM public.companies c
             WHERE c.id = p_company_id AND c.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.company_members cm
                WHERE cm.company_id = p_company_id
                  AND cm.user_id = auth.uid()
                  AND lower(btrim(cm.role)) IN (
                        'owner', 'admin', 'general_manager', 'gm', 'generalmanager',
                        'manager', 'accountant', 'store_manager', 'purchasing_officer'));
$function$;

REVOKE ALL    ON FUNCTION public.can_manage_products(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_products(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.can_manage_products(uuid) IS
  'v3.74.935 — من يُنشئ الأصناف ويعدّلها، فى موضعٍ واحد: تُناديه سياسةُ الصف والدالةُ المخوَّلة معاً.';

-- ═══════ (٢) بابٌ واحدٌ للإضافة، وبابٌ واحدٌ للتعديل ═══════

DROP POLICY IF EXISTS products_insert         ON public.products;
DROP POLICY IF EXISTS products_insert_members ON public.products;

CREATE POLICY products_insert_managers ON public.products
FOR INSERT
WITH CHECK (public.can_manage_products(company_id));

DROP POLICY IF EXISTS products_update         ON public.products;
DROP POLICY IF EXISTS products_update_members ON public.products;

CREATE POLICY products_update_managers ON public.products
FOR UPDATE
USING      (public.can_manage_products(company_id))
WITH CHECK (public.can_manage_products(company_id));

COMMENT ON POLICY products_insert_managers ON public.products IS
  'v3.74.935 — بابٌ واحد بعد اثنين، والحكمُ نداءٌ لا نصّ. والدالةُ المخوَّلة تُنادى الحكمَ نفسَه.';

-- ═══════ (٣) والبابُ الحقيقى: الدالةُ المخوَّلة تسأل عن الدور ═══════
--
-- تُقرأ كلُّ نسخةٍ من القاعدة، ويُتحقَّق من المرساة، ثم يُدسّ الشرطُ
-- بعدها مباشرةً. وإن تغيّرت المرساةُ رُفض الإصلاح — لا تُرقَّع دالةٌ
-- تغيّر شكلُها.

DO $patch$
DECLARE
  v_anchor TEXT := 'PERFORM public.assert_company_access(p_company_id);';
  -- ⚠️ نصُّ الشرط المدسوس **إنجليزىٌّ مقتضب عمداً**: هو ما يُطبع فى
  -- `pg_get_functiondef`، ويُقارَن حرفاً بحرف بين الملف والقاعدة، ويُقصّه
  -- الفخُّ الذاتىُّ بتعبيرٍ نمطى. فكلُّ حرفٍ زائدٍ هنا موضعُ انحرافٍ لاحق.
  v_guard  TEXT := E'\n  -- v3.74.935\n'
                || E'  IF NOT public.can_manage_products(p_company_id) THEN\n'
                || E'    RAISE EXCEPTION ''PRODUCT_MANAGE_FORBIDDEN'' USING ERRCODE = ''42501'';\n'
                || E'  END IF;\n';
  r        RECORD;
  v_def    TEXT;
  v_count  INT := 0;
BEGIN
  FOR r IN
    SELECT p.oid, p.oid::regprocedure::text AS sig
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'create_product_atomic'
  LOOP
    v_def := pg_get_functiondef(r.oid);

    IF position(v_anchor IN v_def) = 0 THEN
      RAISE EXCEPTION 'create_product_atomic %: the anchor moved - refusing to patch blindly', r.sig;
    END IF;

    -- مرّةً واحدة: لو أُعيد تشغيل الهجرة لا يُدسّ الشرطُ مرتين.
    IF position('can_manage_products' IN v_def) > 0 THEN
      RAISE NOTICE 'create_product_atomic %: already guarded, left as is', r.sig;
      CONTINUE;
    END IF;

    v_def := replace(v_def, v_anchor, v_anchor || v_guard);
    EXECUTE v_def;
    v_count := v_count + 1;
  END LOOP;

  IF v_count = 0 THEN
    RAISE NOTICE 'create_product_atomic: nothing to patch';
  END IF;
END
$patch$;

-- والمنحةُ تُعاد كما كانت بالضبط (درس 919/929): كلُّ CREATE FUNCTION
-- يمنح PUBLIC، و PUBLIC يشمل anon.
DO $grants$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure::text AS sig
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'create_product_atomic'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', r.sig);
  END LOOP;
END
$grants$;
