-- ---------------------------------------------------------------------------
-- v3.75.34 — «والنداءُ بمتغيّرٍ نداء»
-- ---------------------------------------------------------------------------
-- ثلاثةُ أسماءٍ (أربعةُ توقيعات) بصلاحيّاتٍ كاملةٍ مفتوحةٌ لكلِّ مستخدِمٍ مسجَّل،
-- **ولا أحدَ يطرقُها**، وكلُّها تكتبُ فى الدفترِ أو فى سجلِّ التدقيق:
--
--     public.create_audit_log(uuid, uuid, text, text, uuid, text, jsonb, jsonb, uuid, uuid, text)
--     public.execute_sales_invoice_accounting(uuid)
--     public.record_payment(uuid, numeric, date, uuid)
--     public.record_payment(uuid, numeric, date, uuid, text)
--
-- وقِيس ذلك بأربعةِ أنواعٍ من الطارقين، لا بالظنّ:
--
--   ١) **شاشةٌ أو مسارٌ فى المشروع**: لا موضعَ واحد — لا نداءً مكتوباً حرفاً،
--      **ولا اسماً محمولاً فى متغيّرٍ إلى `rpc()`**. وهذا الشكلُ الثالثُ هو الذى
--      كشفَ فى هذه الدفعةِ أنّ خمسةَ عشرَ اسماً كانت معدودةً «بلا طارق» **وهى
--      مطروقةٌ فعلاً**، منها `post_accounting_event` و`process_invoice_payment_atomic`
--      وستُّ دالّاتِ أجورِ الإنتاج. **فلا يُنزَعُ من هؤلاء شىء.**
--   ٢) **سياسةُ حمايةٍ تطرقُها**: لا واحدة (`policy_knocked_function_names`).
--   ٣) **عرضٌ (view) ينادِيها**: لا واحد.
--   ٤) **إعلانُ ما قبلَ الدخول**: لا واحدةَ مذكورةٌ فيه.
--
-- ومَن ينادِيها إذن؟ **دالّاتٌ أخرى بصلاحيّاتٍ كاملةٍ يملكُها `postgres`**:
--
--     restore_company_backup()            →  create_audit_log
--     complete_booking_atomic()           →  execute_sales_invoice_accounting
--     handle_invoice_sent_accrual()       →  execute_sales_invoice_accounting  (زنادٌ)
--     ولا أحدَ                            →  record_payment
--
-- **وداخلَ دالّةِ الصلاحيّاتِ الكاملةِ يجرى النداءُ بحقِّ مالكِها لا بحقِّ المُنادِى**
-- — فالنداءُ الداخلىُّ لا يحتاجُ منحةً أصلاً. والمنحةُ إذن **بابٌ خلفىٌّ لا يفتحُ
-- شيئاً لأحدٍ يحتاجُه**، ويسمحُ لأىِّ مستخدِمٍ مسجَّلٍ أن يكتبَ سطرَ تدقيقٍ أو
-- قيدَ استحقاقٍ أو دفعةً **خارجَ الغلافِ الذى يسألُ عن حقِّه**.
--
-- **و`record_payment(uuid, numeric, date, uuid)` أعجبُها**: للاسمِ توقيعانِ،
-- والثانى يحملُ `p_notes text DEFAULT NULL` — فأىُّ نداءٍ بأربعةِ وسائطَ **يقعُ
-- ملتبِساً (42725) ولا يصلُ إلى أىِّ منهما**. أى أنّ التوقيعَ الرباعىَّ **بابٌ
-- لا يُفتَحُ حتّى لمن يملكُ مفتاحَه**، ومنحتُه زينةٌ خالصة.
--
-- **ولا يُصدَّقُ هذا بالوصف.** جُرِّب حيّاً على الإنتاجِ قبلَ كتابةِ هذا الملفّ،
-- بدورِ `authenticated` نفسِه، داخلَ معاملةٍ أُلغيت بالكامل:
--
--     1) create_audit_log                 : مباشرةً = 42501   ·   عبرَ غلاف = 23502
--     2) execute_sales_invoice_accounting : مباشرةً = 42501   ·   عبرَ غلاف = مرّ
--     3) record_payment (رباعىّ)          : مباشرةً = 42725 (ملتبِسٌ أصلاً)
--     4) record_payment (خماسىّ)          : مباشرةً = 42501   ·   عبرَ غلاف = مرّ
--
-- **و42501 هو الرفضُ لعدمِ الصلاحيّة**؛ وما جاءَ عبرَ الغلافِ لم يكن 42501 قطّ —
-- بل خطأَ عملٍ (عمودٌ لا يقبلُ العدم) أو نجاحاً. أى أنّ **البوّابةَ وحدَها هى
-- التى أُغلقت، والنداءُ الداخلىُّ يمرُّ كما كان**.
--
-- والتجاربُ **مُعادةٌ داخلَ هذه الهجرةِ نفسِها** — **وفخٌّ لا يُشغَّل ليس فخّاً**.
-- والأغلفةُ المزروعةُ للبرهانِ تُنشَأُ بأسماءٍ محسوبةٍ ثمّ تُحذَف، **ولا تُترَكُ
-- تجربةٌ أثراً**.
--
-- ولا صفَّ بياناتٍ يتغيّر، ولا شاشةَ، ولا صلاحيّةَ إنسانٍ تضيقُ إلّا هذه الأبوابَ
-- التى لا يطرقُها أحد. **ومنحةُ `service_role` تبقى كما هى** — فلا طريقَ خادمٍ
-- يُقطَع، **ونصفُ جراحةٍ أسوأُ من لا جراحة**.
-- ---------------------------------------------------------------------------

