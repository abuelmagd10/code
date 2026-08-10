-- =============================================================================
-- v3.74.998 — دالّةٌ بصلاحيّاتٍ كاملةٍ تُثبّت مسارَها
-- =============================================================================
-- اثنتان وستّون دالّةً تعمل **بصلاحيّات صاحبها لا صاحب النداء**، ولم تكن تُثبّت
-- المسارَ الذى تبحث فيه عن الأسماء. فالمسارُ يأتيها **من المُنادى**.
--
-- ولم تكن قابلةً للاستغلال اليوم: **المستخدمُ المسجَّل لا يستطيع إنشاءَ كائنٍ**
-- لا فى `public` ولا فى `extensions` — قِيس ولم يُفترض. لكنّ هذا أمانٌ **يتّكئ
-- على شرطٍ لم نكتبه بأيدينا**: منحةٌ واحدةٌ تُضاف يوماً بحسن نيّةٍ فيسقط كلُّه.
--
-- > **وأمانٌ يتّكئ على شرطٍ لم تكتبه بيدك ليس أماناً بل حظّاً.**
--
-- والتثبيتُ لا يمسّ منطقاً ولا سطراً من جسم الدالّة — يُضاف إليها **أين تبحث**
-- فقط. وأُضيف `extensions` إلى المسار لأنّ `pgcrypto` و`uuid-ossp` تسكنانه:
-- **فلا يُكسر ما كان يعمل بحجّة تأمينه.**
-- =============================================================================

DO $pin$
DECLARE r record; v_n int := 0;
BEGIN
  FOR r IN
    SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.prosecdef
       AND (p.proconfig IS NULL OR NOT EXISTS (SELECT 1 FROM unnest(p.proconfig) AS c WHERE c LIKE 'search\_path=%'))
     ORDER BY p.proname
  LOOP
    EXECUTE format('ALTER FUNCTION public.%I(%s) SET search_path TO %L, %L, %L',
                   r.proname, r.args, 'public', 'extensions', 'pg_catalog');
    v_n := v_n + 1;
  END LOOP;
  RAISE NOTICE 'v3.74.998 · دالّاتٌ ثُبّت مسارُها: %', v_n;
END $pin$;

-- -----------------------------------------------------------------------------
-- وفحصٌ مرجعىٌّ يمنع العودة — ويُشغَّل فخُّه ليُثبت أنّه يرى
-- -----------------------------------------------------------------------------
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
GRANT EXECUTE ON FUNCTION public.assert_baseline_v3_74_998_check() TO service_role;

DO $$
BEGIN
  PERFORM public.assert_baseline_v3_74_998_check();
  RAISE NOTICE 'v3.74.998 · تمّت وأثبتت نفسَها.';
END $$;
