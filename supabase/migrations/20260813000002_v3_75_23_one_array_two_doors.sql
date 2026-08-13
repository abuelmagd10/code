-- v3.75.23 — «ومصفوفةٌ واحدةٌ ببابَين»
-- =============================================================================
-- شحنّا فى v3.75.22 **القانونَ الواحد** `bill_status_is_payable` فصارت أفواهُ
-- المالِ الثلاثةُ فى القاعدةِ تسألُه. وبقىَ **فمٌ رابعٌ خارجَ القاعدة**:
-- `scripts/check-supplier-payables.js` يطبعُ «إجمالي الذمم الدائنة» بقائمةِ
-- منعٍ **خامسةِ التهجئة** كتبها بيدِه — `(draft,cancelled,voided,fully_returned)`
-- — فطبعَ ٩٩٦٫١٠ فى الدفعةِ نفسِها التى صحّحت الشاشةَ إلى ٩٨٦٫١٠.
--
-- **وفمٌ يقولُ رقماً بعدَ أن قِيلَ غيرُه خطرٌ صامت**: لا يرفضُ ولا يمنعُ دفعةً،
-- فيُقرأُ غداً على أنّه الحقيقة.
--
-- ولا يُعالَجُ بنسخِ القائمةِ إليه — **فنسخةٌ ثانيةٌ تنحرفُ يوماً ولا يُبلَّغُ
-- أحد**. بل يُفتَحُ للقانونِ **بابٌ ثانٍ** يصلحُ لمن هو خارجَ لغةِ القاعدة:
-- دالّةٌ تُرجعُ **المصفوفةَ نفسَها**. والبابانِ يقرآنِ **مصفوفةً واحدةً لا
-- اثنتَين**: `bill_status_is_payable` صارت تسألُ `bill_payable_statuses`،
-- فليس فى البيتِ إلّا سطرٌ واحدٌ يحملُ الأسماء.
--
-- **ولا اسمَ بلا بيت. ومكسبٌ لا يُثبَّتُ يُلتَفُّ عليه.**
-- =============================================================================

-- —— المصفوفةُ الواحدة: أسماءُ الحالاتِ التى عبرتْ حدَّ الأستاذ ————————————
-- **هذا هو الموضعُ الوحيدُ فى المشروعِ كلِّه الذى تُكتَبُ فيه هذه الأسماء.**
-- من كان داخلَ لغةِ القاعدةِ يسألُ `bill_status_is_payable`، ومن كان خارجَها
-- ينادى هذه فيأخذُ المصفوفةَ كما هى.
CREATE OR REPLACE FUNCTION public.bill_payable_statuses()
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_catalog'
AS $function$
  SELECT ARRAY[
    'received', 'partially_paid', 'paid', 'partially_returned', 'fully_returned'
  ]::text[];
$function$;

-- **ومنعٌ عن الجميعِ ليس منعاً عن أحدٍ بعينِه.** المنعُ عن `PUBLIC` لا يرفعُ
-- منحةً **مباشرةً** لـ`anon`، وSupabase تمنحُها بصلاحيّاتٍ افتراضيّةٍ لكلِّ
-- دالّةٍ جديدةٍ فى `public`. فبقىَ البابُ مفتوحاً لزائرٍ لم يُسجِّلْ دخولَه —
-- **وقد أمسكَ الفحصُ المرجعىُّ هذا بيدِه فرفضَ الهجرةَ قبلَ أن تُطبَّق.**
REVOKE ALL ON FUNCTION public.bill_payable_statuses() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bill_payable_statuses() FROM anon;
GRANT EXECUTE ON FUNCTION public.bill_payable_statuses() TO authenticated;

