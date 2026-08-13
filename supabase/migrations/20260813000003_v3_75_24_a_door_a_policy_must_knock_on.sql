-- v3.75.24 — «وبابٌ تطرقُه سياسةٌ لا يُغلَقُ فى وجهِ الطارق»
-- =============================================================================
-- أغلقتُ فى v3.75.23 — قبلَ ساعةٍ — بابَ `supplier_is_active_in_my_branch` فى
-- وجهِ الزائر. وكان الإغلاقُ **خطأً**، وقد كُتب سببُه فى المشروعِ قبلَ أن أُخطئه:
--
--   > «ودالّةٌ تُستدعى داخلَ سياسةِ حمايةٍ **يجب** أن تكونَ قابلةً للتنفيذِ من
--   >  الأدوارِ التى تُقيَّمُ لها تلك السياسة؛ ونزعُ التنفيذِ لا يشدُّ شيئاً بل
--   >  يكسرُ حمايةَ الصفوف.»   — `check-anon-reachable-functions.js`
--
-- والدالّةُ مُستدعاةٌ داخلَ سياسةِ الاطّلاعِ على `suppliers`، و`anon` يملكُ
-- SELECT على الجدول. **وقِيس حيّاً لا نظريّاً**: جلسةُ زائرٍ تقرأُ الموردينَ
-- فتُصادفُ الآن:
--
--   > `ERROR: permission denied for function supplier_is_active_in_my_branch`
--
-- **فلم يعُدْ يُردُّ بصفرِ صفوفٍ بل بعطبٍ صريح.** ولا يُختصرُ الشرطُ الأوّلُ
-- ليُنجيَه: بوستجريس قيّمَ الطرفَ الثانىَ فعلاً — **ولا يُبنى أمانٌ على أنّ
-- المخطِّطَ سيقصّرُ فى تقييمِ شرط**.
--
-- **ولا يُسرِّبُ فتحُها شيئاً**: أوّلُ سطرٍ فيها يردُّ من لا هويّةَ له بـFALSE.
-- =============================================================================
-- وثلاثةُ أعمالٍ فى دفعةٍ واحدة، والأوّلُ إصلاحُ ما كسرتُه:
--
--   (أ) يُفتَحُ البابُ الذى تطرقُه السياسة.
--   (ب) ويُغلَقُ **المصدر**: تُنزَعُ منحةُ الزائرِ من **الصلاحيّاتِ الافتراضيّة**،
--       فتُولَدُ كلُّ دالّةٍ جديدةٍ **مغلقةً** بدلَ أن تُولَدَ مفتوحةً ثمّ يُتذكَّرَ
--       إغلاقُها. **ومنعٌ عن الجميعِ ليس منعاً عن أحدٍ بعينِه.**
--   (ج) ويُنصَبُ **الإنذارُ المقابل**: إغلاقُ المصدرِ وحدَه فخٌّ للمستقبل — أىُّ
--       هجرةٍ تُعيدُ خلقَ دالّةِ سياسةٍ تُولَدُ مغلقةً فتكسرُ الحماية. فالفحصُ
--       يقيسُ الاتّجاهَين: **لا يزيدُ المفتوحُ، ولا ينقصُ ما تحتاجُه سياسة.**
-- =============================================================================

-- —— (أ) البابُ الذى تطرقُه السياسةُ يُفتَحُ لمن تُقيَّمُ له ————————————————
GRANT EXECUTE ON FUNCTION public.supplier_is_active_in_my_branch(uuid, uuid) TO anon;

-- —— (ب) المصدر: تُولَدُ الدالّاتُ مغلقةً لا مفتوحة ————————————————————————
-- الصلاحيّةُ الافتراضيّةُ فى `public` كانت تمنحُ التنفيذَ لـ`anon` **لكلِّ دالّةٍ
-- جديدة**، ولذلك كان `REVOKE ... FROM PUBLIC` لا يُغلقُ شيئاً. تُنزَعُ من المنبع.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM anon;

