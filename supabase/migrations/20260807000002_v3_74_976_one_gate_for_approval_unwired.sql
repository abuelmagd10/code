-- v3.74.976 — بوّابةُ الاعتماد الواحدة، **غيرَ موصولةٍ بعد**.
--
-- ═══ لماذا غيرَ موصولة ═══
--
-- «مَن يعتمد؟» يُقرَّر اليوم فى **قوائمِ أدوارٍ مكتوبةٍ باليد** موزَّعةٍ على
-- عشرات المسارات: ['owner','admin'] هنا، و["owner","admin","general_manager",
-- "manager"] هناك. فلكلِّ بابٍ قائمتُه، ولا أحدَ يعرف مجموعَها.
--
-- وشاشةُ الصلاحيات تحمل الجواب المفترض فى allowed_actions. لكنّ قياسَ اليوم
-- أظهر أنّها **ناقصةٌ ومتباينةُ المفردات**: المالكُ والمشرفُ والمُطَّلعُ
-- مملوءون، والمديرُ صفٌّ واحدٌ من خمسةٍ وعشرين، ومسؤولُ المشتريات والموظّفُ
-- والمديرُ العامُّ **لا شىءَ لهم إطلاقاً**. ولغتان مختلطتان: أفعالٌ مجرّدة
-- (approve · read) وأفعالٌ مقيَّدةٌ بمورد (bills:read · invoices:void).
--
-- **فوصلُها اليومَ يسلب الاعتمادَ من أدوارٍ تعتمد الآن.** ولذلك تُبنى ولا
-- تُوصل: تُقاس أوّلاً على كلِّ دورٍ وكلِّ مورد، ويُعرض الفرقُ على المالك
-- بالأرقام، ثمّ يُقرَّر الوصل.
--
-- ═══ والقياسُ الذى بُنى عليه هذا القرار ═══
--
-- سُئلت البوّابةُ عن سبعة أدوارٍ فى «تست» وثمانيةِ موارد، بانتحال شخصيّةِ كلِّ
-- عضوٍ على القاعدة الحيّة:
--
--   المالك              → يعتمد الثمانية.
--   مسؤولُ المخزن       → مرتجعاتِ الشراء فقط.
--   المدير · المحاسب · مسؤولُ المشتريات · الموظّف · مسؤولُ التصنيع → **لا شىء**.
--
-- والمديرُ والمحاسبُ يعتمدان اليومَ فعلاً فى مساراتٍ قائمة. فلو وُصلت
-- البوّابةُ الآن **لتوقّف عملٌ قائم**. فالخطوةُ التاليةُ ليست الوصل، بل ملءُ
-- شاشةِ الصلاحيات لمن يعتمد اليوم — بقرارِ المالك وعلى الشاشة التى يملكها.
--
-- ═══ والطابقُ الأوّل مبنىٌّ فيها من أوّل يوم ═══
--
-- **المالكُ معتمِدٌ دائماً**، ولا تُخرجه شاشةُ الصلاحيات. وهذا ليس تسهيلاً:
-- شركةٌ بلا معتمِدٍ واحدٍ شركةٌ متوقّفة، وأخطرُ ما فى بابٍ أن يُغلق على
-- الجميع بلا قصد.
--
-- ═══ والطابقُ الثالثُ يُؤجَّل بقياسٍ لا بنسيان ═══
--
-- «لا دورةَ تُترك بلا معتمِد» حارسٌ لا معنى له اليوم: بما أنّ المالكَ معتمِدٌ
-- دائماً، فالشرطُ متحقّقٌ تلقائيّاً مهما أُفرغت الشاشة. فيُكتب بعد أن تُملأ
-- الشاشةُ، لا قبلها — وإلا كان حارساً يحرس ما لا يُخرق.

CREATE OR REPLACE FUNCTION public.can_approve(
  p_company_id uuid,
  p_resource   text
) RETURNS boolean
  LANGUAGE plpgsql STABLE SECURITY DEFINER
  SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE v_uid  uuid := auth.uid();
        v_role text;
        v_ok   boolean;
BEGIN
  IF v_uid IS NULL OR p_company_id IS NULL OR p_resource IS NULL THEN
    RETURN false;   -- العجزُ عن التحقّق يُغلق ولا يفتح (درس ٨٦٥)
  END IF;

  -- الطابقُ الأوّل: مالكُ الشركة المسجَّل معتمِدٌ دائماً، ولو لم يُذكر عضواً.
  IF EXISTS (SELECT 1 FROM public.companies c
              WHERE c.id = p_company_id AND c.user_id = v_uid) THEN
    RETURN true;
  END IF;

  SELECT lower(btrim(cm.role)) INTO v_role
    FROM public.company_members cm
   WHERE cm.company_id = p_company_id AND cm.user_id = v_uid
   LIMIT 1;

  IF v_role IS NULL THEN RETURN false; END IF;
  IF v_role IN ('owner', 'admin') THEN RETURN true; END IF;

  -- وما عداهما: تُسأل شاشةُ الصلاحيات، بلغتيها معاً.
  SELECT (p.all_access
          OR 'approve' = ANY(p.allowed_actions)
          OR '*'       = ANY(p.allowed_actions)
          OR (p_resource || ':approve') = ANY(p.allowed_actions))
    INTO v_ok
    FROM public.company_role_permissions p
   WHERE p.company_id = p_company_id
     AND lower(btrim(p.role)) = v_role
     AND p.resource = p_resource
   LIMIT 1;

  RETURN COALESCE(v_ok, false);
END
$function$;

COMMENT ON FUNCTION public.can_approve(uuid, text) IS
  'v3.74.976 — بوّابةُ الاعتماد الواحدة. غيرُ موصولةٍ بعد: تُقاس قبل أن تُوصل. المالكُ معتمِدٌ دائماً.';

REVOKE EXECUTE ON FUNCTION public.can_approve(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.can_approve(uuid, text) FROM anon;
GRANT  EXECUTE ON FUNCTION public.can_approve(uuid, text) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.can_approve(uuid, text) TO service_role;
