-- =============================================================================
-- v3.74.995 — اسمٌ يُقرأ ولا يُشغَل سطرٌ يُضلّل
-- =============================================================================
-- ٩٩٤ وضع حارساً يعدّ الدَّين ولا يدعه يزيد: **مئتان وتسعةٌ وأربعون موضعاً** فى
-- القاعدة تسمّى وظائفَ لا يستطيع أحدٌ أن يشغلها. ولا واحدٌ منها يُغلق باباً —
-- كلٌّ يسمّى وظيفةً حيّةً بجانبه. **لكنّها سطورٌ تُقرأ فتُضلّل من يقرؤها غداً.**
--
-- وهذه الدفعةُ تكنس **الدالّات**. والسياساتُ تُكنس فى دفعةٍ تخصّها، لأنّ إعادةَ
-- كتابتها تلمس من يرى ماذا — **ولا يُجمع فى دفعةٍ واحدةٍ ما يُقاس بمقياسين.**
--
-- ═══ أداةٌ ترفض أن تُخمّن ═══
--
-- قاعدتُها كقاعدة ٩٩٣: **شكلٌ لا تعرفه يُوقف كلَّ شىء**. وهى تعمل داخل معاملةٍ
-- واحدة، فإن رفضت موضعاً واحداً **لم يُكتب حرفٌ فى شىء**.
--
-- ورفضت ثلاثَ مرّاتٍ قبل أن تصدق:
--   ١. أنماطُ نصٍّ فى فحوصٍ قديمة (`NOT LIKE '%''general_manager''%'`) — ليست
--      قوائمَ أدوارٍ بل مقارنةَ نصوص. أُعلنت استثناءً **باسمها** لا تخطّياً صامتاً.
--   ٢. عنصرٌ أخيرٌ فى قائمةٍ متعدّدةِ الأسطر: فاصلتُه فى السطر السابق.
--   ٣. عنصرٌ صار أوّلَ سطره بعد حذفِ ما قبله: فاصلتُه أيضاً فى السطر السابق.
--
-- ═══ والثابتُ الذى يحمى ═══
--
-- قبل أن تُكتب دالّةٌ يُقاس شيئان:
--   • **مجموعةُ الأسماء الحيّة فيها لم تتغيّر** — فما حُذف اسمٌ يشغله بشر.
--   • عددُ سطورها يُطابق ما أُعلن حذفُه — فلا سطرَ ضاع بغير حساب.
-- وأىُّ اختلافٍ يُلغى الهجرةَ كلَّها.
--
-- > **واسمٌ يُقرأ ولا يُشغَل سطرٌ يُضلّل.**
-- =============================================================================

