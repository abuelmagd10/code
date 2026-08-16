-- ═══════════════════════════════════════════════════════════════════════════
-- v3.75.47 — «ودَينٌ عمرُه ساعاتٌ دَينٌ كما هو»
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ثلاثةُ ديونٍ كُتبت فى ثلاثِ دفعاتٍ متتاليةٍ وتُسدَّدُ هنا إلى **صفر**:
--
--     v3.75.43   مواضعُ تكتبُ شرطَ المرآةِ بيدِها ...........  ١  →  ٠
--     v3.75.45   مواضعُ تكتبُ قائمةَ الدفعاتِ بيدِها ........  ٢  →  ٠
--
-- **ودَينٌ يُكتَبُ ولا يُسدَّدُ يصيرُ عادة** — وهذه دُيونٌ عمرُها ساعات، فلا تُترَك.
--
-- ═══ ولا تُنسَخُ أجسادٌ باليد ═══
--
-- ولا يُعادُ كتابةُ جسدٍ واحدٍ هنا. **القاعدةُ تقرأُ أجسادَها الحيّةَ بنفسِها**
-- وتستبدلُ فيها الموضعَ بنداءِ البيت، **ثمّ تُعيدُ الاستبدالَ عكسيّاً فيجبُ أن
-- يعودَ الأصلُ حرفاً بحرف** — وإلّا سقطتِ الهجرةُ كلُّها. **ولا أُخمّن**: لو لم
-- يوجَدِ النصُّ المتوقَّعُ بالضبط، رفضت ولم تُكتَبْ حرفاً.
--
-- ═══ ونداءٌ من الداخلِ لا يحتاجُ إذناً — وقد قِيسَ ═══
--
-- درسُ v3.75.46 مُطبَّقٌ قبلَ الفعل: الثلاثةُ المُحوَّلةُ كلُّها
-- `SECURITY DEFINER`، فنداؤها للبيوتِ يجرى بحقِّ مالكِ القاعدةِ لا بحقِّ
-- المستخدِم. و`je_lines_mirror` غيرُ ممنوحةٍ للمستخدِمِ أصلاً **ولا تحتاجُ أن
-- تُمنَح**، و`payment_journal_reference_types` تبقى ممنوحةً كما وُلدت.
--
-- ═══ وفرقٌ واحدٌ فى الحكمِ يُعلَنُ ولا يُخبَّأ ═══
--
-- شرطُ المرآةِ المكتوبُ باليدِ فى `handle_invoice_cancellation_reversal` كان
-- يقولُ عن قيدٍ **بلا سطورٍ أصلاً** إنّه «مَعكوسٌ سلفاً» — لأنّ المجموعةَ
-- الفارغةَ تُطابقُ كلَّ شىء. و`je_lines_mirror` **لا تقولُ ذلك**: تشترطُ أن يكونَ
-- للأصلِ سطورٌ فعلاً. **وبحثٌ لا يجد ليس دليلَ غياب.**
--
-- فالتحويلُ يجعلُ الحكمَ **أدقَّ لا أوسع**. وقِيسَ أثرُه على القاعدةِ الحيّة:
--
--     قيودٌ بلا سطورٍ (كلُّها) ......  ٠
--     قيودٌ بلا سطورٍ (غيرُ محذوفة) .  ٠
--
-- فلا صفَّ واحدٌ فى القاعدةِ يقعُ عليه الفرق. **ومعلومٌ يُعلَنُ لا يُسكَتُ عنه.**
--
-- ═══ والبرهانُ كتابةٌ حيّةٌ تُلغى ═══
--
--   (أ) الفخُّ ما زال يُشغَّل: قيدُ دفعةٍ مرجعُه وهمىٌّ **يُرفَض**، ومرجعُه
--       حقيقىٌّ **يمرّ** — بعدَ الجراحةِ لا قبلَها.
--   (ب) والمرآةُ ما زالت ترى: زوجٌ متطابقٌ معكوسٌ → **صحيح**، وزوجٌ مختلفٌ
--       → **خطأ**.
-- ═══════════════════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────────────────
-- ١ · القاعدةُ تُبدِّلُ فى ثلاثةِ أجسادٍ بنفسِها — وكلُّ تبديلٍ يُبرهنُ بالعكس
-- ───────────────────────────────────────────────────────────────────────────
DO $inject$
DECLARE
  k_hand_list constant text := 'reference_type IN (''invoice_payment'', ''bill_payment'')';
  k_call_list constant text := 'reference_type = ANY (public.payment_journal_reference_types())';

  k_hand_mirror constant text :=
