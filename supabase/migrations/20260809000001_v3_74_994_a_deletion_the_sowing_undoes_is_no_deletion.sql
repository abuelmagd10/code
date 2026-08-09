-- =============================================================================
-- v3.74.994 — حذفٌ يُعيد الزرعُ ما اقتلعه ليس حذفاً
-- =============================================================================
-- فى ٩٩٣ رُفع الدور `general_manager` من مفردات العضويّة وحُذفت صلاحيّاتُه.
-- ثمّ قِيس الأثر، فظهر أنّ الحذف **غيرُ دائم**:
--
--   دالّةُ `seed_reports_access_v581` تُدرج صلاحيّاتٍ لهذا الدور بعينه،
--   ويستدعيها مُشغِّلٌ حىٌّ عند إنشاء **أىِّ شركةٍ جديدة**. فأوّلُ شركةٍ تُنشأ
--   بعد ٩٩٣ كانت ستولد ومعها ما اقتُلع بالأمس.
--
-- > **وحذفٌ يُعيد الزرعُ ما اقتلعه ليس حذفاً.**
--
-- والعلاجُ ليس شطبَ الاسم من قائمةٍ مكتوبةٍ بيد — ذاك مُسكّن يعود العطبُ بعده
-- بأىِّ اسمٍ آخر. العلاجُ أن يكون **لمفردات الأدوار بيتٌ واحد** يُقرأ من القيد
-- المُنفَّذ نفسِه، فلا تستطيع مِزرعةٌ أن تزرع وظيفةً لا يقبلها النظام.
--
-- ═══ وبيتان يختلفان فى المفردات ═══
--
-- قِيس، فإذا القيدُ المُنفَّذ يقبل **إحدى عشرةَ وظيفة**، وجدولُ الأدوار المرجعىُّ
-- يذكر **سبعاً**. والأربعُ الغائبة: الحجوزات · الموارد البشريّة · التصنيع ·
-- المشتريات. **واثنان من العاملين يشغلان اثنتين منها اليوم** — والمرجعُ لا
-- يعرف أنّهما موجودان.
--
-- ولا يُحذف المرجع (فالوظيفةُ غيرُ المستعملة ليست زائدة) بل يُصالَح مع الحقيقة،
-- ويُمنع بفحصٍ مرجعىٍّ أن يختلفا ثانيةً.
--
-- ═══ وإشعارٌ يُكتب لدورٍ ميّتٍ ثمّ يُنقذ ═══
--
-- مُشغِّلُ الحوكمة عند تعديل فاتورةٍ يُنشئ إشعارَين **بالنصِّ نفسِه والعنوان
-- نفسِه**: واحداً للمالك وواحداً للدور المحذوف. والثانى يلتقطه مُشغِّلُ الإنقاذ
-- فيحوّله للمالك — **فيصل المالكَ الخبرُ نفسُه مرّتين**. فحُذف الثانى.
--
-- > **والوصولُ يُكتب ولا يُنقَذ.**
-- =============================================================================

