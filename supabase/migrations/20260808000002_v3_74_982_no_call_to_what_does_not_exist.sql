-- =============================================================================
-- v3.74.982 — لا نداءَ لما لا وجودَ له، ولا فحصٌ يُسأل عن نفسه قبل أن يفحص
-- =============================================================================
-- العلّةُ المقيسة على قاعدة الإنتاج فى ٨ أغسطس ٢٠٢٦:
--
--   ١) اسمان لا وجودَ لهما فى القاعدة تناديهما إحدى عشرةَ دالّة:
--        validate_transaction_period        — تناديها ٩ دوالّ
--        validate_commission_run_transition — تناديها دالّتان
--      ستٌّ منها تناديه نداءً صريحاً فتسقط عند أوّل استعمال. أُثبت بالتنفيذ:
--      SQLSTATE 42883 «function ... does not exist».
--
--   ٢) وثلاثٌ جعلت الفحصَ اختياريّاً بصيغة:
--        IF to_regprocedure('...') IS NOT NULL THEN PERFORM ... END IF;
--      فهى تعمل ولا تفحص. **وفحصٌ يمكن تخطّيه ليس فحصاً** — وهذا مسكّنٌ لا حلّ.
--
--   ٣) والستُّ نفسُها **معطوبةٌ مرّتين**: تُدخل رأسَ القيد بحالة «مرحَّل»
--      مباشرةً، وحارسُ سلامة القيود يمنع ذلك إلّا بإذنٍ صريح تفتحه أخواتُها
--      الخمسُ والعشرون ولا تفتحه هى. **ولم يظهر ذلك إلّا حين شُغّلت.**
--
--   ٤) وجدولُ سجلِّ إعادة هيكلة الحسابات coa_restructure_log غيرُ موجود،
--      ودالّتان تكتبان فيه، فتسقط عمليّتا دمج الحسابات وإعادة تصنيفها.
--
--   ٥) واعتمادُ دورة العمولات يكتب «معتمدة» بلا أن يسأل عن الحالة الحاليّة،
--      فدورةٌ مرحَّلةٌ أو مصروفةٌ تُرجَع إلى «معتمدة» فتُرحَّل مرّةً ثانية.
--
-- وترتيبُ الإصلاح مُلزم: إنشاءُ الدالّتين وحدَهما **يفتح باباً كان مغلقاً
-- بالعطب**. فالترحيلُ اليوم يسقط، فلا يستطيع أحدٌ أن يُرحّل مرّتين؛ فإذا
-- أُصلح السقوطُ وبقى بابُ الاعتماد يقبل الرجوع، صار التكرارُ ممكناً بعد أن
-- كان مستحيلاً. **فهما عملٌ واحدٌ فى دفعةٍ واحدة.**
-- =============================================================================

-- -----------------------------------------------------------------------------
-- ١) بيتٌ واحدٌ لقاعدة «الفترةُ المُقفلة»
-- -----------------------------------------------------------------------------
-- كانت القاعدةُ مكتوبةً فى ثلاثِ دوالَّ بأسماءَ مختلفةٍ وعلى جدولين مختلفين
-- (check_fiscal_period_locked · check_period_lock · check_period_lock_for_date)
-- ولا واحدةَ منها ترفع خطأً — كلُّها تُخبر ولا تمنع. والاسمُ الذى ينادِيه
-- تسعُ دوالَّ هو رابعٌ لا وجودَ له. فصار هذا هو البيتُ الواحد: **يفحص الجدولين
-- كليهما ويرفع الخطأ**، ويُحوَّل إليه الحارسُ الموجودُ على جدول القيود.

