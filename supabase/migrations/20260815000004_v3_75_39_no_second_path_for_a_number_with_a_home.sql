-- ═══════════════════════════════════════════════════════════════════════════
-- v3.75.39 — «ولا مسارَ بديلٍ لرقمٍ له بيت»
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ═══ القاعدةُ التى كُسرت — وهى مكتوبةٌ فى المشروعِ منذ زمن ═══
--
-- فى `docs/ACCOUNTING_REPORTS_ARCHITECTURE.md`:
--
--     «لا حساب مكرر: لا يُسمح بحساب نفس الرقم بطريقتين مختلفتين.»
--     «لا مسار بديل: جميع التقارير تستخدم نفس الـ API/Function.»
--
-- وبيوتُ الأرقامِ المحاسبيّةِ مُسمّاةٌ هناك: `/api/income-statement` (وعليه
-- «DO NOT MODIFY WITHOUT SENIOR ACCOUNTING REVIEW») و`/api/account-balances`
-- و`lib/ledger.ts`.
--
-- **وشاشةُ `/reports/dashboard` كانت تسلكُ مساراً رابعاً خاصّاً بها** عبر
-- `get_financial_summary` — تُعيدُ حسابَ الإيراداتِ والمصروفاتِ والأصولِ
-- والالتزاماتِ وحقوقِ الملكيّةِ من الصفر. **وهو المسارُ البديلُ الممنوعُ نصّاً.**
--
-- ═══ ولم يكتشفْه أحدٌ لأنّه مكسورٌ فيصمت ═══
--
-- كان يقارنُ `account_type` بـ`'Revenue'` و`'COGS'` و`'Asset'` و`'Liability'`
-- و`'Equity'` و`'Expense'` — **بحروفٍ كبيرة**. والقيمُ الحيّةُ صغيرةٌ كلُّها:
-- `asset · equity · expense · income · liability`. **فلا شرطَ يُطابِقُ شيئاً،
-- فتعرضُ الشاشةُ أصفاراً وتبدو سليمة.** ولا وجودَ لنوعٍ اسمُه `COGS` أصلاً —
-- تكلفةُ المبيعاتِ نوعٌ فرعىٌّ تحتَ `expense`. وكان يحسبُ القيودَ المحذوفةَ
-- أيضاً، خلافاً للبيتِ المعتمَد.
--
-- ═══ وأربعُ دوالَّ أُخرى لا تعملُ أصلاً ═══
--
-- `get_balance_sheet` و`get_income_statement` و`get_trial_balance` بصيغتَيها
-- الثالثةِ والخامسة: كلُّهنّ يطلبنَ عموداً `chart_of_accounts.code` **لا وجودَ
-- له** (اسمُه `account_code`)، فيسقطنَ عندَ أوّلِ نداء. والثالثةُ **ملتبسةٌ**
-- مع الخماسيّةِ فلا يمكنُ نداؤها أصلاً (`42725`) — نفسُ عطبِ `record_payment`
-- فى v3.75.34.
--
-- ═══ فالعلاجُ إزالةٌ لا إصلاح ═══
--
-- **بيتٌ لا يُسكَنُ ليس بيتاً.** وإصلاحُ حسبةٍ محاسبيّةٍ ثانيةٍ يُبقيها بيتاً
-- ثانياً؛ فتُزال، وتقرأُ الشاشةُ من البيتَينِ المعتمَدَينِ كما تفعلُ أخواتُها.
--
-- ═══ ولا يُهدَمُ بيتٌ يسكنُه أحد ═══
--
-- الهجرةُ **تمسحُ كلَّ سطحٍ فى القاعدةِ أوّلاً** — أجسامَ الدوالِّ والعروضَ
-- والسياساتِ والقيمَ الافتراضيّةَ والقيودَ والزناداتِ ومهامَّ الجدولةِ وصفوفَ
-- جدولِ الإرسال — **وترفضُ الحذفَ كلَّه إن وجدت مُنادِياً واحداً**. وقد قِيس:
-- لا مُنادىَ فى القاعدة، ولا فى الشيفرةِ سوى تلك الشاشةِ وحدَها.
--
-- **والفحصُ المرجعىُّ الذى يُسمّى ما يحرسُه ليس مُنادِياً له** — كما أنّ
-- التعليقَ ليس تعليمة. فتُستثنى دوالُّ `assert_baseline_%` صراحةً، وإلّا
-- لَرفضَ المسحُ الحذفَ بسببِ اسمٍ مكتوبٍ داخلَ نمطِ فحص. (وقد وقعَ ذلك فعلاً
-- فى أوّلِ محاولة.)
--
-- ═══ وبابٌ أُزيل لا يحتاجُ قفلاً ═══
--
-- فحصُ v3.75.38 كان يشترطُ بقاءَ سبعةِ أبوابٍ مقفولة، واثنتانِ منها تُزالانِ
-- هنا. **فسقطَ الفحصُ فورَ الحذف — وهو صادقٌ فى صراخِه.** فيُعادُ كتابتُه فى
-- **الدفعةِ التى أزالتهما**، لا بأثرٍ رجعىّ ولا بإسكات.
--
-- ═══ ومعدودٌ لا مسكوتٌ عنه ═══
--
-- الخمسُ لم تكنْ إلّا رأسَ العائلة: **٣٣ دالّةً فى القاعدةِ ما زالت تجمعُ
-- مالاً من سطورِ اليوميّةِ بحسبِ نوعِ الحساب** — ومنها `get_enhanced_balance_sheet`
-- و`get_enhanced_income_statement`. والرقمُ يُعَدُّ فى الفحصِ المرجعىّ فلا يزيدُ
-- صامتاً، ويُسدَّدُ على دفعاتٍ مقيسة.
-- ═══════════════════════════════════════════════════════════════════════════

