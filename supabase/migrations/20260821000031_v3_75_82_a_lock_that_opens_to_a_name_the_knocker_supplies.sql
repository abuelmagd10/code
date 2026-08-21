-- v3.75.82 — قفلٌ يُفتَحُ باسمٍ يُرسلُه الطارق، وحكمٌ للفترةِ فى بيتَين
-- ===========================================================================
--
-- ═══ (أ) العطبُ الأوّل: القفلُ يُفتَحُ باسمٍ يُرسلُه الطارقُ نفسُه ═══
--
-- `unlock_accounting_period` دالّةٌ **بصلاحيّاتٍ كاملة** (SECURITY DEFINER)
-- **ممنوحةٌ لكلِّ مستخدِمٍ مسجَّل** (authenticated). وكانت تقرِّرُ الإذنَ هكذا:
--
--     SELECT role INTO v_user_role FROM company_members
--      WHERE company_id = v_period.company_id AND user_id = p_user_id;
--     IF v_user_role != 'owner' THEN  ... غير مصرح ...  END IF;
--
-- وفيها عطبان يجتمعان فيصيرانِ ثغرةً كاملة:
--
--   ‏(١) **الهويّةُ تأتى من الطارقِ لا من الجلسة.** `p_user_id` وسيطٌ يكتبُه
--       المُنادى بيدِه، فلا يُثبِتُ شيئاً. ولا نداءَ هنا لـ`assert_company_access`
--       أصلاً، فلا شىءَ يمنعُ عابراً من العبثِ بفترةِ **شركةٍ أخرى**.
--
--   ‏(٢) **والغيابُ صارَ إذناً.** لو لم يكنِ الاسمُ المُرسَلُ عضواً فى الشركة،
--       يعودُ `v_user_role` فارغاً (NULL)، و`NULL <> 'owner'` قيمتُها **NULL**،
--       و`IF NULL THEN` لا يعملُ فرعُه. فيسقطُ الحارسُ صامتاً **ويمضى التنفيذُ
--       إلى الفتح**. وقِيسَ هذا على الإنتاجِ حرفيّاً قبلَ كتابةِ هذه الهجرة:
--
--           SELECT CASE WHEN (NULL::text <> 'owner') THEN 'guard fires'
--                       ELSE 'GUARD SKIPPED - falls through' END;
--           ⇒  GUARD SKIPPED - falls through
--
--   فالمحصِّلة: **أىُّ مستخدِمٍ مسجَّلٍ يستطيع أن يُعيدَ فتحَ فترةٍ محاسبيّةٍ
--   مقفولةٍ فى أىِّ شركة** — يكفى أن يُرسِلَ رقمَ فترةٍ واسماً لا وجودَ له.
--   وإعادةُ الفتحِ ترفعُ المنعَ عن الكتابةِ فى فترةٍ أُغلقت.
--
--   ولم يقعْ ضررٌ إلى اليوم — **مقيسٌ لا مفترَض**: ٧٥ فترةً على الإنتاج،
--   كلُّها `open` و`is_locked = false`، فلا فترةَ مقفولةً لتُفتَحَ خِفيةً.
--   والعلاجُ هنا **قبلَ الحادثةِ لا بعدَها**.
--
-- ═══ (ب) العطبُ الثانى: «هل الفترةُ مقفولة؟» يُجيبُ عنه بيتان ═══
--
-- أُقرَّ فى v3.74.982 بيتٌ واحدٌ للسؤال: `validate_transaction_period`،
-- ويُنادِيه مُشغِّلُ **رأسِ** القيد (`enforce_period_lock_header`). أمّا مُشغِّلُ
-- **سطورِ** القيد فظلَّ يكتبُ الحكمَ بيدِه بنسخةٍ **أضيق**:
--
--     AND (ap.is_locked = TRUE OR ap.status = 'closed')
--
-- والبيتُ الواحدُ يقولُ أكثرَ من ذلك:
--
--     status IN ('closed', 'locked')      ← وحالةُ `locked` تسقطُ من النسخةِ الثانية
--     check_fiscal_period_locked(...)     ← والفتراتُ الماليّةُ تسقطُ منها كلِّيّةً
--
-- فكانت النتيجةُ **بابَينِ لحكمٍ واحد**: فترةٌ حالتُها `locked` تمنعُ كتابةَ
-- الرأسِ ولا تمنعُ كتابةَ السطور؛ وفترةٌ ماليّةٌ مقفولةٌ كذلك. **وقفلٌ يمنعُ
-- الرأسَ ويترك السطورَ ليس قفلاً**، لأنَّ المالَ يسكنُ السطورَ لا الرأس.
--
--   ولا أثرَ لهذا اليوم — مقيسٌ أيضاً: `fiscal_periods` فيها **صفرُ صفوف**،
--   ولا فترةَ محاسبيّةً حالتُها `locked`. فالبيتانِ يقولانِ اليومَ قولاً واحداً،
--   ويختلفانِ غداً. **فيُوحَّدانِ اليومَ بلا أثرٍ على أحد.**
--
-- ═══ (ج) وما لم يُعالَجْ هنا — معدودٌ لا مسكوتٌ عنه ═══
--
-- `close_accounting_period` لها **نسختان** فى القاعدة تحملانِ اسماً واحداً
-- وتفعلانِ شيئَين مختلفَين: واحدةٌ تقلبُ الحالةَ وحدَها، وأخرى **تكتبُ قيدَ
-- الإغلاق** وتُعيدُ صافىَ الربح. والشاشةُ تنادى الثانية، والمسارُ الخادمىُّ
-- ينادى الأولى. **وهذا بيتان لعمليّةٍ واحدة** — لكنَّ توحيدَهما يعنى نقلَ
-- كتابةِ قيدٍ فى الدفتر، وذلك يُقاسُ فى دفعتِه وحدَه ولا يُخلَطُ بسدِّ ثغرة.
-- ===========================================================================

