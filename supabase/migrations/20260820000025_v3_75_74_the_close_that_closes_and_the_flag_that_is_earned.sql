-- ═══════════════════════════════════════════════════════════════════════════
-- v3.75.74 — «والخانةُ تُستحَقُّ ولا تُدَّعى، والقيدُ يُنسَبُ لفاتورتِه لا لسطرِها»
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ثلاثةُ ألغامٍ نائمة، لم ينفجرْ منها شىءٌ بعدُ فى الإنتاج — قِيسَ يومَ كتابةِ
-- هذه الهجرة: صفرُ فترةٍ مقفلة، صفرُ قيدٍ مُرحَّلٍ بلا سطور، صفرُ فاتورةٍ
-- تحملُ أكثرَ من سطرِ مخزونٍ واحد. فما دونَ هذه الهجرةِ ليس إصلاحَ ضررٍ وقع،
-- بل نزعُ فتيلٍ قبلَ أن يمسَّه أوّلُ عميلٍ يفعلُ شيئاً طبيعيّاً تماماً:
-- أن يُقفلَ شهراً، أو أن يبيعَ صنفينِ فى فاتورةٍ واحدة.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- (١) «والخانةُ تُستحَقُّ ولا تُدَّعى» — قفلُ الفترةِ كان يُلغى بخانةٍ واحدة
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ما كان قائماً
-- ─────────────
-- enforce_period_lock_header يقرأُ is_closing_entry أوّلَ ما يقرأ، فإن وجدَها
-- مرفوعةً انصرفَ وسلَّمَ الصفَّ بلا سؤال — وهذا صحيحٌ فى ذاتِه: قيدُ الإقفالِ
-- يُكتبُ فى فترةٍ مُقفلةٍ لأن هذا هو عملُه. والمثلُ فى enforce_period_lock_lines.
--
-- لكنَّ الخانةَ التى يُبنى عليها هذا الانصرافُ عمودٌ عادىٌّ على الجدول:
--     GRANT INSERT, UPDATE ON public.journal_entries TO authenticated;
-- ولا صلاحيّةَ على مستوى العمود، ولا مُشغِّلَ يسألُ **مَن** رفعَها. فأىُّ
-- مستخدمٍ يملكُ صلاحيّةَ القيودِ فى شركتِه يستطيعُ أن يُدرجَ قيدَه مسودَّةً
-- وقد رفعَ الخانة، ثمّ يُرحِّلَه — فيمرَّ من فوقِ قفلِ الفترةِ كلِّه. أى أنَّ
-- حجرَ الأساسِ فى أىِّ نظامٍ محاسبىٍّ مؤسَّسىٍّ كان يُلتَفُّ عليه بخطوةٍ واحدة.
--
-- العلاجُ الواحد
-- ──────────────
-- «الدورُ هو الدليل، لا خانةٌ يكتبُها المتصفِّح». مُشغِّلٌ يقفُ قبلَ الإدخالِ
-- والتحديثِ فلا يسمحُ برفعِ الخانةِ إلّا لدورٍ لا يملكُه المتصفِّحُ أصلاً:
-- postgres (وهو ما يصيرُ إليه current_user داخلَ أىِّ دالَّةِ SECURITY DEFINER)،
-- أو supabase_admin، أو service_role (مفتاحُه لا يغادرُ الخادم). و authenticated
-- ليست عضواً فى أىٍّ من هذه الأدوارِ — قِيسَ من pg_auth_members يومَ الكتابة:
-- member_of لـ authenticated = {} — فلا بابَ وراثةٍ يُدخلُها.
--
-- ولا يُحاسَبُ على التحديثِ مَن ورثَ الخانةَ مرفوعةً؛ يُحاسَبُ مَن يرفعُها الآن.
-- وهذا هو نفسُ الدليلِ الذى يعتمدُه enforce_je_integrity منذ v3.74.871
-- (current_user فى الأدوارِ الموثوقة) — بيتٌ واحدٌ لفكرةِ «مَن يُصدَّق».
--
-- ما لا يتغيَّر: لا سطرَ واحدٌ فى التطبيقِ اليومَ يكتبُ is_closing_entry —
-- قِيسَ بالبحثِ فى app/ و lib/ و components/: صفر. والدوالُّ التى ترفعُها
-- (close_accounting_period، perform_annual_closing_atomic، create_reversal_entry)
-- كلُّها SECURITY DEFINER مملوكةٌ لـ postgres. فأثرُ هذا المُشغِّلِ على كلِّ
-- مسارٍ قائمٍ اليوم: لا شىء.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- (٢) «ولا يُحسَبُ الربحُ مرّتين» — الأرباحُ المحتجزةُ كانت تتضاعفُ بعدَ الإقفال
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ما كان قائماً
-- ─────────────
-- get_retained_earnings_balance تحسبُ:
--     رصيدَ حسابِ الأرباحِ المحتجزة + (كلَّ الإيراداتِ − كلَّ المصروفات)
-- وهذه الصيغةُ تفترضُ افتراضاً صريحاً — مكتوباً فى تعليقِ هجرةِ
-- 20260219_001 — أنَّ قيدَ الإقفالِ **يُصفِّرُ** حساباتِ الإيرادِ والمصروف،
-- «فبعد الإقفال: v_inc - v_exp = 0».
--
-- والمسارُ الحىُّ (lib/period-closing.ts) لا يُصفِّرُ شيئاً: قيدُه سطران
-- اثنان فقط بين حسابَىْ حقوقِ ملكيّة (3300 ↔ 3200)، وحساباتُ الإيرادِ
-- والمصروفِ تبقى بأرصدتِها كما هى. فبعدَ أوّلِ إقفال:
--     v_re = صافى الربح   و   v_inc − v_exp = صافى الربح   ⇒   النتيجة = ٢ × الربح.
--
-- وليس هذا رقماً على شاشةٍ فحسب: هذه الدالَّةُ بعينِها هى **بوّابةُ توزيعِ
-- الأرباحِ على الشركاء** — create_profit_distribution ترفضُ التوزيعَ إن تجاوزَ
-- المتاح. فبعدَ أوّلِ إقفالٍ يسمحُ النظامُ بتوزيعِ ضِعفِ الربحِ الحقيقى: مالٌ
-- يخرجُ فعلاً من الشركةِ بناءً على رقمٍ مُضاعَف.
--
-- العلاجُ الواحد، ولمَ هذا العلاجُ بعينِه
-- ────────────────────────────────────────
-- أمامَ الخللِ طريقان:
--   (أ) أن يصيرَ قيدُ الإقفالِ قيدَ إقفالٍ حقيقيّاً فيُصفِّرَ كلَّ حساباتِ
--       الإيرادِ والمصروف — وهو الحلُّ الكتابىُّ الكلاسيكى.
--   (ب) أن تُصحَّحَ الصيغةُ فتُوافقَ ما يفعلُه النظامُ فعلاً.
--
-- اختِيرَ (ب)، بقياسٍ لا بذوق: تصفيرُ حساباتِ الإيرادِ داخلَ الفترةِ يجعلُ
-- قائمةَ الدخلِ لتلك الفترةِ **صفراً** ما لم يستثنِ كلُّ تقريرٍ قيودَ الإقفال.
-- وقِيسَ: من خمسةٍ وعشرين ملفّاً يجمعُ أرصدةَ الإيرادِ والمصروفِ من الدفتر،
-- **واحدٌ فقط** يستثنى is_closing_entry اليوم. فالحلُّ (أ) يفرضُ تعديلَ أربعةٍ
-- وعشرينَ مسارَ تقريرٍ فى دفعةٍ واحدة — وذلك خطرٌ أكبرُ من الداءِ نفسِه.
--
-- والصيغةُ المصحَّحةُ صحيحةٌ فى الحالتين معاً: الأرباحُ المحتجزةُ هى رصيدُ
-- حسابِها، مضافاً إليه ما **لم يُرحَّلْ إليها بعدُ** — أى نشاطُ الأرباحِ
-- والخسائرِ اللاحقُ لآخرِ فترةٍ مُقفلة. فإن لم تُقفَلْ فترةٌ قطُّ فالنتيجةُ
-- هى النتيجةُ القديمةُ حرفاً بحرف؛ وإن أُقفلت، لم يُحسَبِ الربحُ مرّتين.
-- ويُستثنى قيدُ الإقفالِ نفسُه من الشقِّ الثانى، فيبقى الحسابُ صحيحاً حتى لو
-- صارَ قيدُ الإقفالِ يوماً يُصفِّرُ الحسابات.
--
-- والحلُّ (أ) يبقى مُسمًّى مؤجَّلاً لا منسيّاً: «قيدُ إقفالٍ يُصفِّرُ الحسابات،
-- وكلُّ تقريرِ دخلٍ يستثنيه» — دفعةٌ مستقلّةٌ بمداها الخاص.
--
-- ما لا يتغيَّر: قِيسَ على الإنتاج يومَ الكتابة: صفرُ فترةٍ مُقفلة
-- (status IN ('closed','locked') أو is_locked) ⇒ v_closed_through = NULL ⇒
-- الشرطُ الجديدُ يمرُّ على كلِّ صف، والنتيجةُ مطابقةٌ للقديمةِ تماماً.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- (٣) «والقيدُ يُنسَبُ لفاتورتِه لا لسطرِها» — فاتورةٌ بصنفين كانت تُسقِطُ البيع
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ما كان قائماً
-- ─────────────
-- auto_create_cogs_journal مُشغِّلٌ لكلِّ صفٍّ (FOR EACH ROW) على
-- inventory_transactions، ويُنشئُ فى كلِّ مرّةٍ قيدَ تكلفةٍ جديداً بـ
-- (reference_type='invoice_cogs', reference_id=الفاتورة). وهذا يفترضُ ضمناً
-- أنَّ لكلِّ فاتورةٍ صفَّ إخراجٍ واحداً. ولا شىءَ يفرضُ هذا الافتراض.
--
-- و post_accounting_event يُدرجُ صفوفَ المخزونِ **صفّاً صفّاً فى حلقة**. فأوّلُ
-- فاتورةٍ تحملُ صنفينِ مخزنيّين: المُشغِّلُ يُنشئُ القيدَ عندَ الصفِّ الأوّل،
-- ثمّ يصطدمُ عندَ الصفِّ الثانى بـ prevent_duplicate_journal_entry_v2
-- (و 'invoice_cogs' ليست فى قائمةِ الإعفاء) — فتُلغى المعاملةُ بأكملِها:
-- لا إيراد، ولا تكلفة، ولا خصمَ مخزون.
--
-- وقد لامسَ المشروعُ هذا الجرحَ من قبلُ ولم يبلغْ أصلَه: تعليقُ v3.74.85 فى
-- lib/accounting-transaction-service.ts يصفُ الاصطدامَ نفسَه بين قيدِ التطبيقِ
-- وقيدِ المُشغِّل، وعُولجَ يومَها بحذفِ قيدِ التطبيق — فبقىَ المُشغِّلُ وحدَه،
-- وبقىَ افتراضُه «سطرٌ واحدٌ لكلِّ فاتورة» على حالِه.
--
-- العلاجُ الواحد
-- ──────────────
-- «بيتٌ واحدٌ لقيدِ تكلفةِ الفاتورة»: يبحثُ المُشغِّلُ أوّلاً عن قيدِ تكلفةٍ
-- لهذه الفاتورةِ **أنشأتْه هذه المعاملةُ نفسُها**، فإن وجدَه أضافَ إليه سطرَىْ
-- هذا الصنف؛ وإلّا أنشأَ القيدَ وسجَّلَ أنّه صاحبُه. فالفاتورةُ ذاتُ العشرةِ
-- أصنافٍ يصيرُ لها قيدُ تكلفةٍ واحدٌ بعشرينَ سطراً، متوازنٌ سطراً بسطر.
--
-- ولمَ «هذه المعاملةُ نفسُها» وحدَها؟ لأنَّ الإضافةَ إلى قيدٍ من معاملةٍ سابقةٍ
-- تعديلٌ لتاريخٍ مُرحَّل، وذلك ما يرفضُه المشروعُ من أساسِه: الخطأُ يُصحَّحُ
-- بقيدٍ عكسىٍّ لا بإعادةِ كتابةِ ما مضى. أمّا داخلَ المعاملةِ الواحدةِ فالقيدُ
-- لم يصرْ تاريخاً بعد — لم يُثبَّتْ ولم يرَه أحد. والحالةُ الأخرى (صفُّ إخراجٍ
-- جديدٍ لفاتورةٍ كُلِّفتْ فى معاملةٍ سابقة) كانت تُرفَضُ من قبلُ برسالةِ
-- «قيدٌ مكرَّر» المُضلِّلة، وصارت تُرفَضُ برسالةٍ تقولُ الحقيقةَ باسمِها.
--
-- والصفةُ «هذه المعاملة» لا تُؤخَذُ من ظنٍّ: تُسجَّلُ فى إعدادٍ محلىٍّ
-- للمعاملةِ (is_local = true) يحملُ معرِّفَ الفاتورةِ فى اسمِه، فيموتُ بموتِها.
--
-- ورفعُ حارسِ سطورِ القيدِ المُرحَّلِ لحظةَ الإضافةِ محصورٌ ومُعادٌ: يُقرأُ ما
-- كان، ثمّ يُرفَعُ، ثمّ يُعادُ إلى ما كان — فلا يتسرَّبُ الرفعُ إلى ما بعدَه
-- فى المعاملةِ نفسِها.
--
-- ما لا يتغيَّر: قِيسَ على الإنتاج يومَ الكتابة: صفرُ فاتورةٍ تحملُ أكثرَ من
-- صفِّ إخراجٍ واحد ⇒ لا يُنفَّذُ فرعُ الإضافةِ ولا مرّةً واحدةً على البياناتِ
-- القائمة، والسلوكُ مطابقٌ حرفاً بحرفٍ لما كان.
--
-- لا حذفَ ولا تعديلَ لصفٍّ قائم. لا BACKFILL. هذه الهجرةُ تُغيِّرُ ما سيُحسَبُ
-- ويُطلَبُ من القاعدةِ من اليومِ فصاعداً، ولا تمسُّ رقماً مضى.
-- ═══════════════════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────────────────
-- (١) الخانةُ تُستحَقُّ ولا تُدَّعى
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.enforce_closing_entry_flag_is_earned()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_catalog', 'pg_temp'
AS $function$
BEGIN
  -- الخانةُ مطفأة؟ لا شأنَ لهذا الحارسِ بالصف.
  IF COALESCE(NEW.is_closing_entry, FALSE) = FALSE THEN
    RETURN NEW;
  END IF;

  -- على التحديث: يُحاسَبُ مَن يرفعُها الآن، لا مَن ورثَها مرفوعة.
  IF TG_OP = 'UPDATE' AND COALESCE(OLD.is_closing_entry, FALSE) = TRUE THEN
    RETURN NEW;
  END IF;

  -- الدورُ هو الدليل. authenticated و anon ليستا عضواً فى أىٍّ من هذه،
  -- و current_user يصيرُ postgres داخلَ أىِّ دالَّةِ SECURITY DEFINER.
  IF current_user IN ('postgres', 'supabase_admin', 'service_role') THEN
    RETURN NEW;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = current_user AND rolsuper) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION
    'CLOSING_FLAG_NOT_EARNED: خانةُ «قيدِ الإقفال» لا تُرفَعُ من التطبيق — '
    'وهى الخانةُ التى ينصرفُ عندها قفلُ الفترة. الإقفالُ يمرُّ من بابِه '
    '(إقفالُ الفترةِ أو الإقفالُ السنوى). role=[%]', current_user
    USING ERRCODE = 'P0001';
