-- ============================================================================
-- v3.75.18 — «وحارسٌ على بيتٍ واحدٍ من بيتَين ليس حارساً»
-- ============================================================================
--
-- ═══ كيف انكشف ═══
--
-- فى v3.75.17 ظهرَ أنّ فحصاً مرجعيّاً كان **ساقطاً على قاعدةِ الاختبارِ منذ
-- شهور** ولم يرَه أحد، لأنّ حرّاسَنا كلَّهم يقرأون **قاعدةَ الإنتاجِ وحدَها**.
-- فأُضيفَ إلى الاختبارِ الفحصانِ الناقصانِ (٩٩٣ و٩٩٨)، **فصرخَ ٩٩٣ فوراً**:
--
--     «صمتُ القاعدة قُرئ إذناً — بابٌ يُفتح لأنّ أحداً لم يكتب له قاعدة»
--
-- ودالّةُ `check_page_access` — التى تقرِّرُ «هل يرى هذا المستخدمُ هذه
-- الشاشة؟» — كانت على الاختبارِ ما زالت تقولُ فى تعليقِها بالحرف: «إذا لم يوجد
-- سجل، نفترض أن الوصول مسموح» ثمّ تُرجعُ TRUE. **بنسختَيها معاً.** وقد أُصلح
-- ذلك على الإنتاجِ فى v3.74.993 ولم يصلْ إلى البيتِ الثانى قطّ.
--
-- ═══ ثمّ قِيست الفجوةُ كلُّها ولم تُقدَّر ═══
--
-- ١٣٥٦ دالّةً على الإنتاجِ مقابل ١٣٥٥ على الاختبار: **٢ عند الإنتاجِ وحدَه،
-- و١ عند الاختبارِ وحدَه، و٦٩ بنفسِ الاسمِ وجسدٍ مختلف**.
--
-- وأُخذت منها **٤٥ دالّةً هى الحرّاسُ والأبوابُ والاعتماداتُ والفحوصُ
-- المرجعيّة**، وقُورنت ثلاثَ مرّاتٍ بمقاييسَ متدرّجة — بالنصِّ الخام، ثمّ بعد
-- نزعِ التعليقاتِ والأسطر، ثمّ بعد تعميةِ نصوصِ الرسائل — فكانت النتيجة:
--
--   • **٣٩** اختلافُها **تعليقاتٌ ومواضعُ كسرِ أسطرٍ فقط**، وشيفرتُها متطابقةٌ
--     حرفاً بحرف. ومنها كلُّ من أقلقَ اسمُه: `erp_sod_guard` و
--     `erp_doors_that_do_not_ask` و`validate_customer_branch_isolation` و
--     `can_access_bill_items` و`seed_reports_access_v581`. **لا تُلمَس.**
--   • **٢** اختلافُهما **نصُّ رسالةِ خطأٍ فقط** (٩٩٢ و٩٩٩) — **معدودٌ ولا
--     يُغيَّر**: لا يستحقُّ خطرَ تحريكِ نصٍّ مقابلَ صفرِ سلوك.
--   • **٤** فيها اختلافٌ حقيقىٌّ فى الشيفرة — وهى وحدَها ما تحملُه هذه الهجرة.
--
--     **والخوفُ كان أكبرَ من الواقع، والقياسُ هو الذى فرّق.**
--
-- ═══ والأربعُ ═══
--
-- (١) `check_governance_scope` — الإنتاجُ يرفضُ صراحةً أن يُكتَبَ مستندٌ بلا
--     فرعٍ أو مخزنٍ أو مركزِ تكلفة، ويقولُ أىُّ حقلٍ ناقص. والاختبارُ لا يسألُ
--     عن الفراغِ أصلاً. **الإنتاجُ أصحّ.**
--
-- (٢) `prevent_posted_journal_modification` — الإنتاجُ `RETURN COALESCE(NEW, OLD)`
--     والاختبارُ `RETURN NEW`. وعندَ الحذفِ تكونُ NEW فارغةً، **فيُلغى الحذفُ
--     بصمتٍ ولا يعرفُ أحد**. **الإنتاجُ أصحّ.**
--
-- (٣) `plw_create_labour_payment` — متغيّرٌ محلّىٌّ يُحسَبُ ولا يُستعمَل.
--     **الإنتاجُ أنظف.**
--
-- (٤) `assert_baseline` — **وهنا الاختبارُ أدقُّ من الإنتاج**: يحملُ شرطاً
--     يمنعُ الدالّةَ من أن تُثبتَ نفسَها بنفسِها. ولو نُقل الإنتاجُ كما هو
--     **لضاعَ تشديدٌ قائم**. فأُخذ الأدقُّ ونُقل إلى الإنتاج، بعد أن قِيس أثرُه:
--     الدالّةُ التى تُثبتُ الشرطَ اليومَ هى `inv_evaluate_discount_approval`
--     **فى الحالتَين معاً** — فالتشديدُ **محايدٌ اليومَ، أقوى غداً**.
--
--     **وليس الأحدثُ هو الأصحَّ دائماً — ولا يُنقَلُ بيتٌ إلى بيتٍ بالثقة.**
--
-- ═══ وشكلُ الكتابة ═══
--
-- ما كان صغيراً كُتب **بنصِّه كاملاً** فيصيرُ الملفُّ ادّعاءً يُقاسُ على
-- القاعدة. وما كان كبيراً **حُوِّل آليّاً**: يُقرأُ التعريفُ من القاعدةِ ويُعادُ
-- إصدارُه بعد تغييرٍ محدَّدٍ بنصِّه، ولا يُنسَخُ بيد. وكلُّ تغييرٍ **لا أثرَ له
-- إن كان موضعُه غائباً** — فالهجرةُ تُعادُ بلا ضرر، وتصلحُ للبيتَين وللقاعدةِ
-- التى تُولَدُ غداً.
--
-- **ولا صفَّ بياناتٍ يُلمَس، ولا شاشةَ تتغيّر، ولا صلاحيّةَ إنسانٍ تتبدّل.**
-- ============================================================================


