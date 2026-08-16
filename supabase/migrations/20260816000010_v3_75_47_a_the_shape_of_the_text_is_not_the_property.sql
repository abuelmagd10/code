-- ═══════════════════════════════════════════════════════════════════════════
-- v3.75.47-أ — «وشكلُ النصِّ ليس خاصّيّة» (مرّةً أخرى، وعلى نفسى)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- **الحارسُ رفضَ الدفعة، ورفضُه صحيحٌ فى الشكلِ خاطئٌ فى المعنى — والنقصُ منّى.**
--
-- v3.75.47 حوّلت شرطَ المرآةِ المكتوبَ باليدِ فى
-- `handle_invoice_cancellation_reversal` إلى نداءٍ لبيتِه `je_lines_mirror`.
-- فسقطَ `assert_baseline_v3_75_42_check` بجملتِه الأولى:
--
--     «the cancellation trigger no longer refuses to reverse what is already
--      reversed»
--
-- ولمّا قُرئَ نصُّ الفحصِ تبيّنَ أنّ تلك الجملةَ **لا تقيسُ شيئاً من الأثر**:
-- تبحثُ عن اسمَىِ التسميةِ `missing_from_the_mirror` و`extra_in_the_mirror`
-- داخلَ جسدِ المُشغِّل. **فهى تحرسُ عبارةً لا خاصّيّة** — وهو الدرسُ الذى يحملُه
-- الحارسُ فى رسالتِه نفسِها: «اقرأ نصَّ السقوطِ قبلَ أن تُصلح».
--
-- وجملتاه الأخريانِ **تقيسانِ الأثرَ فعلاً وقد مرّتا**:
--
--     (٢) المُشغِّلُ ما زال معلّقاً على جدولِ الفواتير ......  يمرّ
--     (٣) فواتيرُ عُكِست مرّتَينِ بلا تعويضٍ = صفر .........  يمرّ
--
-- **فالشرطُ حىٌّ والأثرُ سليم، والساقطُ هو البحثُ عن عبارة.**
--
-- ═══ ولا يُطفَأُ حارسٌ ولا يُستثنى، بل يُعادُ التعبيرُ عن قصدِه ═══
--
-- القصدُ الحقيقىُّ للجملةِ الأولى: **أن يبقى فى المُشغِّلِ اختبارُ مرآة**. وهو
-- يتحقّقُ بأحدِ وجهَين: أن يكتبَه بيدِه (كما كان)، **أو أن يُفوِّضَ إلى البيتِ
-- الواحد** (كما صارَ) — **ومن يُفوِّضُ إلى من يحكمُ يحكم**. فيقبلُ الفحصُ
-- الوجهَين، ويرفضُ غيابَهما معاً.
--
-- **ولا يُوسَّعُ الفحصُ أكثرَ ممّا ضاق**: لا يُقبَلُ ذكرٌ عابر — الاسمُ يُنادى
-- داخلَ الجسدِ فعلاً، وجملتا الأثرِ باقيتانِ كما هما لم يُمَسّا.
--
-- ═══ ودرسٌ لى قبلَ أن يكونَ درساً للفحص ═══
--
-- v3.75.47 نادت الفحوصَ ٤٣ و٤٥ و٢٥ و٢٩ فى آخرِها، **ولم تُنادِ ٤٢** — وهو
-- الفحصُ الذى يُسمّى الدالّةَ التى جرت عليها الجراحة. ولو نُودِىَ **لسقطتِ
-- الهجرةُ فى لحظتِها ولم تُطبَّقْ على بيتٍ واحد**، ولَما احتاجت هذه المرافقة.
--
-- **والقاعدة: من يُبدِّلْ جسداً فليُنادِ كلَّ فحصٍ يُسمّى ذلك الجسد.**
-- ═══════════════════════════════════════════════════════════════════════════

DO $fix$
DECLARE
  k_old constant text :=
'      AND p.prosrc ~ ''missing_from_the_mirror'' AND p.prosrc ~ ''extra_in_the_mirror''';
  k_new constant text :=
'      AND (p.prosrc ~ ''je_lines_mirror''
           OR (p.prosrc ~ ''missing_from_the_mirror'' AND p.prosrc ~ ''extra_in_the_mirror''))';
  v_old  text;
  v_new  text;
  v_back text;
BEGIN
  v_old := pg_get_functiondef('public.assert_baseline_v3_75_42_check()'::regprocedure::oid);

  IF position(k_old in v_old) = 0 THEN
    IF position('je_lines_mirror' in v_old) > 0 THEN
      RAISE NOTICE 'v3.75.47-a: the check already accepts delegation to the one home.';
      RETURN;
    END IF;
    RAISE EXCEPTION 'v3.75.47-a: the check does not carry the text-shape condition I expected - I do not guess.';
  END IF;

  v_new  := replace(v_old, k_old, k_new);
  v_back := replace(v_new, k_new, k_old);
  IF v_back IS DISTINCT FROM v_old THEN
    RAISE EXCEPTION 'v3.75.47-a: the substitution is not reversible - refusing.';
  END IF;

  EXECUTE v_new;
  RAISE NOTICE 'v3.75.47-a: the check now judges by the property, not by the phrase.';
END
$fix$;

-- **والبرهانُ فورىّ**: الفحصُ الذى رفضَ يُنادَى الآن، ومعه كلُّ فحصٍ يُسمّى
-- دالّةً بُدِّلَ جسدُها فى v3.75.47 — وهى القاعدةُ التى نقصتنى.
SELECT public.assert_baseline_v3_75_42_check();
SELECT public.assert_baseline_v3_75_43_check();
SELECT public.assert_baseline_v3_75_45_check();
SELECT public.assert_baseline_v3_75_47_check();
SELECT public.assert_baseline_v3_75_25_check();
SELECT public.assert_baseline_v3_75_29_check();