END;
$function$;

DROP TRIGGER IF EXISTS trg_closing_entry_flag_is_earned ON public.journal_entries;
CREATE TRIGGER trg_closing_entry_flag_is_earned
  BEFORE INSERT OR UPDATE ON public.journal_entries
  FOR EACH ROW EXECUTE FUNCTION public.enforce_closing_entry_flag_is_earned();

-- «ولا زينةَ على بابٍ لا يُفتَح» — قانونُ v3.75.25/29/61، وهو الذى أوقفَ الدفعَ
-- أوّلَ مرّةٍ وكشفَ هذا السهوَ بعينِه.
--
-- كلُّ دالّةٍ تُولَدُ فى بوستجرس ومعها EXECUTE لعمومِ الأدوار (PUBLIC)، وزادَ
-- عليها ضبطُ المشروعِ منحةً لـ authenticated. ودالَّةُ المُشغِّلِ لا تُنادى نداءً
-- أصلاً: المُشغِّلُ يُشغِّلُها ولا تُفحَصُ صلاحيّةُ التنفيذِ حينَها — فالمنحةُ
-- زينةٌ على بابٍ لا يُفتَح، وبابٌ مفتوحٌ بلا حاجةٍ بابٌ يُغلَق.
--
-- والقياسُ لا الذوق: أخواتُها فى المشروعِ كلُّهنّ بهذا الشكلِ تماماً
-- (enforce_period_lock_header وenforce_period_lock_lines وenforce_je_integrity
-- وprevent_posted_journal_modification وauto_create_cogs_journal):
--     postgres=X/postgres · service_role=X/postgres
-- فتُردُّ هذه إلى شكلِ أخواتِها حرفاً بحرف.
--
-- ومُجرَّبٌ لا مُستنتَج: بعدَ النزعِ جُرِّبَ رفعُ الخانةِ بدورِ authenticated على
-- الإنتاجِ داخلَ معاملةٍ أُلغيت، فصرخَ المُشغِّلُ CLOSING_FLAG_NOT_EARNED كما يجب
-- — فالحمايةُ قائمةٌ والمنحةُ كانت زينةً فعلاً.
REVOKE EXECUTE ON FUNCTION public.enforce_closing_entry_flag_is_earned() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.enforce_closing_entry_flag_is_earned() FROM anon;
REVOKE EXECUTE ON FUNCTION public.enforce_closing_entry_flag_is_earned() FROM authenticated;


