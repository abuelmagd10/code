-- ═══════════════════════════════════════════════════════════════════════════
-- v3.75.46 — «ونداءٌ من الداخلِ لا يحتاجُ إذناً، إلّا أن يجرىَ المُنادِى بحقِّ
--             من يُنادى»
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ستُّ دالّاتٍ تُجيبُ عن سؤالِ صلاحيّة — «أهذا مالكُ الشركة؟» «أيملكُ اعتمادَ
-- الدفعات؟» — كلُّها بصلاحيّاتٍ كاملة، **ويبلغُها المستخدِمُ المسجَّلُ مباشرةً**،
-- ولا شاشةَ فى المشروعِ تنادى واحدةً منها. فقُيِّدت فى دَينِ «بلا طارق».
--
-- ═══ والقياسُ الأوّلُ كان ناقصاً، والنقصُ منّى ═══
--
-- قِيسَ أنّها «لا تُنادَى إلّا من دالّاتٍ أخرى»، فاستُنتِجَ أنّ نزعَ الإذنِ لا
-- يضرّ. **وهذا صحيحٌ فى نصفِ الحالاتِ فقط.** فالنداءُ من الداخلِ يجرى بحقِّ
-- **الدالّةِ المُنادِية**: فإن كانت بصلاحيّاتٍ كاملة (`SECURITY DEFINER`) جرى
-- النداءُ بحقِّ مالكِ القاعدة، فلا يضرُّه نزعُ إذنِ المستخدِم. **أمّا إن كانت
-- تجرى بحقِّ مُنادِيها (`SECURITY INVOKER`) فالنداءُ الداخلىُّ يجرى بحقِّ
-- المستخدِمِ نفسِه** — ونزعُ إذنِه يكسرُ البابَ من داخلِه.
--
-- فأُعيدَ القياسُ على هذا الحدِّ بعينِه:
--
--     الدالّة                          مُنادُون   منهم بحقِّ المُنادى
--     ─────────────────────────────────────────────────────────────
--     erp_payment_privileged .........    ٦            ٠
--     erp_creator_needs_no_approval ..    ٣            ٠
--     expense_actor_may_approve ......    ٣            ٠
--     company_role_has_holder ........    ٢            ٠
--     erp_is_company_owner ...........    ٥          **٣**
--     erp_is_company_senior ..........    ٢          **١**
--
-- ═══ فأربعٌ تُغلَق، واثنتانِ تبقيانِ مفتوحتَينِ بسببٍ مكتوب ═══
--
-- المُنادِى الخطِرُ هو **`erp_sod_guard`** — البيتُ الواحدُ لفصلِ المهامّ، مُشغِّلٌ
-- يجرى **بحقِّ من يكتب**، معلَّقٌ على جداولَ كثيرة. فلو نُزِعَ إذنُ المستخدِمِ عن
-- `erp_is_company_owner` و`erp_is_company_senior` **لسقطت كلُّ كتابةٍ يحرسُها**.
-- ومعهما بابا مذكّراتِ المدين (`apply_customer_debit_note` و
-- `approve_customer_debit_note`) — وكلاهما يجرى بحقِّ مُنادِيه ويبلغُه المستخدِم.
--
-- **ولا يُغلَقُ بابٌ يمرُّ منه عمل.** فتُترَكانِ مفتوحتَين، **ويُكتَبُ السبب،
-- ويُجعَلُ السببُ قابلاً للانقضاء**: الفحصُ المرجعىُّ يعدُّ المُنادِينَ بحقِّ
-- المُنادى، **فإن صارَ صفراً سقطَ الفحصُ وقال: انقضى العذرُ فادفعِ الدَّين**.
-- **ودَينٌ يُكتَبُ ولا يُسدَّدُ يصيرُ عادة** — وهذا دَينٌ لا يستطيعُ أن يُنسى.
--
-- ═══ والبرهانُ نداءٌ حىٌّ بحقِّ المستخدِمِ نفسِه ═══
--
-- **وفخٌّ لا يُشغَّل ليس فخّاً، ومنحةٌ لا تُجرَّب لا يُعرَفُ أكانت تعمل**:
--
--   (أ) قبلَ النزع: تُنادَى السّتُّ بحقِّ `authenticated` فتمرُّ — فالمنحةُ حقيقيّةٌ
--       لا زينة، **ولا يُنزَعُ ما هو منزوعٌ سلفاً ثمّ يُدَّعى إنجاز**.
--   (ب) بعدَ النزع: الأربعُ تُرفَضُ بـ 42501 بحقِّ `authenticated`.
--   (ج) **والأهمّ**: بابٌ حىٌّ بصلاحيّاتٍ كاملةٍ ينادى واحدةً من المنزوعاتِ
--       **يُنادَى بحقِّ `authenticated` فيمرّ** — فالنداءُ الداخلىُّ لم ينكسر.
--   (د) والاثنتانِ المُبقاتانِ تمرّانِ كما كانتا — وهو شرطُ بقاءِ فصلِ المهامّ.
-- ═══════════════════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────────────────
-- ١ · قبلَ النزع: المنحةُ حقيقيّةٌ لا زينة
-- ───────────────────────────────────────────────────────────────────────────
DO $before$
DECLARE
  v_fail text := '';
  v_name text;