'          AND NOT EXISTS (
            SELECT 1 FROM (
              SELECT l.account_id, l.debit_amount AS d, l.credit_amount AS c
                FROM journal_entry_lines l WHERE l.journal_entry_id = v_original_je.id
              EXCEPT ALL
              SELECT l.account_id, l.credit_amount, l.debit_amount
                FROM journal_entry_lines l WHERE l.journal_entry_id = r.id
            ) missing_from_the_mirror
          )
          AND NOT EXISTS (
            SELECT 1 FROM (
              SELECT l.account_id, l.credit_amount AS d, l.debit_amount AS c
                FROM journal_entry_lines l WHERE l.journal_entry_id = r.id
              EXCEPT ALL
              SELECT l.account_id, l.debit_amount, l.credit_amount
                FROM journal_entry_lines l WHERE l.journal_entry_id = v_original_je.id
            ) extra_in_the_mirror
          )';
  k_call_mirror constant text := '          AND public.je_lines_mirror(v_original_je.id, r.id)';

  v_sig  text;
  v_old  text;
  v_new  text;
  v_back text;
  v_done int := 0;
BEGIN
  -- (أ) و(ب) بابا v3.75.44 — القائمةُ المكتوبةُ باليد تصيرُ نداءً للبيت
  FOREACH v_sig IN ARRAY ARRAY['public.enforce_payment_reference_resolves()',
                               'public.repair_unresolved_payment_references()'] LOOP
    v_old := pg_get_functiondef(v_sig::regprocedure::oid);
    IF position(k_hand_list in v_old) = 0 THEN
      IF position(k_call_list in v_old) > 0 THEN
        RAISE NOTICE 'v3.75.47: % already calls the one home.', v_sig;
      ELSE
        RAISE EXCEPTION 'v3.75.47: % does not carry the list I expected - I do not guess.', v_sig;
      END IF;
    ELSE
      v_new  := replace(v_old, k_hand_list, k_call_list);
      v_back := replace(v_new, k_call_list, k_hand_list);
      IF v_back IS DISTINCT FROM v_old THEN
        RAISE EXCEPTION 'v3.75.47: the substitution in % is not reversible - refusing.', v_sig;
      END IF;
      EXECUTE v_new;
      v_done := v_done + 1;
    END IF;
  END LOOP;

  -- (ج) شرطُ المرآةِ المكتوبُ باليد يصيرُ نداءً لبيتِ v3.75.43
  v_sig := 'public.handle_invoice_cancellation_reversal()';
  v_old := pg_get_functiondef(v_sig::regprocedure::oid);
  IF position(k_hand_mirror in v_old) = 0 THEN
    IF position(k_call_mirror in v_old) > 0 THEN
      RAISE NOTICE 'v3.75.47: the cancellation reversal already calls the mirror house.';
    ELSE
      RAISE EXCEPTION 'v3.75.47: the cancellation reversal does not carry the hand-written mirror I expected - I do not guess.';
    END IF;
  ELSE
    v_new  := replace(v_old, k_hand_mirror, k_call_mirror);
    v_back := replace(v_new, k_call_mirror, k_hand_mirror);
    IF v_back IS DISTINCT FROM v_old THEN
      RAISE EXCEPTION 'v3.75.47: the substitution in the cancellation reversal is not reversible - refusing.';
    END IF;
    EXECUTE v_new;
    v_done := v_done + 1;
  END IF;

  -- (د) والدَّينُ يُخفَضُ فى البيتِ الذى كتبَه — **ومكسبٌ لا يُثبَّتُ يُلتَفُّ عليه**
  FOREACH v_sig IN ARRAY ARRAY['public.assert_baseline_v3_75_43_check()',
                               'public.assert_baseline_v3_75_45_check()'] LOOP
    v_old := pg_get_functiondef(v_sig::regprocedure::oid);
    v_new := v_old;
    v_new := replace(v_new, 'k_handwritten constant int := 1;', 'k_handwritten constant int := 0;');
    v_new := replace(v_new, 'k_hand constant int := 2;',        'k_hand constant int := 0;');
    IF v_new IS NOT DISTINCT FROM v_old THEN
      RAISE NOTICE 'v3.75.47: the pinned debt in % is already zero.', v_sig;
    ELSE
      v_back := v_new;
      v_back := replace(v_back, 'k_handwritten constant int := 0;', 'k_handwritten constant int := 1;');
      v_back := replace(v_back, 'k_hand constant int := 0;',        'k_hand constant int := 2;');
      IF v_back IS DISTINCT FROM v_old THEN
        RAISE EXCEPTION 'v3.75.47: lowering the pinned debt in % is not reversible - refusing.', v_sig;
      END IF;
      EXECUTE v_new;
      v_done := v_done + 1;
    END IF;
  END LOOP;

  RAISE NOTICE 'v3.75.47: % body/bodies rewritten by the database itself, each proven reversible.', v_done;
END
$inject$;


