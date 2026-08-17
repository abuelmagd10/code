-- ═══════════════════════════════════════════════════════════════════════════
-- v3.75.49 — «وقائمةٌ تسألُ: هل أنتَ موجود؟ ليست يداً تطرقُ الباب»
-- ═══════════════════════════════════════════════════════════════════════════
--
-- حارسُ «ما يبلغُه المستخدِمُ المسجَّلُ بلا طارق» يقولُ فى كلِّ دفعةٍ إنّ خمسةً
-- من المائةِ والستّةِ والعشرين **مذكورةٌ أسماؤُهنّ نصّاً فى الشيفرةِ ولا نداءَ
-- ظاهراً لهنّ**، ويكتبُ بجوارِهنّ شرطَه: **«فلا تُنزَعُ منحةُ أحدِهم قبلَ قراءةِ
-- كلِّ موضعٍ بالعين»**. وقد قُرِئَ كلُّ موضع.
--
-- ═══ ما وجدتُه فى كلِّ موضعٍ — واحداً واحداً ═══
--
-- (١) `auto_post_monthly_depreciation`
--     • app/api/fixed-assets/auto-post-depreciation/route.ts:184 —
--       `record_identifier: 'auto_post_monthly_depreciation'`: **عنوانٌ نصّىٌّ
--       فى سجلِّ التدقيق**. والمسارُ نفسُه لا ينادِيها: يمرُّ على الجداولِ صفّاً
--       صفّاً وينادى `post_depreciation` لكلِّ صفّ.
--     • scripts/125_enhance_monthly_depreciation.sql — سكربتٌ قديمٌ **لا يناديه
--       أحدٌ فى المشروعِ كلِّه**، يُنشئُها ويمنحُها. وهو بابُ الالتفافِ الحقيقىّ.
--     • فخُّ حارسٍ ذاتىّ (نصُّ مثالٍ) · اللقطةُ · openapi.json.
--     • وفى القاعدة: **صفرُ منادٍ** — لا دالّةَ، ولا سياسةَ، ولا عرضَ، ولا قيمةَ
--       افتراضيّةً، ولا قيدَ تحقُّق.
--
-- (٢) `check_and_claim_idempotency_key`
--     • اسمٌ فى **قائمةِ دوالٍّ مطلوبةٍ** فى شاشةِ فحصِ الحوكمة، تُسألُ عن وجودِها
--       لا تُنادَى. والوجودُ يُقرأُ من `get_db_governance_state()` وهى تمسحُ
--       `pg_proc` **بلا أىِّ ترشيحٍ بالصلاحيّات** — فنزعُ المنحةِ لا يُخفيها عن
--       الشاشة، ولا يجعلُ الفحصَ يقولُ «مفقودة».
--     • وفى القاعدة: **أربعةُ منادينَ كلُّهم بصلاحيّاتٍ كاملة** —
--       `post_accounting_event_v2`، `post_payroll_atomic`،
--       `process_invoice_payment_atomic_v2` (صيغتان).
--       **ونداءٌ من الداخلِ لا يحتاجُ إذناً، إلّا أن يجرىَ المُنادِى بحقِّ من
--       يُنادى** — ولا واحدَ منهم بصلاحيّاتِ مُنادِيه.
--
-- (٣) `check_period_lock_for_date` · (٤) `get_dashboard_kpis` ·
-- (٥) `reconcile_fifo_vs_gl`
--     • أسماءٌ فى **قوائمِ وجودٍ** فى الشاشةِ نفسِها.
--     • وأسماءٌ **داخلَ نصِّ** `assert_baseline_v3_75_38_check` فى مصفوفةِ
--       `k_locked` — **نصٌّ لا نداء**. وذلك الفحصُ يقيسُ أنّهنّ مُقفَلاتٌ
--       (يصلْنَ إلى `assert_company_access`)، ويرفضُ أن يناديهنّ موضعٌ يجرى بحقِّ
--       المستخدِم. فهنّ مُقفَلاتٌ اليومَ وبلا طارقٍ فى الوقتِ نفسِه.
--     • و`reconcile_fifo_vs_gl` لها **نداءٌ حقيقىٌّ واحد**:
--       tests/critical/financial-integrity.test.ts:280 — **اختبارٌ لا يُشحَن**،
--       عميلُه مفتاحُ الخدمةِ (أو المفتاحُ المجهولُ وهو ممنوعٌ سلفاً)، وعند الخطأ
--       يطبعُ تحذيراً ويعود ولا يسقط. **ومفتاحُ الخدمةِ لا يُمَسُّ هنا.**
--
-- ═══ فالحكم ═══
--
-- **وذِكرُ الاسمِ ليس نداءً، وقائمةٌ تسألُ عن الوجودِ ليست يداً تطرق.** تُنزَعُ
-- منحةُ الخمسةِ عن `PUBLIC` و`anon` و`authenticated` **ولا يُمَسُّ
-- `service_role`** — فمسارُ الخادمِ هو الذى يعملُ فعلاً، **ولا يُغلَقُ بابٌ يمرُّ
-- منه عمل**.
--
-- **ولا تُحذَفُ دالّةٌ واحدة**: «ليس معنى أنّ وظيفةً لم تُستخدَمْ حتى الآن أنّها
-- زائدةٌ على المشروع». تبقى الخمسُ كما هى، أجساداً وصلاحيّاتِ تنفيذٍ للخادم،
-- ويُغلَقُ البابُ الذى لا يمرُّ منه أحد.
--
-- ═══ والبرهانُ كتابةٌ حيّةٌ تُلغى — بعدَ النزعِ لا قبلَه ═══
--
--   (أ) بحقِّ مستخدِمٍ مسجَّلٍ حقيقىّ: نداءٌ مباشرٌ لكلٍّ من الخمس ⇒ **يُرفَضُ
--       بـ42501** (خمسٌ من خمس). ورقمُ الشركةِ فى هذه المحاولاتِ **وهمىّ**،
--       فلو لم يُرفَضْ بالصلاحيّةِ لَرفضَتْه بوّابةُ الشركةِ قبلَ أىِّ عمل.
--   (ب) وبالحقِّ نفسِه: نداءُ `post_payroll_atomic` بمفتاحِ تكرارٍ **مُكتمِلٍ
--       سلفاً** ⇒ يعودُ بالجوابِ المخزَّنِ **بلا خطأ**. وذلك يعنى أنّ النداءَ
--       الداخلىَّ لـ`check_and_claim_idempotency_key` **جرى فعلاً بعدَ إغلاقِ
--       بابِها** — فالجوابُ المخزَّنُ لا يخرجُ إلّا من داخلِها.
--
-- ولو مرَّ نداءٌ مباشرٌ واحد، أو سقطَ نداءُ الغلافِ بـ42501، **لسقطتِ الهجرةُ
-- ولم يُكتَبْ حرف**. وكلُّ ما زُرِعَ يُلغى: لا صفَّ يبقى.
--
-- **ولا تُسمّى الهجرةُ شركةً بعينِها**: تختارُ أوّلَ شركةٍ من القاعدةِ وقتَ
-- التشغيل — **وحارسٌ يعرفُ اسمَ شركةٍ بعينِها ليس حارساً بل تشخيصاً** (v3.75.48)،
-- والهجرةُ أولى بذلك.
-- ═══════════════════════════════════════════════════════════════════════════

