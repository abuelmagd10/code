-- =============================================================================
-- v3.74.990 — البابُ يسأل بنفسه، ولا يتّكل على جارٍ يسأل عنه
-- =============================================================================
-- بعد ٩٨٩ سألتُ سؤالاً واحداً على كلِّ الأبواب الخلفيّة معاً بدل أن أقرأها
-- باباً باباً: **أىُّ دالّةٍ تتجاوز حمايةَ الصفوف، ويستطيع كلُّ مسجَّلٍ نداءَها،
-- ولا تتحقّق أنّ الطالبَ ينتمى للشركة التى تكتب فيها؟**
--
-- وكنتُ سأرفع تهمةً على `create_sales_invoice_atomic`: تأخذ رقمَ الشركة من
-- **داخل حمولةٍ نصّيّة**، ولا تسأل عن المُنادى إطلاقاً. **فجرّبتُها**: انتحلتُ
-- عضواً من شركةٍ وطلبتُ إنشاءَ فاتورةٍ فى شركةٍ أخرى — **فرُفض بالفعل**.
--
--   **لكنّ الرافضَ لم يكن الدالّة.** كان **مُشغِّلاً وظيفتُه اعتمادُ الخصومات**،
--   تصادف أنّه يفحص الشركة. فمن يُعدّل قواعدَ الخصم غداً يفتح باباً لم يقصد
--   فتحه، ولا يعلم.
--
-- > **والتهمةُ تُقاس كما يُقاس العطب**: لا تُسمَّى ثغرةً حمايةٌ رفضت بالتشغيل.
-- > وتُسمَّى ما هى: **حمايةٌ صحيحةُ النتيجة، هشّةُ السبب — لأنّ البابَ لا يسأل
-- > بنفسه.**
--
-- ═══ ولماذا لم يرَها الحارسُ القائم ═══
--
-- فى المشروع حارسٌ لهذا المعنى بالضبط منذ ٩١٩، وُلد من عطبٍ صنعه كاتبُه بيده.
-- وهو سليمٌ فى معناه، **لكنّه يقيس شكلاً لا خاصّيّة**:
--
--   • يشترط أن تأخذ الدالّةُ وسيطاً من نوع `uuid` — **ومن يُخفى رقمَ الشركة
--     داخل حمولة `jsonb` يمرُّ من تحته**.
--   • ويشترط أن يكون فى جسدها كتابةٌ صريحة — **ومن يُفوِّض الكتابةَ إلى دالّةٍ
--     أخرى يبدو برىئاً وهو الباب**.
--
-- فوُسِّع الحارسُ ليقيس الخاصّيّةَ لا الشكل: **الوسيطُ رقماً كان أو حمولة،
-- والكتابةُ مباشرةً كانت أو بتفويض. ومن فوَّض إلى من يسأل فقد سأل** — فلا
-- يُتَّهم برىء.
--
-- وبالخاصّيّة الموسَّعة ظهرت **ثلاثةٌ لا رابعَ لها**، وكلُّها تُصلَح هنا:
--   ١) إنشاءُ فاتورة مبيعات        — تكتب مباشرةً ولا تسأل
--   ٢) مزامنةُ موادّ أمر تصنيع     — تُفوِّض إلى من لا يسأل
--   ٣) تهيئةُ الفترات المحاسبيّة   — تُفوِّض إلى من لا يسأل
-- =============================================================================

-- -----------------------------------------------------------------------------
-- ١) السؤالُ يُدَسُّ فى الأبواب الثلاثة — كلٌّ بلغته
-- -----------------------------------------------------------------------------
-- ولا يُكتب فحصٌ جديد: يُنادى **البيتُ الواحدُ القائم** `assert_company_access`،
-- وهو الذى يعرف الاستثناءَين المقيسَين سلفاً: نداءُ الخادم بلا جلسة، ومالكُ
-- الشركة المسجَّل على السجلّ نفسِه لحظةَ إنشائها.
--
-- ويُتحقَّق من كلِّ استبدالٍ بعكسه: يُعاد النصُّ الجديدُ إلى القديم، فإن لم
-- يطابقه **حرفاً بحرف** تُلغى الهجرةُ كلُّها.

