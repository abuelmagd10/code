-- ---------------------------------------------------------------------------
-- v3.75.33 — «والغلافُ وحدَه ينادى»
-- ---------------------------------------------------------------------------
-- بابانِ بصلاحيّاتٍ كاملةٍ مفتوحانِ لكلِّ مستخدِمٍ مسجَّل، **ولا أحدَ يطرقُهما**:
--
--     public.check_username_available(text, uuid)
--     public.generate_username_from_email(text)
--
-- وقِيس ذلك بأربعةِ أنواعٍ من الطارقين، لا بالظنّ:
--
--   ١) **شاشةٌ أو مسارٌ فى المشروع**: مُسحت 1153 ملفَّ واجهةٍ وخادمٍ بحثاً عن
--      `rpc("الاسم")` أو `/rpc/الاسم` — **ولا موضعَ واحد**.
--   ٢) **سياسةُ حمايةٍ تطرقُهما**: لا واحدة (`policy_knocked_function_names`).
--   ٣) **عرضٌ (view) ينادِيهما**: لا واحد. وهذا الطارقُ الثالثُ **ليس نظريّاً**:
--      خمسون عرضاً فى المخطَّط، اثنان وأربعون منها `security_invoker`، وسبعُ
--      دالّاتٍ تُنادى من داخلِها فعلاً (منها `bill_money` و`bill_item_money`
--      وأخواتُهما فى مسارِ حجبِ تكلفةِ الشراء). **فلو نُزعت منحتُهنّ لانكسرت
--      ستُّ شاشاتٍ محوَّلة** — ولذلك يُعَدُّ العرضُ طارقاً.
--   ٤) **إعلانُ ما قبلَ الدخول**: لا واحد منهما مذكورٌ فيه.
--
-- ومَن ينادِيهما إذن؟ **غلافاهما وحدَهما**:
--
--     update_username(uuid, text)          →  check_username_available
--     create_user_profile_on_signup()      →  generate_username_from_email
--
-- **وداخلَ دالّةِ الصلاحيّاتِ الكاملةِ يجرى النداءُ بحقِّ مالكِها لا بحقِّ
-- المُنادِى** — فالنداءُ الداخلىُّ لا يحتاجُ منحةً أصلاً. والمنحةُ إذن **بابٌ
-- خلفىٌّ لا يفتحُ شيئاً لأحدٍ يحتاجُه**، ويسمحُ لأىِّ مستخدِمٍ مسجَّلٍ أن ينادىَ
-- منطقاً داخليّاً بصلاحيّاتٍ كاملةٍ خارجَ غلافِه — وغلافُ الأوّلِ هو الذى يسألُ
-- `assert_is_self`، فمن تجاوزَه تجاوزَ السؤال.
--
-- **ولا يُصدَّقُ هذا بالوصف.** جُرِّب حيّاً على الإنتاجِ قبلَ كتابةِ هذا الملفّ،
-- بمستخدِمٍ حقيقىٍّ وبدورِ `authenticated` نفسِه، ثمّ أُلغىَ كلُّ شىء:
--
--     (أ) الداخلُ بعدَ النزع : permission denied for function check_username_available
--     (ب) والغلافُ يعمل      : {"success": true, "username": "7esaberb"}
--
-- والتجربتانِ مُعادتانِ **داخلَ هذه الهجرةِ نفسِها** — **وفخٌّ لا يُشغَّل ليس فخّاً**.
--
-- ولا صفَّ بياناتٍ يبقى ملموساً (تجربةُ الغلافِ تُلغى)، ولا شاشةَ تتغيّر،
-- ولا صلاحيّةَ إنسانٍ تضيقُ إلّا هذا البابَ الذى لا يطرقُه أحد.
-- ---------------------------------------------------------------------------