-- ─────────────────────────────────────────────────────────────────────────
-- (أ) غيابُ القاعدة يُقرأ منعاً لا إذناً — بنسختَيها
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.check_page_access(p_company_id uuid, p_role text, p_resource text)
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

CREATE OR REPLACE FUNCTION public.check_page_access(p_user_id uuid, p_company_id uuid, p_resource text)
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


-- ─────────────────────────────────────────────────────────────────────────
-- (ب) لا يُكتَبُ مستندٌ بلا فرعٍ ولا مخزنٍ ولا مركزِ تكلفة — ويُقالُ أيُّها ناقص
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.check_governance_scope()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.branch_id IS NULL THEN
    RAISE EXCEPTION 'Branch is required (%.branch_id is null)', TG_TABLE_NAME;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM branches WHERE id = NEW.branch_id AND company_id = NEW.company_id) THEN
    RAISE EXCEPTION 'Branch does not belong to company';
  END IF;

  IF NEW.warehouse_id IS NULL THEN
    RAISE EXCEPTION 'Warehouse is required (%.warehouse_id is null)', TG_TABLE_NAME;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM warehouses WHERE id = NEW.warehouse_id AND company_id = NEW.company_id) THEN
    RAISE EXCEPTION 'Warehouse does not belong to company';
  END IF;

  IF NEW.cost_center_id IS NULL THEN
    RAISE EXCEPTION 'Cost center is required (%.cost_center_id is null)', TG_TABLE_NAME;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM cost_centers WHERE id = NEW.cost_center_id AND company_id = NEW.company_id) THEN
    RAISE EXCEPTION 'Cost center does not belong to company';
  END IF;

  RETURN NEW;
END;
$function$;


-- ─────────────────────────────────────────────────────────────────────────
-- (ج) ولا يُلغى حذفٌ بصمت
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.prevent_posted_journal_modification()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  -- Administrative bypass
  IF current_setting('app.allow_direct_post', true) = 'true' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF OLD.status = 'posted' THEN
    IF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION 'Cannot delete a posted journal entry (ID: %). Create a reversal entry instead.', OLD.id;
    ELSIF TG_OP = 'UPDATE' THEN
      IF OLD.entry_date IS DISTINCT FROM NEW.entry_date
         OR OLD.description IS DISTINCT FROM NEW.description
         OR OLD.reference_type IS DISTINCT FROM NEW.reference_type
         OR OLD.reference_id IS DISTINCT FROM NEW.reference_id
         OR OLD.warehouse_id IS DISTINCT FROM NEW.warehouse_id
         OR OLD.status IS DISTINCT FROM NEW.status
      THEN
        RAISE EXCEPTION 'Cannot modify a posted journal entry (ID: %). Create a reversal entry instead.', OLD.id;
      END IF;
      IF OLD.branch_id IS DISTINCT FROM NEW.branch_id THEN
        IF OLD.branch_id IS NOT NULL OR NEW.branch_id IS NULL THEN
          RAISE EXCEPTION 'Cannot modify a posted journal entry (metadata branch_id) (ID: %). Create a reversal entry instead.', OLD.id;
        END IF;
      END IF;
      IF OLD.cost_center_id IS DISTINCT FROM NEW.cost_center_id THEN
        IF OLD.cost_center_id IS NOT NULL OR NEW.cost_center_id IS NULL THEN
          RAISE EXCEPTION 'Cannot modify a posted journal entry (metadata cost_center_id) (ID: %). Create a reversal entry instead.', OLD.id;
        END IF;
      END IF;
      RETURN NEW;
    END IF;
  END IF;

  -- v3.74.881 — كان `RETURN NEW`. وعلى الحذف تكون `NEW` فارغةً فيُلغى
  -- الحذف بصمت. `COALESCE(NEW, OLD)` تُعيد الصف الصحيح فى الحالتين.
  RETURN COALESCE(NEW, OLD);