DO $before$
DECLARE v_callers text;
BEGIN
  SELECT string_agg(DISTINCT nm.n || ' <- ' || s.place, ' | ') INTO v_callers
  FROM (VALUES ('get_financial_summary'),('get_balance_sheet'),('get_income_statement')) AS nm(n)
  JOIN (
    SELECT 'function(' || p.proname || ')' AS place, p.prosrc AS txt
      FROM pg_proc p JOIN pg_namespace n2 ON n2.oid = p.pronamespace
      WHERE n2.nspname = 'public'
        AND p.proname NOT LIKE 'assert_baseline_%'
        AND p.proname NOT IN ('get_financial_summary','get_balance_sheet','get_income_statement')
    UNION ALL SELECT 'view(' || c.relname || ')', pg_get_viewdef(c.oid)
      FROM pg_class c JOIN pg_namespace n2 ON n2.oid = c.relnamespace
      WHERE n2.nspname = 'public' AND c.relkind IN ('v','m')
    UNION ALL SELECT 'policy(' || pol.polname || ')',
        coalesce(pg_get_expr(pol.polqual, pol.polrelid),'') || ' ' || coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid),'')
      FROM pg_policy pol
    UNION ALL SELECT 'default(' || cl.relname || '.' || a.attname || ')', pg_get_expr(ad.adbin, ad.adrelid)
      FROM pg_attrdef ad JOIN pg_class cl ON cl.oid = ad.adrelid
      JOIN pg_attribute a ON a.attrelid = ad.adrelid AND a.attnum = ad.adnum
    UNION ALL SELECT 'check(' || con.conname || ')', pg_get_constraintdef(con.oid)
      FROM pg_constraint con WHERE con.contype = 'c'
    UNION ALL SELECT 'trigger(' || t.tgname || ')', pg_get_triggerdef(t.oid)
      FROM pg_trigger t WHERE NOT t.tgisinternal
    UNION ALL SELECT 'cron(' || coalesce(j.jobname,'?') || ')', j.command FROM cron.job j
    UNION ALL SELECT 'table_row(integrity_check_definitions)', d.fn_name FROM public.integrity_check_definitions d
  ) s ON s.txt ~ ('(^|[^A-Za-z0-9_])(public\.)?' || nm.n || '\s*\(');

  IF v_callers IS NOT NULL AND v_callers <> '' THEN
    RAISE EXCEPTION 'v3.75.39: a place in the database still calls a retired name: % - nothing is dropped.', v_callers;
  END IF;
  RAISE NOTICE 'v3.75.39 BEFORE: no database caller for the retired names.';
END
$before$;

DROP FUNCTION IF EXISTS public.get_financial_summary(uuid, date, date);
DROP FUNCTION IF EXISTS public.get_balance_sheet(uuid, date);
DROP FUNCTION IF EXISTS public.get_income_statement(uuid, date, date);
DROP FUNCTION IF EXISTS public.get_trial_balance(uuid, date, date);
DROP FUNCTION IF EXISTS public.get_trial_balance(uuid, date, date, uuid, uuid);