-- ───────────────────────────────────────────────────────────────────────────
-- ٢ · البرهانُ الحىّ — بعدَ الجراحةِ لا قبلَها، ثمّ يُلغى كلُّ ما زُرِع
-- ───────────────────────────────────────────────────────────────────────────
DO $proof$
DECLARE
  v_co uuid; v_br uuid; v_bill uuid; v_a uuid; v_b uuid;
  v_je1 uuid; v_je2 uuid; v_je3 uuid;
  v_out text; v_trap text := 'not-run'; v_mirror text := 'not-run';
BEGIN
  BEGIN
    SELECT b.company_id, b.id INTO v_co, v_bill
      FROM bills b
     WHERE EXISTS (SELECT 1 FROM branches x WHERE x.company_id = b.company_id)
       AND (SELECT count(*) FROM chart_of_accounts c WHERE c.company_id = b.company_id) >= 2
     ORDER BY b.id LIMIT 1;

    IF v_co IS NULL THEN RAISE EXCEPTION 'NO_SUBJECT'; END IF;

    SELECT x.id INTO v_br FROM branches x WHERE x.company_id = v_co ORDER BY x.id LIMIT 1;
    SELECT c.id INTO v_a FROM chart_of_accounts c WHERE c.company_id = v_co ORDER BY c.id LIMIT 1;
    SELECT c.id INTO v_b FROM chart_of_accounts c WHERE c.company_id = v_co AND c.id <> v_a ORDER BY c.id LIMIT 1;

    -- (أ) **وفخٌّ لا يُشغَّل ليس فخّاً**: المرجعُ الحقيقىُّ يمرّ، والوهمىُّ يُرفَض
    PERFORM set_config('app.allow_direct_post', 'true', true);
    INSERT INTO journal_entries (company_id, branch_id, reference_type, reference_id, entry_date, description, status)
    VALUES (v_co, v_br, 'bill_payment', v_bill, CURRENT_DATE, 'v3.75.47 proof trap innocent', 'draft');

    BEGIN
      PERFORM set_config('app.allow_direct_post', 'true', true);
      INSERT INTO journal_entries (company_id, branch_id, reference_type, reference_id, entry_date, description, status)
      VALUES (v_co, v_br, 'bill_payment', gen_random_uuid(), CURRENT_DATE, 'v3.75.47 proof trap guilty', 'draft');
      v_trap := 'NOT_REFUSED';
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM LIKE '%UNRESOLVED_PAYMENT_REFERENCE%' THEN v_trap := 'refused';
      ELSE v_trap := 'wrong-error: ' || SQLERRM; END IF;
    END;

    -- (ب) **والمرآةُ ما زالت ترى**: زوجٌ معكوسٌ بالضبط، وزوجٌ مختلف.
    --     **ونوعُ المرجعِ لا يقبلُ الفراغ** (قيدٌ فى الجدولِ نفسِه)، فيُزرَعُ
    --     بنوعٍ يدوىٍّ ومرجعٍ فارغٍ — فيمرُّ حارسُ التكرارِ من بابِه المُعلَن.
    PERFORM set_config('app.allow_direct_post', 'true', true);
    INSERT INTO journal_entries (company_id, branch_id, reference_type, reference_id, entry_date, description, status)
    VALUES (v_co, v_br, 'manual', NULL, CURRENT_DATE, 'v3.75.47 proof mirror a', 'draft') RETURNING id INTO v_je1;
    INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit_amount, credit_amount, description)
    VALUES (v_je1, v_a, 70, 0, 'a'), (v_je1, v_b, 0, 70, 'b');

    PERFORM set_config('app.allow_direct_post', 'true', true);
    INSERT INTO journal_entries (company_id, branch_id, reference_type, reference_id, entry_date, description, status)
    VALUES (v_co, v_br, 'manual', NULL, CURRENT_DATE, 'v3.75.47 proof mirror b', 'draft') RETURNING id INTO v_je2;
    INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit_amount, credit_amount, description)
    VALUES (v_je2, v_a, 0, 70, 'a'), (v_je2, v_b, 70, 0, 'b');

    PERFORM set_config('app.allow_direct_post', 'true', true);
    INSERT INTO journal_entries (company_id, branch_id, reference_type, reference_id, entry_date, description, status)
    VALUES (v_co, v_br, 'manual', NULL, CURRENT_DATE, 'v3.75.47 proof mirror c', 'draft') RETURNING id INTO v_je3;
    INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit_amount, credit_amount, description)
    VALUES (v_je3, v_a, 0, 55, 'a'), (v_je3, v_b, 55, 0, 'b');

    v_mirror := CASE WHEN public.je_lines_mirror(v_je1, v_je2)
                      AND NOT public.je_lines_mirror(v_je1, v_je3)
                THEN 'sees' ELSE 'blind' END;

    RAISE EXCEPTION 'MEASURED trap=% mirror=%', v_trap, v_mirror;
  EXCEPTION WHEN OTHERS THEN
    v_out := SQLERRM;          -- المعاملةُ الفرعيّةُ أُلغيت: لا صفَّ بقى ممّا زُرِع
  END;

  IF v_out = 'NO_SUBJECT' THEN
    RAISE NOTICE 'v3.75.47: no company in this house can carry the planting - no live proof is claimed.';
    RETURN;
  END IF;

  IF v_out !~ '^MEASURED ' THEN
    RAISE EXCEPTION 'v3.75.47: the live proof could not run: %', v_out;
  END IF;

  IF v_out !~ 'trap=refused ' THEN
    RAISE EXCEPTION 'v3.75.47 (a): after the surgery the payment-reference trap no longer refuses a ghost reference -> %', v_out;
  END IF;
  IF v_out !~ 'mirror=sees$' THEN
    RAISE EXCEPTION 'v3.75.47 (b): after the surgery the mirror test no longer tells a reversal from a stranger -> %', v_out;
  END IF;

  RAISE NOTICE 'v3.75.47 PROOF ok (all planted rows rolled back): %', v_out;