-- —— والقانونُ صارَ يسألُ المصفوفةَ ولا يحملُها ————————————————————————
-- كان يحملُ نسختَه من الأسماء. فلمّا فُتح البابُ الثانى صارتا نسختَين،
-- **ونسختانِ تتفقانِ اليومَ تختلفانِ غداً**. فصارَ يقرأُ من البيتِ الواحد.
CREATE OR REPLACE FUNCTION public.bill_status_is_payable(p_status text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_catalog'
AS $function$
  SELECT COALESCE(p_status, '') = ANY (public.bill_payable_statuses());
$function$;

REVOKE ALL ON FUNCTION public.bill_status_is_payable(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bill_status_is_payable(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.bill_status_is_payable(text) TO authenticated;

-- —— وبابُ الأمسِ يُغلَقُ على الزائر ————————————————————————————————
-- `supplier_is_active_in_my_branch` شُحنتْ أمسَ بصلاحيّاتٍ كاملةٍ ومنعٍ عن
-- `PUBLIC` وحدَه — فبقيتْ **قابلةً للنداءِ من زائرٍ لم يُسجِّلْ دخولَه**.
-- ولم تُسرِّبْ شيئاً لأنّ أوّلَ سطرٍ فيها يرفضُ من لا هويّةَ له، **ولكنّ
-- بابَ الأمانِ لا يُترَكُ مواربًا لأنّ خلفَه قفلاً ثانياً**: تعديلٌ واحدٌ
-- غداً يرفعُ القفلَ الثانى ويبقى البابُ مفتوحاً. **ونصفُ إغلاقٍ ليس إغلاقاً.**
REVOKE ALL ON FUNCTION public.supplier_is_active_in_my_branch(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.supplier_is_active_in_my_branch(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.supplier_is_active_in_my_branch(uuid, uuid) TO authenticated;

-- =============================================================================
-- الفحصُ المرجعىُّ — يعيشُ فى القاعدةِ فيحرسُ البيتَ الذى رُكِّب فيه.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.assert_baseline_v3_75_23_check()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_name TEXT;
  v_arr  TEXT[];
BEGIN
  -- (١) البابُ الثانى موجودٌ وثابتٌ لا يتبدّل.
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'bill_payable_statuses'
       AND p.pronargs = 0 AND p.provolatile = 'i'
  ) THEN
    RAISE EXCEPTION 'v3.75.23: البابُ الثانى bill_payable_statuses مفقودٌ أو غيرُ ثابت.';
  END IF;

  -- (٢) والقانونُ يسألُ المصفوفةَ ولا يحملُ نسختَه منها.
  --     **وحارسٌ على نسختَين ليس حارساً** — فالمصفوفةُ سطرٌ واحدٌ فى البيت.
  IF strpos(pg_get_functiondef('public.bill_status_is_payable(text)'::regprocedure),
            'bill_payable_statuses') = 0 THEN
    RAISE EXCEPTION 'v3.75.23: القانونُ عادَ يحملُ نسختَه من الأسماء بدلَ أن يسألَ المصفوفة.';
  END IF;

  -- (٣) والبابانِ يقولانِ قولاً واحداً — يُقاسُ سلوكاً على كلِّ اسمٍ حىٍّ وميّت.
  v_arr := public.bill_payable_statuses();
  IF v_arr IS NULL OR array_length(v_arr, 1) IS NULL THEN
    RAISE EXCEPTION 'v3.75.23: المصفوفةُ فارغةٌ — بابٌ يقولُ إنّ لا شىءَ مالٌ أبداً.';
  END IF;
  FOREACH v_name IN ARRAY ARRAY[
    'draft','cancelled','rejected','pending_approval','sent','voided','approved','pending','',
    'received','partially_paid','paid','partially_returned','fully_returned'
  ] LOOP
    IF public.bill_status_is_payable(v_name) <> (v_name = ANY (v_arr)) THEN
      RAISE EXCEPTION 'v3.75.23: البابانِ اختلفا على الاسم: %', v_name;
    END IF;
  END LOOP;

  -- (٤) وما رُفض عند الاستلامِ يبقى خارجَ المال — الحكمُ نفسُه لا يتبدّلُ بتبديلِ الباب.
  IF 'rejected' = ANY (v_arr) OR 'draft' = ANY (v_arr) OR 'cancelled' = ANY (v_arr)
     OR 'sent' = ANY (v_arr) OR 'pending_approval' = ANY (v_arr) OR 'voided' = ANY (v_arr) THEN
    RAISE EXCEPTION 'v3.75.23: المصفوفةُ قبِلت حالةً لم تعبرِ الأستاذ.';
  END IF;

  -- (٥) ولا يُنادى بابٌ من أبوابِ هذا العضوِ إلّا من عرَفناه — لا زائرٌ ولا مجهول.
  --     **ومنعٌ عن الجميعِ ليس منعاً عن أحدٍ بعينِه**: المنعُ عن PUBLIC لا
  --     يرفعُ منحةً مباشرةً لـanon، ولذلك يُقاسُ الأثرُ لا تُقرأُ النيّة.
  IF has_function_privilege('anon', 'public.bill_payable_statuses()', 'EXECUTE') THEN
    RAISE EXCEPTION 'v3.75.23: البابُ الثانى مفتوحٌ لزائرٍ لم يُسجِّلْ دخولَه.';
  END IF;
  IF has_function_privilege('anon', 'public.bill_status_is_payable(text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'v3.75.23: القانونُ مفتوحٌ لزائرٍ لم يُسجِّلْ دخولَه.';
  END IF;
  IF has_function_privilege('anon', 'public.supplier_is_active_in_my_branch(uuid,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'v3.75.23: دالّةُ الحركةِ بصلاحيّاتٍ كاملةٍ ومفتوحةٌ لزائرٍ لم يُسجِّلْ دخولَه.';
  END IF;

  -- (٦) ويبقى البابُ مفتوحاً لمن يستعملُه فعلاً — **وحارسٌ يُغلقُ على البرىء يُطفأ.**
  IF NOT has_function_privilege('authenticated', 'public.bill_payable_statuses()', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.bill_status_is_payable(text)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.supplier_is_active_in_my_branch(uuid,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'v3.75.23: أُغلق بابٌ فى وجهِ من يحتاجُه — الشاشةُ تعطّلت.';
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.assert_baseline_v3_75_23_check() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assert_baseline_v3_75_23_check() FROM anon;
REVOKE ALL ON FUNCTION public.assert_baseline_v3_75_23_check() FROM authenticated;

SELECT public.assert_baseline_v3_75_23_check();
SELECT public.assert_baseline_v3_75_22_check();
