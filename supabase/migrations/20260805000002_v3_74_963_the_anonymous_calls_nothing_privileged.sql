-- v3.74.963 — الزائرُ المجهول لا ينادى شيئاً مرتفعَ الصلاحية
-- ============================================================================
-- ٩٦٢ أغلق ٣٧ دالةً — تلك التى لا تسأل عن الهوية أصلاً — وبقيت لوحةُ
-- السلامة ترفع نفسَ الانحراف. فقياسُها أوسعُ من قياسى، وهى محقّة: المقياسُ
-- الصحيح ليس «هل تسأل عن الهوية داخلها؟» بل **«هل يستطيع من لم يسجّل دخولاً
-- أن ينادى دالةً تعمل بصلاحية مالك القاعدة؟»**
--
-- والباقى بعد ٩٦٢: ١٥٥ دالة — ٩٥ مُشغِّلاً، و٢٢ حراسةً، و٣٨ تسأل عن الهوية.
-- ولا واحدةَ منها يحتاج المجهولُ نداءَها:
--   • المُشغِّلات لا تُنادى بالاسم أصلاً — يُشغِّلها المحرّكُ عند الكتابة،
--     ولا يُفحص إذنُ النداء وقتَها. فالسحبُ لا يمسّ عملَها البتّة.
--   • والثمانى والثلاثون تردّ المجهولَ داخلها — لكنّ منعَه عند الباب أوثق.
--
-- ثمّ استثناءٌ **قِيس ولم يُخمَّن**، وصُحِّح مرّتين:
--   ‏(١) أوّلُ محاولةٍ سحبت كلَّ شىء، فصارت قراءةُ المجهول للجداول المحميّة
--       تُعطى «permission denied for function is_company_member» بدل نتيجةٍ
--       فارغة. وهما منعٌ، لكنّ الثانى قد يكسر صفحةً تُقرأ قبل الدخول.
--   ‏(٢) وثانيةٌ استثنت «ما اسمُه يشبه الحراسة ويُرجع bool»، فبقيت
--       get_user_company_ids تسقط — فهى SETOF لا bool.
--
-- فالتعريفُ الصحيح لا يُقرأ من الاسم ولا من نوع الإرجاع، بل من الكتالوج:
-- **دالةٌ يذكرها تعبيرُ سياسةِ رؤية** تبقى منادَاةً للمجهول، وما عداها يُمنع.
--
-- الإثباتُ على الاختبار ثمّ على الإنتاج:
--   المجهولُ قرأ ٢٥٥ جدولاً فلم يسقط واحدٌ منها بخطأ دالة.
--   نداؤه لدالةٍ مرتفعة        → permission denied
--   تسجيلُ الدخول              → سليم
--   المستخدمُ المسجَّل           → باقٍ يعمل
--   والباقى مفتوحاً للمجهول: ٣٣ دالةً، كلُّها تذكرها سياساتُ الرؤية — ولا
--   غنى عنها، وما تُفشيه جوابٌ عن صفٍّ سمّاه السائلُ بنفسه.
-- ============================================================================

-- (١) المنعُ الشامل
DO $$
DECLARE
  r record;
  n integer := 0;
BEGIN
  FOR r IN
    SELECT p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' AS sig
      FROM pg_proc p
      JOIN pg_namespace ns ON ns.oid = p.pronamespace
     WHERE ns.nspname = 'public'
       AND p.prokind = 'f'
       AND p.prosecdef
       AND has_function_privilege('anon', p.oid, 'EXECUTE')
       AND p.prosrc ~* 'company_id|companies'
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM PUBLIC', r.sig);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated, service_role', r.sig);
    n := n + 1;
  END LOOP;
  RAISE NOTICE 'v3.74.963: مُنع نداءُ % دالةً على الزائر المجهول.', n;
END $$;

-- (٢) والاستثناءُ المقيس: ما تذكره سياساتُ الرؤية يبقى منادًى
DO $$
DECLARE
  r record;
  n integer := 0;
  v_exprs text;
BEGIN
  SELECT string_agg(coalesce(pg_get_expr(polqual, polrelid), '') || ' ' ||
                    coalesce(pg_get_expr(polwithcheck, polrelid), ''), ' ')
    INTO v_exprs
    FROM pg_policy;

  FOR r IN
    SELECT p.proname,
           p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' AS sig
      FROM pg_proc p
      JOIN pg_namespace ns ON ns.oid = p.pronamespace
     WHERE ns.nspname = 'public'
       AND p.prokind = 'f'
       AND p.prosecdef
       AND NOT has_function_privilege('anon', p.oid, 'EXECUTE')
  LOOP
    IF v_exprs ~ ('(^|[^a-z_])' || r.proname || '\s*\(') THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO anon', r.sig);
      n := n + 1;
    END IF;
  END LOOP;
  RAISE NOTICE 'v3.74.963: أُبقى نداءُ % دالةً تذكرها سياساتُ الرؤية.', n;
END $$;