-- ───────────────────────────────────────────────────────────────────────────
-- (٢) لا يُحسَبُ الربحُ مرّتين
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_retained_earnings_balance(p_company_id uuid)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  v_re  DECIMAL := 0;
  v_inc DECIMAL := 0;
  v_exp DECIMAL := 0;
  v_closed_through DATE;
BEGIN
  PERFORM public.assert_company_access(p_company_id);

  -- v3.75.74 — إلى أىِّ يومٍ رُحِّلَ الربحُ إلى الأرباحِ المحتجزةِ فعلاً؟
  -- ما قبلَه صارَ داخلَ رصيدِ الحساب، فلا يُجمَعُ ثانيةً من حساباتِ النشاط.
  SELECT MAX(period_end)
    INTO v_closed_through
    FROM public.accounting_periods
   WHERE company_id = p_company_id
     AND (is_locked = TRUE OR status IN ('closed', 'locked'));

  SELECT COALESCE(SUM(jel.credit_amount) - SUM(jel.debit_amount), 0)
    INTO v_re
    FROM journal_entry_lines jel
    JOIN journal_entries je ON je.id = jel.journal_entry_id
    JOIN chart_of_accounts coa ON coa.id = jel.account_id
    WHERE coa.company_id = p_company_id
      AND coa.account_type = 'equity'
      AND (coa.sub_type = 'retained_earnings' OR coa.account_code = '3200')
      AND je.company_id = p_company_id
      AND COALESCE(je.status, 'posted') NOT IN ('cancelled', 'draft');

  SELECT COALESCE(SUM(jel.credit_amount) - SUM(jel.debit_amount), 0)
    INTO v_inc
    FROM journal_entry_lines jel
    JOIN journal_entries je ON je.id = jel.journal_entry_id
    JOIN chart_of_accounts coa ON coa.id = jel.account_id
    WHERE coa.company_id = p_company_id
      AND coa.account_type IN ('income', 'revenue')
      AND je.company_id = p_company_id
      AND je.status = 'posted'
      AND COALESCE(je.is_closing_entry, FALSE) = FALSE
      AND (v_closed_through IS NULL OR je.entry_date > v_closed_through);

  SELECT COALESCE(SUM(jel.debit_amount) - SUM(jel.credit_amount), 0)
    INTO v_exp
    FROM journal_entry_lines jel
    JOIN journal_entries je ON je.id = jel.journal_entry_id
    JOIN chart_of_accounts coa ON coa.id = jel.account_id
    WHERE coa.company_id = p_company_id
      AND coa.account_type = 'expense'
      AND je.company_id = p_company_id
      AND je.status = 'posted'
      AND COALESCE(je.is_closing_entry, FALSE) = FALSE
      AND (v_closed_through IS NULL OR je.entry_date > v_closed_through);

  RETURN v_re + (v_inc - v_exp);