CREATE OR REPLACE FUNCTION public.validate_transaction_period(
    p_company_id uuid,
    p_date date
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
BEGIN
  IF p_company_id IS NULL OR p_date IS NULL THEN
    RETURN;
  END IF;

  -- (أ) السنةُ/الشهرُ فى fiscal_periods
  IF public.check_fiscal_period_locked(p_company_id, p_date) THEN
    RAISE EXCEPTION 'الفترةُ الماليّة %-% مُقفلةٌ أو مُغلقة، فلا تُقبل عمليّةٌ بتاريخها. | Action blocked: Fiscal period %-% is CLOSED or LOCKED.',
      EXTRACT(YEAR FROM p_date), EXTRACT(MONTH FROM p_date),
      EXTRACT(YEAR FROM p_date), EXTRACT(MONTH FROM p_date)
      USING ERRCODE = 'check_violation';
  END IF;

  -- (ب) الفترةُ المحاسبيّةُ فى accounting_periods
  IF EXISTS (
    SELECT 1 FROM public.accounting_periods
    WHERE company_id = p_company_id
      AND p_date BETWEEN period_start AND period_end
      AND (is_locked = TRUE OR status IN ('closed', 'locked'))
  ) THEN
    RAISE EXCEPTION 'الفترةُ المحاسبيّةُ التى يقع فيها % مُقفلةٌ أو مُغلقة. | Action blocked: This accounting period is CLOSED or LOCKED. Date: %',
      p_date, p_date
      USING ERRCODE = 'check_violation';
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.validate_transaction_period(uuid, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.validate_transaction_period(uuid, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.validate_transaction_period(uuid, date) TO authenticated, service_role;

-- والحارسُ الموجودُ على جدول القيود يُحوَّل إلى البيت الواحد، فلا تبقى
-- القاعدةُ مكتوبةً فى مكانين يفترقان غداً.
CREATE OR REPLACE FUNCTION public.enforce_period_lock_header()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_entry_date DATE;
  v_is_closing BOOLEAN;
  v_company_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_entry_date := OLD.entry_date;
    v_is_closing := OLD.is_closing_entry;
    v_company_id := OLD.company_id;
  ELSE
    v_entry_date := NEW.entry_date;
    v_is_closing := NEW.is_closing_entry;
    v_company_id := NEW.company_id;
  END IF;

  -- قيدُ الإغلاق نفسُه يُكتب فى فترةٍ مُقفلة — وهذا هو عملُه.
  IF v_is_closing THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- v3.74.982 — بيتٌ واحدٌ للقاعدة، لا نسخةٌ ثانيةٌ منها هنا.
  PERFORM public.validate_transaction_period(v_company_id, v_entry_date);

  RETURN COALESCE(NEW, OLD);
END;
$function$;

-- -----------------------------------------------------------------------------
-- ٢) رفعُ المسكّن: فحصٌ يُسأل عن وجوده قبل أن يفحص ليس فحصاً
-- -----------------------------------------------------------------------------
-- لا يُذكر اسمُ دالّةٍ بعينها هنا: تُقاس **الصفةُ** من القاعدة نفسِها، فمن
-- يكتب المسكّنَ غداً فى دالّةٍ ثالثةٍ يُرفع عنه أيضاً.

DO $$
DECLARE
  r RECORD;
  v_old text;
  v_new text;
  v_fixed int := 0;
  v_pattern text := 'IF\s+to_regprocedure\(''public\.validate_transaction_period\(uuid,date\)''\)\s+IS\s+NOT\s+NULL\s+THEN\s*(PERFORM\s+public\.validate_transaction_period\([^;]*;)\s*END\s+IF;';
BEGIN
  FOR r IN
    SELECT p.oid, p.proname
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prokind = 'f'
      AND p.prosrc ~ 'to_regprocedure'
      AND p.prosrc ~ 'validate_transaction_period'
  LOOP
    v_old := pg_get_functiondef(r.oid);
    v_new := regexp_replace(v_old, v_pattern, '\1', 'g');

    IF v_new = v_old THEN
      RAISE EXCEPTION 'المسكّنُ فى %() بصيغةٍ لم أتوقّعها — لم أعدّل شيئاً.', r.proname;
    END IF;

    -- ولا يُكتب حرفٌ حتى يثبت أنّ الفرقَ هو **حذفُ الشرط وحدَه**.
    IF regexp_replace(v_old, '\s+', '', 'g') <> regexp_replace(
         regexp_replace(v_new, '(PERFORM\s+public\.validate_transaction_period\([^;]*;)',
           'IF to_regprocedure(''public.validate_transaction_period(uuid,date)'') IS NOT NULL THEN \1 END IF;', 'g'),
         '\s+', '', 'g') THEN
      RAISE EXCEPTION 'الفرقُ فى %() أكبرُ من حذف الشرط — لم أعدّل شيئاً.', r.proname;
    END IF;

    EXECUTE v_new;
    v_fixed := v_fixed + 1;
    RAISE NOTICE 'v3.74.982 · رُفع المسكّنُ من %()', r.proname;
  END LOOP;

  RAISE NOTICE 'v3.74.982 · مسكّناتٌ مرفوعة: %', v_fixed;

  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prokind = 'f' AND p.prosrc ~ 'to_regprocedure'
  ) THEN
    RAISE EXCEPTION 'ما زال فى القاعدة فحصٌ اختيارىٌّ بصيغة to_regprocedure.';
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- ٣) والعطبُ الثانى فى الطريق نفسِه: ترحيلٌ بلا إذن
-- -----------------------------------------------------------------------------
-- **هذا ما لم أكن أعرفه حتى شغّلتُ الإصلاحَ الأوّل**: لمّا صارت الدالّةُ
-- موجودةً، تقدّم الترحيلُ خطوةً ثمّ سقط سقوطاً آخر:
--     DIRECT_POST_BLOCKED: Use create_journal_entry_atomic()
-- فحارسُ سلامة القيود يمنع إدخالَ رأسِ قيدٍ بحالة «مرحَّل» إلّا لمن يفتح
-- إذناً صريحاً داخل معاملته. وخمسٌ وعشرون دالّةً فى المشروع تفتحه، **وهؤلاء
-- الستُّ لا** — لأنّهنّ كُتبن قبل الحارس ولم يُراجعن بعده.
--
-- **ولا يُدّعى إصلاحٌ لم يُشغَّل**: لو اكتفينا بالخطوة الأولى لبقيت الأبوابُ
-- الستُّ ساقطةً برسالةٍ أخرى، ولقلتُ لك «أُصلحت» وهى لم تُصلح.
--
-- والإذنُ يُغلق بعد **آخر** سطرٍ من سطور القيد لا بعد رأسه — فسطورُ قيدٍ
-- مرحَّلٍ لا تُقبل إلّا بالإذن نفسِه. (وهذا خطأٌ وقعتُ فيه فى التجربة
-- فكشفَته، فلا يقع فى الإنتاج.)