END
$proof$;


-- ───────────────────────────────────────────────────────────────────────────
-- ٣ · الفحصُ المرجعىّ — **ولا يُقالُ سُدِّدَ إلّا وقد بلغَ الصفر**
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.assert_baseline_v3_75_47_check()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $check47$
DECLARE
  v_hand_list int;
  v_hand_mirror int;
  v_callers_list int;
  v_caller_mirror int;
BEGIN
  -- (١) لا موضعَ يكتبُ قائمةَ أنواعِ الدفعاتِ بيدِه — **الصفرُ لا ما دونَ سقف**
  --     **ونصُّ الفحصِ مواصفةٌ لا صنعة** — فتُستثنى الفحوصُ المرجعيّةُ بالاسم.
  SELECT count(*) INTO v_hand_list
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.prosrc ~ 'reference_type IN \(''invoice_payment'', ''bill_payment''\)'
     AND p.proname NOT LIKE 'assert_baseline_%';

  IF v_hand_list <> 0 THEN
    RAISE EXCEPTION 'v3.75.47 (1): % place(s) write the payment-reference list by hand again - the debt was paid to zero and must stay there.', v_hand_list;
  END IF;

  -- (٢) ولا موضعَ يكتبُ شرطَ المرآةِ بيدِه
  SELECT count(*) INTO v_hand_mirror
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.prosrc ~ 'EXCEPT ALL' AND p.prosrc ~ 'journal_entry_lines'
     AND p.proname NOT IN ('je_lines_mirror', 'je_lines_identical')
     AND p.proname NOT LIKE 'assert_baseline_%';

  IF v_hand_mirror <> 0 THEN
    RAISE EXCEPTION 'v3.75.47 (2): % place(s) write the mirror test by hand again - the debt was paid to zero and must stay there.', v_hand_mirror;
  END IF;

  -- (٣) **وغيابُ النصِّ ليس حضورَ النداء**: يُقاسُ أنّ البيوتَ تُنادى فعلاً،
  --     وإلّا كان الصفرُ أعلاه صفرَ حذفٍ لا صفرَ تحويل.
  SELECT count(*) INTO v_callers_list
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN ('enforce_payment_reference_resolves', 'repair_unresolved_payment_references',
                       'prevent_duplicate_journal_entry_v2', 'ic_duplicate_journals')
     AND p.prosrc ~ 'payment_journal_reference_types';

  IF v_callers_list <> 4 THEN
    RAISE EXCEPTION 'v3.75.47 (3): only % of 4 doors call the payment-reference home - a zero by deletion is not a zero by conversion.', v_callers_list;
  END IF;

  SELECT count(*) INTO v_caller_mirror
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'handle_invoice_cancellation_reversal'
     AND p.prosrc ~ 'je_lines_mirror';

  IF v_caller_mirror <> 1 THEN
    RAISE EXCEPTION 'v3.75.47 (4): the cancellation reversal no longer calls the mirror home - a zero by deletion is not a zero by conversion.';
  END IF;

  RETURN 'v3.75.47 ok - the payment-reference list and the mirror test are each written in exactly one home, 4 door(s) and 1 door call them, and nothing writes either by hand.';
END
$check47$;

REVOKE ALL ON FUNCTION public.assert_baseline_v3_75_47_check() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assert_baseline_v3_75_47_check() TO service_role;

SELECT public.assert_baseline_v3_75_47_check();
SELECT public.assert_baseline_v3_75_43_check();
SELECT public.assert_baseline_v3_75_45_check();
SELECT public.assert_baseline_v3_75_25_check();
SELECT public.assert_baseline_v3_75_29_check();