BEGIN
  FOREACH v_name IN ARRAY ARRAY['erp_payment_privileged', 'erp_creator_needs_no_approval',
                                'expense_actor_may_approve', 'erp_is_company_owner',
                                'erp_is_company_senior'] LOOP
    BEGIN
      SET LOCAL ROLE authenticated;
      EXECUTE format('SELECT public.%I($1, $2)', v_name) USING NULL::uuid, NULL::uuid;
      RESET ROLE;
    EXCEPTION WHEN OTHERS THEN
      RESET ROLE;
      v_fail := v_fail || v_name || '(' || SQLSTATE || ') ';
    END;
  END LOOP;

  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM public.company_role_has_holder(NULL::uuid, NULL::text);
    RESET ROLE;
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE;
    v_fail := v_fail || 'company_role_has_holder(' || SQLSTATE || ') ';
  END;

  IF v_fail <> '' THEN
    RAISE EXCEPTION 'v3.75.46: these were expected callable by authenticated BEFORE the revoke and were not: % - I do not claim to close a door that is already shut.', v_fail;
  END IF;

  RAISE NOTICE 'v3.75.46: all six oracles answer to authenticated before the revoke - the grant was real.';
END
$before$;


-- ───────────────────────────────────────────────────────────────────────────
-- ٢ · النزع: أربعٌ لا يطرقُها أحدٌ من خارج، ولا يُنادِيها من يجرى بحقِّ المستخدِم
-- ───────────────────────────────────────────────────────────────────────────
-- **ولا تُنزَعُ منحةُ الخادمِ**: مفتاحُ الخدمةِ يبقى كما كان.
REVOKE ALL ON FUNCTION public.erp_payment_privileged(uuid, uuid)        FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.erp_creator_needs_no_approval(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.expense_actor_may_approve(uuid, uuid)     FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.company_role_has_holder(uuid, text)       FROM PUBLIC, anon, authenticated;


-- ───────────────────────────────────────────────────────────────────────────
-- ٣ · بعدَ النزع: البابُ أُغلق، والداخلُ لم ينكسر
-- ───────────────────────────────────────────────────────────────────────────
DO $after$
DECLARE
  v_fail text := '';
  v_name text;
  v_u uuid := gen_random_uuid();
  v_c uuid := gen_random_uuid();
BEGIN
  -- (ب) الأربعُ تُرفَضُ بحقِّ المستخدِمِ المسجَّل
  FOREACH v_name IN ARRAY ARRAY['erp_payment_privileged', 'erp_creator_needs_no_approval',
                                'expense_actor_may_approve'] LOOP
    DECLARE v_state text := '00000';
    BEGIN
      BEGIN
        SET LOCAL ROLE authenticated;
        EXECUTE format('SELECT public.%I($1, $2)', v_name) USING NULL::uuid, NULL::uuid;
        RESET ROLE;
      EXCEPTION WHEN OTHERS THEN
        RESET ROLE; v_state := SQLSTATE;
      END;
      IF v_state <> '42501' THEN
        v_fail := v_fail || v_name || ' still open(' || v_state || ') ';
      END IF;
    END;
  END LOOP;

  DECLARE v_state text := '00000';
  BEGIN
    BEGIN
      SET LOCAL ROLE authenticated;
      PERFORM public.company_role_has_holder(NULL::uuid, NULL::text);
      RESET ROLE;
    EXCEPTION WHEN OTHERS THEN
      RESET ROLE; v_state := SQLSTATE;
    END;
    IF v_state <> '42501' THEN
      v_fail := v_fail || 'company_role_has_holder still open(' || v_state || ') ';
    END IF;
  END;

  -- (ج) **والنداءُ الداخلىُّ لم ينكسر**: بابانِ حيّانِ بصلاحيّاتٍ كاملةٍ ينادِيانِ
  --     منزوعتَين، يُنادَيانِ بحقِّ المستخدِمِ المسجَّلِ فيمرّان.
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM public.payment_self_approval_error(v_c, v_u, v_u);
    PERFORM public.erp_self_approval_error(v_c, v_u, v_u, ARRAY['accountant']::text[]);
    RESET ROLE;
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE;
    v_fail := v_fail || 'an inner call broke(' || SQLSTATE || ': ' || SQLERRM || ') ';
  END;

  -- (د) والاثنتانِ المُبقاتانِ تمرّانِ — وعليهما يقومُ فصلُ المهامّ
  FOREACH v_name IN ARRAY ARRAY['erp_is_company_owner', 'erp_is_company_senior'] LOOP
    BEGIN
      SET LOCAL ROLE authenticated;
      EXECUTE format('SELECT public.%I($1, $2)', v_name) USING NULL::uuid, NULL::uuid;
      RESET ROLE;
    EXCEPTION WHEN OTHERS THEN
      RESET ROLE;
      v_fail := v_fail || v_name || ' was closed by mistake(' || SQLSTATE || ') ';
    END;
  END LOOP;

  IF v_fail <> '' THEN
    RAISE EXCEPTION 'v3.75.46: %', v_fail;
  END IF;

  RAISE NOTICE 'v3.75.46 PROOF ok: four doors shut to the logged-in user, the inner calls still pass, and separation of duties still has what it needs.';
END
$after$;


-- ───────────────────────────────────────────────────────────────────────────
-- ٤ · الفحصُ المرجعىّ — **وعُذرٌ يقبلُ الانقضاء**
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.assert_baseline_v3_75_46_check()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $check46$
DECLARE
  k_held constant int := 2;   -- المُبقاتانِ بعذرٍ مكتوب
  k_closed constant text[] := ARRAY['erp_payment_privileged', 'erp_creator_needs_no_approval',
                                    'expense_actor_may_approve', 'company_role_has_holder'];
  k_hold   constant text[] := ARRAY['erp_is_company_owner', 'erp_is_company_senior'];
  v_open int;
  v_held int;
  v_reason int;
  v_borrowed int;
BEGIN
  -- (١) الأربعُ المُغلَقة: لا يبلغُها زائرٌ ولا مستخدِمٌ مسجَّل
  SELECT count(*) INTO v_open
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = ANY (k_closed)
     AND (has_function_privilege('authenticated', p.oid, 'EXECUTE')
       OR has_function_privilege('anon', p.oid, 'EXECUTE'));

  IF v_open > 0 THEN
    RAISE EXCEPTION 'v3.75.46 (1): % permission oracle(s) are reachable by a logged-in user again - a gain that is not pinned gets walked around.', v_open;
  END IF;

  -- (٢) **ولا يُغلَقُ بابٌ يمرُّ منه عمل**: المُبقاتانِ يجبُ أن تبقيا مفتوحتَين،
  --     وإلّا سقطَ فصلُ المهامِّ على كلِّ كتابةٍ يحرسُها `erp_sod_guard`.
  SELECT count(*) INTO v_held
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = ANY (k_hold)
     AND has_function_privilege('authenticated', p.oid, 'EXECUTE');

  IF v_held <> k_held THEN
    RAISE EXCEPTION 'v3.75.46 (2): only % of % held-open oracle(s) still answer the logged-in user - separation of duties runs by the writer''s right and will fail.', v_held, k_held;
  END IF;

  -- (٣) **وعذرٌ لا ينقضى ليس عذراً**: العذرُ هو وجودُ مُنادٍ يجرى بحقِّ مُنادِيه.
  --     فإن لم يبقَ واحدٌ، فالإذنُ صارَ بلا سبب — ويُنزَع.
  SELECT count(*) INTO v_reason
    FROM pg_proc caller JOIN pg_namespace n ON n.oid = caller.pronamespace
   WHERE n.nspname = 'public' AND NOT caller.prosecdef
     AND caller.proname <> ALL (k_hold)
     AND caller.proname NOT LIKE 'assert_baseline_%'
     AND EXISTS (SELECT 1 FROM unnest(k_hold) h WHERE caller.prosrc ~ ('\m' || h || '\M'));

  IF v_reason = 0 THEN
    RAISE EXCEPTION 'v3.75.46 (3): no caller running by the invoker''s right is left - the excuse has expired, revoke the two held-open oracles and lower the debt.';
  END IF;

  -- (٤) **ولا تُستعارُ منزوعةٌ إلى موضعٍ يجرى بحقِّ المستخدِم**: لا سياسةَ ولا
  --     عرضٌ ولا دالّةٌ بحقِّ مُنادِيها تنادى واحدةً من الأربعِ المُغلَقة، وإلّا
  --     انكسرت عندَ أوّلِ مستخدِم.
  SELECT (SELECT count(*) FROM pg_policies pol
           WHERE EXISTS (SELECT 1 FROM unnest(k_closed) c
                          WHERE coalesce(pol.qual, '') || ' ' || coalesce(pol.with_check, '') ~ ('\m' || c || '\M')))
       + (SELECT count(*) FROM pg_views v
           WHERE v.schemaname = 'public'
             AND EXISTS (SELECT 1 FROM unnest(k_closed) c WHERE v.definition ~ ('\m' || c || '\M')))
       + (SELECT count(*) FROM pg_proc p2 JOIN pg_namespace n2 ON n2.oid = p2.pronamespace
           WHERE n2.nspname = 'public' AND NOT p2.prosecdef
             AND p2.proname <> ALL (k_closed)
             AND p2.proname NOT LIKE 'assert_baseline_%'
             AND EXISTS (SELECT 1 FROM unnest(k_closed) c WHERE p2.prosrc ~ ('\m' || c || '\M')))
    INTO v_borrowed;

  IF v_borrowed > 0 THEN
    RAISE EXCEPTION 'v3.75.46 (4): % place(s) that run by the user''s own right now call a revoked oracle - it will fail for the first real user.', v_borrowed;
  END IF;

  RETURN format('v3.75.46 ok - 4 permission oracle(s) answer no logged-in user, %s held open by a live excuse (%s caller(s) still run by the invoker''s right), and nothing that runs by the user''s right borrows a revoked one.', v_held, v_reason);
END
$check46$;

REVOKE ALL ON FUNCTION public.assert_baseline_v3_75_46_check() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assert_baseline_v3_75_46_check() TO service_role;

SELECT public.assert_baseline_v3_75_46_check();
SELECT public.assert_baseline_v3_75_25_check();
SELECT public.assert_baseline_v3_75_29_check();