-- =============================================================================
-- (ج) الفحصُ المرجعىُّ — يقيسُ الاتّجاهَين معاً.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.assert_baseline_v3_75_24_check()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_missing TEXT;
  v_open    INT;
  v_ceiling CONSTANT INT := 135;
BEGIN
  -- (١) **الأرضيّة**: كلُّ دالّةٍ تطرقُها سياسةُ حمايةٍ على جدولٍ يبلغُه الزائرُ
  --     يجب أن يستطيعَ الزائرُ تنفيذَها — وإلّا رُدَّ بعطبٍ لا بصفرِ صفوف.
  --     **وتُقاسُ حيّاً من الكتالوجِ ولا تُكتَبُ قائمةً بيد.**
  SELECT string_agg(x.proname, ', ' ORDER BY x.proname) INTO v_missing
  FROM (
    WITH pol AS (
      SELECT c.oid AS reloid,
             COALESCE(pg_get_expr(p2.polqual, p2.polrelid), '') || ' ' ||
             COALESCE(pg_get_expr(p2.polwithcheck, p2.polrelid), '') AS body
        FROM pg_policy p2
        JOIN pg_class c ON c.oid = p2.polrelid
        JOIN pg_namespace n2 ON n2.oid = c.relnamespace AND n2.nspname = 'public'
       WHERE has_table_privilege('anon', c.oid, 'SELECT')
    ), fn AS (
      SELECT p3.oid, p3.proname
        FROM pg_proc p3 JOIN pg_namespace n3 ON n3.oid = p3.pronamespace
       WHERE n3.nspname = 'public' AND p3.prokind = 'f'
    )
    SELECT DISTINCT fn.proname
      FROM fn JOIN pol ON pol.body ~ ('\m' || fn.proname || '\s*\(')
     WHERE NOT has_function_privilege('anon', fn.oid, 'EXECUTE')
  ) x;

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION
      'v3.75.24: سياسةُ حمايةٍ تطرقُ باباً مغلقاً فى وجهِ الزائرِ — تُردُّ بعطبٍ لا بصفرِ صفوف: %',
      v_missing;
  END IF;

  -- (٢) **السقف**: لا يزيدُ عددُ الدالّاتِ ذاتِ الصلاحيّاتِ الكاملةِ التى يبلغُها
  --     الزائر. وقد قِيس ١٣٤ قبلَ هذه الدفعة، وصارَ ١٣٥ **بضرورةٍ مبرهَنة** فى
  --     البندِ (١) لا برغبة. **معدودٌ لا مسكوتٌ عنه.**
  SELECT count(*) INTO v_open
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.prokind = 'f' AND p.prosecdef
     AND has_function_privilege('anon', p.oid, 'EXECUTE');

  IF v_open > v_ceiling THEN
    RAISE EXCEPTION
      'v3.75.24: زادَ ما يبلغُه الزائرُ من دالّاتِ الصلاحيّاتِ الكاملة: % (السقف %).',
      v_open, v_ceiling;
  END IF;

  -- (٣) **المصدر**: الصلاحيّةُ الافتراضيّةُ لم تعُدْ تمنحُ الزائرَ تنفيذَ كلِّ
  --     دالّةٍ جديدة — فتُولَدُ مغلقةً، ومن احتاجَ فتحاً فتحَ بقرارٍ مكتوب.
  IF EXISTS (
    SELECT 1 FROM pg_default_acl d
      JOIN pg_namespace n ON n.oid = d.defaclnamespace
     WHERE n.nspname = 'public' AND d.defaclobjtype = 'f'
       AND d.defaclrole = 'postgres'::regrole
       AND d.defaclacl::text LIKE '%anon=X%'
  ) THEN
    RAISE EXCEPTION 'v3.75.24: الصلاحيّةُ الافتراضيّةُ عادت تمنحُ الزائرَ كلَّ دالّةٍ جديدة.';
  END IF;

  -- (٤) ومن يحتاجُ البابَ يبقى له مفتوحاً — **وحارسٌ يُغلقُ على البرىء يُطفأ.**
  IF NOT has_function_privilege('authenticated', 'public.supplier_is_active_in_my_branch(uuid,uuid)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.bill_status_is_payable(text)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.bill_payable_statuses()', 'EXECUTE') THEN
    RAISE EXCEPTION 'v3.75.24: أُغلق بابٌ فى وجهِ من يحتاجُه.';
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.assert_baseline_v3_75_24_check() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assert_baseline_v3_75_24_check() FROM anon;
REVOKE ALL ON FUNCTION public.assert_baseline_v3_75_24_check() FROM authenticated;

