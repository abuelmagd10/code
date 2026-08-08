-- =============================================================================
-- v3.74.984 — لا توقيعَ لم يوقّعه أحد
-- =============================================================================
-- قِيست أبوابُ الاعتماد كلُّها فى المشروع (خمسةٌ وعشرون باباً)، وقِيست معها
-- سبعةٌ وعشرون جدولاً يحمل «من أنشأ» و«من اعتمد» معاً. والنتيجةُ:
--
--   • صرفُ المورّدين **سليم**: ستُّ دفعاتٍ أدخلها المحاسبُ واعتمدها المالكُ
--     فعلاً — شخصان لا واحد. والقاعدةُ مكتوبةٌ فى الدالّة صراحةً.
--
--   • وقبضُ العملاء **بلا رقابةٍ إطلاقاً**: الدالّةُ تكتب
--         created_by = p_user_id ، approved_by = p_user_id ، status = 'approved'
--     **بلا أىِّ فحص**. فتسعُ دفعاتٍ (٣٬٩٠٨٫٧٩) تقول إنّ المحاسبَ اعتمدها وهو
--     من أدخلها — **ولم يعتمدها أحدٌ فى الحقيقة**، بدليل أنّ ساعةَ الاعتماد
--     هى ساعةُ الإنشاء نفسُها إلى أجزاء الثانية.
--
-- **وحقلٌ يقول «معتمَد» ولم يعتمده أحدٌ أسوأُ من حقلٍ فارغ**: الفارغُ يُسأل
-- عنه، والكاذبُ يُطمئن. وهذا عينُ ما قاله المالك: رقابةٌ تُطمئن ولا تحمى.
--
-- **وقرارُ المالك**: يبقى القبضُ ماضياً بلا اعتمادٍ ثانٍ فلا يتوقّف عملُ اليوم،
-- **لكنّ الحقلَ يقول الحقيقة** — فلا يُكتب «معتمِد» إلّا لمن يملك الاعتماد
-- فعلاً. وسقفُ المبلغ يأتى مع شاشة الإعدادات.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- ١) بيتٌ واحدٌ لقاعدة «من يعتمد دفعةً بلا توقيعٍ ثانٍ»
-- -----------------------------------------------------------------------------
-- القائمةُ ليست جديدة: هى المكتوبةُ اليومَ داخل دالّة صرف المورّدين. وإنّما
-- أُخرجت إلى بيتٍ واحدٍ لأنّها كانت فى دالّةٍ وغائبةً عن أختها، **وذاك هو
-- سببُ الفرق بين البابين**.

CREATE OR REPLACE FUNCTION public.erp_payment_privileged(
    p_company_id uuid,
    p_user_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.company_members cm
    WHERE cm.company_id = p_company_id
      AND cm.user_id = p_user_id
      AND cm.role IN ('owner', 'admin', 'general_manager')
  );
$function$;