-- ═══ (١) تُغلَقُ الأبوابُ الأربعة ══════════════════════════════════════════════
REVOKE ALL ON FUNCTION public.create_audit_log(uuid, uuid, text, text, uuid, text, jsonb, jsonb, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.execute_sales_invoice_accounting(uuid)                                               FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_payment(uuid, numeric, date, uuid)                                            FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_payment(uuid, numeric, date, uuid, text)                                      FROM PUBLIC, anon, authenticated;

-- ═══ (٢) البرهانُ الحىّ ══════════════════════════════════════════════════════
DO $do$
DECLARE
  -- النداءُ كما يكتبُه مُنادٍ حقيقىّ (بقيمٍ عدميّةٍ — فالمقصودُ البوّابةُ لا العمل)
  k_calls  CONSTANT TEXT[] := ARRAY[
    'public.create_audit_log(NULL::uuid,NULL::uuid,NULL::text,NULL::text,NULL::uuid,NULL::text,NULL::jsonb,NULL::jsonb,NULL::uuid,NULL::uuid,NULL::text)',
    'public.execute_sales_invoice_accounting(NULL::uuid)',
    'public.record_payment(NULL::uuid,NULL::numeric,NULL::date,NULL::uuid,NULL::text)'
  ];
  k_wrap   CONSTANT TEXT := 'zz_proof_v3_75_34_';
  i        INT;
  v_direct TEXT;
  v_inner  TEXT;
  v_amb    TEXT;
  v_open   TEXT;
BEGIN
  -- (أ) **لا بابَ من الأربعةِ يبلغُه زائرٌ ولا مستخدِمٌ مسجَّل** — بعدَ النزع.
  SELECT string_agg(p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')', ', ')
    INTO v_open
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN ('create_audit_log', 'execute_sales_invoice_accounting', 'record_payment')
     AND (has_function_privilege('anon', p.oid, 'EXECUTE')
          OR has_function_privilege('authenticated', p.oid, 'EXECUTE'));
  IF v_open IS NOT NULL THEN
    RAISE EXCEPTION 'v3.75.34: بابٌ ما زال يبلغُه من لا يطرقُه بعدَ النزع: %', v_open;
  END IF;

  -- (ب) **والنداءُ المباشرُ يُرفَضُ، والنداءُ من داخلِ غلافٍ يمرّ.**
  --     تُزرَعُ الأغلفةُ بأسماءٍ محسوبةٍ فلا تُقرأُ دعوى وجودٍ فى ملفِّ الهجرة.
  FOR i IN 1 .. array_length(k_calls, 1) LOOP
    EXECUTE format(
      'CREATE OR REPLACE FUNCTION public.%I() RETURNS void LANGUAGE plpgsql SECURITY DEFINER '
      'SET search_path TO ''public'',''pg_catalog'' AS $f$ BEGIN PERFORM %s; END $f$',
      k_wrap || i, k_calls[i]);

    BEGIN
      SET LOCAL ROLE authenticated;
      EXECUTE 'SELECT ' || k_calls[i];
      v_direct := 'ALLOWED';
    EXCEPTION WHEN OTHERS THEN
      v_direct := SQLSTATE;
    END;
    RESET ROLE;

    BEGIN
      SET LOCAL ROLE authenticated;
      EXECUTE format('SELECT public.%I()', k_wrap || i);
      v_inner := 'OK';
    EXCEPTION WHEN OTHERS THEN
      v_inner := SQLSTATE;
    END;
    RESET ROLE;

    EXECUTE format('DROP FUNCTION IF EXISTS public.%I()', k_wrap || i);

    IF v_direct <> '42501' THEN
      RAISE EXCEPTION
        'v3.75.34: النداءُ المباشرُ لم يُرفَضْ لعدمِ الصلاحيّة (%): %', v_direct, k_calls[i];
    END IF;

    -- **وحارسٌ يُغلقُ على البرىء يُطفأ**: لو انكسرَ النداءُ الداخلىُّ لَرُفضت الهجرة.
    IF v_inner = '42501' THEN
      RAISE EXCEPTION
        'v3.75.34: النداءُ من داخلِ غلافٍ بصلاحيّاتٍ كاملةٍ صارَ يُرفَضُ — أُغلق على البرىء: %',
        k_calls[i];
    END IF;
  END LOOP;

  -- (ج) **والتوقيعُ الرباعىُّ ملتبِسٌ أصلاً** — لا يصلُ إليه نداءٌ برباعىِّ الوسائط.
  --     يُبرهَنُ بدورِ المالكِ نفسِه: فلو كانت المنحةُ هى المانعَ لَجاءَ 42501.
  BEGIN
    EXECUTE 'SELECT public.record_payment(NULL::uuid,NULL::numeric,NULL::date,NULL::uuid)';
    v_amb := 'RESOLVED';
  EXCEPTION WHEN OTHERS THEN
    v_amb := SQLSTATE;
  END;
  IF v_amb <> '42725' THEN
    RAISE EXCEPTION
      'v3.75.34: توقّعتُ التباسَ التوقيعَين (42725) على النداءِ الرباعىِّ فجاء % — راجعِ الدعوى.',
      v_amb;
  END IF;
END;
$do$;

-- ═══ (٣) الفحصُ المرجعىُّ الجديد ═════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.assert_baseline_v3_75_34_check()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_bad TEXT;
  v_n   INT;
BEGIN
  -- (١) **الأبوابُ الأربعةُ مغلقة**: لا زائرَ ولا مستخدِمَ مسجَّلَ ولا PUBLIC.
  SELECT string_agg(p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
                    ', ' ORDER BY p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')')
    INTO v_bad
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN ('create_audit_log', 'execute_sales_invoice_accounting', 'record_payment')
     AND (has_function_privilege('anon', p.oid, 'EXECUTE')
          OR has_function_privilege('authenticated', p.oid, 'EXECUTE'));
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'v3.75.34: بابٌ يكتبُ فى الدفترِ عادَ يبلغُه من لا يطرقُه: %', v_bad;
  END IF;

  -- (٢) **ولم يُقطَعْ طريقُ الخادم.** النزعُ من الزائرِ والمستخدِمِ لا من الخدمة —
  --     **ونصفُ جراحةٍ أسوأُ من لا جراحة**.
  SELECT string_agg(p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')', ', ')
    INTO v_bad
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN ('create_audit_log', 'execute_sales_invoice_accounting', 'record_payment')
     AND NOT has_function_privilege('service_role', p.oid, 'EXECUTE');
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'v3.75.34: نُزعت منحةُ الخدمةِ أيضاً فانقطعَ طريقُ الخادم: %', v_bad;
  END IF;

  -- (٣) **والأربعةُ باقيةٌ بصلاحيّاتٍ كاملةٍ يملكُها postgres** — فلو صارت
  --     `SECURITY INVOKER` لَانكسرَ النداءُ الداخلىُّ على المستخدِمِ بعدَ الإغلاق.
  SELECT string_agg(p.proname, ', ' ORDER BY p.proname) INTO v_bad
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN ('create_audit_log', 'execute_sales_invoice_accounting', 'record_payment')
     AND (NOT p.prosecdef OR pg_get_userbyid(p.proowner) <> 'postgres');
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION
      'v3.75.34: دالّةٌ فقدت صلاحيّاتِها الكاملةَ أو مالكَها فينكسرُ النداءُ الداخلىُّ: %', v_bad;
  END IF;

  -- (٤) **وكلُّ مَن ينادِيها من داخلِ القاعدةِ ينادى بحقِّ المالك.** هذا هو
  --     الشرطُ الذى جعلَ الإغلاقَ آمناً؛ فلو وُلدَ غداً منادٍ بصلاحيّاتِ مُنادِيه
  --     (`SECURITY INVOKER`) لَانكسرَ عندَه النداءُ صامتاً. **ومكسبٌ لا يُثبَّتُ
  --     يُلتَفُّ عليه.**
  SELECT string_agg(DISTINCT c.proname, ', ') INTO v_bad
    FROM pg_proc c JOIN pg_namespace cn ON cn.oid = c.pronamespace
   WHERE cn.nspname = 'public'
     AND c.proname NOT IN ('create_audit_log', 'execute_sales_invoice_accounting', 'record_payment')
     AND (NOT c.prosecdef OR pg_get_userbyid(c.proowner) <> 'postgres')
     AND EXISTS (
           SELECT 1 FROM unnest(ARRAY['create_audit_log',
                                      'execute_sales_invoice_accounting',
                                      'record_payment']) AS t(nm)
            WHERE c.prosrc ~ ('(^|[^A-Za-z0-9_])(public\.)?' || t.nm || '\s*\(')
         );
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION
      'v3.75.34: دالّةٌ تنادى باباً مغلقاً وهى تجرى بحقِّ مُنادِيها فينكسرُ عندَها: %', v_bad;
  END IF;

  -- (٥) **ولا يُغلَقُ بابٌ ويُترَكُ غلافُه ميّتاً.** الأغلفةُ المعروفةُ باقيةٌ تنادى.
  SELECT count(*) INTO v_n
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'restore_company_backup'
     AND p.prosecdef AND p.prosrc LIKE '%create_audit_log%';
  IF v_n < 1 THEN
    RAISE EXCEPTION 'v3.75.34: غلافُ سجلِّ التدقيقِ restore_company_backup ماتَ أو لم يعُدْ ينادِيه.';
  END IF;

  SELECT count(*) INTO v_n
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN ('complete_booking_atomic', 'handle_invoice_sent_accrual')
     AND p.prosecdef AND p.prosrc LIKE '%execute_sales_invoice_accounting%';
  IF v_n < 2 THEN
    RAISE EXCEPTION 'v3.75.34: غلافُ محرِّكِ الاستحقاقِ ماتَ أو لم يعُدْ ينادِيه (وُجد % لا 2).', v_n;
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.assert_baseline_v3_75_34_check() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assert_baseline_v3_75_34_check() TO service_role;

-- ═══ (٤) وفخٌّ لا يُشغَّل ليس فخّاً ═══════════════════════════════════════════
SELECT public.assert_baseline_v3_75_34_check();
