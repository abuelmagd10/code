-- ═══════════════════════════════════════════════════════════════════════════
-- v3.75.6 — البابُ المفتوحُ على لا أحدٍ يُغلَق
-- ═══════════════════════════════════════════════════════════════════════════
--
-- فى سياسةِ تعديلِ المصروفاتِ شرطٌ يقول: «أو مَن وظيفتُه إحدى ثلاثِ تهجئاتٍ
-- لوظيفةٍ لا يقبلها قيدُ الوظائفِ أصلاً». فهو شرطٌ يُنفَّذ على كلِّ صفٍّ يُقرأ
-- **ولا يُدخل أحداً أبداً**.
--
-- وقُيس قبلَ أن يُلمَس: ٥٥٦٤ زوجاً (عضوٌ × صفّ)، حقيقيّةٍ ومُتخيَّلةٍ تُغطّى
-- الشركاتِ السّتَّ وكلَّ حالاتِ المستند. القديمُ والجديدُ اتّفقا فى كلِّ صفّ،
-- والعددُ الذى يستطيع التعديلَ ٤٤٦ قبلُ و٤٤٦ بعدُ.
-- وقُلبت التجربةُ لتُثبت أنّ الصفرَ ليس عمًى: بمفرداتٍ مُتخيَّلةٍ يحملُ فيها
-- عضوٌ ذلك الاسمَ، رأى القياسُ الفرقَ حالاً.
--
-- **وتُحذف الشروطُ لا الأسماء:** حذفُ الأسماءِ وحدَها يتركُ قائمةً فارغةً
-- ملتبسةً لا يُعرف أهى منعٌ أم سهو.
--
-- ولا يُمَسُّ سواه: شرطُ الحالةِ الجديدةِ فى السياسةِ نفسِها يبقى كما هو،
-- لأنّه يذكرُ وظيفةً حيّةً بجانبها — وتلك تهجئاتٌ ميّتةٌ معدودةٌ يتولّاها
-- حارسٌ آخرُ فى نسخةٍ تخصُّها. **ولا تُدمَج مسألتان فى نسخةٍ واحدة.**
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══ (١) الشرطُ الميّتُ يُحذف كاملاً ═══
ALTER POLICY expenses_update ON public.expenses
USING (
  (company_id IN ( SELECT cm.company_id
     FROM company_members cm
    WHERE (cm.user_id = auth.uid())))
  AND ((EXISTS ( SELECT 1
     FROM companies c
    WHERE ((c.id = expenses.company_id) AND (c.user_id = auth.uid()))))
    OR (EXISTS ( SELECT 1
     FROM company_members cm
    WHERE ((cm.company_id = expenses.company_id) AND (cm.user_id = auth.uid()) AND (cm.role = 'admin'::text))))
    OR ((created_by = auth.uid()) AND ((status)::text = ANY ((ARRAY['draft'::character varying, 'rejected'::character varying])::text[]))))
);

-- ═══ (٢) البابُ يُقرأ من القاعدةِ الحيّة، لا من قائمةٍ مكتوبةٍ هنا ═══
-- **ووظيفةُ الجلسةِ ليست وظيفةَ الموظّف:** ما بعدَه قوسٌ نداءُ دالّةٍ لا عمودُ
-- جدول، فلا يُحاكَم. وما بين علامتَى اقتباسٍ اسمٌ داخلَ نصٍّ لا عمود.
CREATE OR REPLACE FUNCTION public.erp_policy_role_groups()
RETURNS TABLE(policy_name text, roles_named text[])
LANGUAGE sql
STABLE
SET search_path TO 'public', 'pg_catalog'
AS $function$
  WITH pol AS (
    SELECT n.nspname || '.' || c.relname || ' / ' || p.polname AS nm,
           coalesce(pg_get_expr(p.polqual, p.polrelid), '') || ' ||| ' ||
           coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') AS body
    FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname IN ('public', 'storage')
  ), grp AS (
    SELECT nm, m[1] AS lst FROM pol,
      LATERAL regexp_matches(body, '(?<![''"])\mrole\M(?!\s*\()[^=<>!]{0,60}?=\s*ANY\s*\(\s*ARRAY\s*\[([^\]]*)\]', 'g') m
    UNION ALL
    SELECT nm, m[1] FROM pol,
      LATERAL regexp_matches(body, '(?<![''"])\mrole\M(?!\s*\()[^=<>!]{0,60}?=\s*(''[a-z_]+'')', 'g') m
    UNION ALL
    SELECT nm, m[1] FROM pol,
      LATERAL regexp_matches(body, '(?<![''"])\mrole\M(?!\s*\()[^=<>!]{0,60}?IN\s*\(\s*((?:''[a-z_]+''\s*(?:::text)?\s*,?\s*)+)\)', 'g') m
  )
  SELECT nm, (SELECT array_agg(t[1]) FROM regexp_matches(lst, '''([a-z_]+)''', 'g') t)
  FROM grp
  WHERE (SELECT array_agg(t[1]) FROM regexp_matches(lst, '''([a-z_]+)''', 'g') t) IS NOT NULL;