REVOKE ALL ON FUNCTION public.auto_post_monthly_depreciation(uuid, uuid)                        FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.check_and_claim_idempotency_key(text, uuid, text, text, uuid)     FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.check_period_lock_for_date(uuid, date)                            FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_dashboard_kpis(uuid, date, date)                              FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reconcile_fifo_vs_gl(uuid)                                        FROM PUBLIC, anon, authenticated;

-- ═══ البرهانُ الحىّ ═══
DO $proof$
DECLARE
  k_ghost constant uuid := '00000000-0000-0000-0000-0000000000ff';
  v_co      uuid;
  v_owner   uuid;
  v_key     text := 'v3_75_49_proof_key';
  v_denied  int  := 0;
  v_open    text := '';
  v_cached  text := 'NOT_RUN';
  v_resp    jsonb;
BEGIN
  SELECT c.id, c.user_id INTO v_co, v_owner
    FROM public.companies c
   WHERE c.user_id IS NOT NULL
   ORDER BY c.created_at
   LIMIT 1;

  IF v_co IS NULL THEN
    RAISE NOTICE 'v3.75.49: no company with an owner on this house - no live proof is claimed.';
    RETURN;
  END IF;

  BEGIN
    -- مفتاحٌ مُكتمِلٌ سلفاً، فيعودُ الغلافُ بالجوابِ المخزَّنِ بلا عمل
    INSERT INTO public.idempotency_keys
      (idempotency_key, company_id, operation_type, status, response_data, created_by, completed_at)
    VALUES
      (v_key, v_co, 'payroll_pay', 'completed', jsonb_build_object('proof', 'v3.75.49'), v_owner, now());

    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', v_owner::text, 'role', 'authenticated')::text, true);
    SET LOCAL ROLE authenticated;

    -- (أ) البابُ مُغلَقٌ على المستخدِمِ المسجَّل — خمسٌ من خمس
    BEGIN PERFORM 1 FROM public.auto_post_monthly_depreciation(k_ghost, v_owner);
      v_open := v_open || 'auto_post_monthly_depreciation ';
    EXCEPTION WHEN insufficient_privilege THEN v_denied := v_denied + 1;
              WHEN OTHERS THEN v_open := v_open || 'auto_post_monthly_depreciation(' || SQLSTATE || ') ';
    END;
    BEGIN PERFORM public.check_and_claim_idempotency_key('x', k_ghost, 'x', NULL, v_owner);
      v_open := v_open || 'check_and_claim_idempotency_key ';
    EXCEPTION WHEN insufficient_privilege THEN v_denied := v_denied + 1;
              WHEN OTHERS THEN v_open := v_open || 'check_and_claim_idempotency_key(' || SQLSTATE || ') ';
    END;
    BEGIN PERFORM public.check_period_lock_for_date(k_ghost, current_date);
      v_open := v_open || 'check_period_lock_for_date ';
    EXCEPTION WHEN insufficient_privilege THEN v_denied := v_denied + 1;
              WHEN OTHERS THEN v_open := v_open || 'check_period_lock_for_date(' || SQLSTATE || ') ';
    END;
    BEGIN PERFORM public.get_dashboard_kpis(k_ghost, current_date, current_date);
      v_open := v_open || 'get_dashboard_kpis ';
    EXCEPTION WHEN insufficient_privilege THEN v_denied := v_denied + 1;
              WHEN OTHERS THEN v_open := v_open || 'get_dashboard_kpis(' || SQLSTATE || ') ';
    END;
    BEGIN PERFORM 1 FROM public.reconcile_fifo_vs_gl(k_ghost);
      v_open := v_open || 'reconcile_fifo_vs_gl ';
    EXCEPTION WHEN insufficient_privilege THEN v_denied := v_denied + 1;
              WHEN OTHERS THEN v_open := v_open || 'reconcile_fifo_vs_gl(' || SQLSTATE || ') ';
    END;

    -- (ب) والنداءُ من الداخلِ ما زال يجرى — والجوابُ المخزَّنُ شاهدُه
    BEGIN
      v_resp := public.post_payroll_atomic(v_co, k_ghost, k_ghost, k_ghost,
                                          current_date, 2026, 1, v_owner, v_key);
      v_cached := CASE WHEN v_resp = jsonb_build_object('proof', 'v3.75.49')
                       THEN 'INNER_CALL_RAN' ELSE 'UNEXPECTED:' || coalesce(v_resp::text, 'null') END;
    EXCEPTION
      WHEN insufficient_privilege THEN v_cached := 'INNER_CALL_DENIED';
      WHEN OTHERS THEN v_cached := 'OTHER:' || SQLSTATE;
    END;

    RESET ROLE;
    PERFORM set_config('request.jwt.claims', NULL, true);

    RAISE EXCEPTION 'MEASURED denied=% open=[%] inner=%', v_denied, v_open, v_cached;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'MEASURED %' THEN
      RAISE EXCEPTION 'v3.75.49: the live proof itself broke - %', SQLERRM;
    END IF;
    RESET ROLE;

    IF SQLERRM NOT LIKE '%denied=5%' THEN
      RAISE EXCEPTION 'v3.75.49: a revoked door is still open to a logged-in user - %', SQLERRM;
    END IF;
    IF SQLERRM NOT LIKE '%open=[]%' THEN
      RAISE EXCEPTION 'v3.75.49: a direct call was refused for the wrong reason - %', SQLERRM;
    END IF;
    IF SQLERRM NOT LIKE '%inner=INNER_CALL_RAN%' THEN
      RAISE EXCEPTION 'v3.75.49: the inner call no longer runs after the revoke - %', SQLERRM;
    END IF;
    RAISE NOTICE 'v3.75.49 proof: %', SQLERRM;
  END;