-- =============================================================================
-- وفحصُ الأمسِ يُصحَّح: كان يشترطُ إغلاقَ بابٍ تطرقُه سياسة.
-- **وفحصٌ يشترطُ الخطأَ يُثبّتُ الخطأ** — فيُبدَّلُ شرطُه بالصوابِ الذى قِيس.
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

  -- (٤) وما رُفض عند الاستلامِ يبقى خارجَ المال.
  IF 'rejected' = ANY (v_arr) OR 'draft' = ANY (v_arr) OR 'cancelled' = ANY (v_arr)
     OR 'sent' = ANY (v_arr) OR 'pending_approval' = ANY (v_arr) OR 'voided' = ANY (v_arr) THEN
    RAISE EXCEPTION 'v3.75.23: المصفوفةُ قبِلت حالةً لم تعبرِ الأستاذ.';
  END IF;

  -- (٥) وبابا القانونِ لا يبلغُهما زائر — ولا تطرقُهما سياسةُ حماية، فإغلاقُهما
  --     لا يكسرُ شيئاً. **ولا يُقاسُ بابانِ بمقياسِ بابٍ ثالثٍ تطرقُه سياسة.**
  IF has_function_privilege('anon', 'public.bill_payable_statuses()', 'EXECUTE') THEN
    RAISE EXCEPTION 'v3.75.23: البابُ الثانى مفتوحٌ لزائرٍ لم يُسجِّلْ دخولَه.';
  END IF;
  IF has_function_privilege('anon', 'public.bill_status_is_payable(text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'v3.75.23: القانونُ مفتوحٌ لزائرٍ لم يُسجِّلْ دخولَه.';
  END IF;

  -- (٦) **ودالّةُ الحركةِ تطرقُها سياسةُ الاطّلاعِ على الموردين، فتبقى مفتوحةً
  --     للزائرِ عمداً** (v3.75.24) — وأمانُها فى جسدِها لا فى منحتِها: أوّلُ
  --     سطرٍ فيها يردُّ من لا هويّةَ له. وهذا هو **الفحصُ الصحيحُ** بدلَ الذى
  --     كان يشترطُ إغلاقَها فيكسرُ حمايةَ الصفوف.
  IF NOT has_function_privilege('anon', 'public.supplier_is_active_in_my_branch(uuid,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'v3.75.23: بابٌ تطرقُه سياسةُ الموردينَ مغلقٌ — يُردُّ الزائرُ بعطبٍ لا بصفرِ صفوف.';
  END IF;
  IF strpos(pg_get_functiondef('public.supplier_is_active_in_my_branch(uuid,uuid)'::regprocedure),
            'auth.uid() IS NULL') = 0 THEN
    RAISE EXCEPTION 'v3.75.23: دالّةُ الحركةِ لم تعُدْ تردُّ من لا هويّةَ له — وهى مفتوحةٌ للزائر.';
  END IF;

  -- (٧) ويبقى البابُ مفتوحاً لمن يستعملُه فعلاً.
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

SELECT public.assert_baseline_v3_75_24_check();
SELECT public.assert_baseline_v3_75_23_check();