DO $proof$
DECLARE v_left text; v_home int;
BEGIN
  SELECT string_agg(replace(p.oid::regprocedure::text, 'public.', ''), ' ') INTO v_left
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND replace(p.oid::regprocedure::text, 'public.', '') IN (
      'get_financial_summary(uuid,date,date)', 'get_balance_sheet(uuid,date)',
      'get_income_statement(uuid,date,date)', 'get_trial_balance(uuid,date,date)',
      'get_trial_balance(uuid,date,date,uuid,uuid)');
  IF v_left IS NOT NULL AND v_left <> '' THEN
    RAISE EXCEPTION 'v3.75.39: a retired path survived: %', v_left;
  END IF;

  SELECT count(*) INTO v_home FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND replace(p.oid::regprocedure::text, 'public.', '') = 'get_trial_balance(uuid,date)'
    AND p.prosecdef AND p.prosrc ~ 'assert_company_access';
  IF v_home <> 1 THEN
    RAISE EXCEPTION 'v3.75.39: the surviving trial balance is missing or lost its lock - the live screen would break.';
  END IF;

  RAISE NOTICE 'v3.75.39 PROOF: 5 retired, the surviving trial balance is alive and still locked.';
END
$proof$;

-- ═══ وبابٌ أُزيل لا يحتاجُ قفلاً: يُعادُ فحصُ v3.75.38 فى الدفعةِ التى أزالت بابَيه ═══
CREATE OR REPLACE FUNCTION public.assert_baseline_v3_75_38_check()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $check$
DECLARE
  -- v3.75.39: صيغتانِ من get_trial_balance تقاعدتا (مكسورتانِ ومسارٌ بديل)،
  -- **وبابٌ أُزيل لا يحتاجُ قفلاً** - فرُفعتا من القائمةِ فى الدفعةِ التى أزالتهما.
  k_locked text[] := ARRAY[
    'get_trial_balance(uuid,date)',
    'get_dashboard_kpis(uuid,date,date)',
    'reconcile_fifo_vs_gl(uuid)',
    'search_audit_trail(uuid,text,integer)',
    'check_period_lock_for_date(uuid,date)'
  ];
  v_missing text := ''; v_ungated text := ''; v_caller text := '';
  v_open int; v_gateless int; s text;
BEGIN
  FOREACH s IN ARRAY k_locked LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.prosecdef
        AND pg_get_userbyid(p.proowner) = 'postgres'
        AND replace(p.oid::regprocedure::text, 'public.', '') = s
    ) THEN
      v_missing := v_missing || s || ' ';
    END IF;
  END LOOP;
  IF v_missing <> '' THEN
    RAISE EXCEPTION 'v3.75.38 (1): missing or changed: %', v_missing;
  END IF;

  SELECT string_agg(x.sig, ' ') INTO v_ungated
  FROM (
    SELECT replace(p.oid::regprocedure::text, 'public.', '') AS sig, p.oid
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND replace(p.oid::regprocedure::text, 'public.', '') = ANY(k_locked)
  ) x
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_proc caller
    JOIN pg_namespace cn ON cn.oid = caller.pronamespace,
         LATERAL regexp_matches(caller.prosrc, '([a-zA-Z_][a-zA-Z0-9_]*)\s*\(', 'g') m
    JOIN pg_proc gate ON gate.proname = m[1]
    JOIN pg_namespace gn ON gn.oid = gate.pronamespace AND gn.nspname = 'public'
    WHERE caller.oid = x.oid AND cn.nspname = 'public'
      AND gate.proname IN ('assert_company_access', 'assert_company_access_by_row')
  );
  IF v_ungated IS NOT NULL AND v_ungated <> '' THEN
    RAISE EXCEPTION 'v3.75.38 (2): a door with no lock: %', v_ungated;
  END IF;

  BEGIN
    PERFORM public.assert_company_access('00000000-0000-0000-0000-000000000001'::uuid);
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'v3.75.38 (3): the gate refuses a caller with no identity - this cuts every server path.';
  END;

  SELECT string_agg(DISTINCT q.place, ' ') INTO v_caller
  FROM (
    SELECT 'invoker:' || p.proname AS place, p.prosrc AS txt
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND NOT p.prosecdef
    UNION ALL
    SELECT 'default:' || cl.relname || '.' || a.attname, pg_get_expr(ad.adbin, ad.adrelid)
      FROM pg_attrdef ad JOIN pg_class cl ON cl.oid = ad.adrelid
      JOIN pg_attribute a ON a.attrelid = ad.adrelid AND a.attnum = ad.adnum
    UNION ALL
    SELECT 'check:' || con.conname, pg_get_constraintdef(con.oid)
      FROM pg_constraint con WHERE con.contype = 'c'
  ) q
  WHERE q.txt ~ '(^|[^A-Za-z0-9_])(public\.)?(get_trial_balance|get_dashboard_kpis|reconcile_fifo_vs_gl|search_audit_trail|check_period_lock_for_date)\s*\(';
  IF v_caller IS NOT NULL AND v_caller <> '' THEN
    RAISE EXCEPTION 'v3.75.38 (4): a place evaluated with the caller rights calls a locked door: %', v_caller;
  END IF;

  WITH RECURSIVE fns AS (
    SELECT p.oid, p.proname, p.prosrc FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prokind = 'f'
  ), tok AS (
    SELECT f.oid AS caller, m[1] AS callee_name
    FROM fns f, LATERAL regexp_matches(f.prosrc, '([a-zA-Z_][a-zA-Z0-9_]*)\s*\(', 'g') m
  ), edges AS (
    SELECT DISTINCT t.caller, f2.oid AS callee FROM tok t JOIN fns f2 ON f2.proname = t.callee_name
  ), gates AS (
    SELECT oid FROM fns WHERE proname IN ('assert_company_access', 'assert_company_access_by_row')
  ), reach AS (
    SELECT g.oid AS f, 0 AS d FROM gates g
    UNION
    SELECT e.caller, r.d + 1 FROM edges e JOIN reach r ON e.callee = r.f WHERE r.d < 4
  ), target AS (
    SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef AND p.prokind = 'f'
      AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
      AND pg_get_function_arguments(p.oid) ~ 'p_company_id\s+uuid'
  )
  SELECT count(*), count(*) FILTER (WHERE t.oid NOT IN (SELECT f FROM reach))
  INTO v_open, v_gateless
  FROM target t;

  RETURN format('v3.75.38 ok - 5 doors locked - %s company-scoped and reachable by a logged-in user - %s gateless - the server path passes.',
                v_open, v_gateless);