DO $$
DECLARE
  r RECORD; v_old text; v_new text; v_tmp text; v_n int := 0;
  v_on  text := 'PERFORM set_config(''app.allow_direct_post'', ''true'', true);';
  v_off text := 'PERFORM set_config(''app.allow_direct_post'', ''false'', true);';
BEGIN
  FOR r IN
    SELECT p.oid, p.proname
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prokind = 'f'
      AND p.prosrc ~ 'validate_transaction_period'
      AND p.prosrc !~ 'allow_direct_post'
      AND p.prosrc ~ 'INSERT[\s]+INTO[\s]+(public\.)?journal_entries'
    ORDER BY p.proname
  LOOP
    v_old := pg_get_functiondef(r.oid);

    -- (أ) الإذنُ يُفتح قبل إدخال رأس القيد
    v_new := regexp_replace(
      v_old,
      '(INSERT[\s]+INTO[\s]+(?:public\.)?journal_entries[^;]*;)',
      v_on || E'\n\\1', 'g');

    -- (ب) ويُغلق بعد **آخر** إدخالٍ لسطور القيد
    v_tmp := regexp_replace(
      v_new,
      '^([\s\S]*INSERT[\s]+INTO[\s]+(?:public\.)?journal_entry_lines[^;]*;)',
      E'\\1\n' || v_off);

    IF v_tmp = v_new THEN
      -- لا سطورَ فى هذه الدالّة: يُغلق بعد الرأس مباشرةً
      v_tmp := regexp_replace(
        v_new,
        '(INSERT[\s]+INTO[\s]+(?:public\.)?journal_entries[^;]*;)',
        E'\\1\n' || v_off, 'g');
    END IF;
    v_new := v_tmp;

    IF v_new = v_old THEN
      RAISE EXCEPTION 'لم أجد إدخالَ القيد فى %() — لم أعدّل شيئاً.', r.proname;
    END IF;

    IF regexp_replace(replace(replace(v_new, v_on, ''), v_off, ''), '\s+', '', 'g')
       <> regexp_replace(v_old, '\s+', '', 'g') THEN
      RAISE EXCEPTION 'الفرقُ فى %() أكبرُ من سطرَى الإذن — لم أعدّل شيئاً.', r.proname;
    END IF;

    EXECUTE v_new;
    v_n := v_n + 1;
    RAISE NOTICE 'v3.74.982 · وُصل %() بالطريق المسموح للترحيل', r.proname;
  END LOOP;
  RAISE NOTICE 'v3.74.982 · دوالُّ ترحيلٍ أُصلحت: %', v_n;