REVOKE ALL ON FUNCTION public.erp_payment_privileged(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.erp_payment_privileged(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.erp_payment_privileged(uuid, uuid) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- ٢) القاعدةُ نفسُها — تُرجع NULL إن كان التوقيعُ صادقاً، وإلّا فالسببَ
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.payment_self_approval_error(
    p_company_id uuid,
    p_created_by uuid,
    p_approved_by uuid
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
BEGIN
  -- لا توقيعَ أصلاً: لا دعوى
  IF p_approved_by IS NULL OR p_created_by IS NULL THEN
    RETURN NULL;
  END IF;
  -- وقّعها غيرُ من أدخلها: هذه هى الرقابة
  IF p_approved_by <> p_created_by THEN
    RETURN NULL;
  END IF;
  -- وقّعها من أدخلها: تجوز لمن يملك الاعتمادَ أصلاً (المالك · المدير العام)
  IF public.erp_payment_privileged(p_company_id, p_approved_by) THEN
    RETURN NULL;
  END IF;
  RETURN 'لا يُكتب «معتمِد» لمن أدخل الدفعةَ وهو لا يملك اعتمادَها — وحقلٌ يقول «معتمَد» ولم يعتمده أحدٌ أسوأُ من حقلٍ فارغ';
END;
$function$;

REVOKE ALL ON FUNCTION public.payment_self_approval_error(uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.payment_self_approval_error(uuid, uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.payment_self_approval_error(uuid, uuid, uuid) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- ٣) والمنعُ على الجدول نفسِه — لا على البابِ الذى مرَّت منه الدفعة
-- -----------------------------------------------------------------------------
-- ولا يُحاكَم الماضى: القيدُ لا يعمل إلّا حين يُكتب توقيعٌ جديدٌ أو يُغيَّر.

CREATE OR REPLACE FUNCTION public.enforce_payment_approver_is_real()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_err text;
BEGIN
  v_err := public.payment_self_approval_error(NEW.company_id, NEW.created_by, NEW.approved_by);
  IF v_err IS NOT NULL THEN
    RAISE EXCEPTION '%', v_err USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_payment_approver_is_real ON public.payments;
CREATE TRIGGER trg_payment_approver_is_real
  BEFORE INSERT OR UPDATE OF approved_by ON public.payments
  FOR EACH ROW
  WHEN (NEW.approved_by IS NOT NULL)
  EXECUTE FUNCTION public.enforce_payment_approver_is_real();

-- -----------------------------------------------------------------------------
-- ٤) وقبضُ العميل يتوقّف عن ختمِ نفسِه
-- -----------------------------------------------------------------------------
-- ولا تُعاد كتابةُ الدالّة بيدى: يُقرأ نصُّها من القاعدة ويُبدَّل فيه موضعُ
-- التوقيع وحدَه، **ولا يُكتب حرفٌ حتى يثبت أنّ الفرقَ هو ذاك الموضعُ لا غير**.

DO $$
DECLARE
  r RECORD; v_old text; v_new text; v_n int := 0; v_seen int := 0;
  v_needle text := 'p_user_id, p_user_id, p_user_id, NOW(), ''approved''';
  v_repl text := 'p_user_id, p_user_id,' || E'\n' ||
                 '    CASE WHEN public.erp_payment_privileged(p_company_id, p_user_id) THEN p_user_id ELSE NULL END,' || E'\n' ||
                 '    CASE WHEN public.erp_payment_privileged(p_company_id, p_user_id) THEN NOW() ELSE NULL END,' || E'\n' ||
                 '    ''approved''';
BEGIN
  -- للدالّة أكثرُ من بصمة، فتُقرأ كلُّها ولا يُكتفى بواحدة.
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prokind = 'f'
      AND p.proname = 'process_invoice_payment_atomic_v2'
  LOOP
    v_seen := v_seen + 1;
    v_old := pg_get_functiondef(r.oid);

    IF strpos(v_old, 'erp_payment_privileged') > 0 THEN
      v_n := v_n + 1;
      RAISE NOTICE 'v3.74.984 · مُصحَّحٌ سلفاً: %()', r.proname;
      CONTINUE;
    END IF;

    -- بصمةٌ لا تكتب توقيعاً أصلاً: لا شأنَ لنا بها
    IF strpos(v_old, 'approved_by') = 0 THEN
      RAISE NOTICE 'v3.74.984 · لا تكتب توقيعاً: %()', r.proname;
      CONTINUE;
    END IF;

    IF strpos(v_old, v_needle) = 0 THEN
      RAISE EXCEPTION 'بصمةٌ تكتب توقيعاً بصيغةٍ لم أتوقّعها فى %() — لم أعدّل شيئاً.', r.proname;
    END IF;

    v_new := replace(v_old, v_needle, v_repl);
    -- والفرقُ يُقاس: النصُّ الجديدُ مردوداً إلى القديم يجب أن يعود حرفاً بحرف
    IF replace(v_new, v_repl, v_needle) <> v_old THEN
      RAISE EXCEPTION 'الفرقُ أكبرُ من موضع التوقيع فى %() — لم أعدّل شيئاً.', r.proname;
    END IF;

    EXECUTE v_new;
    v_n := v_n + 1;
    RAISE NOTICE 'v3.74.984 · قبضُ العميل لم يعد يختم نفسَه: %()', r.proname;
  END LOOP;

  IF v_seen = 0 THEN
    RAISE EXCEPTION 'process_invoice_payment_atomic_v2 غير موجودة.';
  END IF;
  IF v_n = 0 THEN
    RAISE EXCEPTION 'لم أُصحّح بصمةً واحدة — ولا أقول «تمّ» ولم يتمّ.';
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- ٥) والبابان صارا ينادِيان البيتَ الواحد بدل أن يكتب كلٌّ منهما القائمة
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  r RECORD; v_old text; v_new text; v_n int := 0;
  v_needle text := 'IF v_user_role IN (''owner'', ''admin'', ''general_manager'') THEN';
  v_repl   text := 'IF public.erp_payment_privileged(p_company_id, v_user_id) THEN';
BEGIN
  FOR r IN
    SELECT p.oid, p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prokind = 'f'
      AND p.proname IN ('process_supplier_payment_allocation', 'process_customer_payment_allocation')
  LOOP
    v_old := pg_get_functiondef(r.oid);
    IF strpos(v_old, 'erp_payment_privileged') > 0 THEN
      RAISE NOTICE 'v3.74.984 · %() تنادى البيتَ الواحد سلفاً', r.proname;
      CONTINUE;
    END IF;
    IF strpos(v_old, v_needle) = 0 THEN
      RAISE NOTICE 'v3.74.984 · %() لا تحمل القائمةَ بهذه الصيغة — تُركت كما هى', r.proname;
      CONTINUE;
    END IF;
    v_new := replace(v_old, v_needle, v_repl);
    IF replace(v_new, v_repl, v_needle) <> v_old THEN
      RAISE EXCEPTION 'الفرقُ فى %() أكبرُ من سطرِ القائمة — لم أعدّل شيئاً.', r.proname;
    END IF;
    EXECUTE v_new;
    v_n := v_n + 1;
    RAISE NOTICE 'v3.74.984 · %() صارت تنادى البيتَ الواحد', r.proname;
  END LOOP;
  RAISE NOTICE 'v3.74.984 · دوالُّ دفعٍ وُحّدت قاعدتُها: %', v_n;
END $$;

-- -----------------------------------------------------------------------------
-- ٦) وفحصٌ مرجعىٌّ يمنع عودةَ هذا — يُشغَّل مع كلِّ دفعة
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.assert_baseline_v3_74_984_check()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_company uuid;
  v_privileged uuid;