END
$check$;

CREATE OR REPLACE FUNCTION public.assert_baseline_v3_75_39_check()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $check$
DECLARE
  k_retired text[] := ARRAY[
    'get_financial_summary(uuid,date,date)',
    'get_balance_sheet(uuid,date)',
    'get_income_statement(uuid,date,date)',
    'get_trial_balance(uuid,date,date)',
    'get_trial_balance(uuid,date,date,uuid,uuid)'
  ];
  v_back text := ''; v_ref text := ''; v_sum int;
BEGIN
  SELECT string_agg(replace(p.oid::regprocedure::text, 'public.', ''), ' ') INTO v_back
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND replace(p.oid::regprocedure::text, 'public.', '') = ANY(k_retired);
  IF v_back IS NOT NULL AND v_back <> '' THEN
    RAISE EXCEPTION 'v3.75.39 (1): a retired second path was born again: %', v_back;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND replace(p.oid::regprocedure::text, 'public.', '') = 'get_trial_balance(uuid,date)'
      AND p.prosecdef AND p.prosrc ~ 'assert_company_access'
  ) THEN
    RAISE EXCEPTION 'v3.75.39 (2): the surviving trial balance is gone or lost its lock.';
  END IF;

  SELECT string_agg(DISTINCT q.place, ' ') INTO v_ref
  FROM (
    SELECT 'function:' || p.proname AS place, p.prosrc AS txt
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname NOT LIKE 'assert_baseline_%'
    UNION ALL
    SELECT 'view:' || c.relname, pg_get_viewdef(c.oid)
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind IN ('v','m')
  ) q
  WHERE q.txt ~ '(^|[^A-Za-z0-9_])(public\.)?(get_financial_summary|get_balance_sheet|get_income_statement)\s*\(';
  IF v_ref IS NOT NULL AND v_ref <> '' THEN
    RAISE EXCEPTION 'v3.75.39 (3): a place still calls a retired name: %', v_ref;
  END IF;

  SELECT count(*) INTO v_sum
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.prokind = 'f'
    AND p.prosrc ~ 'journal_entry_lines' AND p.prosrc ~ 'account_type';

  RETURN format('v3.75.39 ok - 5 second paths retired - the one home is alive and locked - %s function(s) still sum money from journal lines by account type (counted, not silenced).', v_sum);
END
$check$;

REVOKE ALL ON FUNCTION public.assert_baseline_v3_75_39_check() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assert_baseline_v3_75_39_check() TO service_role;

SELECT public.assert_baseline_v3_75_38_check();
SELECT public.assert_baseline_v3_75_39_check();
