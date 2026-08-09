-- =============================================================================
-- v3.74.993 — غيابُ القاعدة يُقرأ منعاً لا إذناً
-- =============================================================================
-- بدأتُ أقيس حذفَ الدور `general_manager` — وهو مطلبٌ قديم — فقادنى القياسُ إلى
-- ما هو أخطرُ منه.
--
-- ═══ أوّلاً: سلاحٌ اسمُه لطيفٌ متروكٌ على الطاولة ═══
--
-- دالّتان اسمُهما `check_page_access` تُجيبان عن سؤالٍ واحد: «أيدخل صاحبُ هذا
-- الدور هذه الصفحة؟». وكلتاهما تقول، **حين لا تجد قاعدةً مكتوبة**:
--
--     -- إذا لم يوجد سجل، نفترض أن الوصول مسموح
--     IF NOT FOUND THEN RETURN TRUE; END IF;
--
-- **وطبقةُ التطبيق تقول عكسَه بالحرف**: `return false // Default to deny for
-- security`. فبيتان لسؤالٍ واحد، أحدُهما يفتح والآخرُ يغلق.
--
-- **ولا أُضخّم ما قِسته**: لا شاشةَ تنادى هاتين الدالّتين، ولا سياسةَ رؤية،
-- ولا مُشغِّل. **فهما لا تفتحان اليومَ باباً.** لكنّ اسمَهما يدعو من يقرأ
-- الشيفرةَ غداً أن يربطهما بسياسةٍ — واسمٌ لطيفٌ على منطقٍ يفتح **أخطرُ من
-- منطقٍ يفتح باسمٍ مخيف**.
--
-- وقِيس ما كان سيحدث لو رُبطتا، فى شركة «تست» وحدَها:
--
--   | الدور | صفحاتٌ لا قاعدةَ مكتوبةً لها | من |
--   |---|---|---|
--   | مسؤول التصنيع | ٤٦ | ٥١ |
--   | موظّف | ٤٦ | ٥١ |
--   | مسؤول المخزن | ٤٣ | ٥١ |
--   | مسؤول المشتريات | ٤٢ | ٥١ |
--
-- > **وبابٌ يُفتح لأنّ أحداً لم يكتب له قاعدةً ليس إذناً — هو صمتٌ قُرئ إذناً.**
--
-- ═══ وثانياً: الدورُ الذى لا وجودَ له وله صلاحيّات ═══
--
-- `general_manager`: **لا يشغله أحد** (صفر عضوٍ فى ستّ شركات)، **وليس فى
-- كتالوج الأدوار** أصلاً (سبعةٌ فيه، واثنا عشرَ يقبلها قيدُ العضويّة). ومع
-- ذلك له **اثنا عشرَ صفَّ صلاحيّاتٍ** فى ست شركات.
--
-- وقِيس قبل الحذف: **كلُّ بابٍ فى القاعدة يسمّيه يسمّى `admin` معه** — تسعون
-- دالّةً وستٌّ وعشرون سياسةَ رؤية، **لا استثناءَ واحد**. فحذفُه لا يُغلق باباً
-- على أحد. (و٩٧٧ جعلت `admin` هو المديرَ العامّ.)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- ١) الصمتُ يُقرأ منعاً — فى البيتين معاً
-- -----------------------------------------------------------------------------
-- ولا يُغيَّر معنى الصفِّ الموجود: من له قاعدةٌ مكتوبةٌ يبقى جوابُه كما هو،
-- **والتغييرُ فى الغياب وحدَه**.