-- ───────────────────────────────────────────────────────────────────────────
-- ‏(١) القفلُ لا يُفتَحُ إلّا لمن تعرفُه الجلسة
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.unlock_accounting_period(
  p_period_id uuid,
  p_user_id   uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  v_period   RECORD;
  v_actor    uuid;
  v_role     text;
  v_is_owner boolean;
BEGIN
  SELECT * INTO v_period
    FROM public.accounting_periods
   WHERE id = p_period_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'الفترة غير موجودة');
  END IF;

  -- ‏(أ) بيتُ الإذنِ الواحد: يرفضُ العبورَ إلى شركةٍ أخرى، ويصمتُ للنداءِ
  -- الخادمىِّ (auth.uid() فارغة) كعادتِه المُعلَنة — فالطبقةُ التى فوقَه أذِنت.
  PERFORM public.assert_company_access(v_period.company_id);

  -- ‏(ب) **الهويّةُ تُؤخَذُ من الجلسةِ لا ممّا يكتبُه الطارق.** ويبقى `p_user_id`
  -- للنداءِ الخادمىِّ وحدَه، حيث لا جلسةَ أصلاً وقد أذِنَ المسارُ قبلَ النداء.
  v_actor := COALESCE(auth.uid(), p_user_id);
  IF v_actor IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'لا هويّةَ للفاعل — ولا يُفتَحُ قفلٌ لفاعلٍ مجهول');
  END IF;

  SELECT lower(btrim(replace(m.role, ' ', '_')))
    INTO v_role
    FROM public.company_members m
   WHERE m.company_id = v_period.company_id
     AND m.user_id = v_actor
   LIMIT 1;

  -- ‏(ج) **والغيابُ ليس إذناً.** `IS NOT DISTINCT FROM` تُجيبُ نعم/لا ولا
  -- تُجيبُ NULL، فلا يمرُّ غيرُ العضوِ من ثقبِ الفراغ. ومالكُ الشركةِ المسجَّلُ
  -- على صفِّها هو نفسُ الشخصِ مُسجَّلاً فى مكانٍ آخر (درس v3.74.836).
  v_is_owner := (v_role IS NOT DISTINCT FROM 'owner')
             OR EXISTS (
                  SELECT 1 FROM public.companies c
                   WHERE c.id = v_period.company_id
                     AND c.user_id = v_actor);

  IF NOT v_is_owner THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'غير مصرح - المالك فقط يمكنه فتح الفترة');
  END IF;

  -- ‏(د) والفتحُ يرفعُ القفلَ **كلَّه**: كان يُعيدُ الحالةَ إلى `open` ويترك
  -- `is_locked` كما هى، فتبقى الفترةُ ممنوعةً وهى تقولُ إنّها مفتوحة —
  -- **علامتانِ لحقيقةٍ واحدةٍ تتناقضان**.
  UPDATE public.accounting_periods
     SET status     = 'open',
         is_locked  = false,
         closed_by  = NULL,
         closed_at  = NULL,
         updated_at = NOW()
   WHERE id = p_period_id;

  RETURN jsonb_build_object(
    'success',   true,
    'message',   'تم فتح الفترة بنجاح',
    'period_id', p_period_id,
    'opened_by', v_actor);
