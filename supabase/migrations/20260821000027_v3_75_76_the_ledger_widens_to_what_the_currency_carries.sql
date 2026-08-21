-- ═══════════════════════════════════════════════════════════════════════════
-- v3.75.76 — «ويتّسعُ الدفترُ لما تحملُه العملة»
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ما كان قائماً
-- ─────────────
-- أثبتَ إصدارُ v3.75.75 على دفترٍ حقيقىٍّ أنَّ فاتورةً كويتيّةً من ثلاثةِ
-- سطورٍ بـ3.375 د.ك للسطرِ — مجموعُها 10.125 متوازنٌ تماماً قبلَ أن يلمسَ
-- القاعدة — تُخزَّنُ مديناً 10.13 ودائناً 10.14، فيُرفَضُ الترحيلُ بفارقِ
-- قرشٍ لم يخترعْه سطرٌ فى الشيفرة، بل اخترعَه **نوعُ العمود** نفسُه.
--
-- ولم يكن ذلك رأياً فى الدقّة، بل بابٌ مغلق: شركةٌ خليجيّةٌ لا تستطيعُ
-- ترحيلَ فاتورةٍ واحدةٍ بأرقامِ عملتِها الصحيحة. والأسوأُ أنَّ الفشلَ
-- **متقطّع**: مبلغٌ تصادفَ أن يُقرَّبَ بالتساوى على الطرفَينِ يمرُّ ويُخزَّنُ
-- خطأً فى صمت.
--
-- ولم يكن المشروعُ متّسقاً مع نفسِه أصلاً
-- ────────────────────────────────────────
-- فى هذه القاعدةِ نفسِها **140 عموداً رقميّاً يحفظُ أربعَ خاناتٍ بالفعل**
-- فى 56 جدولاً — منها المدينُ والدائنُ فى دفاترِ التوحيد. أى أنَّ الجسدَ
-- الواحدَ كان يقولُ خانتَينِ هنا وأربعاً هناك. فهذه الهجرةُ **تُنهى تناقضاً
-- قائماً ولا تخترعُ معياراً جديداً**؛ والمقياسُ المختارُ هو مقياسُ البيتِ
-- الأكثرُ استعمالاً فيه: numeric(18,4).
--
-- ما تفعلُه هذه الهجرة
-- ────────────────────
-- تُوسِّعُ 226 عمودَ مالٍ فى 77 جدولاً من خانتَينِ إلى أربع. والخاناتُ
-- الصحيحةُ (ما قبلَ الفاصلة) **لا تضيقُ أبداً**: الدقّةُ الجديدةُ هى
-- max(18، الدقّةُ القديمة + 2)، فما كان (15,2) صارَ (18,4) وما كان (18,2)
-- صارَ (20,4). ولذلك لا يوجدُ مبلغٌ كان يتّسعُ ثمَّ لا يتّسع.
--
-- وما ليس مالاً لا يُمَسّ
-- ───────────────────────
-- من بين 291 عموداً بخانتَين، تُركَ 65 عموداً لأنّها ليست نقوداً: نِسَبٌ
-- مئويّةٌ (percent)، ومعدّلاتٌ (‎_rate)، وكمّيّاتٌ (quantity)، وأوقاتٌ
-- (hours/minutes)، ونقاطُ مكافآتٍ لا نقود. والقاعدةُ مكتوبةٌ هنا شرطاً
-- واحداً يُقرَأ، لا قائمةً منقولةً باليد.
--
-- ولا يُترَكُ الأمرُ للثقة: الهجرةُ تقيسُ نفسَها
-- ──────────────────────────────────────────────
-- هذه الهجرةُ **تُثبتُ عدمَ الضررِ داخلَ نفسِ المعاملة**، ولا تكتفى بوعد:
--
--   1. تقيسُ عددَ الصفوفِ **ومجموعَ كلِّ عمودٍ من الـ226** قبلَ التوسيع.
--   2. تلتقطُ بصمةَ **كلِّ منظورٍ ومنظورٍ مادّىٍّ وزنادٍ** فى المخطَّط:
--      التعريفَ والمالكَ والخياراتِ والصلاحيّاتِ والتعليقاتِ والفهارسَ
--      والأعمدةَ وحالةَ التشغيل.
--   3. تُسقِطُ ما يعتمدُ منها على الأعمدةِ المُوسَّعة (وإسقاطُها حتمىٌّ:
--      PostgreSQL يرفضُ تغييرَ نوعِ عمودٍ يستعملُه منظورٌ أو زنادٌ يستمعُ
--      إليه بـ UPDATE OF).
--   4. تُوسِّعُ الأعمدة.
--   5. تُعيدُ بناءَ المناظيرِ **من التعريفِ الملتقَطِ نفسِه** لا من نصٍّ
--      مكتوبٍ باليد، ثمَّ تُعيدُ المالكَ والصلاحيّاتِ والتعليقاتِ والفهارس.
--   6. تُعيدُ القياسَ وتُقارن. فإن اختلفَ **قرشٌ واحدٌ** فى مجموعِ عمودٍ
--      واحد، أو نقصَ صفٌّ واحد، أو تغيّرت بصمةُ منظورٍ واحد — تصرخُ الهجرةُ
--      وتُلغى المعاملةُ بأكملِها، فلا تبقى القاعدةُ نصفَ محوَّلة.
--
-- ما لا يتغيَّر
-- ────────────
-- لا صفَّ يُحذَفُ ولا يُعدَّل، ولا قيمةَ تُقرَّبُ أو تُقَصّ: توسيعُ المقياسِ
-- من 2 إلى 4 حفظٌ زائدٌ لا فقدان. ولا سطرَ فى التطبيقِ يحتاجُ تغييراً
-- لتعملَ القاعدةُ بعدَها؛ توحيدُ التقريبِ ورفعُ قفلِ العملاتِ الثمانى
-- دفعتانِ تاليتان، ولكلٍّ منهما قياسُها.
-- ═══════════════════════════════════════════════════════════════════════════