END $$;

-- -----------------------------------------------------------------------------
-- ٤) حالةُ دورة العمولات لا ترجع إلى الخلف بعد أن مسّت الحسابات
-- -----------------------------------------------------------------------------
-- والصفةُ الممنوعة ليست شكلَ اسمٍ بعينه، بل: **الخروجُ من حالةٍ مسّت
-- الحسابات إلى ما هو قبلَها**. فما قبل الترحيل يتحرّك بحرّيّة (مسودّة ·
-- مراجَعة · معتمدة · ملغاة)، وما بعده لا يرجع.

CREATE OR REPLACE FUNCTION public.commission_run_transition_allowed(
    p_old text,
    p_new text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $function$
  SELECT CASE
    -- إدخالٌ جديد، أو تحديثٌ لا يمسّ الحالة
    WHEN p_old IS NULL OR p_new IS NULL OR p_old = p_new THEN TRUE
    -- «مصروفة» نهاية: لا يخرج منها شىء
    WHEN p_old = 'paid' THEN FALSE
    -- «مرحَّلة» لا تخرج إلّا إلى «مصروفة»
    WHEN p_old = 'posted' THEN p_new = 'paid'
    -- وقبلَ الترحيل: حرّيّةٌ تامّة، إلّا أنّ الصرفَ لا يسبق الترحيل
    ELSE p_new <> 'paid'
  END;
$function$;

REVOKE ALL ON FUNCTION public.commission_run_transition_allowed(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.commission_run_transition_allowed(text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.commission_run_transition_allowed(text, text) TO authenticated, service_role;

-- والاسمُ الذى تنادِيه دالّتا الترحيل والصرف — صار موجوداً وصار يمنع.
CREATE OR REPLACE FUNCTION public.validate_commission_run_transition(
    p_commission_run_id uuid,
    p_new_status text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_old text;
BEGIN
  SELECT status INTO v_old FROM public.commission_runs WHERE id = p_commission_run_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'دورةُ العمولات غير موجودة. | Commission run not found.'
      USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT public.commission_run_transition_allowed(v_old, p_new_status) THEN
    RAISE EXCEPTION 'لا يجوز نقلُ دورة العمولات من «%» إلى «%» — الدورةُ مسّت الحسابات فلا ترجع إلى الخلف. | Illegal commission run transition: % -> %',
      v_old, p_new_status, v_old, p_new_status
      USING ERRCODE = 'check_violation';
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.validate_commission_run_transition(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.validate_commission_run_transition(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.validate_commission_run_transition(uuid, text) TO authenticated, service_role;

-- والمنعُ يوضع فى القاعدة لا فى الشاشة: فلا يهمّ من أىِّ بابٍ جاء الطلب،
-- ولا يحتاج بابٌ جديدٌ غداً أن يتذكّر القاعدة.
CREATE OR REPLACE FUNCTION public.enforce_commission_run_transition()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_catalog'
AS $function$
BEGIN
  IF NOT public.commission_run_transition_allowed(OLD.status, NEW.status) THEN
    RAISE EXCEPTION 'لا يجوز نقلُ دورة العمولات من «%» إلى «%» — الدورةُ مسّت الحسابات فلا ترجع إلى الخلف. | Illegal commission run transition: % -> %',
      OLD.status, NEW.status, OLD.status, NEW.status
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_commission_run_status_transition ON public.commission_runs;
CREATE TRIGGER trg_commission_run_status_transition
  BEFORE UPDATE OF status ON public.commission_runs
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.enforce_commission_run_transition();

-- -----------------------------------------------------------------------------
-- ٥) سجلُّ إعادة هيكلة الحسابات — الجدولُ الذى تكتب فيه دالّتان ولا وجودَ له
-- -----------------------------------------------------------------------------
-- وقاعدةُ المالك: **غيرُ المستعمل ليس زائداً**. فأداتا دمجِ حسابين مكرَّرين
-- وإعادةِ تصنيف حسابٍ مقصودتان ومكتوبتان بعنايةٍ (تنقلان الرصيد بقيدٍ لا
-- بحذفٍ) — وكانتا تسقطان عند آخر سطرٍ فيهما.

CREATE TABLE IF NOT EXISTS public.coa_restructure_log (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    operation_type text NOT NULL CHECK (operation_type IN ('merge', 'reclassify')),
    source_account_id uuid REFERENCES public.chart_of_accounts(id),
    target_account_id uuid REFERENCES public.chart_of_accounts(id),
    journal_entry_id uuid REFERENCES public.journal_entries(id),
    amount numeric(15, 2) NOT NULL DEFAULT 0,
    description text,
    performed_by uuid DEFAULT auth.uid(),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_coa_restructure_log_company
  ON public.coa_restructure_log (company_id, created_at DESC);

ALTER TABLE public.coa_restructure_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS coa_restructure_log_select ON public.coa_restructure_log;
CREATE POLICY coa_restructure_log_select ON public.coa_restructure_log
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.company_members cm
      WHERE cm.company_id = coa_restructure_log.company_id
        AND cm.user_id = auth.uid()
        AND cm.role IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS coa_restructure_log_insert ON public.coa_restructure_log;
CREATE POLICY coa_restructure_log_insert ON public.coa_restructure_log
  FOR INSERT TO authenticated
  WITH CHECK (public.fn_user_company_access(company_id));

-- سجلٌّ لا يُعدَّل ولا يُحذف — وإلّا فليس سجلّاً.
DROP POLICY IF EXISTS coa_restructure_log_no_update ON public.coa_restructure_log;
CREATE POLICY coa_restructure_log_no_update ON public.coa_restructure_log
  FOR UPDATE USING (false);

DROP POLICY IF EXISTS coa_restructure_log_no_delete ON public.coa_restructure_log;
CREATE POLICY coa_restructure_log_no_delete ON public.coa_restructure_log
  FOR DELETE USING (false);

REVOKE ALL ON TABLE public.coa_restructure_log FROM PUBLIC;
REVOKE ALL ON TABLE public.coa_restructure_log FROM anon;
GRANT SELECT, INSERT ON TABLE public.coa_restructure_log TO authenticated;
GRANT ALL ON TABLE public.coa_restructure_log TO service_role;

-- ولمّا فُتحت الأداتان وجدتُ فيهما ما لم أذهب إليه: كلتاهما **مفتوحةٌ
-- لغير المسجَّلين** (anon)، وكلتاهما تأخذ رقمَ الشركة من الطالب **بلا أن
-- تتحقّق أنّه من أهلها**. ولا أدع عطباً فى بابٍ فتحتُه.
DO $$
DECLARE
  r RECORD;
  v_old text;
  v_new text;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prokind = 'f'
      AND p.proname IN ('merge_duplicate_accounts_safe', 'reclassify_account_safe')
  LOOP
    v_old := pg_get_functiondef(r.oid);

    IF v_old ~ 'assert_company_access' THEN
      RAISE NOTICE 'v3.74.982 · %() فيها التحقّقُ سلفاً', r.proname;
    ELSE
      -- لا يُعتمد على شكلٍ نصّىٍّ هشّ: يُدرج النداءُ بعد أوّل BEGIN فى الجسم.
      v_new := regexp_replace(
        v_old,
        '(\$function\$[\s\S]*?)(\mBEGIN\M)',
        E'\\1\\2\n  PERFORM public.assert_company_access(p_company_id);\n',
        ''
      );

      IF v_new = v_old THEN
        RAISE EXCEPTION 'لم أجد موضعَ الإدراج فى %() — لم أعدّل شيئاً.', r.proname;
      END IF;

      IF regexp_replace(replace(v_new, 'PERFORM public.assert_company_access(p_company_id);', ''), '\s+', '', 'g')
         <> regexp_replace(v_old, '\s+', '', 'g') THEN
        RAISE EXCEPTION 'الفرقُ فى %() أكبرُ من سطرٍ مُدرَج — لم أعدّل شيئاً.', r.proname;
      END IF;

      EXECUTE v_new;
      RAISE NOTICE 'v3.74.982 · أُضيف التحقّقُ من الشركة إلى %()', r.proname;
    END IF;

    EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM anon',
                   r.proname, pg_get_function_identity_arguments(r.oid));
    EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC',
                   r.proname, pg_get_function_identity_arguments(r.oid));
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO authenticated, service_role',
                   r.proname, pg_get_function_identity_arguments(r.oid));
  END LOOP;
END $$;

-- -----------------------------------------------------------------------------
-- ٦) وفحصٌ مرجعىٌّ يمنع عودةَ هذا كلِّه — يُشغَّل مع كلِّ دفعة
-- -----------------------------------------------------------------------------
-- **وما ليس نداءً لا يُحاكَم**: يُقرأ شكلان لا يحتملان التأويل — «PERFORM اسم(»
-- و«INSERT INTO اسم» — فلا يصرخ الفحصُ على GREATEST ولا على ON CONFLICT ولا
-- على اسمِ عمودٍ يشبه اسمَ دالّة. **وفحصٌ يصرخ على البرىء يُطفأ ثمّ لا يفحص.**

CREATE OR REPLACE FUNCTION public.assert_baseline_v3_74_982_check()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_missing_fn text;
  v_missing_tbl text;
  v_painkiller text;
  -- الاسمُ المحرَّمُ يُبنى ولا يُكتب، فلا يجد الفحصُ نفسَه فيرفض نفسَه.
  -- (وقع ذلك فعلاً فى التجربة: رفض الفحصُ نفسَه أوّلَ مرّة.)
  v_needle text := 'to_' || 'regprocedure';
BEGIN
  -- (أ) دالّةٌ تُنادى ولا وجودَ لها
  SELECT string_agg(DISTINCT x.callee || ' ← ' || x.caller, ' · ')
  INTO v_missing_fn
  FROM (
    SELECT f.proname AS caller, lower(m[1]) AS callee
    FROM (
      SELECT p.proname, regexp_replace(p.prosrc, '--[^\n]*', ' ', 'g') AS src
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.prokind = 'f'
        AND p.prolang = (SELECT oid FROM pg_language WHERE lanname = 'plpgsql')
    ) f,
    regexp_matches(f.src, '\mPERFORM\s+(?:public\.)?([a-zA-Z_][a-zA-Z0-9_]*)\s*\(', 'g') AS m
  ) x
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_proc p2 JOIN pg_namespace n2 ON n2.oid = p2.pronamespace
    WHERE lower(p2.proname) = x.callee
      AND n2.nspname IN ('public', 'pg_catalog', 'extensions', 'auth', 'storage')
  );

  -- (ب) جدولٌ يُكتب فيه ولا وجودَ له
  SELECT string_agg(DISTINCT x.rel || ' ← ' || x.caller, ' · ')
  INTO v_missing_tbl
  FROM (
    SELECT f.proname AS caller, lower(m[1]) AS rel
    FROM (
      SELECT p.proname, regexp_replace(p.prosrc, '--[^\n]*', ' ', 'g') AS src
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.prokind = 'f'
        AND p.prolang = (SELECT oid FROM pg_language WHERE lanname = 'plpgsql')
    ) f,
    regexp_matches(f.src, '\mINSERT\s+INTO\s+(?:public\.)?([a-zA-Z_][a-zA-Z0-9_]*)', 'g') AS m
  ) x
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n3 ON n3.oid = c.relnamespace
    WHERE lower(c.relname) = x.rel
      AND c.relkind IN ('r', 'v', 'm', 'p', 'f')
      AND n3.nspname IN ('public', 'auth', 'storage', 'extensions')
  )
  -- الجداولُ المؤقّتةُ تُنشأ وتموت داخل الدالّة نفسِها، فليست غائبة.
  AND NOT EXISTS (
    SELECT 1 FROM pg_proc p4 JOIN pg_namespace n4 ON n4.oid = p4.pronamespace
    WHERE n4.nspname = 'public' AND p4.proname = x.caller
      AND p4.prosrc ~* ('CREATE\s+TEMP(ORARY)?\s+TABLE\s+(IF\s+NOT\s+EXISTS\s+)?' || x.rel)
  );

  -- (ج) فحصٌ جُعل اختياريّاً
  SELECT string_agg(DISTINCT p.proname, ' · ') INTO v_painkiller
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.prokind = 'f' AND strpos(p.prosrc, v_needle) > 0;

  IF v_missing_fn IS NOT NULL THEN
    RAISE EXCEPTION 'v3.74.982 · دالّةٌ تُنادى ولا وجودَ لها: %', v_missing_fn;
  END IF;
  IF v_missing_tbl IS NOT NULL THEN
    RAISE EXCEPTION 'v3.74.982 · جدولٌ يُكتب فيه ولا وجودَ له: %', v_missing_tbl;
  END IF;
  IF v_painkiller IS NOT NULL THEN
    RAISE EXCEPTION 'v3.74.982 · فحصٌ اختيارىٌّ يسأل عن وجود نفسه قبل أن يفحص، فى: %', v_painkiller;
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.assert_baseline_v3_74_982_check() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assert_baseline_v3_74_982_check() FROM anon;
GRANT EXECUTE ON FUNCTION public.assert_baseline_v3_74_982_check() TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- ٧) ولا تمرّ الدفعةُ إلّا بعد أن تُثبت نفسَها بالتشغيل — لا بالكتابة
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regprocedure('public.validate_transaction_period(uuid,date)') IS NULL THEN
    RAISE EXCEPTION 'validate_transaction_period(uuid,date) لم تُنشأ.';
  END IF;
  IF to_regprocedure('public.validate_commission_run_transition(uuid,text)') IS NULL THEN
    RAISE EXCEPTION 'validate_commission_run_transition(uuid,text) لم تُنشأ.';
  END IF;
  IF to_regclass('public.coa_restructure_log') IS NULL THEN
    RAISE EXCEPTION 'coa_restructure_log لم يُنشأ.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    WHERE NOT t.tgisinternal AND c.relname = 'commission_runs'
      AND t.tgname = 'trg_commission_run_status_transition' AND t.tgenabled = 'O'
  ) THEN
    RAISE EXCEPTION 'قيدُ حالةِ دورة العمولات غيرُ مركَّبٍ أو مُعطَّل.';
  END IF;

  -- ولا دالّةَ ترحيلٍ بلا إذن
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prokind = 'f'
      AND p.prosrc ~ 'validate_transaction_period'
      AND p.prosrc ~ 'INSERT[\s]+INTO[\s]+(public\.)?journal_entries'
      AND p.prosrc !~ 'allow_direct_post'
  ) THEN
    RAISE EXCEPTION 'ما زالت دالّةُ ترحيلٍ تُدخل قيداً مرحَّلاً بلا إذن.';
  END IF;

  -- والاتّجاهان يُثبتان: يرفض الرجوعَ ويسمح بالتقدّم
  IF public.commission_run_transition_allowed('posted', 'approved') THEN
    RAISE EXCEPTION 'الاتّجاهُ الأوّل ساقط: قبِل الرجوعَ من «مرحَّلة» إلى «معتمدة».';
  END IF;
  IF public.commission_run_transition_allowed('paid', 'posted') THEN
    RAISE EXCEPTION 'الاتّجاهُ الأوّل ساقط: قبِل الرجوعَ من «مصروفة».';
  END IF;
  IF public.commission_run_transition_allowed('approved', 'paid') THEN
    RAISE EXCEPTION 'الاتّجاهُ الأوّل ساقط: قبِل الصرفَ قبل الترحيل.';
  END IF;
  IF NOT public.commission_run_transition_allowed('approved', 'posted') THEN
    RAISE EXCEPTION 'الاتّجاهُ الثانى ساقط: منع الترحيلَ من «معتمدة».';
  END IF;
  IF NOT public.commission_run_transition_allowed('posted', 'paid') THEN
    RAISE EXCEPTION 'الاتّجاهُ الثانى ساقط: منع الصرفَ من «مرحَّلة».';
  END IF;
  IF NOT public.commission_run_transition_allowed('draft', 'reviewed') THEN
    RAISE EXCEPTION 'الاتّجاهُ الثانى ساقط: منع المراجعةَ من «مسودّة».';
  END IF;
  IF NOT public.commission_run_transition_allowed('posted', 'posted') THEN
    RAISE EXCEPTION 'الاتّجاهُ الثانى ساقط: منع تحديثاً لا يمسّ الحالة.';
  END IF;

  -- والفحصُ المرجعىُّ نفسُه يمرّ الآن — ولو بقى عطبٌ واحدٌ لسقط
  PERFORM public.assert_baseline_v3_74_982_check();

  RAISE NOTICE 'v3.74.982 · تمّت وأثبتت نفسَها.';