DO $rewrite$
DECLARE
  r RECORD;
  v_def text;
  v_new text;
  v_expr text;
  v_line text;
  v_n int := 0;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'create_sales_invoice_atomic',
        'sync_manufacturing_production_order_materials_atomic',
        'require_open_financial_period_db'
      )
  LOOP
    -- رقمُ الشركة حيث هو حقّاً: وسيطاً صريحاً أو داخل الحمولة
    v_expr := CASE r.proname
      WHEN 'create_sales_invoice_atomic' THEN '(p_invoice_data->>''company_id'')::uuid'
      ELSE 'p_company_id'
    END;
    v_line := E'  -- v3.74.990 — البابُ يسأل بنفسه عن انتماء طالبه.\n  PERFORM public.assert_company_access('
              || v_expr || E');\n';

    v_def := pg_get_functiondef(r.oid);

    IF position('assert_company_access' in v_def) > 0 THEN
      CONTINUE;
    END IF;

    IF position(E'\nBEGIN\n' in v_def) = 0 THEN
      RAISE EXCEPTION 'v3.74.990: لم أجد مرساةَ BEGIN فى % — ولا أكتب على العمياء.', r.proname;
    END IF;

    v_new := overlay(v_def placing (E'\nBEGIN\n' || v_line)
                     from position(E'\nBEGIN\n' in v_def)
                     for  length(E'\nBEGIN\n'));

    IF replace(v_new, v_line, '') IS DISTINCT FROM v_def THEN
      RAISE EXCEPTION 'v3.74.990: الاستبدالُ فى % لم يعكس نفسَه — أُلغيت الهجرة.', r.proname;
    END IF;

    EXECUTE v_new;
    v_n := v_n + 1;
  END LOOP;

  IF v_n = 0 AND NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'create_sales_invoice_atomic'
      AND position('assert_company_access' in p.prosrc) > 0
  ) THEN
    RAISE EXCEPTION 'v3.74.990: لم أُحصّن باباً واحداً — ولا أقول «تمّ» ولم يتمّ.';
  END IF;

  RAISE NOTICE 'v3.74.990 · حُصّنت % أبواب.', v_n;
END $rewrite$;

-- -----------------------------------------------------------------------------
-- ٢) والخاصّيّةُ نفسُها تصير فحصاً مرجعيّاً يُقرأ من القاعدة وقتَ التشغيل
-- -----------------------------------------------------------------------------
-- لا قائمةَ أسماءٍ مكتوبةٍ هنا: تُسأل القاعدةُ عن كلِّ دالّةٍ موجودةٍ الآن.
-- فمن يكتب داّلةً جديدةً غداً بلا سؤالٍ يجدها الفحصُ، لا قراءتى.