-- -----------------------------------------------------------------------------
-- ١) بيتٌ واحدٌ لمفردات الأدوار — يُقرأ من القيد المُنفَّذ لا من نسخةٍ منه
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.erp_membership_roles()
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
  SELECT coalesce(array_agg(DISTINCT m[1] ORDER BY m[1]), ARRAY[]::text[])
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  CROSS JOIN LATERAL regexp_matches(pg_get_constraintdef(c.oid), '''([a-z_]+)''::text', 'g') AS m
  WHERE n.nspname = 'public'
    AND t.relname = 'company_members'
    AND c.conname = 'company_members_role_check';
$function$;

COMMENT ON FUNCTION public.erp_membership_roles() IS
  'v3.74.994 — البيتُ الواحدُ لمفردات الأدوار: تُقرأ من قيد العضويّة المُنفَّذ نفسِه، فمن أضاف وظيفةً غداً لا يحتاج أن يتذكّر أحداً.';

-- -----------------------------------------------------------------------------
-- ٢) ونيّةُ المِزرعة تُعلَن فى موضعٍ واحدٍ يُقاس
-- -----------------------------------------------------------------------------
-- **ولا تُشتقّ القائمةُ من المفردات كلِّها**: ذاك يمنح التقاريرَ لوظائفَ لم
-- تكن تراها (موظّف · عارض) — توسيعُ رؤيةٍ بلا قرار. فالنيّةُ تبقى كما هى،
-- **وتُصفَّى بالمفردات** فلا تُزرع وظيفةٌ لا يقبلها النظام.
CREATE OR REPLACE FUNCTION public.erp_reports_seed_roles()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
AS $function$
  SELECT ARRAY['manager','accountant','store_manager',
               'purchasing_officer','booking_officer','manufacturing_officer']::text[];
$function$;

CREATE OR REPLACE FUNCTION public.erp_financial_reports_seed_roles()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
AS $function$
  SELECT ARRAY['owner','admin']::text[];
$function$;

-- -----------------------------------------------------------------------------
-- ٣) والمِزرعةُ لا تزرع إلّا ما تقبله المفردات
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.seed_reports_access_v581(p_company_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_role  text;
  v_vocab text[] := public.erp_membership_roles();
BEGIN
  -- v3.74.994 — كانت هنا قائمتان مكتوبتان باليد، فيهما اسمٌ حذفه ٩٩٣.
  -- فصارت النيّةُ تُصفَّى بالمفردات: ما لا يقبله النظام لا يُزرع.
  FOREACH v_role IN ARRAY public.erp_reports_seed_roles() LOOP
    IF NOT (v_role = ANY (v_vocab)) THEN CONTINUE; END IF;
    INSERT INTO public.company_role_permissions
      (company_id, role, resource, can_access, can_read, can_write, can_update, can_delete, all_access, allowed_actions)
    VALUES (p_company_id, v_role, 'reports', true, true, false, false, false, false, '{}')
    ON CONFLICT (company_id, role, resource) DO UPDATE
      SET can_access = true, can_read = true;
  END LOOP;

  FOREACH v_role IN ARRAY public.erp_financial_reports_seed_roles() LOOP
    IF NOT (v_role = ANY (v_vocab)) THEN CONTINUE; END IF;
    INSERT INTO public.company_role_permissions
      (company_id, role, resource, can_access, can_read, can_write, can_update, can_delete, all_access, allowed_actions)
    VALUES (p_company_id, v_role, 'financial_reports', true, true, false, false, false, false, '{}')
    ON CONFLICT (company_id, role, resource) DO UPDATE
      SET can_access = true, can_read = true;
  END LOOP;
END;
$function$;

-- -----------------------------------------------------------------------------
-- ٤) ويُصالَح المرجعُ مع الحقيقة
-- -----------------------------------------------------------------------------
INSERT INTO public.roles (name, title_ar, title_en, description_ar, description_en, priority, is_system)
SELECT v.name, v.title_ar, v.title_en, v.desc_ar, v.desc_en, v.priority, true
FROM (VALUES
  ('purchasing_officer',    'مسؤول المشتريات', 'Purchasing Officer',
   'يُنشئ أوامرَ الشراء ويتابع المورّدين', 'Raises purchase orders and follows suppliers', 8),
  ('booking_officer',       'مسؤول الحجوزات', 'Booking Officer',
   'يُدير الحجوزات ومواعيدها', 'Manages bookings and their schedule', 9),
  ('manufacturing_officer', 'مسؤول التصنيع', 'Manufacturing Officer',
   'يُدير أوامرَ الإنتاج وصرفَ الموادّ', 'Manages production orders and material issues', 10),
  ('hr_officer',            'مسؤول الموارد البشرية', 'HR Officer',
   'يُدير شؤونَ العاملين والحضور والرواتب', 'Manages staff, attendance and payroll', 11)
) AS v(name, title_ar, title_en, desc_ar, desc_en, priority)
WHERE v.name = ANY (public.erp_membership_roles())
  AND NOT EXISTS (SELECT 1 FROM public.roles r WHERE r.name = v.name);

-- -----------------------------------------------------------------------------
-- ٥) وإشعاراتٌ لا يبلغها أحدٌ تُعاد إلى من يقرؤها
-- -----------------------------------------------------------------------------
-- قاعدةُ الرؤية فى القاعدة: يرى المستخدمُ ما وُجّه إلى **دوره هو**، أو إلى لا
-- أحد، أو (إن كان مالكاً) ما وُجّه إلى `admin`. فما وُجّه إلى دورٍ لا يشغله أحد
-- لا يبلغ أحداً — ولا حتّى المالك.
--
-- **ومُشغِّلا الجدول كلاهما عند الإدراج لا التحديث** — قِيس ولم يُفترض — فهذه
-- اللمسةُ لا تُوقظ شيئاً. (درسُ ٩٩٢: يُقاس ما يُوقظه الفعل.)
UPDATE public.notifications
   SET assigned_to_role = 'owner'
 WHERE assigned_to_role IS NOT NULL
   AND NOT (assigned_to_role = ANY (public.erp_membership_roles()))
   AND assigned_to_user IS NULL;

-- -----------------------------------------------------------------------------
-- ٦) والخبرُ الواحد لا يُرسل مرّتين لجمهورٍ واحد
-- -----------------------------------------------------------------------------
DO $governance$
DECLARE
  v_def       text;
  v_lines     text[];
  v_out       text[] := ARRAY[]::text[];
  v_i         int;
  v_start     int;
  v_removed   int := 0;
  v_skip_to   int := 0;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'enforce_governance_on_insert';

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'v3.74.994: لم أجد enforce_governance_on_insert.';
  END IF;

  IF position('pending_approval_gm_after_edit' in v_def) = 0 THEN
    RAISE NOTICE 'v3.74.994 · النداءان المكرَّران محذوفان سلفاً.';
  ELSE
    v_lines := string_to_array(v_def, E'\n');
    FOR v_i IN 1 .. array_length(v_lines, 1) LOOP
      IF v_i <= v_skip_to THEN CONTINUE; END IF;
      IF position('pending_approval_gm_after_edit' in v_lines[v_i]) > 0 THEN
        -- ارجع إلى فاتحة النداء
        v_start := v_i;
        WHILE v_start > 1 AND position('PERFORM create_notification(' in v_lines[v_start]) = 0 LOOP
          v_start := v_start - 1;
        END LOOP;
        IF position('PERFORM create_notification(' in v_lines[v_start]) = 0 THEN
          RAISE EXCEPTION 'v3.74.994: لم أجد فاتحةَ النداء قبل السطر %.', v_i;
        END IF;
        -- امضِ إلى خاتمته
        v_skip_to := v_i;
        WHILE v_skip_to <= array_length(v_lines,1) AND trim(v_lines[v_skip_to]) <> ');' LOOP
          v_skip_to := v_skip_to + 1;
        END LOOP;
        IF v_skip_to > array_length(v_lines,1) THEN
          RAISE EXCEPTION 'v3.74.994: نداءٌ بلا خاتمة عند السطر %.', v_i;
        END IF;
        -- والسطورُ المُدرجةُ سلفاً بين الفاتحة والسطر الحالىّ تُنزع
        v_out := v_out[1 : array_length(v_out,1) - (v_i - v_start)];
        v_removed := v_removed + 1;
        CONTINUE;
      END IF;
      v_out := array_append(v_out, v_lines[v_i]);
    END LOOP;

    IF v_removed <> 2 THEN
      RAISE EXCEPTION 'v3.74.994: توقّعتُ نداءَين مكرَّرَين فوجدتُ %. لم أكتب شيئاً.', v_removed;
    END IF;

    v_def := array_to_string(v_out, E'\n');
    IF position('pending_approval_gm_after_edit' in v_def) > 0
       OR position('pending_approval_owner_after_edit' in v_def) = 0 THEN
      RAISE EXCEPTION 'v3.74.994: النصُّ الناتجُ لا يُطابق المتوقَّع. أُلغيت.';
    END IF;
    EXECUTE v_def;
    RAISE NOTICE 'v3.74.994 · حُذف نداءان مكرَّران من مُشغِّل الحوكمة.';
  END IF;
END $governance$;

-- -----------------------------------------------------------------------------
-- ٧) وفحصٌ مرجعىٌّ لا يُثبت حقّاً لمن لا وجودَ له
-- -----------------------------------------------------------------------------
DO $b988$
DECLARE v_def text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname='public' AND p.proname='assert_baseline_v3_74_988_check';
  IF v_def IS NULL THEN RAISE NOTICE 'v3.74.994 · لا فحصَ ٩٨٨.'; RETURN; END IF;
  IF position('''general_manager''' in v_def) = 0 THEN
    RAISE NOTICE 'v3.74.994 · فحصُ ٩٨٨ يقيس بدورٍ حىٍّ سلفاً.'; RETURN;
  END IF;
  v_def := replace(v_def, '''pending_director'',''APPROVE'',''general_manager''',
                          '''pending_director'',''APPROVE'',''admin''');
  v_def := replace(v_def, '''pending_director'', ''APPROVE'', ''general_manager''',
                          '''pending_director'', ''APPROVE'', ''admin''');
  IF position('''general_manager''' in v_def) > 0 THEN
    RAISE EXCEPTION 'v3.74.994: بقى الاسمُ فى فحص ٩٨٨ بعد الاستبدال — صياغةٌ لم أتوقّعها.';
  END IF;
  EXECUTE v_def;
  RAISE NOTICE 'v3.74.994 · فحصُ ٩٨٨ صار يقيس بدورٍ يشغله بشر.';
END $b988$;

-- -----------------------------------------------------------------------------
-- ٨) والفحصُ المرجعىُّ التاسعُ والعشرون
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.assert_baseline_v3_74_994_check()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_vocab   text[] := public.erp_membership_roles();
  v_missing text;
  v_extra   text;
  v_bad     text;
  v_company uuid;
  v_caught  boolean;
BEGIN
  IF array_length(v_vocab,1) IS NULL OR array_length(v_vocab,1) = 0 THEN
    RAISE EXCEPTION 'BASELINE FAIL: مفرداتُ الأدوار فارغة — بيتٌ لا يقول شيئاً (v3.74.994)';
  END IF;

  -- ═══ المرجعُ والقيدُ يقولان قولاً واحداً ═══
  SELECT string_agg(r, ', ') INTO v_missing
  FROM unnest(v_vocab) AS r WHERE r NOT IN (SELECT name FROM public.roles);
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'BASELINE FAIL: وظائفُ يقبلها القيدُ ولا يعرفها المرجع: % (v3.74.994)', v_missing;
  END IF;
  SELECT string_agg(name, ', ') INTO v_extra
  FROM public.roles WHERE NOT (name = ANY (v_vocab));
  IF v_extra IS NOT NULL THEN
    RAISE EXCEPTION 'BASELINE FAIL: وظائفُ فى المرجعِ لا يقبلها القيد: % (v3.74.994)', v_extra;
  END IF;

  -- ═══ ونيّةُ المِزرعة كلُّها مقبولة ═══
  SELECT string_agg(r, ', ') INTO v_bad
  FROM (SELECT unnest(public.erp_reports_seed_roles()) AS r
        UNION ALL SELECT unnest(public.erp_financial_reports_seed_roles())) s
  WHERE NOT (r = ANY (v_vocab));
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'BASELINE FAIL: المِزرعةُ تنوى زرعَ وظيفةٍ لا يقبلها النظام: % (v3.74.994)', v_bad;
  END IF;

  -- ═══ ولا صفَّ صلاحيّاتٍ لوظيفةٍ لا يقبلها النظام ═══
  SELECT string_agg(DISTINCT role, ', ') INTO v_bad
  FROM public.company_role_permissions WHERE NOT (role = ANY (v_vocab));
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'BASELINE FAIL: صلاحيّاتٌ لوظيفةٍ لا يقبلها النظام: % (v3.74.994)', v_bad;
  END IF;

  -- ═══ والفخُّ يُشغَّل: يُزرع صفٌّ فاسدٌ فيجب أن يصرخ، ثمّ يُلغى الزرع ═══
  -- **فخٌّ لا يُشغَّل ليس فخّاً.**
  SELECT company_id INTO v_company FROM public.company_role_permissions LIMIT 1;
  IF v_company IS NOT NULL THEN
    v_caught := false;
    BEGIN
      INSERT INTO public.company_role_permissions
        (company_id, role, resource, can_access, can_read, can_write, can_update, can_delete, all_access, allowed_actions)
      VALUES (v_company, 'zz_role_nobody_holds', 'zz_probe_994', true, true, false, false, false, false, '{}');
      PERFORM 1 FROM public.company_role_permissions
       WHERE role = 'zz_role_nobody_holds' AND NOT ('zz_role_nobody_holds' = ANY (v_vocab));
      IF FOUND THEN v_caught := true; END IF;
      RAISE EXCEPTION 'ROLLBACK_PROBE_994';
    EXCEPTION
      WHEN raise_exception THEN
        IF SQLERRM <> 'ROLLBACK_PROBE_994' THEN RAISE; END IF;
      WHEN OTHERS THEN
        -- زرعٌ رفضته القاعدةُ نفسُها حراسةٌ أقوى، ويُعدّ نجاحاً معلَناً
        v_caught := true;
    END;
    IF NOT v_caught THEN
      RAISE EXCEPTION 'BASELINE FAIL: زُرع صفٌّ لوظيفةٍ لا يقبلها النظام ولم يره أحد (v3.74.994)';
    END IF;
  END IF;

  -- ═══ ولا إشعارَ موجَّهٌ إلى وظيفةٍ لا يشغلها أحد ═══
  SELECT string_agg(DISTINCT assigned_to_role, ', ') INTO v_bad
  FROM public.notifications
  WHERE assigned_to_role IS NOT NULL AND NOT (assigned_to_role = ANY (v_vocab));
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'BASELINE FAIL: إشعارٌ موجَّهٌ إلى وظيفةٍ لا يقبلها النظام: % (v3.74.994)', v_bad;
  END IF;

  -- ═══ والخبرُ الواحد لا يُرسل مرّتين لجمهورٍ واحد ═══
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='enforce_governance_on_insert'
      AND position('pending_approval_gm_after_edit' in pg_get_functiondef(p.oid)) > 0
  ) THEN
    RAISE EXCEPTION 'BASELINE FAIL: عاد النداءُ المكرَّرُ إلى مُشغِّل الحوكمة (v3.74.994)';
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.assert_baseline_v3_74_994_check() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assert_baseline_v3_74_994_check() FROM anon;
REVOKE ALL ON FUNCTION public.assert_baseline_v3_74_994_check() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.assert_baseline_v3_74_994_check() TO service_role;

DO $$
BEGIN
  PERFORM public.assert_baseline_v3_74_994_check();
  RAISE NOTICE 'v3.74.994 · تمّت وأثبتت نفسَها.';
END $$;