DO $mig$
DECLARE
  r          record;
  g          record;
  i_def      text;
  v_sql      text;
  v_pass     int := 0;
  v_progress boolean;
  v_remaining int;
  v_diff     int;
  v_n        int;
  v_kindword text;
  v_last_err text := '';
  v_detail   text;
BEGIN
  -- ═════════════════════════════════════════════════════════════════════
  -- (1) بصمةُ كلِّ منظورٍ ومنظورٍ مادّىٍّ فى المخطَّط — قبل
  -- ═════════════════════════════════════════════════════════════════════
  CREATE TEMP TABLE _v_before ON COMMIT DROP AS
  SELECT c.oid                                                AS oid,
         c.relname::text                                       AS relname,
         c.relkind::text                                       AS relkind,
         rtrim(pg_get_viewdef(c.oid, true), E' \n;')           AS def,
         pg_get_userbyid(c.relowner)::text                      AS owner,
         COALESCE(array_to_string(c.reloptions, ', '), '')      AS opts,
         COALESCE(c.relacl, acldefault('r', c.relowner))::text  AS acl_eff,
         (SELECT COALESCE(string_agg(y.g, E'\n' ORDER BY y.g), '')
            FROM (SELECT CASE WHEN x.grantee = 0 THEN 'PUBLIC'
                              ELSE pg_get_userbyid(x.grantee) END || ':' || x.privilege_type ||
                         CASE WHEN x.is_grantable THEN '*' ELSE '' END AS g
                    FROM aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) x) y) AS acl,
         COALESCE(obj_description(c.oid, 'pg_class'), '')       AS cmt,
         c.relispopulated                                       AS populated,
         (SELECT COALESCE(string_agg(a.attname || '|' ||
                   COALESCE((SELECT string_agg(z.g, ',' ORDER BY z.g)
                               FROM (SELECT CASE WHEN x.grantee = 0 THEN 'PUBLIC'
                                                 ELSE pg_get_userbyid(x.grantee) END || ':' || x.privilege_type AS g
                                       FROM aclexplode(a.attacl) x) z), '') || '|' ||
                   COALESCE(col_description(c.oid, a.attnum), ''),
                   E'\n' ORDER BY a.attnum), '')
            FROM pg_attribute a
           WHERE a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped) AS cols,
         (SELECT COALESCE(string_agg(pg_get_indexdef(ix.indexrelid),
                   E'\n' ORDER BY pg_get_indexdef(ix.indexrelid)), '')
            FROM pg_index ix WHERE ix.indrelid = c.oid)         AS idx
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind IN ('v', 'm');

  SELECT count(*) INTO v_n FROM _v_before;
  RAISE NOTICE 'مناظيرُ المخطَّطِ قبلَ العمل: %', v_n;

  -- ═════════════════════════════════════════════════════════════════════
  -- (1ب) وبصمةُ كلِّ زنادٍ فى المخطَّط — فالزنادُ الذى يستمعُ لعمودٍ بعينِه
  --      (UPDATE OF ‎...) يمنعُ تغييرَ نوعِه، فيُلتقَطُ ويُسقَطُ ويعودُ.
  -- ═════════════════════════════════════════════════════════════════════
  CREATE TEMP TABLE _t_before ON COMMIT DROP AS
  SELECT t.oid                                          AS oid,
         t.tgname::text                                 AS tgname,
         cl.relname::text                               AS tbl,
         pg_get_triggerdef(t.oid, true)                 AS def,
         t.tgenabled::text                              AS enabled,
         COALESCE(obj_description(t.oid, 'pg_trigger'), '') AS cmt
    FROM pg_trigger t
    JOIN pg_class cl ON cl.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = cl.relnamespace AND n.nspname = 'public'
   WHERE NOT t.tgisinternal;

  SELECT count(*) INTO v_n FROM _t_before;
  RAISE NOTICE 'زنادُ المخطَّطِ قبلَ العمل: %', v_n;

  -- ═════════════════════════════════════════════════════════════════════
  -- (2) أعمدةُ المالِ بخانتَين، والقاعدةُ شرطٌ يُقرَأُ لا قائمةٌ تُنقَل
  -- ═════════════════════════════════════════════════════════════════════
  CREATE TEMP TABLE _money ON COMMIT DROP AS
  SELECT a.attrelid                AS attrelid,
         a.attnum                  AS attnum,
         cl.relname::text          AS tbl,
         a.attname::text           AS col,
         (((a.atttypmod - 4) >> 16) & 65535)::int AS prec
    FROM pg_attribute a
    JOIN pg_class cl ON cl.oid = a.attrelid AND cl.relkind = 'r'
    JOIN pg_namespace n ON n.oid = cl.relnamespace AND n.nspname = 'public'
   WHERE a.attnum > 0 AND NOT a.attisdropped
     AND a.atttypid = 'numeric'::regtype AND a.atttypmod > 0
     AND ((a.atttypmod - 4) & 65535) = 2
     AND NOT (a.attname ~ 'percent|hours|minutes|quantity' OR a.attname ~ '_rate$' OR a.attname = 'bonus_points_per_value');

  SELECT count(*) INTO v_n FROM _money;

  -- مطبَّقةٌ سلفاً؟ لا يُعادُ العملُ ولا يُصرَخُ فى وجهِ من أعادَ التشغيل.
  IF v_n = 0 THEN
    SELECT count(*) INTO v_diff
      FROM pg_attribute a
      JOIN pg_class cl ON cl.oid = a.attrelid AND cl.relkind = 'r'
      JOIN pg_namespace n ON n.oid = cl.relnamespace AND n.nspname = 'public'
     WHERE a.attnum > 0 AND NOT a.attisdropped
       AND a.atttypid = 'numeric'::regtype AND a.atttypmod > 0
       AND ((a.atttypmod - 4) & 65535) = 4
       AND NOT (a.attname ~ 'percent|hours|minutes|quantity' OR a.attname ~ '_rate$' OR a.attname = 'bonus_points_per_value');
    IF v_diff >= 226 THEN
      RAISE NOTICE 'مطبَّقةٌ سلفاً: لا عمودَ مالٍ بخانتَين، و% عموداً بأربع.', v_diff;
      RETURN;
    END IF;
  END IF;

  IF v_n <> 226 THEN
    RAISE EXCEPTION 'MONEY_COLUMN_COUNT_UNEXPECTED: وجدتُ % عمودَ مالٍ بخانتَين والمنتظَرُ 226. لا تُنفَّذُ هجرةٌ على مخطَّطٍ غيرِ الذى قِيسَ.', v_n;
  END IF;

  -- ═════════════════════════════════════════════════════════════════════
  -- (3) إغلاقُ التبعيّة: كلُّ منظورٍ يعتمدُ — مباشرةً أو بالوساطة — عليها
  -- ═════════════════════════════════════════════════════════════════════
  CREATE TEMP TABLE _v_drop ON COMMIT DROP AS
  WITH RECURSIVE seed AS (
    SELECT DISTINCT dv.oid AS oid
      FROM pg_depend d
      JOIN pg_rewrite rw ON d.objid = rw.oid
      JOIN pg_class dv ON rw.ev_class = dv.oid
      JOIN _money m ON m.attrelid = d.refobjid AND m.attnum = d.refobjsubid
     WHERE d.classid = 'pg_rewrite'::regclass AND dv.oid <> d.refobjid
  ), clo AS (
    SELECT oid FROM seed
    UNION
    SELECT dv.oid
      FROM clo
      JOIN pg_depend d ON d.refobjid = clo.oid
      JOIN pg_rewrite rw ON d.objid = rw.oid
      JOIN pg_class dv ON rw.ev_class = dv.oid
     WHERE d.classid = 'pg_rewrite'::regclass AND dv.oid <> clo.oid
  )
  SELECT oid FROM clo;

  SELECT count(*) INTO v_n FROM _v_drop;
  RAISE NOTICE 'مناظيرُ تعتمدُ على أعمدةِ المال: %', v_n;

  CREATE TEMP TABLE _v_todo ON COMMIT DROP AS
    SELECT b.* FROM _v_before b JOIN _v_drop d ON d.oid = b.oid;

  -- صلاحيّاتُ الأعمدةِ داخلَ تلك المناظير (اللائى تُمنَحُ عموداً عموداً)
  CREATE TEMP TABLE _v_colgrant ON COMMIT DROP AS
  SELECT t.relname                                   AS relname,
         t.relkind                                   AS relkind,
         a.attname::text                             AS attname,
         x.privilege_type::text                      AS priv,
         CASE WHEN x.grantee = 0 THEN 'PUBLIC'
              ELSE quote_ident(pg_get_userbyid(x.grantee)) END AS grantee,
         x.is_grantable                              AS grantable
    FROM _v_todo t
    JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum > 0
                       AND NOT a.attisdropped AND a.attacl IS NOT NULL,
         LATERAL aclexplode(a.attacl) x;

  -- تعليقاتُ الأعمدة
  CREATE TEMP TABLE _v_colcmt ON COMMIT DROP AS
  SELECT t.relname AS relname, t.relkind AS relkind,
         a.attname::text AS attname,
         col_description(t.oid, a.attnum) AS cmt
    FROM _v_todo t
    JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum > 0 AND NOT a.attisdropped
   WHERE col_description(t.oid, a.attnum) IS NOT NULL;

  -- الزنادُ المرتبطُ بعمودٍ من أعمدةِ المال
  CREATE TEMP TABLE _t_todo ON COMMIT DROP AS
  SELECT b.*
    FROM _t_before b
   WHERE b.oid IN (SELECT DISTINCT d.objid
                     FROM pg_depend d
                     JOIN _money m ON m.attrelid = d.refobjid AND m.attnum = d.refobjsubid
                    WHERE d.classid = 'pg_trigger'::regclass);

  SELECT count(*) INTO v_n FROM _t_todo;
  RAISE NOTICE 'زنادٌ يستمعُ لأعمدةِ المال: %', v_n;

  -- ═════════════════════════════════════════════════════════════════════
  -- (4) القياسُ قبل: صفوفٌ ومجموعٌ لكلِّ عمودٍ من الـ226
  -- ═════════════════════════════════════════════════════════════════════
  CREATE TEMP TABLE _sum_before (tbl text, col text, n_rows bigint, n_notnull bigint, total numeric) ON COMMIT DROP;
  FOR r IN SELECT tbl, col FROM _money ORDER BY tbl, col LOOP
    EXECUTE format(
      'INSERT INTO _sum_before SELECT %L, %L, count(*), count(%I), COALESCE(sum(%I), 0) FROM public.%I',
      r.tbl, r.col, r.col, r.col, r.tbl);
  END LOOP;

  -- ═════════════════════════════════════════════════════════════════════
  -- (5) الإسقاط — حتمىٌّ لا اختيارىّ
  -- ═════════════════════════════════════════════════════════════════════
  FOR r IN SELECT relname, relkind FROM _v_todo LOOP
    IF r.relkind = 'm' THEN
      EXECUTE format('DROP MATERIALIZED VIEW IF EXISTS public.%I CASCADE', r.relname);
    ELSE
      EXECUTE format('DROP VIEW IF EXISTS public.%I CASCADE', r.relname);
    END IF;
  END LOOP;

  FOR r IN SELECT tgname, tbl FROM _t_todo LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', r.tgname, r.tbl);
  END LOOP;

  -- ═════════════════════════════════════════════════════════════════════
  -- (6) التوسيع — والدقّةُ الجديدةُ قاعدةٌ تُحسَب، لا رقمٌ يُكتَبُ 226 مرّة
  --
  --     الدقّةُ الجديدة = max(18، الدقّةُ القديمة + 2)، والمقياسُ 4.
  --     وبهذا **لا تضيقُ خانةٌ صحيحةٌ أبداً**: ما كان (15,2) صارَ (18,4)
  --     فزادت خاناتُه الصحيحةُ من 13 إلى 14، وما كان (18,2) صارَ (20,4)
  --     فبقيت ستَّ عشرةَ كما هى. ولا يوجدُ مبلغٌ كان يتّسعُ ثمَّ لا يتّسع.
  --
  --     وسِجلُّ ما تغيَّرَ بالضبطِ ليس وعداً هنا: لقطةُ المخطَّطِ فى نفسِ
  --     هذه الدفعة (supabase/schema/schema.sql) تُظهرُ الأعمدةَ الـ226
  --     سطراً سطراً فى فارقِ الإيداع.
  -- ═════════════════════════════════════════════════════════════════════
  FOR r IN SELECT tbl, col, prec FROM _money ORDER BY tbl, col LOOP
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN %I TYPE numeric(%s,4)',
                   r.tbl, r.col, greatest(18, r.prec + 2));
  END LOOP;

  -- ═════════════════════════════════════════════════════════════════════
  -- (6ب) ويعودُ الزنادُ من تعريفِه الملتقَط، بحالتِه وتعليقِه
  -- ═════════════════════════════════════════════════════════════════════
  FOR r IN SELECT * FROM _t_todo LOOP
    EXECUTE r.def;
    IF r.enabled <> 'O' THEN
      EXECUTE format('ALTER TABLE public.%I %s TRIGGER %I', r.tbl,
        CASE r.enabled WHEN 'D' THEN 'DISABLE'
                       WHEN 'R' THEN 'ENABLE REPLICA'
                       WHEN 'A' THEN 'ENABLE ALWAYS'
                       ELSE 'ENABLE' END, r.tgname);
    END IF;
    IF r.cmt <> '' THEN
      EXECUTE format('COMMENT ON TRIGGER %I ON public.%I IS %L', r.tgname, r.tbl, r.cmt);
    END IF;
  END LOOP;

  -- ═════════════════════════════════════════════════════════════════════
  -- (7) إعادةُ البناءِ من التعريفِ الملتقَط، بترتيبٍ يُكتشَفُ بالمحاولة
  -- ═════════════════════════════════════════════════════════════════════
  CREATE TEMP TABLE _v_left ON COMMIT DROP AS SELECT * FROM _v_todo;
  LOOP
    v_pass := v_pass + 1;
    v_progress := false;
    FOR r IN SELECT * FROM _v_left LOOP
      BEGIN
        IF r.relkind = 'm' THEN
          v_sql := format('CREATE MATERIALIZED VIEW public.%I %s AS %s WITH %s DATA',
                     r.relname,
                     CASE WHEN r.opts <> '' THEN 'WITH (' || r.opts || ')' ELSE '' END,
                     r.def,
                     CASE WHEN r.populated THEN '' ELSE 'NO' END);
        ELSE
          v_sql := format('CREATE VIEW public.%I %s AS %s',
                     r.relname,
                     CASE WHEN r.opts <> '' THEN 'WITH (' || r.opts || ')' ELSE '' END,
                     r.def);
        END IF;
        EXECUTE v_sql;
        DELETE FROM _v_left WHERE relname = r.relname;
        v_progress := true;
      EXCEPTION WHEN OTHERS THEN
        v_last_err := SQLERRM;
      END;
    END LOOP;
    SELECT count(*) INTO v_remaining FROM _v_left;
    EXIT WHEN v_remaining = 0;
    IF NOT v_progress THEN
      RAISE EXCEPTION 'VIEW_RESTORE_STUCK: تعذّرت إعادةُ بناءِ % منظوراً. آخرُ خطأ: %', v_remaining, v_last_err;
    END IF;
    IF v_pass > 30 THEN
      RAISE EXCEPTION 'VIEW_RESTORE_PASSES: تجاوزتُ 30 محاولة و% منظوراً باقياً.', v_remaining;
    END IF;
  END LOOP;

  -- ═════════════════════════════════════════════════════════════════════
  -- (8) إعادةُ المالكِ والخياراتِ والصلاحيّاتِ والتعليقاتِ والفهارس
  -- ═════════════════════════════════════════════════════════════════════
  FOR r IN SELECT * FROM _v_todo LOOP
    v_kindword := CASE WHEN r.relkind = 'm' THEN 'MATERIALIZED VIEW' ELSE 'VIEW' END;
    EXECUTE format('ALTER %s public.%I OWNER TO %I', v_kindword, r.relname, r.owner);

    -- المخطَّطُ يمنحُ الجديدَ مِنَحاً افتراضيّةً (ALTER DEFAULT PRIVILEGES)، فيولَدُ
    -- المنظورُ المُعادُ بصلاحيّاتٍ لم تكن له. تُنزَعُ كلُّها أوّلاً، ثمَّ تُعادُ
    -- الصلاحيّةُ الملتقَطةُ وحدَها — فلا يتّسعُ بابٌ باسمِ إصلاحِه.
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC', r.relname);
    FOR g IN SELECT DISTINCT CASE WHEN x.grantee = 0 THEN 'PUBLIC'
                                  ELSE quote_ident(pg_get_userbyid(x.grantee)) END AS grantee
               FROM pg_class c2
               CROSS JOIN LATERAL aclexplode(c2.relacl) x
              WHERE c2.relnamespace = 'public'::regnamespace AND c2.relname = r.relname LOOP
      EXECUTE format('REVOKE ALL ON public.%I FROM %s', r.relname, g.grantee);
    END LOOP;

    FOR g IN SELECT x.privilege_type::text AS priv,
                    CASE WHEN x.grantee = 0 THEN 'PUBLIC'
                         ELSE quote_ident(pg_get_userbyid(x.grantee)) END AS grantee,
                    x.is_grantable AS grantable
               FROM aclexplode(r.acl_eff::aclitem[]) x LOOP
      EXECUTE format('GRANT %s ON public.%I TO %s%s',
        g.priv, r.relname, g.grantee,
        CASE WHEN g.grantable THEN ' WITH GRANT OPTION' ELSE '' END);
    END LOOP;

    IF r.cmt <> '' THEN
      EXECUTE format('COMMENT ON %s public.%I IS %L', v_kindword, r.relname, r.cmt);
    END IF;

    FOR i_def IN SELECT unnest(string_to_array(r.idx, E'\n')) LOOP
      IF i_def IS NOT NULL AND btrim(i_def) <> '' THEN EXECUTE i_def; END IF;
    END LOOP;
  END LOOP;

  FOR g IN SELECT * FROM _v_colgrant LOOP
    EXECUTE format('GRANT %s (%I) ON public.%I TO %s%s',
      g.priv, g.attname, g.relname, g.grantee,
      CASE WHEN g.grantable THEN ' WITH GRANT OPTION' ELSE '' END);
  END LOOP;

  FOR g IN SELECT * FROM _v_colcmt LOOP
    EXECUTE format('COMMENT ON COLUMN public.%I.%I IS %L', g.relname, g.attname, g.cmt);
  END LOOP;

  -- ═════════════════════════════════════════════════════════════════════
  -- (9) القياسُ بعد — والحكمُ: قرشٌ واحدٌ يُلغى كلَّ شىء
  -- ═════════════════════════════════════════════════════════════════════
  CREATE TEMP TABLE _sum_after (tbl text, col text, n_rows bigint, n_notnull bigint, total numeric) ON COMMIT DROP;
  FOR r IN SELECT tbl, col FROM _sum_before ORDER BY tbl, col LOOP
    EXECUTE format(
      'INSERT INTO _sum_after SELECT %L, %L, count(*), count(%I), COALESCE(sum(%I), 0) FROM public.%I',
      r.tbl, r.col, r.col, r.col, r.tbl);
  END LOOP;

  SELECT count(*) INTO v_diff
    FROM _sum_before b
    FULL JOIN _sum_after a ON a.tbl = b.tbl AND a.col = b.col
   WHERE b.tbl IS NULL OR a.tbl IS NULL
      OR b.n_rows <> a.n_rows OR b.n_notnull <> a.n_notnull
      OR b.total <> a.total;
  IF v_diff > 0 THEN
    RAISE EXCEPTION 'MONEY_SUM_CHANGED: اختلفَ % عموداً بينَ القياسِ قبلُ وبعد. تُلغى الهجرةُ بأكملِها.', v_diff;
  END IF;

  -- ═════════════════════════════════════════════════════════════════════
  -- (10) بصمةُ المناظيرِ بعد — لا واحدٌ ضاعَ ولا واحدٌ تبدَّل
  -- ═════════════════════════════════════════════════════════════════════
  CREATE TEMP TABLE _v_after ON COMMIT DROP AS
  SELECT c.relname::text                                       AS relname,
         c.relkind::text                                       AS relkind,
         rtrim(pg_get_viewdef(c.oid, true), E' \n;')           AS def,
         pg_get_userbyid(c.relowner)::text                      AS owner,
         COALESCE(array_to_string(c.reloptions, ', '), '')      AS opts,
         COALESCE(c.relacl, acldefault('r', c.relowner))::text  AS acl_eff,
         (SELECT COALESCE(string_agg(y.g, E'\n' ORDER BY y.g), '')
            FROM (SELECT CASE WHEN x.grantee = 0 THEN 'PUBLIC'
                              ELSE pg_get_userbyid(x.grantee) END || ':' || x.privilege_type ||
                         CASE WHEN x.is_grantable THEN '*' ELSE '' END AS g
                    FROM aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) x) y) AS acl,
         COALESCE(obj_description(c.oid, 'pg_class'), '')       AS cmt,
         c.relispopulated                                       AS populated,
         (SELECT COALESCE(string_agg(a.attname || '|' ||
                   COALESCE((SELECT string_agg(z.g, ',' ORDER BY z.g)
                               FROM (SELECT CASE WHEN x.grantee = 0 THEN 'PUBLIC'
                                                 ELSE pg_get_userbyid(x.grantee) END || ':' || x.privilege_type AS g
                                       FROM aclexplode(a.attacl) x) z), '') || '|' ||
                   COALESCE(col_description(c.oid, a.attnum), ''),
                   E'\n' ORDER BY a.attnum), '')
            FROM pg_attribute a
           WHERE a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped) AS cols,
         (SELECT COALESCE(string_agg(pg_get_indexdef(ix.indexrelid),
                   E'\n' ORDER BY pg_get_indexdef(ix.indexrelid)), '')
            FROM pg_index ix WHERE ix.indrelid = c.oid)         AS idx
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind IN ('v', 'm');

  SELECT count(*), string_agg(x, '  ||  ')
    INTO v_diff, v_detail
    FROM (
      SELECT COALESCE(b.relname, a.relname) || ' [' ||
             concat_ws(',',
               CASE WHEN b.relname IS NULL THEN 'ظهرَ من العدم' END,
               CASE WHEN a.relname IS NULL THEN 'اختفى' END,
               CASE WHEN b.def       IS DISTINCT FROM a.def       THEN 'التعريف' END,
               CASE WHEN b.owner     IS DISTINCT FROM a.owner     THEN 'المالك:' || COALESCE(b.owner,'-') || '>' || COALESCE(a.owner,'-') END,
               CASE WHEN b.opts      IS DISTINCT FROM a.opts      THEN 'الخيارات:' || COALESCE(b.opts,'-') || '>' || COALESCE(a.opts,'-') END,
               CASE WHEN b.acl       IS DISTINCT FROM a.acl       THEN 'الصلاحيّات:' || left(COALESCE(b.acl,'-'),160) || '>' || left(COALESCE(a.acl,'-'),160) END,
               CASE WHEN b.cmt       IS DISTINCT FROM a.cmt       THEN 'التعليق' END,
               CASE WHEN b.populated IS DISTINCT FROM a.populated THEN 'الامتلاء' END,
               CASE WHEN b.cols      IS DISTINCT FROM a.cols      THEN 'الأعمدة:' || left(COALESCE(b.cols,'-'),160) || '>' || left(COALESCE(a.cols,'-'),160) END,
               CASE WHEN b.idx       IS DISTINCT FROM a.idx       THEN 'الفهارس' END) || ']' AS x
        FROM _v_before b
        FULL JOIN _v_after a ON a.relname = b.relname
       WHERE b.relname IS NULL OR a.relname IS NULL
          OR (b.def, b.owner, b.opts, b.acl, b.cmt, b.populated, b.cols, b.idx)
             IS DISTINCT FROM
             (a.def, a.owner, a.opts, a.acl, a.cmt, a.populated, a.cols, a.idx)
       LIMIT 5
    ) q;
  IF v_diff > 0 THEN
    RAISE EXCEPTION 'VIEW_FINGERPRINT_CHANGED: % منظوراً اختلفت بصمتُه. تُلغى الهجرةُ بأكملِها. التفصيل: %', v_diff, v_detail;
  END IF;

  -- ═════════════════════════════════════════════════════════════════════
  -- (10ب) وبصمةُ الزنادِ بعد — لا زنادَ ضاعَ ولا تبدَّلَ ولا نامَ
  -- ═════════════════════════════════════════════════════════════════════
  CREATE TEMP TABLE _t_after ON COMMIT DROP AS
  SELECT t.tgname::text                                 AS tgname,
         cl.relname::text                               AS tbl,
         pg_get_triggerdef(t.oid, true)                 AS def,
         t.tgenabled::text                              AS enabled,
         COALESCE(obj_description(t.oid, 'pg_trigger'), '') AS cmt
    FROM pg_trigger t
    JOIN pg_class cl ON cl.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = cl.relnamespace AND n.nspname = 'public'
   WHERE NOT t.tgisinternal;

  SELECT count(*), string_agg(x, '  ||  ')
    INTO v_diff, v_detail
    FROM (
      SELECT COALESCE(b.tbl, a.tbl) || '.' || COALESCE(b.tgname, a.tgname) || ' [' ||
             concat_ws(',',
               CASE WHEN b.tgname IS NULL THEN 'ظهرَ من العدم' END,
               CASE WHEN a.tgname IS NULL THEN 'اختفى' END,
               CASE WHEN b.def     IS DISTINCT FROM a.def     THEN 'التعريف' END,
               CASE WHEN b.enabled IS DISTINCT FROM a.enabled THEN 'الحالة:' || COALESCE(b.enabled,'-') || '>' || COALESCE(a.enabled,'-') END,
               CASE WHEN b.cmt     IS DISTINCT FROM a.cmt     THEN 'التعليق' END) || ']' AS x
        FROM _t_before b
        FULL JOIN _t_after a ON a.tgname = b.tgname AND a.tbl = b.tbl
       WHERE b.tgname IS NULL OR a.tgname IS NULL
          OR (b.def, b.enabled, b.cmt) IS DISTINCT FROM (a.def, a.enabled, a.cmt)
       LIMIT 5
    ) q;
  IF v_diff > 0 THEN
    RAISE EXCEPTION 'TRIGGER_FINGERPRINT_CHANGED: % زناداً اختلفت بصمتُه. تُلغى الهجرةُ بأكملِها. التفصيل: %', v_diff, v_detail;
  END IF;

  -- ═════════════════════════════════════════════════════════════════════
  -- (11) ولا يبقى عمودُ مالٍ بخانتَين
  -- ═════════════════════════════════════════════════════════════════════
  SELECT count(*) INTO v_n
    FROM pg_attribute a
    JOIN pg_class cl ON cl.oid = a.attrelid AND cl.relkind = 'r'
    JOIN pg_namespace n ON n.oid = cl.relnamespace AND n.nspname = 'public'
   WHERE a.attnum > 0 AND NOT a.attisdropped
     AND a.atttypid = 'numeric'::regtype AND a.atttypmod > 0
     AND ((a.atttypmod - 4) & 65535) = 2
     AND NOT (a.attname ~ 'percent|hours|minutes|quantity' OR a.attname ~ '_rate$' OR a.attname = 'bonus_points_per_value');
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'MONEY_STILL_NARROW: بقىَ % عمودَ مالٍ بخانتَين.', v_n;
  END IF;

  RAISE NOTICE 'تمّ: 226 عمودَ مالٍ اتّسعَ إلى أربعِ خانات، والمجاميعُ كما هى، والمناظيرُ والزنادُ كما كانت.';
END
$mig$;