CREATE OR REPLACE FUNCTION public.check_page_access(
    p_company_id uuid,
    p_role text,
    p_resource text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_can_access BOOLEAN;
BEGIN
  SELECT COALESCE(can_access, TRUE) INTO v_can_access
  FROM public.company_role_permissions
  WHERE company_id = p_company_id AND role = p_role AND resource = p_resource;

  -- v3.74.993 — **غيابُ القاعدة يُقرأ منعاً لا إذناً.** كان هنا RETURN TRUE،
  -- وطبقةُ التطبيق تقول عكسَه بالحرف. فصار البيتان يقولان قولاً واحداً.
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  RETURN v_can_access;
END;
$function$;

-- **وترتيبُ الوسيطين هنا معكوسٌ عن أختها**: المستخدمُ أوّلاً ثمّ الشركة.
-- قِيس من القاعدة ولم يُفترض — ولو افترضتُه لَقلبتُ السؤالَ رأساً على عقب.
CREATE OR REPLACE FUNCTION public.check_page_access(
    p_user_id uuid,
    p_company_id uuid,
    p_resource text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_role TEXT;
  v_can_access BOOLEAN;
BEGIN
  SELECT role INTO v_role
  FROM public.company_members
  WHERE user_id = p_user_id AND company_id = p_company_id;

  IF v_role IS NULL THEN
    RETURN FALSE;
  END IF;

  -- المالكُ والمديرُ يريان كلَّ شىء — وهذا قرارٌ مكتوبٌ لا صمت
  IF v_role IN ('owner', 'admin') THEN
    RETURN TRUE;
  END IF;

  SELECT COALESCE(crp.can_access, TRUE) INTO v_can_access
  FROM public.company_role_permissions crp
  WHERE crp.company_id = p_company_id
    AND crp.role = v_role
    AND crp.resource = p_resource;

  -- v3.74.993 — **غيابُ القاعدة يُقرأ منعاً لا إذناً** (انظر مثيلتَها أعلاه).
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  RETURN v_can_access;
END;
$function$;

-- ولا تُترك مكشوفةً لمن لا يحتاجها: لا شاشةَ تنادِيها ولا سياسة.
REVOKE ALL ON FUNCTION public.check_page_access(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.check_page_access(uuid, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.check_page_access(uuid, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.check_page_access(uuid, text, text) TO service_role;

REVOKE ALL ON FUNCTION public.check_page_access(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.check_page_access(uuid, uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.check_page_access(uuid, uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.check_page_access(uuid, uuid, text) TO service_role;

-- -----------------------------------------------------------------------------
-- ٢) والدورُ الذى لا وجودَ له يُرفع من مفردات العضويّة
-- -----------------------------------------------------------------------------
-- صفرُ عضوٍ يشغله، ولا صفَّ له فى كتالوج الأدوار، وكلُّ بابٍ يسمّيه يسمّى
-- `admin` معه. فلا يُغلق بحذفه بابٌ على أحد.

DO $roles$
DECLARE
  v_holders int;
BEGIN
  SELECT count(*) INTO v_holders FROM public.company_members WHERE role = 'general_manager';
  IF v_holders > 0 THEN
    RAISE EXCEPTION 'v3.74.993: % عضواً يشغل general_manager — لا يُحذف دورٌ يشغله أحد.', v_holders;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public' AND t.relname = 'company_members'
      AND c.conname = 'company_members_role_check'
      AND pg_get_constraintdef(c.oid) ILIKE '%general_manager%'
  ) THEN
    ALTER TABLE public.company_members DROP CONSTRAINT company_members_role_check;
    ALTER TABLE public.company_members ADD CONSTRAINT company_members_role_check
      CHECK (role = ANY (ARRAY[
        'owner'::text, 'admin'::text, 'manager'::text, 'accountant'::text,
        'store_manager'::text, 'staff'::text, 'viewer'::text,
        'manufacturing_officer'::text, 'booking_officer'::text,
        'purchasing_officer'::text, 'hr_officer'::text
      ]));
    RAISE NOTICE 'v3.74.993 · رُفع general_manager من مفردات العضويّة.';
  END IF;
END $roles$;

-- وصلاحيّاتُ دورٍ لا يستطيع أحدٌ أن يشغله سطورٌ تُقرأ فتُضلّل
DELETE FROM public.company_role_permissions WHERE role = 'general_manager';

-- -----------------------------------------------------------------------------
-- ٣) وفحصٌ مرجعىٌّ يُثبت الاتّجاهين ولا يترك ما زرع
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.assert_baseline_v3_74_993_check()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_company uuid;
  v_role text;
  v_resource text;
BEGIN
  -- ═══ الصمتُ منعٌ: دورٌ ومَوردٌ لا قاعدةَ بينهما ═══
  SELECT company_id INTO v_company FROM public.company_role_permissions LIMIT 1;
  IF v_company IS NULL THEN
    RAISE NOTICE 'v3.74.993 · لا صلاحيّاتٍ تُقاس عليها — لم يُدَّعَ قياس.';
  ELSE
    IF public.check_page_access(v_company, 'zz_role_nobody_holds', 'zz_resource_that_has_no_rule') IS NOT FALSE THEN
      RAISE EXCEPTION 'BASELINE FAIL: صمتُ القاعدة قُرئ إذناً — بابٌ يُفتح لأنّ أحداً لم يكتب له قاعدة (v3.74.993)';
    END IF;

    -- ═══ ولا يصرخ على البرىء: من له قاعدةٌ مكتوبةٌ يبقى جوابُه ═══
    SELECT role, resource INTO v_role, v_resource
    FROM public.company_role_permissions
    WHERE company_id = v_company AND COALESCE(can_access, TRUE) = TRUE
    LIMIT 1;

    IF v_role IS NOT NULL
       AND public.check_page_access(v_company, v_role, v_resource) IS NOT TRUE THEN
      RAISE EXCEPTION 'BASELINE FAIL: مُنع من له قاعدةٌ مكتوبةٌ تسمح (v3.74.993)';
    END IF;
  END IF;

  -- ═══ والدورُ المحذوفُ لا أثرَ له ═══
  IF EXISTS (SELECT 1 FROM public.company_members WHERE role = 'general_manager') THEN
    RAISE EXCEPTION 'BASELINE FAIL: عضوٌ يشغل دوراً محذوفاً (v3.74.993)';
  END IF;
  IF EXISTS (SELECT 1 FROM public.company_role_permissions WHERE role = 'general_manager') THEN
    RAISE EXCEPTION 'BASELINE FAIL: صلاحيّاتٌ لدورٍ لا يستطيع أحدٌ أن يشغله (v3.74.993)';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public' AND t.relname = 'company_members'
      AND c.conname = 'company_members_role_check'
      AND pg_get_constraintdef(c.oid) ILIKE '%general_manager%'
  ) THEN
    RAISE EXCEPTION 'BASELINE FAIL: مفرداتُ العضويّة ما زالت تقبل general_manager (v3.74.993)';
  END IF;

  -- ═══ وكلُّ دورٍ يشغله أحدٌ اليومَ تقبله المفردات ═══
  IF EXISTS (
    SELECT 1 FROM public.company_members cm
    WHERE NOT EXISTS (
      SELECT 1 FROM (VALUES
        ('owner'),('admin'),('manager'),('accountant'),('store_manager'),('staff'),
        ('viewer'),('manufacturing_officer'),('booking_officer'),('purchasing_officer'),('hr_officer')
      ) AS v(r) WHERE v.r = cm.role)
  ) THEN
    RAISE EXCEPTION 'BASELINE FAIL: عضوٌ يشغل دوراً خارج المفردات (v3.74.993)';
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.assert_baseline_v3_74_993_check() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assert_baseline_v3_74_993_check() FROM anon;
REVOKE ALL ON FUNCTION public.assert_baseline_v3_74_993_check() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.assert_baseline_v3_74_993_check() TO service_role;

-- -----------------------------------------------------------------------------
-- ولا تمرّ الدفعةُ إلّا بعد أن تُثبت نفسَها بالتشغيل
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  PERFORM public.assert_baseline_v3_74_993_check();
  RAISE NOTICE 'v3.74.993 · تمّت وأثبتت نفسَها.';
END $$;