END;
$function$;

REVOKE ALL    ON FUNCTION public.unlock_accounting_period(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.unlock_accounting_period(uuid, uuid) TO authenticated, service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- ‏(٢) وسطورُ القيدِ تسألُ نفسَ البيتِ الذى يسألُه رأسُه
-- ───────────────────────────────────────────────────────────────────────────
--
-- بصلاحيّاتٍ كاملةٍ كأخيه `enforce_period_lock_header`: القراءةُ يجب أن تصلَ
-- إلى صفِّ القيدِ مهما كانت سياسةُ الصفوفِ على الجدول، وإلّا صارَ «لم أجدْ
-- القيد» بابَ نجاةٍ من الفحص.
CREATE OR REPLACE FUNCTION public.enforce_period_lock_lines()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  v_je_id      uuid;
  v_company_id uuid;
  v_entry_date date;
  v_is_closing boolean;
BEGIN
  v_je_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.journal_entry_id ELSE NEW.journal_entry_id END;

  SELECT je.company_id, je.entry_date, COALESCE(je.is_closing_entry, FALSE)
    INTO v_company_id, v_entry_date, v_is_closing
    FROM public.journal_entries je
   WHERE je.id = v_je_id;

  -- لا رأسَ لهذا السطر: يتركُ الحكمَ لقيودِ الجدولِ نفسِها، ولا يخترعُ رفضاً
  -- لحالةٍ لم يُسأَلْ عنها.
  IF NOT FOUND THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- قيدُ الإغلاقِ نفسُه يُكتبُ فى فترةٍ مُقفلة — وهذا هو عملُه، كما فى الرأس.
  IF v_is_closing THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- **بيتٌ واحدٌ للسؤال**: هو نفسُه الذى يسألُه الرأسُ منذ v3.74.982، فيرى
  -- `status = 'locked'` ويرى الفتراتِ الماليّةَ — وكلاهما كان يسقطُ من النسخةِ
  -- المكتوبةِ هنا بيدٍ.
  PERFORM public.validate_transaction_period(v_company_id, v_entry_date);

  RETURN COALESCE(NEW, OLD);
END;
$function$;

-- ولا سطرَ منحٍ هنا عن قصد: `CREATE OR REPLACE` **يُبقى الصلاحيّاتِ كما هى**،
-- وصلاحيّةُ هذا المُشغِّلِ اليومَ هى بعينِها صلاحيّةُ أخيه فى الرأس
-- (postgres · service_role، ولا زائرَ ولا عمومَ أدوار) — مقيسٌ قبلَ الكتابة.
-- فسطرُ منحٍ زائدٌ يُحرِّكُ لقطةَ الصلاحيّاتِ بلا سبب، **ولا يُلمَسُ ما لا يُصلَح**.