END;
$function$;


-- ─────────────────────────────────────────────────────────────────────────
-- (د) الفحصانِ اللذانِ لم يكونا فى البيتِ الثانى أصلاً — وغيابُهما هو الذى ستر
-- ─────────────────────────────────────────────────────────────────────────
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

CREATE OR REPLACE FUNCTION public.assert_baseline_v3_74_998_check()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_catalog'
AS $function$
DECLARE
  v_bad text;
  v_caught boolean;
BEGIN
  SELECT string_agg(p.proname, ', ' ORDER BY p.proname) INTO v_bad
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.prosecdef
    AND (p.proconfig IS NULL OR NOT EXISTS (
          SELECT 1 FROM unnest(p.proconfig) AS c WHERE c LIKE 'search\_path=%'));
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'BASELINE FAIL: دالّةٌ بصلاحيّاتٍ كاملةٍ بلا مسارٍ مثبَّت: % (v3.74.998)', v_bad;
  END IF;

  -- ═══ فخٌّ لا يُشغَّل ليس فخّاً: تُزرع دالّةٌ بلا مسار، فيجب أن تُرى، ثمّ يُلغى الزرع ═══
  v_caught := false;
  BEGIN
    EXECUTE 'CREATE FUNCTION public.zz_probe_998_no_path() RETURNS int LANGUAGE sql SECURITY DEFINER AS $q$ SELECT 1 $q$';
    PERFORM 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname='public' AND p.proname='zz_probe_998_no_path' AND p.prosecdef
       AND (p.proconfig IS NULL OR NOT EXISTS (
             SELECT 1 FROM unnest(p.proconfig) AS c WHERE c LIKE 'search\_path=%'));
    IF FOUND THEN v_caught := true; END IF;
    RAISE EXCEPTION 'ROLLBACK_PROBE_998';
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM <> 'ROLLBACK_PROBE_998' THEN RAISE; END IF;
    WHEN OTHERS THEN
      v_caught := true;
  END;
  IF NOT v_caught THEN
    RAISE EXCEPTION 'BASELINE FAIL: زُرعت دالّةٌ بلا مسارٍ مثبَّتٍ ولم يرها الفحص (v3.74.998)';
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.assert_baseline_v3_74_998_check() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assert_baseline_v3_74_998_check() FROM anon;
REVOKE ALL ON FUNCTION public.assert_baseline_v3_74_998_check() FROM authenticated;


-- ─────────────────────────────────────────────────────────────────────────
-- (ه) وما كبُر حُوِّل آليّاً — لا نسخَ بيد
-- ─────────────────────────────────────────────────────────────────────────
DO $mig$
DECLARE
  r      record;
  v_def  text;
  v_new  text;
  v_n    int := 0;
BEGIN
  -- (١) `assert_baseline`: يؤخَذُ **الأدقُّ من البيتَين** — ألّا تُثبتَ الدالّةُ
  --     نفسَها بنفسِها. **وفخٌّ يمرّ بنفسه ليس فخّاً.** وقِيس أثرُه قبل نقلِه:
  --     المُثبِتُ اليومَ هو `inv_evaluate_discount_approval` فى الحالتَين معاً.
  FOR r IN
    SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'assert_baseline' AND p.pronargs = 0
  LOOP
    v_def := pg_get_functiondef(r.oid);
    IF strpos(v_def, $q$d.proname <> 'inv_request_discount_approval_trg'$q$) = 0 THEN
      v_new := replace(v_def,
        $q$AND d.prokind = 'f' AND v_inv_trg_def LIKE '%' || d.proname || '(%'$q$,
        $q$AND d.prokind = 'f' AND d.proname <> 'inv_request_discount_approval_trg' AND v_inv_trg_def LIKE '%' || d.proname || '(%'$q$);
      IF v_new <> v_def THEN
        EXECUTE v_new;
        v_n := v_n + 1;
      END IF;
    END IF;
  END LOOP;

  -- (٢) `plw_create_labour_payment`: متغيّرٌ يُحسَبُ ولا يُستعمَل.
  FOR r IN
    SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'plw_create_labour_payment'
  LOOP
    v_def := pg_get_functiondef(r.oid);
    v_new := replace(v_def, $q$ v_days INTEGER;$q$, '');
    v_new := replace(v_new,
$q$  v_days := GREATEST((p_period_to - p_period_from) + 1, 1);
$q$, '');
    IF v_new <> v_def THEN
      EXECUTE v_new;
      v_n := v_n + 1;
    END IF;
  END LOOP;

  RAISE NOTICE 'v3.75.18: حُوِّلت % دالّةً آليّاً.', v_n;
