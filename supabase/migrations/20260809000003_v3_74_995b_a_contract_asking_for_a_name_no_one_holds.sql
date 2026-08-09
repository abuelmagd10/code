-- =============================================================================
-- v3.74.995b — عقدٌ يطلب اسماً لا يُشغَل يحرس شكلاً لا خاصّيّة
-- =============================================================================
-- كنس ٩٩٥ الأسماءَ التى لا يشغلها أحدٌ من ثمانٍ وثمانين دالّة. فسقط حارسان.
-- **وقِيس قبل أن يُلام أحد**: هل فقد إنسانٌ صلاحيّةً؟
--
--   can_manage_products  ما زالت تسمّى: owner · admin · manager · accountant ·
--                        store_manager · purchasing_officer  — **ستّتها كما كانت**
--   can_modify_data      ما زالت تسمّى العشرَ الحيّةَ كلَّها
--
-- **فلا أحدَ فقد شيئاً.** والحارسان يشترطان أن يبقى النصُّ ذاكراً
-- `general_manager` — وهو اسمٌ رفعه ٩٩٣ من مفردات العضويّة، فلا يستطيع أحدٌ أن
-- يشغله.
--
-- > **وعقدٌ يطلب اسماً لا يُشغَل يحرس شكلَ النصّ لا خاصّيّتَه.** (درس ٩٧٧)
--
-- ولا يُعاد الاسمُ ليسكت الحارس — **ذاك إرضاءُ فحصٍ بكذبة**. بل يُعلَّم العقدُ
-- الحقيقةَ الجديدة: كان يطلب اسماً ميّتاً واحداً، فصار يطلب **الوظائفَ الحيّةَ
-- الأربعَ** التى قُصد بها «الوظائف التشغيليّة الحديثة» — فصار أقوى لا أضعف.
-- =============================================================================

DO $fix$
DECLARE v_def text; v_new text; v_old text; v_rep text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='assert_baseline';
  IF v_def IS NULL THEN RAISE NOTICE 'v3.74.995b · لا assert_baseline.'; RETURN; END IF;

  IF position('LIKE ''%booking_officer%''' in v_def) > 0 THEN
    RAISE NOTICE 'v3.74.995b · العقدُ مُصلَحٌ سلفاً.'; RETURN;
  END IF;

  v_old := '    AND pg_get_functiondef(p.oid) LIKE ''%purchasing_officer%''' || chr(13) || E'\n' ||
           '    AND pg_get_functiondef(p.oid) LIKE ''%general_manager%'') THEN';
  IF position(v_old in v_def) = 0 THEN
    v_old := '    AND pg_get_functiondef(p.oid) LIKE ''%purchasing_officer%''' || E'\n' ||
             '    AND pg_get_functiondef(p.oid) LIKE ''%general_manager%'') THEN';
  END IF;
  IF position(v_old in v_def) = 0 THEN
    RAISE EXCEPTION 'v3.74.995b: لم أجد الشرطَ كما هو — لم أكتب شيئاً.';
  END IF;

  v_rep := '    AND pg_get_functiondef(p.oid) LIKE ''%purchasing_officer%''' ||
           CASE WHEN position(chr(13) in v_old) > 0 THEN chr(13) ELSE '' END || E'\n' ||
           '    AND pg_get_functiondef(p.oid) LIKE ''%booking_officer%''' ||
           CASE WHEN position(chr(13) in v_old) > 0 THEN chr(13) ELSE '' END || E'\n' ||
           '    AND pg_get_functiondef(p.oid) LIKE ''%manufacturing_officer%''' ||
           CASE WHEN position(chr(13) in v_old) > 0 THEN chr(13) ELSE '' END || E'\n' ||
           '    AND pg_get_functiondef(p.oid) LIKE ''%hr_officer%'') THEN';

  v_new := replace(v_def, v_old, v_rep);
  -- تحقّقٌ عكسىّ: يُعاد الجديدُ إلى القديم فيجب أن يطابقه حرفاً بحرف
  IF replace(v_new, v_rep, v_old) <> v_def THEN
    RAISE EXCEPTION 'v3.74.995b: التحقّقُ العكسىُّ فشل — أُلغيت.';
  END IF;
  EXECUTE v_new;
  PERFORM public.assert_baseline();
  RAISE NOTICE 'v3.74.995b · العقدُ صار يطلب الوظائفَ الحيّةَ الأربع.';
END $fix$;
