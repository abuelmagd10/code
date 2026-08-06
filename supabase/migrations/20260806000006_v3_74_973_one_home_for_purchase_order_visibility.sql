-- v3.74.973 — بيتٌ واحدٌ لرؤية أمر الشراء، وبابُ إدارة المنتجات يُغلق.
--
-- ═══ (١) الحكمُ الواحدُ يُنادى، ولا يُكتب مرّتين ═══
--
-- حارسُ ٩٣٣ يشترط أن تُنادى سياسةُ الرؤية نفسَ الحكم الذى ينادِيه مسارُ المال،
-- لا أن تُعيد كتابتَه. وقياسُ اليوم أظهر الحقيقةَ على وجهين:
--
--   • الفواتير: البيتُ واحدٌ فعلاً منذ ٩٧٠ — السياسةُ تنادى
--     can_access_bill_row، وcan_access_bill غلافٌ فوقها. فصراخُ الحارس
--     كان على اسمٍ قديم لا على معنى.
--   • أوامرُ الشراء: **البيتان اثنان حقّاً**. السياسةُ تُعيد كتابةَ الشرط
--     بنفسها: company_id IN (…) AND can_access_record_branch(…)، ودالّةُ
--     can_access_purchase_order تكتب الشرطَ نفسَه مرّةً ثانيةً داخلها.
--     فتعديلُ أحدهما يترك الآخرَ مفتوحاً بصمت.
--
-- فيُصنع لأمر الشراء ما صُنع للفاتورة فى ٩٧٠: دالّةُ صفٍّ واحدةٌ تُنادِيها
-- السياسةُ، والدالّةُ القديمة تصير غلافاً فوقها.
--
-- ⚠️ وهذا تغييرُ **بنيةٍ لا سلوك**: الشرطُ الجديد مطابقٌ للقديم حرفاً بحرف،
-- ولم يُضَف إليه can_view_resource — فمَن كان يرى أمرَ شراءٍ أمس يراه اليوم.
-- ورَبطُ أوامر الشراء بشاشة الصلاحيات قرارٌ منفصلٌ يُقاس ويُعرض قبل تنفيذه.
--
-- ولا تُسحب صلاحيةُ النداء من الزائر المجهول عن دالّة الصفّ: فالسياساتُ
-- تُقاس عليه ليُردّ **بلا صفوف**، ولو مُنع النداءُ لرُدَّ بخطأ. وهذا نفسُ
-- الاستثناء المقيس فى ٩٧٢ وفى فحص القاعدة نفسِه.
--
-- ═══ (٢) وبابُ إدارة المنتجات ═══
--
-- حارسُ ٩٣٥ يقول إنّ can_manage_products يناديها الزائرُ المجهول. وقد فاتت
-- علاجَ ٩٧٢ لأنّها تسأل auth.uid() داخلها فاستُثنيت بحقّ من ذلك القياس.
-- وقِيس اليوم أين تُستعمل: فى سياستَى **الإدراج والتعديل** على المنتجات
-- فقط — ولا سياسةَ رؤيةٍ تستعملها. فسحبُ النداء عن المجهول لا يُحوّل «لا
-- صفوف» إلى خطأ، لأنّه ليس فى مسار قراءةٍ أصلاً.
--
-- ═══ القياسُ قبل وبعد ═══
--
-- الاختبار: أحدَ عشرَ مستخدماً، أعدادُ أوامر الشراء وبنودِها **مطابقةٌ صفّاً
-- بصفّ** قبل وبعد.
-- الإنتاج: سبعةُ أدوارٍ فى «تست» — محاسب ٧/١٢ · مدير ٧/١٢ · مسؤول تصنيع ٧/١٢
--          · مالك ٩/١٥ · مسؤول مشتريات ٧/١٢ · موظّف ٧/١٢ · مسؤول مخزن ٧/١٢،
--          **قبل وبعد سواءً بسواء**.

-- (١) بيتٌ واحدٌ لرؤية أمر الشراء
CREATE OR REPLACE FUNCTION public.can_access_purchase_order_row(
  p_company_id uuid,
  p_branch_id  uuid
) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path TO 'public', 'pg_catalog'
AS $function$
  SELECT p_company_id IN (SELECT public.get_user_company_ids())
     AND public.can_access_record_branch(p_company_id, p_branch_id);
$function$;

COMMENT ON FUNCTION public.can_access_purchase_order_row(uuid, uuid) IS
  'v3.74.973 — الحكمُ الواحدُ لرؤية صفِّ أمر الشراء. تُنادِيه السياسةُ ويُنادِيه غلافُ can_access_purchase_order.';

CREATE OR REPLACE FUNCTION public.can_access_purchase_order(
  p_purchase_order_id uuid
) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path TO 'public', 'pg_catalog'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.purchase_orders po
     WHERE po.id = p_purchase_order_id
       AND public.can_access_purchase_order_row(po.company_id, po.branch_id)
  );
$function$;

ALTER POLICY purchase_orders_select_branch_isolation ON public.purchase_orders
  USING (public.can_access_purchase_order_row(company_id, branch_id));

-- (٢) بابُ إدارة المنتجات يُغلق على المجهول
REVOKE EXECUTE ON FUNCTION public.can_manage_products(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.can_manage_products(uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.can_manage_products(uuid) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.can_manage_products(uuid) TO service_role;