END
$mig$;


-- ============================================================================
-- الفحصُ المرجعىُّ — ويعيشُ فى القاعدةِ نفسِها، فيحرسُ **أىَّ بيتٍ يُركَّبُ فيه**
-- ============================================================================
CREATE OR REPLACE FUNCTION public.assert_baseline_v3_75_18_check()
RETURNS void
LANGUAGE plpgsql
AS $function$
DECLARE
  v_company uuid;
  v_bad     int;
BEGIN
  -- (أ) غيابُ القاعدة منعٌ — يُقاسُ بالسلوكِ لا بالنصّ
  SELECT company_id INTO v_company FROM public.company_role_permissions LIMIT 1;
  IF v_company IS NOT NULL THEN
    IF public.check_page_access(v_company, 'zz_role_nobody_holds', 'zz_no_rule_here') IS NOT FALSE THEN
      RAISE EXCEPTION 'BASELINE FAIL: صمتُ القاعدة قُرئ إذناً فى check_page_access (v3.75.18)';
    END IF;
  END IF;

  -- (ب) ولا يُلغى حذفٌ بصمت
  SELECT count(*) INTO v_bad
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'prevent_posted_journal_modification'
     AND strpos(pg_get_functiondef(p.oid), 'COALESCE(NEW, OLD)') = 0;
  IF v_bad > 0 THEN
    RAISE EXCEPTION 'BASELINE FAIL: عادَ حارسُ القيدِ المرحَّلِ يُلغى الحذفَ بصمت (v3.75.18)';
  END IF;

  -- (ج) ولا يُكتَبُ مستندٌ بلا فرعٍ ولا مخزنٍ ولا مركزِ تكلفة
  SELECT count(*) INTO v_bad
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'check_governance_scope'
     AND (strpos(pg_get_functiondef(p.oid), 'NEW.branch_id IS NULL')      = 0
       OR strpos(pg_get_functiondef(p.oid), 'NEW.warehouse_id IS NULL')   = 0
       OR strpos(pg_get_functiondef(p.oid), 'NEW.cost_center_id IS NULL') = 0);
  IF v_bad > 0 THEN
    RAISE EXCEPTION 'BASELINE FAIL: حارسُ النطاقِ لم يعُدْ يسألُ عن الفراغ (v3.75.18)';
  END IF;

  -- (د) وفخٌّ يمرّ بنفسه ليس فخّاً
  SELECT count(*) INTO v_bad
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'assert_baseline' AND p.pronargs = 0
     AND strpos(pg_get_functiondef(p.oid), 'd.proname <> ''inv_request_discount_approval_trg''') = 0;
  IF v_bad > 0 THEN
    RAISE EXCEPTION 'BASELINE FAIL: عادَ الفحصُ الكبيرُ يقبلُ أن تُثبتَ الدالّةُ نفسَها بنفسِها (v3.75.18)';
  END IF;

  -- (ه) والفحصانِ اللذانِ غابا عن بيتٍ لا يغيبانِ بعد اليوم
  SELECT count(*) INTO v_bad
    FROM (VALUES ('assert_baseline_v3_74_993_check'), ('assert_baseline_v3_74_998_check')) AS w(nm)
   WHERE NOT EXISTS (
     SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = w.nm AND p.pronargs = 0);
  IF v_bad > 0 THEN
    RAISE EXCEPTION 'BASELINE FAIL: % فحصاً مرجعيّاً مفقوداً من هذا البيت (v3.75.18)', v_bad;
  END IF;
END;
$function$;

COMMENT ON FUNCTION public.assert_baseline_v3_75_18_check() IS
  'v3.75.18 — وحارسٌ على بيتٍ واحدٍ من بيتَين ليس حارساً.';

REVOKE ALL ON FUNCTION public.assert_baseline_v3_75_18_check() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assert_baseline_v3_75_18_check() FROM anon;
REVOKE ALL ON FUNCTION public.assert_baseline_v3_75_18_check() FROM authenticated;