BEGIN
  -- القيدُ مركَّبٌ ومُفعَّل
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    WHERE NOT t.tgisinternal AND c.relname = 'payments'
      AND t.tgname = 'trg_payment_approver_is_real' AND t.tgenabled = 'O'
  ) THEN
    RAISE EXCEPTION 'BASELINE FAIL: قيدُ صدقِ توقيع الدفعة غيرُ مركَّبٍ أو مُعطَّل (v3.74.984)';
  END IF;

  -- والبابان ينادِيان البيتَ الواحد
  -- **وما لا يكتب توقيعاً لا يُحاكَم**: تُقاس الصفةُ لا الاسم — كلُّ دالّةٍ
  -- تُدخل دفعةً **وتكتب توقيعاً** يجب أن تسأل البيتَ الواحد.
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prokind = 'f'
      AND p.prosrc ~ 'INSERT[\s]+INTO[\s]+(public\.)?payments'
      AND p.prosrc ~ 'approved_by'
      AND p.prosrc !~ 'erp_payment_privileged'
  ) THEN
    RAISE EXCEPTION 'BASELINE FAIL: بابُ دفعٍ يكتب توقيعاً ولا ينادى بيتَ القاعدة — والقواعدُ المكرّرة تفترق (v3.74.984)';
  END IF;

  -- الاتّجاهُ الأوّل: يرفض من ختم نفسَه وهو لا يملك الاعتماد
  IF public.payment_self_approval_error(
       '00000000-0000-0000-0000-000000000000'::uuid,
       '11111111-1111-1111-1111-111111111111'::uuid,
       '11111111-1111-1111-1111-111111111111'::uuid) IS NULL THEN
    RAISE EXCEPTION 'BASELINE FAIL: قبِل توقيعاً ختمه صاحبُه ولا يملكه (v3.74.984)';
  END IF;

  -- والاتّجاهُ الثانى: لا يصرخ على البرىء
  IF public.payment_self_approval_error(
       '00000000-0000-0000-0000-000000000000'::uuid,
       '11111111-1111-1111-1111-111111111111'::uuid,
       '22222222-2222-2222-2222-222222222222'::uuid) IS NOT NULL THEN
    RAISE EXCEPTION 'BASELINE FAIL: صرخ على توقيعٍ وقّعه شخصٌ آخر (v3.74.984)';
  END IF;
  IF public.payment_self_approval_error(
       '00000000-0000-0000-0000-000000000000'::uuid,
       '11111111-1111-1111-1111-111111111111'::uuid, NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'BASELINE FAIL: صرخ على دفعةٍ بلا توقيعٍ أصلاً (v3.74.984)';
  END IF;

  -- ومن يملك الاعتمادَ يوقّع لنفسه — يُقاس بعضوٍ حقيقىٍّ لا بافتراض
  SELECT cm.company_id, cm.user_id INTO v_company, v_privileged
  FROM public.company_members cm
  WHERE cm.role IN ('owner', 'admin', 'general_manager')
  LIMIT 1;
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'BASELINE FAIL: لا مالكَ ولا مديرَ عامٍّ فى القاعدة كلِّها — ولا أحكم بلا مقياس (v3.74.984)';
  END IF;
  IF public.payment_self_approval_error(v_company, v_privileged, v_privileged) IS NOT NULL THEN
    RAISE EXCEPTION 'BASELINE FAIL: منع صاحبَ الاعتماد من توقيع دفعته (v3.74.984)';
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.assert_baseline_v3_74_984_check() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assert_baseline_v3_74_984_check() FROM anon;
GRANT EXECUTE ON FUNCTION public.assert_baseline_v3_74_984_check() TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- ٧) ولا تمرّ الدفعةُ إلّا بعد أن تُثبت نفسَها — والماضى يُقاس ولا يُمحى
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_false int;
BEGIN
  SELECT count(*) INTO v_false
  FROM public.payments p
  WHERE p.approved_by IS NOT NULL
    AND p.approved_by = p.created_by
    AND NOT public.erp_payment_privileged(p.company_id, p.approved_by);
  RAISE NOTICE 'v3.74.984 · دفعاتٌ قديمةٌ تحمل توقيعاً لم يوقّعه صاحبُ صلاحيّة: % (تُترك كما هى — سجلٌّ لا يُمحى، ويُخبَر به المالك)', v_false;

  PERFORM public.assert_baseline_v3_74_984_check();
  RAISE NOTICE 'v3.74.984 · تمّت وأثبتت نفسَها.';
END $$;