$function$;

-- ═══ (٣) الفحصُ المرجعىّ ═══
CREATE OR REPLACE FUNCTION public.assert_baseline_v3_75_6_check()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_total int;
  v_bad   text;
  v_seen  int;
  v_def   text;
  v_caught boolean;
BEGIN
  -- **بحثٌ لا يجد ليس دليلَ غياب** — فيُعدُّ ما مرَّ أوّلاً
  SELECT count(*) INTO v_total FROM public.erp_policy_role_groups();
  IF v_total = 0 THEN
    RAISE EXCEPTION 'BASELINE FAIL: لم تُقرأ مقارنةُ وظيفةٍ واحدةٍ فى السياسات (v3.75.6)';
  END IF;

  -- ═══ ولا بابَ مفتوحٌ على لا أحد ═══
  SELECT string_agg(policy_name || ' [' || array_to_string(roles_named, ', ') || ']', ' | ')
    INTO v_bad
  FROM public.erp_policy_role_groups()
  WHERE NOT (roles_named && public.erp_membership_roles());
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'BASELINE FAIL: بابٌ مفتوحٌ على لا أحد: % (v3.75.6)', v_bad;
  END IF;

  -- ═══ والقيدُ ما زال يرفضُ الاسمَ المحذوف — **فخٌّ يُشغَّل** ═══
  -- يُنسخ نصُّ القيدِ الحىِّ نفسُه إلى جدولٍ مؤقّت، فمن وسَّع القيدَ يوماً
  -- وسَّع النسخةَ معه وسقطَ الفخُّ فسقطَ الفحص.
  SELECT pg_get_constraintdef(oid) INTO v_def
  FROM pg_constraint
  WHERE conrelid = 'public.company_members'::regclass AND conname = 'company_members_role_check';
  IF v_def IS NULL THEN
    RAISE EXCEPTION 'BASELINE FAIL: قيدُ وظائفِ الأعضاءِ غائبٌ — ولا شىءَ يمنعُ اسماً مخترَعاً (v3.75.6)';
  END IF;
  v_caught := false;
  BEGIN
    EXECUTE 'CREATE TEMP TABLE zz_probe_3756_role (role text, CONSTRAINT zz_probe_3756_c ' || v_def || ')';
    BEGIN
      EXECUTE 'INSERT INTO zz_probe_3756_role (role) VALUES (''general_manager'')';
    EXCEPTION WHEN check_violation THEN
      v_caught := true;
    END;
    RAISE EXCEPTION 'ROLLBACK_PROBE_3756A';
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM <> 'ROLLBACK_PROBE_3756A' THEN RAISE; END IF;
  END;
  IF NOT v_caught THEN
    RAISE EXCEPTION 'BASELINE FAIL: القيدُ يقبلُ الاسمَ المحذوفَ — والشرطُ الذى حُذف لم يكن ميّتاً (v3.75.6)';
  END IF;

  -- ═══ والماسحُ يرى لو زُرع بابٌ على لا أحد — **فخٌّ لا يُشغَّل ليس فخّاً** ═══
  v_seen := -1;
  BEGIN
    EXECUTE 'CREATE TABLE public.zz_probe_3756_pol (id int, role text)';
    EXECUTE 'ALTER TABLE public.zz_probe_3756_pol ENABLE ROW LEVEL SECURITY';
    EXECUTE 'CREATE POLICY zz_probe_3756_p ON public.zz_probe_3756_pol FOR SELECT USING (role = ANY (ARRAY[''zz_nobody''::text]))';
    SELECT count(*) INTO v_seen
    FROM public.erp_policy_role_groups()
    WHERE policy_name LIKE '%zz_probe_3756_pol%'
      AND NOT (roles_named && public.erp_membership_roles());
    RAISE EXCEPTION 'ROLLBACK_PROBE_3756B';
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM <> 'ROLLBACK_PROBE_3756B' THEN RAISE; END IF;
  END;
  IF v_seen <> 1 THEN
    RAISE EXCEPTION 'BASELINE FAIL: زُرع بابٌ على لا أحدٍ فلم يره الفحصُ (رأى %) (v3.75.6)', v_seen;
  END IF;
END;
$function$;
