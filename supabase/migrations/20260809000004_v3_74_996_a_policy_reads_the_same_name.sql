-- =============================================================================
-- v3.74.996 — وسياساتُ الرؤية تقرأ الاسمَ نفسَه
-- =============================================================================
-- كنس ٩٩٥ الدالّات وترك السياسات، **لأنّ لمسَها يمسّ من يرى ماذا** — وهو مقياسٌ
-- غيرُ مقياس الدالّات. وهذه دفعتُها.
--
-- والأداةُ هى هى: **شكلٌ لا تعرفه يُوقف كلَّ شىء**، ومعاملةٌ واحدة، وثابتٌ يحمى:
-- **مجموعةُ الأسماء الحيّة فى السياسة لا تتغيّر** — فما ضاق على أحدٍ بابُه ولا اتّسع.
--
-- وتُعدَّل السياسةُ بـ`ALTER POLICY` لا بهدمٍ وبناء: **فيبقى نوعُها ومن تُخاطبهم
-- كما هما**، ولا يمرُّ بينهما لحظةٌ يكون الجدولُ فيها بلا حارس.
--
-- ═══ واستثناءٌ مُعلَنٌ لا مسكوتٌ عنه ═══
--
-- سياسةٌ واحدةٌ فيها قائمةٌ **لم يكن فيها إلّا أسماءٌ ميّتة** — فهى شرطٌ لا يصدق
-- على أحدٍ أصلاً: **بابٌ مفتوحٌ على لا أحد**. وحذفُ أسمائها يُفرغ القائمةَ لا
-- يُصلحها، فتُركت **وسُمّيت** ليُنظر فيها بيدٍ لا بقاعدةٍ عمياء.
--
-- > **وما لا تعرفه القاعدةُ يُسمّى، ولا يُحذف بقاعدةٍ عمياء.**
-- =============================================================================

DO $pol$
DECLARE
  v_vocab text[] := public.erp_membership_roles();
  v_dead  text[] := ARRAY['general_manager','gm','generalmanager','super_admin','superadmin','warehouse_manager','branch_manager'];
  v_re    text := '(general_manager|gm|generalmanager|super_admin|superadmin|warehouse_manager|branch_manager)';
  v_lone  text := 'ARRAY\[''(general_manager|gm|generalmanager|super_admin|superadmin|warehouse_manager|branch_manager)''::text\]';
  r record; v_q text; v_c text; v_tok text; v_sql text;
  v_before text[]; v_after text[]; v_n int := 0; v_sites int := 0;
  v_refused text[] := ARRAY[]::text[]; v_empty text[] := ARRAY[]::text[]; q text := chr(39);
BEGIN
  FOR r IN
    SELECT tablename, policyname, qual, with_check FROM pg_policies
     WHERE schemaname='public'
       AND (coalesce(qual,'')||coalesce(with_check,'')) ~ ('''' || v_re || '''')
     ORDER BY tablename, policyname
  LOOP
    v_q := r.qual; v_c := r.with_check;
    FOREACH v_tok IN ARRAY v_dead LOOP
      IF v_q IS NOT NULL THEN
        v_q := replace(v_q, q||v_tok||q||'::text, ', '');
        v_q := replace(v_q, ', '||q||v_tok||q||'::text', '');
        v_q := regexp_replace(v_q, '\s+(OR|AND)\s+\(?[A-Za-z_][A-Za-z0-9_."]*\s*=\s*'||q||v_tok||q||'(::text)?\)?', '', 'gi');
      END IF;
      IF v_c IS NOT NULL THEN
        v_c := replace(v_c, q||v_tok||q||'::text, ', '');
        v_c := replace(v_c, ', '||q||v_tok||q||'::text', '');
        v_c := regexp_replace(v_c, '\s+(OR|AND)\s+\(?[A-Za-z_][A-Za-z0-9_."]*\s*=\s*'||q||v_tok||q||'(::text)?\)?', '', 'gi');
      END IF;
    END LOOP;
    v_sites := v_sites + (SELECT count(*) FROM regexp_matches(coalesce(r.qual,'')||' '||coalesce(r.with_check,''), ''''||v_re||'''', 'g'));

    IF coalesce(v_q,'') ~ v_lone OR coalesce(v_c,'') ~ v_lone
       OR position('ARRAY[]' in coalesce(v_q,'')) > 0 OR position('ARRAY[]' in coalesce(v_c,'')) > 0 THEN
      v_empty := array_append(v_empty, r.tablename||' :: '||r.policyname);
      CONTINUE;
    END IF;

    IF coalesce(v_q,'') ~ (''''||v_re||'''') OR coalesce(v_c,'') ~ (''''||v_re||'''') THEN
      v_refused := array_append(v_refused, r.tablename||' :: '||r.policyname);
      CONTINUE;
    END IF;

    IF v_q IS NOT DISTINCT FROM r.qual AND v_c IS NOT DISTINCT FROM r.with_check THEN CONTINUE; END IF;

    SELECT array_agg(DISTINCT m[1] ORDER BY m[1]) INTO v_before
      FROM regexp_matches(coalesce(r.qual,'')||' '||coalesce(r.with_check,''), '''([a-z][a-z0-9_]*)''', 'g') AS m
     WHERE m[1] = ANY (v_vocab);
    SELECT array_agg(DISTINCT m[1] ORDER BY m[1]) INTO v_after
      FROM regexp_matches(coalesce(v_q,'')||' '||coalesce(v_c,''), '''([a-z][a-z0-9_]*)''', 'g') AS m
     WHERE m[1] = ANY (v_vocab);
    IF v_before IS DISTINCT FROM v_after THEN
      RAISE EXCEPTION 'v3.74.996: تغيّرت الأسماءُ الحيّةُ فى %.%: % ⟵ %', r.tablename, r.policyname, v_before, v_after;
    END IF;

    v_sql := format('ALTER POLICY %I ON public.%I', r.policyname, r.tablename);
    IF v_q IS NOT NULL THEN v_sql := v_sql || ' USING (' || v_q || ')'; END IF;
    IF v_c IS NOT NULL THEN v_sql := v_sql || ' WITH CHECK (' || v_c || ')'; END IF;
    EXECUTE v_sql;
    v_n := v_n + 1;
  END LOOP;

  IF array_length(v_refused,1) > 0 THEN
    RAISE EXCEPTION 'v3.74.996: % سياسةً لم أعرف شكلَها — أُلغيت. أوّلُها: %',
      array_length(v_refused,1), v_refused[1];
  END IF;
  RAISE NOTICE 'v3.74.996 · سياساتٌ عُولجت: %  ·  مواضع: %  ·  أبوابٌ مفتوحةٌ على لا أحد (تُركت وتُسمّى): %',
    v_n, v_sites, coalesce(array_to_string(v_empty, ' · '), 'لا شىء');
END $pol$;