DO $sweep$
DECLARE
  v_vocab   text[] := public.erp_membership_roles();
  v_dead    text[] := ARRAY['general_manager','gm','generalmanager','super_admin','superadmin','warehouse_manager','branch_manager'];
  r record; v_lines text[]; v_out text[]; v_line text; v_new text; v_i int; v_n int;
  v_tok text; v_live text; v_near boolean; v_before text[]; v_after text[]; v_def text; v_trim text;
  v_touched int := 0; v_sites int := 0; v_exempt int := 0; v_dropped int := 0; v_joined int := 0;
  v_refused text[] := ARRAY[]::text[]; q text := chr(39);
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_functiondef(p.oid) AS def
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname='public' AND p.prokind='f'
       AND pg_get_functiondef(p.oid) ~ '''(general_manager|gm|generalmanager|super_admin|superadmin|warehouse_manager|branch_manager)'''
     ORDER BY p.proname
  LOOP
    v_lines := string_to_array(r.def, E'\n'); v_out := ARRAY[]::text[]; v_n := 0;
    FOR v_i IN 1 .. array_length(v_lines,1) LOOP
      v_line := v_lines[v_i]; v_trim := btrim(v_line, E' \t\r');
      IF v_trim LIKE '--%' THEN v_out := array_append(v_out, v_line); CONTINUE; END IF;
      v_near := false;
      FOREACH v_live IN ARRAY v_vocab LOOP
        IF EXISTS (SELECT 1 FROM generate_series(greatest(1,v_i-5), least(array_length(v_lines,1),v_i+5)) AS g
                    WHERE position(q||v_live||q in v_lines[g]) > 0)
        THEN v_near := true; EXIT; END IF;
      END LOOP;
      IF NOT v_near THEN v_out := array_append(v_out, v_line); CONTINUE; END IF;

      IF v_trim ~ ('^'||q||'('||array_to_string(v_dead,'|')||')'||q||',?$') THEN
        IF right(v_trim,1) <> ',' THEN
          IF array_length(v_out,1) IS NULL OR btrim(v_out[array_length(v_out,1)], E' \t\r') NOT LIKE '%,' THEN
            v_refused := array_append(v_refused, r.proname||':'||v_i||'  عنصرٌ أخيرٌ وما قبله بلا فاصلة'); CONTINUE;
          END IF;
          v_out[array_length(v_out,1)] := regexp_replace(v_out[array_length(v_out,1)], ',(\s*)$', '\1');
        END IF;
        v_sites := v_sites + 1; v_dropped := v_dropped + 1; v_n := v_n + 1; CONTINUE;
      END IF;

      v_new := v_line;
      FOREACH v_tok IN ARRAY v_dead LOOP
        IF position(q||v_tok||q in v_new) = 0 THEN CONTINUE; END IF;
        IF position(q||q||v_tok||q||q in v_new) > 0 THEN v_exempt := v_exempt + 1; CONTINUE; END IF;
        v_sites := v_sites + 1;
        v_new := regexp_replace(v_new, '\s+(OR|AND)\s+[A-Za-z_][A-Za-z0-9_.$]*\s*(=|<>|!=)\s*'''||v_tok||'''', '', 'gi');
        v_new := regexp_replace(v_new, ''''||v_tok||'''\s*,\s*', '', 'g');
        v_new := regexp_replace(v_new, '\s*,\s*'''||v_tok||'''', '', 'g');
        IF position(q||v_tok||q in v_new) > 0 AND v_new ~ ('^\s*'||q||v_tok||q)
           AND array_length(v_out,1) IS NOT NULL
           AND btrim(v_out[array_length(v_out,1)], E' \t\r') LIKE '%,' THEN
          v_out[array_length(v_out,1)] := regexp_replace(v_out[array_length(v_out,1)], ',(\s*)$', '\1');
          v_new := regexp_replace(v_new, '^(\s*)'||q||v_tok||q||'\s*,?\s*', '\1');
          v_joined := v_joined + 1;
        END IF;
        IF position(q||v_tok||q in v_new) > 0 THEN
          v_refused := array_append(v_refused, r.proname||':'||v_i||'  «'||v_tok||'»  '||left(v_trim,90));
        END IF;
      END LOOP;
      v_out := array_append(v_out, v_new);
    END LOOP;

    v_def := array_to_string(v_out, E'\n');
    IF v_def = r.def THEN CONTINUE; END IF;
    SELECT array_agg(DISTINCT m[1] ORDER BY m[1]) INTO v_before
      FROM regexp_matches(r.def, '''([a-z][a-z0-9_]*)''', 'g') AS m WHERE m[1] = ANY (v_vocab);
    SELECT array_agg(DISTINCT m[1] ORDER BY m[1]) INTO v_after
      FROM regexp_matches(v_def, '''([a-z][a-z0-9_]*)''', 'g') AS m WHERE m[1] = ANY (v_vocab);
    IF v_before IS DISTINCT FROM v_after THEN
      RAISE EXCEPTION 'v3.74.995: تغيّرت الأسماءُ الحيّةُ فى %: % ⟵ %', r.proname, v_before, v_after;
    END IF;
    IF array_length(v_out,1) <> array_length(v_lines,1) - v_n THEN
      RAISE EXCEPTION 'v3.74.995: عددُ السطور فى % لا يُطابق المحذوف.', r.proname;
    END IF;
    EXECUTE v_def;
    v_touched := v_touched + 1; v_n := 0;
  END LOOP;

  IF array_length(v_refused,1) > 0 THEN
    RAISE EXCEPTION 'v3.74.995: % موضعاً لم أعرف شكلَه — أُلغيت. أوّلُها: %',
      array_length(v_refused,1), v_refused[1];
  END IF;
  RAISE NOTICE 'v3.74.995 · دالّاتٌ: %  ·  مواضع: %  ·  سطورٌ حُذفت: %  ·  ضُمَّت لسابقها: %  ·  استثناءاتٌ معلَنة: %',
    v_touched, v_sites, v_dropped, v_joined, v_exempt;
END $sweep$;

-- -----------------------------------------------------------------------------
-- وموضعٌ واحدٌ لا يجاوره اسمٌ حىٌّ فلا تراه الأداةُ ولا الحارس — يُعالَج باليد
-- -----------------------------------------------------------------------------
-- **وشرطُ الجوار حمايةٌ لا حجّة**: يمنع الأداةَ أن تحكم على نصٍّ ليس دوراً،
-- لكنّه يُعميها عن موضعٍ حقيقىٍّ وحيد. فيُسمّى ويُعالَج بيدٍ لا بقاعدة.
DO $one$
DECLARE v_def text; v_new text; v_hits int;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='get_user_approval_badges';
  IF v_def IS NULL THEN RAISE NOTICE 'v3.74.995 · لا دالّة.'; RETURN; END IF;

  SELECT count(*) INTO v_hits FROM regexp_matches(v_def, 'v_is_admin OR v_role = ''general_manager''', 'g');
  IF v_hits = 0 THEN RAISE NOTICE 'v3.74.995 · الموضعُ مُعالَجٌ سلفاً.'; RETURN; END IF;
  IF v_hits <> 1 THEN
    RAISE EXCEPTION 'v3.74.995: توقّعتُ موضعاً واحداً فوجدتُ % — لم أكتب شيئاً.', v_hits;
  END IF;

  v_new := replace(v_def, 'v_is_admin OR v_role = ''general_manager''', 'v_is_admin');
  IF replace(v_new, 'IF v_is_admin THEN', 'IF v_is_admin OR v_role = ''general_manager'' THEN') <> v_def THEN
    RAISE EXCEPTION 'v3.74.995: التحقّقُ العكسىُّ فشل — أُلغيت.';
  END IF;
  EXECUTE v_new;
  RAISE NOTICE 'v3.74.995 · موضعٌ لا يجاوره اسمٌ حىٌّ عُولج باليد.';
END $one$;
