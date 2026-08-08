-- =============================================================================
-- v3.74.986 — حارسٌ فى غير موضعه لا يحرس شيئاً
-- =============================================================================
-- قُرئت أبوابُ الاعتماد الباقيةُ **سطراً سطراً لا بمسحٍ آلىّ**. وخرج منها ما
-- هو أخطرُ من الغياب:
--
--   **ثلاثةُ أبوابٍ تحمل مقارنةً تبدو حارساً وهى لا تحرس شيئاً.** فيها بالضبط
--   `if (requesterId !== user.id)` — **لكنّه بعد الاعتماد**، داخل كتلة
--   الإشعارات. فالاعتمادُ يُكتب أوّلاً بلا شرط، ثمّ يأتى السطرُ ليقرّر:
--   أأُرسل إشعاراً أم لا. وفى أحدها التعليقُ مكتوبٌ بالحرف «Self-approval
--   guard» — فمن يقرأ الملفَّ يظنُّه محروساً وهو مفتوح.
--
--   والأبواب: اعتمادُ استرداد العميل · اعتمادُ مرتجع المبيعات · اعتمادُ
--   تصحيح دفعة مورّد.
--
-- > **وبابٌ مكشوفٌ يُرى فيُغلق، وحارسٌ فى غير موضعه يُطمئن فيُنسى.**
--
-- وبابٌ رابعٌ — نقلُ الصلاحيّات — يمنع الاعتمادَ الذاتىَّ **ويستثنى الحالةَ
-- التى لا معتمِدَ فيها غيرُه**، فلا تتوقّف الشركة. **وهذه قاعدةُ المالك
-- الرابعةُ مكتوبةً بيد مبرمجٍ قبلنا دون أن يسمّيها** — فتُسمّى الآن وتصير
-- بيتاً واحداً بدل أن تُكتب فى كلِّ بابٍ من جديد.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- بيتٌ واحدٌ يحمل القواعدَ الثلاثَ معاً
-- -----------------------------------------------------------------------------
--   ٣) مَن أنشأ لا يعتمد.
--   ١) إلّا المالك — فلا أحدَ فوقه ليعتمد عنه.
--   ٤) وإلّا إن لم يوجد معتمِدٌ آخرُ أصلاً — فخطوةٌ لا صاحبَ لها لا تُوقف العمل.
--
-- ويُرجع NULL إن كان التوقيعُ جائزاً، وإلّا فالسببَ بالعربيّة ليقرأه المستخدم.

CREATE OR REPLACE FUNCTION public.erp_self_approval_error(
    p_company_id uuid,
    p_created_by uuid,
    p_approver uuid,
    p_approver_roles text[]
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_others int;
BEGIN
  -- لا منشئَ معروفٌ أو لا معتمِد: لا دعوى
  IF p_created_by IS NULL OR p_approver IS NULL THEN
    RETURN NULL;
  END IF;

  -- اعتمده غيرُ من أنشأه: هذه هى الرقابة
  IF p_created_by <> p_approver THEN
    RETURN NULL;
  END IF;

  -- (قاعدة ١) ما ينشئه المالك لا يطلب اعتماداً
  IF public.erp_creator_needs_no_approval(p_company_id, p_approver) THEN
    RETURN NULL;
  END IF;

  -- (قاعدة ٤) خطوةٌ لا صاحبَ لها لا تُوقف العمل
  IF p_approver_roles IS NULL OR array_length(p_approver_roles, 1) IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT count(*) INTO v_others
  FROM public.company_members cm
  WHERE cm.company_id = p_company_id
    AND cm.user_id <> p_approver
    AND cm.role = ANY (p_approver_roles);

  IF v_others = 0 THEN
    RETURN NULL;
  END IF;

  RETURN 'لا تعتمد ما أنشأتَه بنفسك — وفى الشركة ' || v_others || ' من يملك اعتمادَه';
END;
$function$;

REVOKE ALL ON FUNCTION public.erp_self_approval_error(uuid, uuid, uuid, text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.erp_self_approval_error(uuid, uuid, uuid, text[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.erp_self_approval_error(uuid, uuid, uuid, text[]) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- وفحصٌ مرجعىٌّ يُثبت الاتّجاهات كلَّها بأعضاءَ حقيقيّين لا بافتراض
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.assert_baseline_v3_74_986_check()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_company uuid;
  v_owner uuid;
  v_other uuid;
  v_lonely uuid := '11111111-1111-1111-1111-111111111111'::uuid;
BEGIN
  -- شركةٌ فيها مالكٌ وعضوٌ آخرُ غيرُ مالك — تُقاس ولا تُفترض
  SELECT o.company_id, o.user_id, x.user_id
    INTO v_company, v_owner, v_other
  FROM public.company_members o
  JOIN public.company_members x
    ON x.company_id = o.company_id AND x.user_id <> o.user_id AND x.role <> 'owner'
  WHERE o.role = 'owner'
  LIMIT 1;

  IF v_company IS NULL THEN
    RAISE EXCEPTION 'BASELINE FAIL: لم أجد شركةً فيها مالكٌ وعضوٌ آخر — ولا أحكم بلا مقياس (v3.74.986)';
  END IF;

  -- (قاعدة ٣) غيرُ المالك لا يعتمد ما أنشأه، ما دام هناك معتمِدٌ آخر
  IF public.erp_self_approval_error(v_company, v_other, v_other, ARRAY['owner']) IS NULL THEN
    RAISE EXCEPTION 'BASELINE FAIL: قبِل أن يعتمد المرءُ ما أنشأه وفى الشركة معتمِدٌ غيرُه (v3.74.986)';
  END IF;

  -- (قاعدة ١) والمالكُ يوقّع لنفسه — لا أحدَ فوقه
  IF public.erp_self_approval_error(v_company, v_owner, v_owner, ARRAY['owner']) IS NOT NULL THEN
    RAISE EXCEPTION 'BASELINE FAIL: منع المالكَ من اعتماد ما أنشأه — ولا أحدَ أعلى منه (v3.74.986)';
  END IF;

  -- (قاعدة ٤) ومن لا معتمِدَ غيرُه لا يُوقَف
  IF public.erp_self_approval_error(v_company, v_lonely, v_lonely, ARRAY['a_role_nobody_holds']) IS NOT NULL THEN
    RAISE EXCEPTION 'BASELINE FAIL: أوقف العملَ حيث لا معتمِدَ آخرَ أصلاً (v3.74.986)';
  END IF;

  -- ولا يصرخ على البرىء: اعتمده شخصٌ آخر
  IF public.erp_self_approval_error(v_company, v_other, v_owner, ARRAY['owner']) IS NOT NULL THEN
    RAISE EXCEPTION 'BASELINE FAIL: صرخ على اعتمادٍ وقّعه شخصٌ آخر (v3.74.986)';
  END IF;

  -- ولا على مستندٍ لا يُعرف منشئُه
  IF public.erp_self_approval_error(v_company, NULL, v_owner, ARRAY['owner']) IS NOT NULL THEN
    RAISE EXCEPTION 'BASELINE FAIL: صرخ على مستندٍ بلا منشئٍ معروف (v3.74.986)';
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.assert_baseline_v3_74_986_check() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assert_baseline_v3_74_986_check() FROM anon;
GRANT EXECUTE ON FUNCTION public.assert_baseline_v3_74_986_check() TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- ولا تمرّ الدفعةُ إلّا بعد أن تُثبت نفسَها بالتشغيل
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  PERFORM public.assert_baseline_v3_74_986_check();
  RAISE NOTICE 'v3.74.986 · تمّت وأثبتت نفسَها.';
END $$;
