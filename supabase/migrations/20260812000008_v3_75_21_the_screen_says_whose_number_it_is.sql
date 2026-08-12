-- ============================================================================
-- v3.75.21 — «ورقمٌ بعنوانٍ لا يقولُ لمن هو ليس صدقاً»
-- ============================================================================
--
-- ═══ من أين جاء ═══
--
-- سألَ صاحبُ المشروع: لماذا يرى محاسبُ الفرعِ للمورّدِ «احمد سمكة» مطلوباتٍ
-- قدرُها **١٠٫٠٠**، ويرى المالكُ **٩٩٦٫١٠**؟
--
-- وقِيس فكان الجواب: للمورّدِ فاتورتانِ مفتوحتان — **١٠٫٠٠** فى «الفرع
-- الرئيسي» و**٩٨٦٫١٠** فى فرعِ **«مدينة نصر»**. والمحاسبُ مربوطٌ بالفرعِ
-- الرئيسىِّ، وسياسةُ عزلِ الفروعِ تُخفى عنه الثانية. **والرقمانِ صحيحانِ معاً.**
--
-- ═══ والخللُ ليس فى الحساب بل فى العنوان ═══
--
-- العمودُ اسمُه «مطلوبات (ذمم دائنة)» **بلا إشارةٍ إلى أنّه مقصورٌ على فرعِ من
-- ينظر**. فيقرأُ المحاسبُ «١٠٫٠٠» ويفهمُ «هذا ما علينا لهذا المورّد» — والحقيقةُ
-- ٩٩٦٫١٠. ولو سوّى على هذا الرقمِ أو أقفلَ الحساب **لبنى قراراً على نصفِ صورة**.
--
--     **ورقمٌ واحدٌ بعنوانٍ واحدٍ يعنى شيئَين لشخصَين ليس صدقاً وإن صحَّ حسابُه.**
--
-- ═══ العلاجُ: إشعارُ وجودٍ بلا كشفِ مبلغ ═══
--
-- `suppliers_with_balance_outside_scope` تُجيبُ **بنعم أو لا لكلِّ مورّد**: هل له
-- رصيدٌ مفتوحٌ خارجَ الفرعِ المعروض؟ **بلا مبلغٍ ولا فرعٍ ولا رقمِ فاتورة.** وهى
-- الوحيدةُ هنا التى تعملُ بصلاحيّاتٍ كاملة، ولذلك **تسألُ أوّلاً من الطارق**:
-- `assert_company_access` قبل أىِّ قراءة. **وبابٌ يُجيبُ بلا أن يسألَ من الطارق
-- ليس باباً.** وإن لم يكنْ فرعٌ معروضٌ (المالكُ يرى الكلَّ) **لا تُرجعُ شيئاً** —
-- فلا «خارج» أصلاً.
--
-- ═══ وما لم يُشحَنْ فى هذه الدفعةِ ولماذا ═══
--
-- ظهرَ أثناءَ القياسِ ثقبٌ ثانٍ **أخطرُ من المسؤولِ عنه**: قائمةُ المورّدينَ
-- تُصفّى بفرعِ **سجلِّ المورّد**، وسجلُّ «احمد سمكة» على الفرعِ الرئيسىِّ بينما
-- دَينُه الكبيرُ فى «مدينة نصر» — فمحاسبُ «مدينة نصر» **لا يرى هذا المورّدَ
-- إطلاقاً** وعليه هو ٩٨٦٫١٠ **فى فرعِه هو**. **وغيابٌ تامٌّ أسوأُ من رقمٍ ناقص.**
--
-- وكانت الخطّةُ توسيعَ تصفيةِ القائمةِ إلى «سجلُّه فى فرعى **أو** له فاتورةٌ
-- فيه». **فأوقفَ القياسُ ذلك**: جدولُ `suppliers` نفسُه محروسٌ بعزلِ الفروع
-- (`can_access_record_branch`)، فصفُّ المورّدِ **غيرُ مرئىٍّ له أصلاً** — وأىُّ
-- شرطٍ إضافىٍّ داخلَ الدالّةِ **لا يستطيعُ أن يُظهرَ صفّاً تُخفيه السياسة**.
--
-- فإصلاحُه الحقيقىُّ يعنى **توسيعَ ما يراه إنسان**: أن يرى اسمَ مورّدٍ سجلُّه فى
-- فرعٍ آخر. **ولا يُغيَّرُ ما يستطيعُه إنسانٌ إلّا بقرارِ صاحبِ المشروع** — فبقىَ
-- مقيساً ومكتوباً ينتظرُ قراره. **ونصفُ جراحةٍ أسوأُ من لا جراحة.**
--
-- ═══ والخاصّيّةُ الحاملةُ التى تُثبَّت ═══
--
-- `get_suppliers_overview` **يجب أن تبقى بصلاحيّةِ من يناديها**. فلو قُلبت يوماً
-- إلى صلاحيّاتٍ كاملةٍ لَانكشفَ لمحاسبِ الفرعِ **مالُ الفروعِ كلِّها** فى نفسِ
-- العمود، بلا أن يقصدَ ذلك أحد.
--
-- **ولا صفَّ بياناتٍ يُلمَس، ولا صلاحيّةَ إنسانٍ تتّسع.**
-- ============================================================================