CREATE OR REPLACE FUNCTION public.erp_doors_that_do_not_ask()
RETURNS TABLE (proname text, args text, writes_directly boolean, writes_via_callee boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
  WITH fn AS (
    SELECT p.oid, p.proname::text AS nm, pg_get_function_identity_arguments(p.oid) AS ar,
           p.prosrc, p.prosecdef,
           (has_function_privilege('authenticated', p.oid, 'EXECUTE')
            OR has_function_privilege('anon', p.oid, 'EXECUTE')) AS exposed,
           (p.prosrc ILIKE '%INSERT INTO%'
            OR p.prosrc ~* '\mUPDATE\s+\w'
            OR p.prosrc ~* '\mDELETE\s+FROM') AS writes,
           (p.prosrc ILIKE '%company_members%'
            OR p.prosrc ILIKE '%auth.uid()%'
            OR p.prosrc ILIKE '%user_has_company_access%'
            OR p.prosrc ILIKE '%assert_company_access%'
            OR p.prosrc ILIKE '%assert_is_self%') AS asks
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prokind = 'f'
      AND p.prorettype <> 'trigger'::regtype
  ),
  -- المرشَّحون وحدَهم على يسار العلاقة، ومن يكتب أو يسأل وحدَه على يمينها:
  -- فلا تُقارَن ألفُ دالّةٍ بألفٍ بلا داعٍ، والنتيجةُ هى هى.
  cand AS (
    SELECT * FROM fn c
    WHERE c.prosecdef AND c.exposed AND c.nm NOT LIKE 'assert\_%'
      AND (c.ar ILIKE '%uuid%' OR c.ar ILIKE '%jsonb%')
      AND NOT c.asks
  ),
  edge AS (
    SELECT c.oid AS caller, t.oid AS callee
    FROM cand c JOIN fn t
      ON t.nm <> c.nm AND (t.writes OR t.asks)
     AND c.prosrc ~* ('\m' || t.nm || '\s*\(')
  )
  SELECT c.nm, c.ar, c.writes,
         EXISTS (SELECT 1 FROM edge e JOIN fn t ON t.oid = e.callee WHERE e.caller = c.oid AND t.writes)
  FROM cand c
  WHERE
    -- تكتب بنفسها أو تُفوِّض الكتابة
    (c.writes OR EXISTS (SELECT 1 FROM edge e JOIN fn t ON t.oid = e.callee WHERE e.caller = c.oid AND t.writes))
    -- **ومن فوَّض إلى من يسأل فقد سأل** — فلا يُتَّهم برىء
    AND NOT EXISTS (SELECT 1 FROM edge e JOIN fn t ON t.oid = e.callee WHERE e.caller = c.oid AND t.asks)
  ORDER BY 1;
$function$;

REVOKE ALL ON FUNCTION public.erp_doors_that_do_not_ask() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.erp_doors_that_do_not_ask() FROM anon;
GRANT EXECUTE ON FUNCTION public.erp_doors_that_do_not_ask() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.assert_baseline_v3_74_990_check()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_open int;
  v_names text;
  v_seen int;
  v_msg text;
BEGIN
  -- ═══ لا بابَ مكشوفاً اليوم ═══
  SELECT count(*), string_agg(d.proname, ' · ') INTO v_open, v_names
  FROM public.erp_doors_that_do_not_ask() d;

  IF v_open > 0 THEN
    RAISE EXCEPTION 'BASELINE FAIL: % باباً يكتب فى شركةٍ ولا يسأل عن انتماء طالبه: % (v3.74.990)', v_open, v_names;
  END IF;

  -- ═══ وفحصٌ لا يجد شيئاً قد يكون أعمى — فيُجرَّب عليه مذنبٌ مزروع ═══
  -- يُزرع بابٌ يُخفى رقمَ الشركة داخل حمولة (الشكلُ الذى كان يمرُّ من تحت
  -- الحارس القديم)، ثمّ يُقاس، ثمّ **يُلغى الزرعُ دائماً**.
  BEGIN
    EXECUTE $probe$
      CREATE OR REPLACE FUNCTION public.zz_probe_990_door(p_payload jsonb)
      RETURNS void LANGUAGE plpgsql SECURITY DEFINER
      SET search_path TO 'public', 'pg_catalog'
      AS $body$
      BEGIN
        UPDATE public.companies SET updated_at = updated_at
        WHERE id = (p_payload->>'company_id')::uuid;
      END;
      $body$;
    $probe$;
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.zz_probe_990_door(jsonb) FROM PUBLIC';
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.zz_probe_990_door(jsonb) FROM anon';
    EXECUTE 'GRANT  EXECUTE ON FUNCTION public.zz_probe_990_door(jsonb) TO authenticated';

    SELECT count(*) INTO v_seen
    FROM public.erp_doors_that_do_not_ask() d
    WHERE d.proname = 'zz_probe_990_door';

    v_msg := 'ROLLBACK_PROBE_990:' || v_seen::text;
    RAISE EXCEPTION '%', v_msg;
  EXCEPTION WHEN OTHERS THEN
    v_msg := SQLERRM;
  END;

  IF position('ROLLBACK_PROBE_990:1' in v_msg) = 0 THEN
    RAISE EXCEPTION 'BASELINE FAIL: الفحصُ لم يرَ باباً مزروعاً يُخفى الشركةَ فى حمولة — فحصٌ لا يرى ليس فحصاً (%) (v3.74.990)', v_msg;
  END IF;

  -- وما زُرع أُلغى: لا أثرَ له فى القاعدة
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'zz_probe_990_door'
  ) THEN
    RAISE EXCEPTION 'BASELINE FAIL: بقى الزرعُ فى القاعدة — ولا أترك ما زرعتُ (v3.74.990)';
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.assert_baseline_v3_74_990_check() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assert_baseline_v3_74_990_check() FROM anon;
GRANT EXECUTE ON FUNCTION public.assert_baseline_v3_74_990_check() TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- ولا تمرّ الدفعةُ إلّا بعد أن تُثبت نفسَها بالتشغيل
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  PERFORM public.assert_baseline_v3_74_990_check();
  RAISE NOTICE 'v3.74.990 · تمّت وأثبتت نفسَها.';
END $$;