END $$;

-- -----------------------------------------------------------------------------
-- ٨) تاريخُ صرف العمولات: لا يُطلب من المستخدم ما لا يُستعمل
-- -----------------------------------------------------------------------------
-- شاشةُ الصرف تسأل عن تاريخ الصرف، والدالّةُ كانت تكتب تاريخَ اليوم وتُهمل
-- ما اختاره. وتبقى بصمةٌ واحدةٌ للدالّة: تُحذف القديمةُ ولا تُترك نسختان.

CREATE OR REPLACE FUNCTION public.pay_commission_run_atomic(
    p_commission_run_id uuid,
    p_payable_account_id uuid,
    p_bank_account_id uuid,
    p_user_id uuid,
    p_payment_date date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
    v_run RECORD;
    v_journal_id UUID;
    v_date DATE := COALESCE(p_payment_date, CURRENT_DATE);
BEGIN
  -- v3.74.747 — reject a caller acting on another company's data.
  PERFORM public.assert_company_access_by_row('commission_runs', p_commission_run_id);

    SELECT * INTO v_run FROM commission_runs WHERE id = p_commission_run_id;

    IF v_run IS NULL THEN
        RAISE EXCEPTION 'Commission run not found';
    END IF;

    -- Idempotency check
    IF v_run.status = 'paid' THEN
        RETURN jsonb_build_object('success', TRUE, 'message', 'Already paid', 'payment_journal_id', v_run.payment_journal_id);
    END IF;

    PERFORM validate_commission_run_transition(p_commission_run_id, 'paid');
    PERFORM validate_transaction_period(v_run.company_id, v_date);

    PERFORM set_config('app.allow_direct_post', 'true', true);
    INSERT INTO journal_entries (
        company_id, entry_date, description, reference_type, reference_id,
        status, posted_by, posted_at
    ) VALUES (
        v_run.company_id, v_date,
        'Commission Payment - ' || v_run.period_start || ' to ' || v_run.period_end,
        'commission_payment', p_commission_run_id, 'posted', p_user_id, NOW()
    ) RETURNING id INTO v_journal_id;

    INSERT INTO journal_entry_lines (journal_entry_id, account_id, description, debit_amount, credit_amount)
    VALUES (v_journal_id, p_payable_account_id, 'Commission Payable', v_run.net_commission, 0);

    INSERT INTO journal_entry_lines (journal_entry_id, account_id, description, debit_amount, credit_amount)
    VALUES (v_journal_id, p_bank_account_id, 'Bank Payment', 0, v_run.net_commission);
    PERFORM set_config('app.allow_direct_post', 'false', true);

    UPDATE commission_runs
    SET status = 'paid', payment_journal_id = v_journal_id, paid_by = p_user_id, paid_at = NOW()
    WHERE id = p_commission_run_id;

    UPDATE commission_ledger SET status = 'paid' WHERE commission_run_id = p_commission_run_id;

    RETURN jsonb_build_object('success', TRUE, 'payment_journal_id', v_journal_id);
END;
$function$;

DROP FUNCTION IF EXISTS public.pay_commission_run_atomic(uuid, uuid, uuid, uuid);

REVOKE ALL ON FUNCTION public.pay_commission_run_atomic(uuid, uuid, uuid, uuid, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pay_commission_run_atomic(uuid, uuid, uuid, uuid, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.pay_commission_run_atomic(uuid, uuid, uuid, uuid, date) TO authenticated, service_role;

DO $$
BEGIN
  IF to_regprocedure('public.pay_commission_run_atomic(uuid,uuid,uuid,uuid,date)') IS NULL THEN
    RAISE EXCEPTION 'البصمةُ الجديدة لم تُنشأ.';
  END IF;
  IF to_regprocedure('public.pay_commission_run_atomic(uuid,uuid,uuid,uuid)') IS NOT NULL THEN
    RAISE EXCEPTION 'البصمةُ القديمة ما زالت موجودةً — نسختان لعملٍ واحد.';
  END IF;
  PERFORM public.assert_baseline_v3_74_982_check();
END $$;