CREATE OR REPLACE FUNCTION public.suppliers_with_balance_outside_scope(p_company_id uuid, p_visible_branch uuid)
 RETURNS SETOF uuid
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
BEGIN
  -- وبابٌ يُجيبُ بلا أن يسألَ من الطارق ليس باباً.
  PERFORM public.assert_company_access(p_company_id);

  -- لا فرعَ معروضٌ يعنى لا «خارج» — فلا إشعارَ أصلاً.
  IF p_visible_branch IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT DISTINCT b.supplier_id
  FROM public.bills b
  WHERE b.company_id = p_company_id
    AND b.supplier_id IS NOT NULL
    AND b.branch_id IS DISTINCT FROM p_visible_branch
    AND COALESCE(b.status,'') NOT IN ('draft','cancelled','fully_returned')
    AND GREATEST(
          GREATEST(COALESCE(b.total_amount,0) - COALESCE(b.returned_amount,0), 0)
            - COALESCE(b.paid_amount,0), 0) > 0;
END;
$function$;

REVOKE ALL ON FUNCTION public.suppliers_with_balance_outside_scope(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.suppliers_with_balance_outside_scope(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.suppliers_with_balance_outside_scope(uuid, uuid) TO authenticated;


-- ============================================================================
-- الفحصُ المرجعىُّ — يسكنُ القاعدةَ فيحرسُ أىَّ بيتٍ يُركَّبُ فيه
-- ============================================================================
CREATE OR REPLACE FUNCTION public.assert_baseline_v3_75_21_check()
RETURNS void
LANGUAGE plpgsql
AS $function$
DECLARE
  v_bad  int;
  v_co   uuid;
  v_n    int;
BEGIN
  -- (أ) **الخاصّيّةُ الحاملة**: نظرةُ المورّدين تبقى بصلاحيّةِ من يناديها.
  SELECT count(*) INTO v_bad
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'get_suppliers_overview' AND p.prosecdef;
  IF v_bad > 0 THEN
    RAISE EXCEPTION 'BASELINE FAIL: get_suppliers_overview صارت بصلاحيّاتٍ كاملة — فينكشفُ مالُ الفروعِ كلِّها لمحاسبِ فرع (v3.75.21)';
  END IF;

  -- (ب) وإشعارُ الوجودِ يسألُ من الطارقِ قبلَ أن يُجيب، ومسارُه مثبَّت
  SELECT count(*) INTO v_bad
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'suppliers_with_balance_outside_scope'
     AND (NOT p.prosecdef
       OR p.proconfig IS NULL
       OR NOT EXISTS (SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search\_path=%')
       OR strpos(pg_get_functiondef(p.oid), 'assert_company_access') = 0);
  IF v_bad > 0 THEN
    RAISE EXCEPTION 'BASELINE FAIL: إشعارُ الوجودِ بلا مسارٍ مثبَّتٍ أو لا يسألُ من الطارق (v3.75.21)';
  END IF;

  -- (ج) ولا «خارج» حين لا فرعَ معروض — يُقاسُ بالسلوكِ لا بالنصّ
  SELECT id INTO v_co FROM public.companies LIMIT 1;
  IF v_co IS NULL THEN
    RAISE NOTICE 'v3.75.21 · لا شركةَ تُقاسُ عليها — لم يُدَّعَ قياس.';
    RETURN;
  END IF;
  SELECT count(*) INTO v_n FROM public.suppliers_with_balance_outside_scope(v_co, NULL);
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'BASELINE FAIL: أُشعِرَ بوجودِ «خارج» ولا فرعَ معروضاً أصلاً (v3.75.21)';
  END IF;
END;
$function$;

COMMENT ON FUNCTION public.assert_baseline_v3_75_21_check() IS
  'v3.75.21 — ورقمٌ بعنوانٍ لا يقولُ لمن هو ليس صدقاً.';

REVOKE ALL ON FUNCTION public.assert_baseline_v3_75_21_check() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assert_baseline_v3_75_21_check() FROM anon;
REVOKE ALL ON FUNCTION public.assert_baseline_v3_75_21_check() FROM authenticated;