END;
$function$;


-- ───────────────────────────────────────────────────────────────────────────
-- (٣) القيدُ يُنسَبُ لفاتورتِه لا لسطرِها
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.auto_create_cogs_journal()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  v_company_id UUID;
  v_product_cost NUMERIC;
  v_cogs_amount NUMERIC;
  v_fifo_cogs NUMERIC;
  v_inventory_account_id UUID;
  v_cogs_account_id UUID;
  v_journal_entry_id UUID;
  v_invoice_number TEXT;
  v_invoice_date DATE;
  v_product_item_type TEXT;
  -- v3.75.74
  v_txn_key TEXT;
  v_mine_id TEXT;
  v_existing_id UUID;
  v_prev_direct_post TEXT;
BEGIN
  IF NEW.transaction_type != 'sale' THEN RETURN NEW; END IF;

  SELECT item_type INTO v_product_item_type FROM products WHERE id = NEW.product_id;
  IF v_product_item_type = 'service' THEN RETURN NEW; END IF;

  SELECT company_id, cost_price INTO v_company_id, v_product_cost
  FROM products WHERE id = NEW.product_id;

  -- v3.74.786 — single-consumer principle. When the atomic event carries
  -- explicit lot-level consumption rows (app.fifo_payload_present), the
  -- payload is the one and only depleter; this trigger must only PRICE the
  -- COGS journal. calculate_fifo_cogs is read-only and, running BEFORE the
  -- payload loop touches the lots, allocates from the very same lots the
  -- payload was prepared from — same order, same amounts.
  IF current_setting('app.fifo_payload_present', true) = 'true' THEN
    SELECT total_cogs INTO v_fifo_cogs
      FROM public.calculate_fifo_cogs(NEW.product_id, ABS(NEW.quantity_change), NEW.branch_id);
  ELSE
    -- v3.74.702 — COGS from FIFO lots (what was ACTUALLY paid per batch).
    -- consume_fifo_lots records the consumption and depletes the batch —
    -- correct ONLY when nobody else does (legacy paths without a payload).
    v_fifo_cogs := public.consume_fifo_lots(
      v_company_id, NEW.product_id, ABS(NEW.quantity_change),
      'sale', 'invoice', NEW.reference_id,
      COALESCE(NEW.created_at::date, CURRENT_DATE), NEW.branch_id
    );
  END IF;

  IF COALESCE(v_fifo_cogs, 0) > 0 THEN
    v_cogs_amount := v_fifo_cogs;
  ELSE
    -- Fallback: legacy stock with no FIFO lot yet. Keeps the old behaviour so
    -- COGS is never silently zeroed.
    v_cogs_amount := ABS(NEW.quantity_change) * COALESCE(v_product_cost, 0);
  END IF;

  IF v_cogs_amount = 0 THEN RETURN NEW; END IF;

  SELECT coa.id INTO v_inventory_account_id FROM chart_of_accounts coa
  WHERE coa.company_id = v_company_id AND coa.sub_type = 'inventory'
  AND (coa.parent_id IS NOT NULL OR coa.level > 1) LIMIT 1;

  SELECT coa.id INTO v_cogs_account_id FROM chart_of_accounts coa
  WHERE coa.company_id = v_company_id
  AND (coa.sub_type = 'cost_of_goods_sold' OR coa.sub_type = 'cogs' OR coa.account_code = '5000')
  AND (coa.parent_id IS NOT NULL OR coa.level > 1) LIMIT 1;

  IF v_inventory_account_id IS NULL OR v_cogs_account_id IS NULL THEN RETURN NEW; END IF;

  SELECT invoice_number, invoice_date INTO v_invoice_number, v_invoice_date
  FROM invoices WHERE id = NEW.reference_id;

  -- ══ v3.75.74 — بيتٌ واحدٌ لقيدِ تكلفةِ الفاتورة ═══════════════════════════
  -- مفتاحٌ محلىٌّ للمعاملةِ يحملُ معرِّفَ الفاتورة: إن كان مضبوطاً فالقيدُ من
  -- صنعِ هذه المعاملةِ نفسِها، ولم يصرْ تاريخاً بعد، فتُضافُ إليه السطور.
  v_txn_key := 'erp_cogs.je_' || replace(NEW.reference_id::text, '-', '');
  v_mine_id := NULLIF(current_setting(v_txn_key, true), '');

  IF v_mine_id IS NOT NULL THEN
    v_journal_entry_id := v_mine_id::uuid;

    -- رفعٌ محصورٌ لحارسِ سطورِ القيدِ المُرحَّل، ثمّ إعادتُه إلى ما كان.
    v_prev_direct_post := COALESCE(current_setting('app.allow_direct_post', true), 'false');
    PERFORM set_config('app.allow_direct_post', 'true', true);

    INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit_amount, credit_amount, description, branch_id, cost_center_id) VALUES
    (v_journal_entry_id, v_cogs_account_id, v_cogs_amount, 0, 'COGS', NEW.branch_id, NEW.cost_center_id),
    (v_journal_entry_id, v_inventory_account_id, 0, v_cogs_amount, 'Inventory', NEW.branch_id, NEW.cost_center_id);

    PERFORM set_config('app.allow_direct_post', v_prev_direct_post, true);

    NEW.journal_entry_id := v_journal_entry_id;
    RETURN NEW;
  END IF;

  -- لا قيدَ من هذه المعاملة. فهل لهذه الفاتورةِ قيدُ تكلفةٍ من معاملةٍ سابقة؟
  -- إن كان، فتعديلُه تعديلٌ لتاريخٍ مُرحَّل — ولا يُصحَّحُ المُرحَّلُ إلّا بعكسِه.
  SELECT id INTO v_existing_id
    FROM journal_entries
   WHERE company_id = v_company_id
     AND reference_type = 'invoice_cogs'
     AND reference_id = NEW.reference_id
     AND (is_deleted IS NULL OR is_deleted = FALSE)
     AND deleted_at IS NULL
   LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    RAISE EXCEPTION
      'INVOICE_ALREADY_COSTED: للفاتورةِ [%] قيدُ تكلفةٍ مُرحَّلٌ من قبلُ [%]. '
      'إخراجُ بضاعةٍ جديدٍ لفاتورةٍ كُلِّفتْ لا يُضافُ إلى قيدٍ مضى — '
      'يُعكَسُ القيدُ القديمُ ثمّ يُعادُ الترحيل.',
      COALESCE(v_invoice_number, NEW.reference_id::text), v_existing_id
      USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO journal_entries (company_id, reference_type, reference_id, entry_date, description, branch_id, cost_center_id)
  VALUES (v_company_id, 'invoice_cogs', NEW.reference_id, COALESCE(v_invoice_date, CURRENT_DATE),
  'COGS - ' || COALESCE(v_invoice_number, 'Invoice'), NEW.branch_id, NEW.cost_center_id)
  RETURNING id INTO v_journal_entry_id;

  -- هذه المعاملةُ هى صاحبةُ القيد؛ يُسجَّلُ ذلك محلّيّاً فيموتُ بموتِها.
  PERFORM set_config(v_txn_key, v_journal_entry_id::text, true);

  -- v3.74.815 branch tagging: COGS lines carried no branch/cost-center while the
  -- revenue side did — branch and cost-center P&L showed the sale but not
  -- its cost (per-branch profit overstated). The source inventory row has both.
  INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit_amount, credit_amount, description, branch_id, cost_center_id) VALUES
  (v_journal_entry_id, v_cogs_account_id, v_cogs_amount, 0, 'COGS', NEW.branch_id, NEW.cost_center_id),
  (v_journal_entry_id, v_inventory_account_id, 0, v_cogs_amount, 'Inventory', NEW.branch_id, NEW.cost_center_id);

  NEW.journal_entry_id := v_journal_entry_id;
  RETURN NEW;
END;
$function$;