END
$proof$;

-- ═══ الفحصُ المرجعىُّ الجديد ═══
CREATE OR REPLACE FUNCTION public.assert_baseline_v3_75_49_check()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $check$
DECLARE
  k_shut text[] := ARRAY[
    'auto_post_monthly_depreciation(uuid,uuid)',
    'check_and_claim_idempotency_key(text,uuid,text,text,uuid)',
    'check_period_lock_for_date(uuid,date)',
    'get_dashboard_kpis(uuid,date,date)',
    'reconcile_fifo_vs_gl(uuid)'
  ];
  s          text;
  v_missing  text := '';
  v_open     text := '';
  v_noserver text := '';
  v_invoker  text := '';
  v_inner    int;
BEGIN
  FOREACH s IN ARRAY k_shut LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.prosecdef
         AND pg_get_userbyid(p.proowner) = 'postgres'
         AND replace(p.oid::regprocedure::text, 'public.', '') = s
    ) THEN
      v_missing := v_missing || s || ' ';
    END IF;
  END LOOP;
  -- **وبابٌ أُزيل لا يحتاجُ قفلاً — لكنّ إزالتَه تُعلَنُ فى دفعتِها لا تُسكَتُ عنها**
  IF v_missing <> '' THEN
    RAISE EXCEPTION 'v3.75.49 (1): missing, not a definer, or not owned by postgres: %', v_missing;
  END IF;

  SELECT coalesce(string_agg(x.sig || CASE WHEN x.a THEN ':authenticated' ELSE '' END
                                    || CASE WHEN x.n THEN ':anon' ELSE '' END, ' '), '')
    INTO v_open
  FROM (
    SELECT replace(p.oid::regprocedure::text, 'public.', '') AS sig,
           has_function_privilege('authenticated', p.oid, 'EXECUTE') AS a,
           has_function_privilege('anon',          p.oid, 'EXECUTE') AS n
      FROM pg_proc p JOIN pg_namespace nn ON nn.oid = p.pronamespace
     WHERE nn.nspname = 'public'
       AND replace(p.oid::regprocedure::text, 'public.', '') = ANY(k_shut)
  ) x
  WHERE x.a OR x.n;
  IF v_open <> '' THEN
    RAISE EXCEPTION 'v3.75.49 (2): a door that has no knocker is open again: %', v_open;
  END IF;

  -- **ولا يُغلَقُ بابٌ يمرُّ منه عمل**: مسارُ الخادمِ يبقى مفتوحاً
  SELECT coalesce(string_agg(replace(p.oid::regprocedure::text, 'public.', ''), ' '), '')
    INTO v_noserver
    FROM pg_proc p JOIN pg_namespace nn ON nn.oid = p.pronamespace
   WHERE nn.nspname = 'public'
     AND replace(p.oid::regprocedure::text, 'public.', '') = ANY(k_shut)
     AND NOT has_function_privilege('service_role', p.oid, 'EXECUTE');
  IF v_noserver <> '' THEN
    RAISE EXCEPTION 'v3.75.49 (3): the server path was closed too - %', v_noserver;
  END IF;

  -- **ونداءٌ من الداخلِ لا يحتاجُ إذناً، إلّا أن يجرىَ المُنادِى بحقِّ من يُنادى**
  SELECT count(*) INTO v_inner
    FROM pg_proc c JOIN pg_namespace cn ON cn.oid = c.pronamespace
   WHERE cn.nspname = 'public' AND c.prosecdef
     AND c.proname <> 'check_and_claim_idempotency_key'
     AND c.proname NOT LIKE 'assert_baseline_%'
     AND c.prosrc ~ '\ycheck_and_claim_idempotency_key\s*\(';
  IF v_inner < 4 THEN
    RAISE EXCEPTION 'v3.75.49 (4): the idempotency claim is called from % full-rights place(s), not 4 - a business path may have lost it.', v_inner;
  END IF;

  SELECT coalesce(string_agg(c.proname, ' '), '') INTO v_invoker
    FROM pg_proc c JOIN pg_namespace cn ON cn.oid = c.pronamespace
   WHERE cn.nspname = 'public' AND NOT c.prosecdef
     AND c.proname NOT LIKE 'assert_baseline_%'
     AND c.prosrc ~ ('\y(' ||
         'auto_post_monthly_depreciation|check_and_claim_idempotency_key|' ||
         'check_period_lock_for_date|get_dashboard_kpis|reconcile_fifo_vs_gl' ||
         ')\s*\(');
  IF v_invoker <> '' THEN
    RAISE EXCEPTION 'v3.75.49 (5): a place that runs with the caller rights now calls a shut door - grant it back or make the caller a definer: %', v_invoker;
  END IF;

  RETURN format('v3.75.49 ok - 5 doors with no knocker are shut to anon and to a logged-in user, '
             || 'the service_role path is untouched, the idempotency claim is still called from %s '
             || 'full-rights place(s), and no caller-rights place calls any of the five.', v_inner);
END
$check$;

REVOKE ALL ON FUNCTION public.assert_baseline_v3_75_49_check() FROM PUBLIC, anon, authenticated;

-- **ومن يُبدِّلْ حالاً فليُنادِ كلَّ فحصٍ يُسمّى ذلك الحال**
SELECT public.assert_baseline_v3_75_49_check();
SELECT public.assert_baseline_v3_75_38_check();
SELECT public.assert_baseline_v3_75_25_check();
SELECT public.assert_baseline_v3_75_29_check();