-- ═══ (١) يُغلَقُ البابانِ الداخليّان ═════════════════════════════════════════
REVOKE ALL ON FUNCTION public.check_username_available(text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.generate_username_from_email(text)   FROM PUBLIC, anon, authenticated;

-- ═══ (٢) البرهانُ الحىّ ══════════════════════════════════════════════════════
DO $do$
DECLARE
  v_uid      uuid;
  v_name     text;
  v_closed   boolean := false;
  v_envelope boolean := false;
  v_res      jsonb;
BEGIN
  SELECT up.user_id, up.username INTO v_uid, v_name
    FROM public.user_profiles up
   WHERE up.username IS NOT NULL
   ORDER BY up.user_id
   LIMIT 1;

  -- **وبحثٌ لا يجد ليس دليلَ غياب**: بلا مستخدِمٍ حقيقىٍّ لا برهانَ، فيُرفَض.
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'v3.75.33: لا صفَّ مستخدِمٍ ذا اسمٍ لأُجرّبَ عليه — فحصٌ صامتٌ لا سليم.';
  END IF;

  -- (أ) الداخلُ مغلقٌ فى وجهِ المستخدِمِ المسجَّل
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claims',
                       json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
    PERFORM public.check_username_available('zz_probe_v3_75_33', v_uid);
  EXCEPTION
    WHEN insufficient_privilege THEN v_closed := true;
    WHEN OTHERS THEN v_closed := false;
  END;
  RESET ROLE;

  IF NOT v_closed THEN
    RAISE EXCEPTION 'v3.75.33: البابُ الداخلىُّ ما زال يبلغُه المستخدِمُ المسجَّلُ بعدَ النزع.';
  END IF;

  -- (ب) **وحارسٌ يُغلقُ على البرىء يُطفأ**: الغلافُ يجبُ أن يبقى يعمل.
  --     والكتابةُ تُلغى — **ولا تُترَكُ تجربةٌ أثراً**.
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claims',
                       json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
    v_res := public.update_username(v_uid, v_name);
    IF COALESCE((v_res->>'success')::boolean, false) THEN v_envelope := true; END IF;
    RAISE EXCEPTION 'zz_rollback_v3_75_33';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'zz_rollback_v3_75_33' THEN v_envelope := false; END IF;
  END;
  RESET ROLE;

  IF NOT v_envelope THEN
    RAISE EXCEPTION 'v3.75.33: الغلافُ update_username لم يعُدْ يعمل بعدَ النزع — أُغلق على البرىء.';
  END IF;
END;
$do$;

-- ═══ (٣) الفحصُ المرجعىُّ الجديد ═════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.assert_baseline_v3_75_33_check()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_bad TEXT;
  v_n   INT;
BEGIN
  -- (١) **الداخلُ مغلق**: لا زائرَ ولا مستخدِمَ ولا PUBLIC.
  SELECT string_agg(p.proname, ', ' ORDER BY p.proname) INTO v_bad
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN ('check_username_available', 'generate_username_from_email')
     AND (has_function_privilege('anon', p.oid, 'EXECUTE')
          OR has_function_privilege('authenticated', p.oid, 'EXECUTE'));
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'v3.75.33: بابٌ داخلىٌّ عادَ يبلغُه من لا يطرقُه: %', v_bad;
  END IF;

  -- (٢) **والغلافُ باقٍ مفتوحاً وينادى داخلَه** — وإلّا لم نُغلقْ باباً بل قطعنا طريقاً.
  --     **ولا اسمَ بلا بيت**، ولا إغلاقَ بلا مَخرَجٍ لمن يحتاج.
  SELECT count(*) INTO v_n
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'update_username'
     AND p.prosecdef
     AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
     AND p.prosrc LIKE '%check_username_available%';
  IF v_n < 1 THEN
    RAISE EXCEPTION 'v3.75.33: الغلافُ update_username ماتَ أو أُغلق أو لم يعُدْ ينادى داخلَه.';
  END IF;

  SELECT count(*) INTO v_n
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'create_user_profile_on_signup'
     AND p.prosecdef
     AND p.prosrc LIKE '%generate_username_from_email%';
  IF v_n < 1 THEN
    RAISE EXCEPTION 'v3.75.33: غلافُ التسجيلِ ماتَ أو لم يعُدْ ينادى مولِّدَ الاسم.';
  END IF;

  -- (٣) **والنداءُ الداخلىُّ يعملُ بحقِّ المالك**: لو صارَ أحدُ الأربعةِ
  --     `SECURITY INVOKER` لَانكسرَ النداءُ الداخلىُّ على المستخدِمِ بعدَ الإغلاق.
  --     **ونصفُ جراحةٍ أسوأُ من لا جراحة.**
  SELECT string_agg(p.proname, ', ' ORDER BY p.proname) INTO v_bad
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN ('check_username_available', 'generate_username_from_email',
                       'update_username', 'create_user_profile_on_signup')
     AND (NOT p.prosecdef OR pg_get_userbyid(p.proowner) <> 'postgres');
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION
      'v3.75.33: دالّةٌ فقدت صلاحيّاتِها الكاملةَ أو مالكَها فينكسرُ النداءُ الداخلىُّ: %',
      v_bad;
  END IF;

  -- (٤) **ولا يُغلَقُ داخلٌ ويُترَكُ الغلافُ بلا سؤال.** صارَ `update_username`
  --     البابَ الوحيد، فسؤالُه عن هويّةِ المُنادى لم يعُدْ طبقةً ثانيةً بل الطبقةَ
  --     الوحيدة. (وُلد السؤالُ فى v3.74.750، ويُحرَسُ من اليوم.)
  SELECT count(*) INTO v_n
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'update_username'
     AND p.prosrc LIKE '%assert_is_self%';
  IF v_n < 1 THEN
    RAISE EXCEPTION 'v3.75.33: الغلافُ لم يعُدْ يسألُ عن هويّةِ مُنادِيه — وهو البابُ الوحيد.';
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.assert_baseline_v3_75_33_check() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assert_baseline_v3_75_33_check() TO service_role;

-- ═══ (٤) وفخٌّ لا يُشغَّل ليس فخّاً ═══════════════════════════════════════════
SELECT public.assert_baseline_v3_75_33_check();
