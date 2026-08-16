-- ═══════════════════════════════════════════════════════════════════════════
-- v3.75.41 — «ووسائطُ مخترَعةٌ تُخفى ما يُسلَّم»
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ═══ لماذا لم تُكشَفْ هذه الأبوابُ فى v3.75.40 ═══
--
-- الدفعةُ السابقةُ نادت الأبوابَ التى يكفيها **رقمُ الشركةِ وحدَه**. وما احتاجَ
-- وسيطاً ثانياً — عميلاً أو حساباً أو مخزناً أو موظّفاً — لم يُنادَ أصلاً، أو
-- نودِىَ بوسيطٍ مخترَعٍ فردَّ فارغاً **فبدا برىئاً وهو ليس كذلك**.
--
-- **فالوسائطُ هنا مأخوذةٌ من بياناتِ الشركةِ المسؤولِ عنها نفسِها**: عميلُها
-- وحسابُها ومخزنُها ومنتجُها وفاتورتُها وموظّفُها ومستخدِمُها — تُقرأُ من
-- القاعدةِ لحظةَ التشغيل. **وردٌّ فارغٌ عن سؤالٍ خاطئٍ ليس براءة.**
--
-- ═══ ما سُلِّم للغريب — نداءٌ حىٌّ على الإنتاج داخلَ معاملةٍ أُلغيت ═══
--
--   get_closing_preview .................  معاينةُ إقفالِ سنةٍ كاملة: صافى الدخل
--   can_close_accounting_year ...........  «لا يمكن الإقفال: ١ مشكلة حرجة» عن دفترِ غيرِه
--   get_journal_entry_id_for_bill_receipt  رقمُ قيدِ استلامِ فاتورةِ مورِّدِها
--   check_bill_quantities ...............  بنودُ فاتورةِ مورِّدٍ برسائلِها
--   get_effective_available_stock .......  ١٧٨ وحدةً من منتجِها فى مخزنِها
--   preview_next_product_sku ............  رمزُ فرعِها وتسلسلُ منتجاتِها
--   get_employee_available_commission ...  عمولةُ موظّفٍ بعينِه
--   get_employee_commission_summary… ....  ملخّصُ عمولتِه للرواتب
--   get_user_notifications ..............  عشرةُ صفوفٍ من إشعاراتِها
--   get_unread_notification_count .......  تسعةٌ وتسعون
--   get_user_dependencies ...............  فواتيرُها وعملاؤها ومورِّدوها عدداً
--   get_user_record_counts ..............  نفسُ العائلة
--   get_user_approval_badges ............  شاراتُ اعتمادِ مستخدِمٍ فيها
--   check_user_role .....................  نعم، هذا المستخدِمُ مالكٌ هناك
--   check_user_access_to_record (صيغتان)   حكمُ الصلاحيّةِ كاملاً عن مستخدِمٍ أجنبىّ
--
-- **وحمايةُ الصفوفِ صامدةٌ طَوالَ ذلك**: الشخصُ نفسُه لا يرى من تلك الشركةِ صفّاً
-- واحداً إن سألَ الجداولَ مباشرةً. الدالّةُ وحدَها تمرُّ من فوقِها.
--
-- ═══ وستُّ أبوابٍ تُؤجَّلُ عمداً ═══
--
-- erp_is_company_owner · erp_is_company_senior · erp_payment_privileged ·
-- erp_creator_needs_no_approval · expense_actor_may_approve · company_role_has_holder
--
-- كلُّهنّ يُسلِّمْنَ هيكلَ صلاحيّاتِ شركةٍ أجنبيّة، **لكنّهنّ يُنادَينَ من داخلِ
-- مُشغِّلاتٍ حيّة** (حارسُ فصلِ المهامّ · توجيهُ الإشعارِ إلى شخص · إعفاءُ مُنشئِ
-- طلبِ الصرف). وقفلٌ فى طريقِ مُشغِّلٍ لا يُبرهَنُ بقراءة، **بل بكتابةٍ حيّةٍ
-- تُلغى** — وتلك دفعةٌ قائمةٌ بذاتِها. **ونصفُ جراحةٍ أسوأُ من لا جراحة.**
--
-- ═══ وبابان لم يعملا قطُّ ═══
--
--   get_gl_transactions_paginated ..  42P01  missing FROM-clause entry for table "jel"
--   get_user_display_currency ......  42703  column "currency" does not exist
--
-- جُرّبا على شركةِ صاحبِ العملِ نفسِه فسقطا كذلك — **فالعطبُ فيهما لا فى السائل**.
-- والأوّلُ موصولٌ بمسارٍ حىّ (`/api/general-ledger` عند طلبِ دفترِ حسابٍ واحدٍ
-- بصفحات)، وللمسارِ خطّةُ تراجعٍ تعملُ **حين تكونُ الدالّةُ غائبة** لا حين تكونُ
-- معطوبة. **فحذفُها يُشغِّلُ خطّةَ التراجعِ فيعملُ المسارُ الذى كان يعطبُ اليوم**
-- — والإزالةُ هنا إصلاحٌ لا هدم. وبيتٌ لا يُسكَنُ ليس بيتاً.
--
-- ═══ ونصُّ الاستعلامِ لا يُمَسُّ حرفاً ═══
--
-- الستَّ عشرةَ وُلدت آليّاً من مرآةِ الدوالِّ بإدراجِ **سطرٍ واحدٍ** بعدَ BEGIN
-- الخارجىِّ لا غير، **وبُرهنَ لكلِّ واحدةٍ أنّ نزعَ ذلك السطرِ يُعيدُ الأصلَ حرفاً
-- بحرف**. واثنتانِ كانتا بلغةِ sql التى لا تعرفُ PERFORM فحُوِّلتا، ونصُّ
-- استعلامِهما كما هو.
--
-- ═══ والبرهانُ ثلاثىُّ الاتّجاه ═══
--
-- تقيسُ الهجرةُ قبلَ الجراحةِ ثمّ تقارنُ بما بعدَها، وترفضُ نفسَها إن:
--   (أ) نقصَ صفٌّ أو تغيّرَ حرفٌ ممّا كان يراه صاحبُ الشركةِ نفسُه؛
--   (ب) أو مرَّ الغريبُ من بابٍ واحدٍ من الستَّةَ عشر؛
--   (ج) أو انقطعَ طريقُ الخادم؛
--   (د) أو وُجد فى القاعدةِ مُنادٍ للبابَينِ المحذوفَين.
-- **ولا يُقاسُ الأثرُ بعدَ الحدثِ وحدَه**، **وما لا يُنادَى لا يُقاس** فيُجمَعُ
-- النصُّ ليُجبَرَ النداءُ ويُقارَنَ المحتوى لا العددُ وحدَه.
--
-- وتختارُ الهجرةُ موضوعاتِها **من القاعدةِ نفسِها**: أعمرَ البيوتِ دفتراً، ومنه
-- عميلاً وحساباً ومخزناً ومنتجاً وفاتورةً وموظّفاً. وإن لم تجدْ، **قالت ذلك
-- صراحةً ولم تدّعِ برهاناً**.
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- ١ · قياسٌ قبلَ اللمس — بوسائطَ من القاعدةِ لا من الخيال
-- ───────────────────────────────────────────────────────────────────────────
DO $before$
DECLARE
  v_own uuid; v_uid uuid; v_foreign uuid;
  v_bill uuid; v_wh uuid; v_prod uuid; v_branch uuid; v_emp uuid;
  v_year int := EXTRACT(YEAR FROM CURRENT_DATE)::int;
  v_month int := EXTRACT(MONTH FROM CURRENT_DATE)::int;
  v_calls text[]; v_c text; v_rows int; v_sig text; v_acc text := '';
BEGIN
  -- **وبيتٌ لا يُسكَنُ ليس بيتاً**: أعمرُ البيوتِ دفتراً، من القاعدةِ لا من اسمٍ مكتوب.
  SELECT cm.company_id, cm.user_id INTO v_own, v_uid
  FROM public.company_members cm JOIN public.companies c ON c.id = cm.company_id
  WHERE cm.user_id IS NOT NULL
  ORDER BY (SELECT count(*) FROM public.journal_entries je WHERE je.company_id = cm.company_id) DESC,
           cm.company_id, cm.user_id
  LIMIT 1;

  IF v_own IS NULL THEN
    PERFORM set_config('erb.v41_subjects', 'none', false);
    RAISE NOTICE 'v3.75.41: no membership in this house - the locks are planted and no live proof is claimed.';
    RETURN;
  END IF;

  SELECT c.id INTO v_foreign FROM public.companies c
  WHERE c.id <> v_own AND (c.user_id IS DISTINCT FROM v_uid)
    AND NOT EXISTS (SELECT 1 FROM public.company_members m WHERE m.company_id = c.id AND m.user_id = v_uid)
  ORDER BY (SELECT count(*) FROM public.journal_entries je WHERE je.company_id = c.id) DESC, c.id
  LIMIT 1;

  SELECT x.id INTO v_bill   FROM public.bills x      WHERE x.company_id = v_own LIMIT 1;
  SELECT x.id INTO v_wh     FROM public.warehouses x WHERE x.company_id = v_own LIMIT 1;
  SELECT x.id INTO v_prod   FROM public.products x   WHERE x.company_id = v_own LIMIT 1;
  SELECT x.id INTO v_branch FROM public.branches x   WHERE x.company_id = v_own LIMIT 1;
  SELECT x.id INTO v_emp    FROM public.employees x  WHERE x.company_id = v_own LIMIT 1;

  v_calls := ARRAY[
    format('get_closing_preview($1, %s)', v_year),
    format('can_close_accounting_year($1, %s)', v_year),
    format('check_bill_quantities(%L::uuid, NULL::uuid, $1)', v_bill),
    format('get_effective_available_stock($1, %L::uuid, %L::uuid)', v_wh, v_prod),
    format('preview_next_product_sku($1, %L::uuid, %L, %L)', v_branch, 'product', 'physical'),
    format('get_employee_available_commission($1, %L::uuid)', v_emp),
    format('get_employee_commission_summary_for_payroll($1, %L::uuid, %s, %s)', v_emp, v_year, v_month),
    format('get_user_notifications(%L::uuid, $1)', v_uid),
    format('get_unread_notification_count(%L::uuid, $1)', v_uid),
    format('get_user_dependencies($1, %L::uuid)', v_uid),
    format('get_user_record_counts($1, %L::uuid)', v_uid),
    format('get_user_approval_badges(%L::uuid, $1)', v_uid),
    format('check_user_role($1, %L::uuid, ARRAY[%L])', v_uid, 'owner'),
    format('check_user_access_to_record(p_user_id => %L::uuid, p_company_id => $1, p_resource_type => %L, p_record_owner_id => %L::uuid)', v_uid, 'invoices', v_uid),
    format('check_user_access_to_record(p_user_id => %L::uuid, p_company_id => $1, p_resource_type => %L, p_record_created_by => %L::uuid, p_record_branch_id => NULL::uuid)', v_uid, 'invoices', v_uid),
    format('get_journal_entry_id_for_bill_receipt($1, %L::uuid)', v_bill)
  ];

  PERFORM set_config('erb.v41_own', v_own::text, false);
  PERFORM set_config('erb.v41_uid', v_uid::text, false);
  PERFORM set_config('erb.v41_foreign', coalesce(v_foreign::text, ''), false);
  PERFORM set_config('erb.v41_calls', array_to_string(v_calls, E'\n'), false);
  PERFORM set_config('erb.v41_subjects', CASE WHEN v_foreign IS NULL THEN 'own_only' ELSE 'both' END, false);

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_uid::text, 'role', 'authenticated')::text, true);

  FOREACH v_c IN ARRAY v_calls LOOP
    EXECUTE format(
      'SELECT count(*), md5(coalesce(string_agg(t.x::text, ''|'' ORDER BY t.x::text), '''')) FROM (SELECT public.%s AS x) t',
      v_c) INTO v_rows, v_sig USING v_own;
    v_acc := v_acc || split_part(v_c, '(', 1) || '=' || v_rows || '/' || v_sig || ';';
  END LOOP;

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM set_config('erb.v41_before', v_acc, false);
  RAISE NOTICE 'v3.75.41 BEFORE: %', v_acc;
END
$before$;

-- ───────────────────────────────────────────────────────────────────────────
-- ٢ · ستَّ عشرةَ قفلاً — والقاعدةُ هى التى تُدرِجُ السطر
-- ───────────────────────────────────────────────────────────────────────────
-- **ولا تُنسَخُ أجسادٌ باليد.** فى v3.75.40 نُسخت أربعَ عشرةَ دالّةً حرفاً بحرف،
-- وانحرفَ نصُّ الترويسةِ خمسةً وعشرينَ حرفاً عمّا طُبِّق — أُمسك بمقارنةِ البصمات،
-- لكنّه كان يمكنُ ألّا يُمسَك. **والعلاجُ أن يُنزَعَ النسخُ من يدِ الناسخ**:
-- القاعدةُ تقرأُ جسدَها الحىَّ، وتُدرِجُ سطراً واحداً بعدَ BEGIN الخارجىِّ،
-- وتُعيدُ كتابةَ الدالّةِ بنفسِها. **فلا انحرافَ ممكنٌ أصلاً، لا مُمسَكٌ به.**
--
-- ويُبرهَنُ ذلك هنا لا يُدَّعى: بعدَ الإدراجِ يُنزَعُ السطرُ من الجسدِ الجديدِ
-- **فيجبُ أن يعودَ الأصلُ حرفاً بحرف** — وإلّا سقطت الهجرةُ كلُّها.
--
-- والأجسادُ الناتجةُ ليست مخفيّة: مرآةُ الدوالِّ `supabase/schema/functions.sql`
-- تُعادُ كتابتُها فى كلِّ إصدار، وحارسٌ يقارنُها بالقاعدةِ جسداً بجسد.
DO $inject$
DECLARE
  k_doors text[] := ARRAY[
    'public.get_closing_preview(uuid,integer)',
    'public.can_close_accounting_year(uuid,integer)',
    'public.check_bill_quantities(uuid,uuid,uuid)',
    'public.get_effective_available_stock(uuid,uuid,uuid)',
    'public.preview_next_product_sku(uuid,uuid,text,text)',
    'public.get_employee_available_commission(uuid,uuid,date,date)',
    'public.get_employee_commission_summary_for_payroll(uuid,uuid,integer,integer,uuid)',
    'public.get_user_notifications(uuid,uuid,uuid,uuid,character varying,character varying,character varying,text,character varying,character varying)',
    'public.get_unread_notification_count(uuid,uuid,uuid,uuid)',
    'public.get_user_dependencies(uuid,uuid)',
    'public.get_user_approval_badges(uuid,uuid)',
    'public.check_user_role(uuid,uuid,text[])',
    'public.check_user_access_to_record(uuid,uuid,text,uuid)',
    'public.check_user_access_to_record(uuid,uuid,text,uuid,uuid)'
  ];
  k_gate constant text := '  PERFORM public.assert_company_access(p_company_id);';
  v_sig text; v_oid oid; v_old text; v_new text; v_body_old text; v_body_new text;
  v_lines text[]; v_i int; v_begin int; v_done int := 0; v_skip int := 0;
BEGIN
  FOREACH v_sig IN ARRAY k_doors LOOP
    v_oid := v_sig::regprocedure::oid;   -- **والاسمُ يُحَلُّ لا يُصدَّق**: توقيعٌ لا وجودَ له يُسقِطُ الهجرة
    v_old := pg_get_functiondef(v_oid);

    IF v_old ~ '\massert_company_access\M' THEN
      v_skip := v_skip + 1;
      CONTINUE;                          -- مقفولٌ سلفاً: الهجرةُ تُعادُ بلا ضرر
    END IF;

    IF v_old !~ '\mSECURITY DEFINER\M' THEN
      RAISE EXCEPTION 'v3.75.41: % is not SECURITY DEFINER - it is guarded by row security, not by this lock.', v_sig;
    END IF;

    v_body_old := substring(v_old from 'AS \$function\$([\s\S]*)\$function\$');
    IF v_body_old IS NULL THEN
      RAISE EXCEPTION 'v3.75.41: cannot read the body of %', v_sig;
    END IF;

    -- **BEGIN الخارجىُّ وحدَه**: أوّلُ سطرٍ لا يحملُ إلّا BEGIN.
    v_lines := string_to_array(v_body_old, E'\n');
    v_begin := 0;
    FOR v_i IN 1 .. array_length(v_lines, 1) LOOP
      IF btrim(replace(v_lines[v_i], E'\r', '')) = 'BEGIN' THEN v_begin := v_i; EXIT; END IF;
    END LOOP;
    IF v_begin = 0 THEN
      RAISE EXCEPTION 'v3.75.41: no outermost BEGIN on its own line in % - refusing to guess.', v_sig;
    END IF;

    v_body_new := array_to_string(
      v_lines[1:v_begin] || ARRAY[k_gate] || v_lines[v_begin+1:array_length(v_lines,1)], E'\n');

    -- **والبرهان**: انزعِ السطرَ المُدرَجَ فيعودُ الأصلُ حرفاً بحرف.
    IF array_to_string(
         (string_to_array(v_body_new, E'\n'))[1:v_begin] ||
         (string_to_array(v_body_new, E'\n'))[v_begin+2:array_length(string_to_array(v_body_new, E'\n'),1)],
         E'\n') IS DISTINCT FROM v_body_old THEN
      RAISE EXCEPTION 'v3.75.41: the insertion changed more than one line in % - refusing.', v_sig;
    END IF;

    v_new := replace(v_old, 'AS $function$' || v_body_old || '$function$',
                            'AS $function$' || v_body_new || '$function$');
    IF v_new = v_old THEN
      RAISE EXCEPTION 'v3.75.41: could not rewrite %', v_sig;
    END IF;

    EXECUTE v_new;
    v_done := v_done + 1;
  END LOOP;

  IF v_done + v_skip <> array_length(k_doors, 1) THEN
    RAISE EXCEPTION 'v3.75.41: % of % doors were neither locked nor already locked.',
      array_length(k_doors,1) - v_done - v_skip, array_length(k_doors,1);
  END IF;
  RAISE NOTICE 'v3.75.41: % door(s) locked by insertion, % already locked.', v_done, v_skip;
END
$inject$;

-- ── واثنتانِ بلغةِ sql لا تعرفُ PERFORM، فتُحوَّلانِ — ونصُّ استعلامِهما كما هو ──

CREATE OR REPLACE FUNCTION public.get_journal_entry_id_for_bill_receipt(p_company_id uuid, p_bill_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.assert_company_access(p_company_id);
  RETURN (
  SELECT je.id
  FROM public.journal_entries je
  WHERE je.company_id = p_company_id
    AND je.reference_id = p_bill_id
  ORDER BY je.created_at DESC NULLS LAST
  LIMIT 1
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_user_record_counts(p_company_id uuid, p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.assert_company_access(p_company_id);
  RETURN (
  SELECT jsonb_build_object(
    'customers',
      (SELECT count(*)::int FROM public.customers
       WHERE company_id = p_company_id AND created_by_user_id = p_user_id),
    'estimates',
      (SELECT count(*)::int FROM public.estimates
       WHERE company_id = p_company_id AND created_by_user_id = p_user_id),
    'sales_orders',
      (SELECT count(*)::int FROM public.sales_orders
       WHERE company_id = p_company_id AND created_by_user_id = p_user_id),
    'bookings',
      (SELECT count(*)::int FROM public.bookings
       WHERE company_id = p_company_id AND created_by_user_id = p_user_id)
  )
  );
END;
$function$;

-- ───────────────────────────────────────────────────────────────────────────
-- ٣ · بابان لم يعملا قطُّ — ولا يُهدَمُ بيتٌ يسكنُه أحد
-- ───────────────────────────────────────────────────────────────────────────
DO $sweep$
DECLARE
  k_dead text[] := ARRAY['get_gl_transactions_paginated', 'get_user_display_currency'];
  v_ref text := '';
BEGIN
  SELECT string_agg(DISTINCT q.place, ' ') INTO v_ref
  FROM (
    SELECT 'function:' || p.proname AS place, p.prosrc AS txt
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname NOT LIKE 'assert_baseline_%'
        AND p.proname <> ALL(k_dead)
    UNION ALL
    SELECT 'view:' || c.relname, pg_get_viewdef(c.oid)
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind IN ('v','m')
    UNION ALL
    SELECT 'policy:' || c.relname || '.' || po.polname,
           coalesce(pg_get_expr(po.polqual, po.polrelid),'') || ' ' || coalesce(pg_get_expr(po.polwithcheck, po.polrelid),'')
      FROM pg_policy po JOIN pg_class c ON c.oid = po.polrelid
    UNION ALL
    SELECT 'default:' || c.relname || '.' || a.attname, pg_get_expr(d.adbin, d.adrelid)
      FROM pg_attrdef d JOIN pg_class c ON c.oid = d.adrelid
      JOIN pg_attribute a ON a.attrelid = d.adrelid AND a.attnum = d.adnum
      JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public'
    UNION ALL
    SELECT 'constraint:' || conname, pg_get_constraintdef(oid) FROM pg_constraint
    UNION ALL
    SELECT 'cron:' || jobname, command FROM cron.job
  ) q
  WHERE q.txt ~ ('(^|[^A-Za-z0-9_])(public\.)?(' || array_to_string(k_dead, '|') || ')\s*\(');

  IF v_ref IS NOT NULL AND v_ref <> '' THEN
    RAISE EXCEPTION 'v3.75.41: a place still calls a dead door, so nothing is dropped: %', v_ref;
  END IF;
END
$sweep$;

DROP FUNCTION IF EXISTS public.get_gl_transactions_paginated(uuid, uuid, date, date, integer, integer);
DROP FUNCTION IF EXISTS public.get_user_display_currency(uuid, uuid);

-- ───────────────────────────────────────────────────────────────────────────
-- ٤ · البرهانُ ثلاثىُّ الاتّجاه
-- ───────────────────────────────────────────────────────────────────────────
DO $proof$
DECLARE
  k_probe constant text := 'SELECT count(*), md5(coalesce(string_agg(t.x::text, ''|'' ORDER BY t.x::text), '''')) FROM (SELECT public.%s AS x) t';
  v_subjects text := current_setting('erb.v41_subjects', true);
  v_own uuid; v_uid uuid; v_foreign uuid; v_before text;
  v_calls text[]; v_c text; v_rows int; v_sig text; v_acc text := ''; v_passed text := '';
  v_gone int;
BEGIN
  -- (د) البابانِ الميّتانِ ذهبا فعلاً
  SELECT count(*) INTO v_gone FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname IN ('get_gl_transactions_paginated', 'get_user_display_currency');
  IF v_gone <> 0 THEN
    RAISE EXCEPTION 'v3.75.41 (د): a dead door survived the drop (% left).', v_gone;
  END IF;

  IF v_subjects IS NULL OR v_subjects = 'none' THEN
    RAISE NOTICE 'v3.75.41: no live subject in this house - the locks are planted and no live proof is claimed.';
    RETURN;
  END IF;

  v_own     := current_setting('erb.v41_own')::uuid;
  v_uid     := current_setting('erb.v41_uid')::uuid;
  v_before  := current_setting('erb.v41_before');
  v_foreign := NULLIF(current_setting('erb.v41_foreign'), '')::uuid;
  v_calls   := string_to_array(current_setting('erb.v41_calls'), E'\n');

  -- (ج) طريقُ الخادم: لا هُويّةَ مستخدِمٍ، فلا سؤالَ ولا قطع.
  FOREACH v_c IN ARRAY v_calls LOOP
    BEGIN
      EXECUTE format(k_probe, v_c) INTO v_rows, v_sig USING v_own;
    EXCEPTION WHEN query_canceled THEN
      RAISE EXCEPTION 'v3.75.41 (ج): the server path was cut at %', v_c;
    END;
  END LOOP;

  -- (أ) صاحبُ الشركةِ نفسُه: لا صفَّ نقص ولا حرفَ تغيّر.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_uid::text, 'role', 'authenticated')::text, true);

  FOREACH v_c IN ARRAY v_calls LOOP
    EXECUTE format(k_probe, v_c) INTO v_rows, v_sig USING v_own;
    v_acc := v_acc || split_part(v_c, '(', 1) || '=' || v_rows || '/' || v_sig || ';';
  END LOOP;

  IF v_acc IS DISTINCT FROM v_before THEN
    RESET ROLE;
    RAISE EXCEPTION 'v3.75.41 (أ): the owner lost something after the lock. before[%] after[%]', v_before, v_acc;
  END IF;

  -- (ب) الغريبُ يُرفَضُ من كلِّ بابٍ من الستَّةَ عشر.
  IF v_foreign IS NOT NULL THEN
    FOREACH v_c IN ARRAY v_calls LOOP
      BEGIN
        EXECUTE format(k_probe, v_c) INTO v_rows, v_sig USING v_foreign;
        v_passed := v_passed || split_part(v_c, '(', 1) || ' ';
      EXCEPTION WHEN query_canceled THEN
        NULL;
      END;
    END LOOP;

    IF v_passed <> '' THEN
      RESET ROLE;
      RAISE EXCEPTION 'v3.75.41 (ب): the stranger still passes into: %', v_passed;
    END IF;
  END IF;

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
  RAISE NOTICE 'v3.75.41 PROOF ok: owner unchanged - stranger refused everywhere - server path open - 2 dead doors gone. foreign=%',
               coalesce(v_foreign::text, '<none found>');
END
$proof$;

-- ───────────────────────────────────────────────────────────────────────────
-- ٥ · الفحصُ المرجعىّ
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.assert_baseline_v3_75_41_check()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $check$
DECLARE
  k_locked text[] := ARRAY[
    'get_closing_preview(uuid,integer)',
    'can_close_accounting_year(uuid,integer)',
    'check_bill_quantities(uuid,uuid,uuid)',
    'get_effective_available_stock(uuid,uuid,uuid)',
    'preview_next_product_sku(uuid,uuid,text,text)',
    'get_employee_available_commission(uuid,uuid,date,date)',
    'get_employee_commission_summary_for_payroll(uuid,uuid,integer,integer,uuid)',
    'get_unread_notification_count(uuid,uuid,uuid,uuid)',
    'get_user_dependencies(uuid,uuid)',
    'get_user_record_counts(uuid,uuid)',
    'get_user_approval_badges(uuid,uuid)',
    'check_user_role(uuid,uuid,text[])',
    'check_user_access_to_record(uuid,uuid,text,uuid)',
    'check_user_access_to_record(uuid,uuid,text,uuid,uuid)',
    'get_journal_entry_id_for_bill_receipt(uuid,uuid)'
  ];
  k_dead text[] := ARRAY['get_gl_transactions_paginated', 'get_user_display_currency'];
  v_missing text := ''; v_back text := ''; v_held int;
BEGIN
  -- (١) كلُّ بابٍ مقفولٍ لا يزالُ بصلاحيّاتٍ كاملةٍ ولا يزالُ يسألُ البيتَ الواحد
  SELECT string_agg(k, ' ') INTO v_missing
  FROM unnest(k_locked) AS k
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND replace(p.oid::regprocedure::text, 'public.', '') = k
      AND p.prosecdef
      AND p.prosrc ~ '\massert_company_access\M'
  );
  IF v_missing IS NOT NULL AND v_missing <> '' THEN
    RAISE EXCEPTION 'v3.75.41 (1): a door lost its lock or its full rights: %', v_missing;
  END IF;

  -- والسادسةَ عشرةَ يُسمّيها اسمُها وحدَه (عشرةُ وسائطَ لا تُكتَبُ هنا)
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'get_user_notifications'
      AND p.prosecdef AND p.prosrc ~ '\massert_company_access\M'
  ) THEN
    RAISE EXCEPTION 'v3.75.41 (1b): get_user_notifications lost its lock or its full rights.';
  END IF;

  -- (٢) والبابانِ الميّتانِ لم يُبعَثا
  SELECT string_agg(DISTINCT p.proname, ' ') INTO v_back
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = ANY(k_dead);
  IF v_back IS NOT NULL AND v_back <> '' THEN
    RAISE EXCEPTION 'v3.75.41 (2): a door that never worked was born again: %', v_back;
  END IF;

  -- (٣) ولا مكانَ فى القاعدةِ ينادى ميّتاً
  SELECT string_agg(DISTINCT q.place, ' ') INTO v_back
  FROM (
    SELECT 'function:' || p.proname AS place, p.prosrc AS txt
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname NOT LIKE 'assert_baseline_%'
    UNION ALL
    SELECT 'view:' || c.relname, pg_get_viewdef(c.oid)
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind IN ('v','m')
  ) q
  WHERE q.txt ~ ('(^|[^A-Za-z0-9_])(public\.)?(' || array_to_string(k_dead, '|') || ')\s*\(');
  IF v_back IS NOT NULL AND v_back <> '' THEN
    RAISE EXCEPTION 'v3.75.41 (3): a place still calls a dead door: %', v_back;
  END IF;

  -- معدودٌ لا مسكوتٌ عنه: الستُّ المؤجَّلاتُ ما زلن بلا قفل، ولا يُسكَتُ عنهنّ
  SELECT count(*) INTO v_held
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN ('erp_is_company_owner','erp_is_company_senior','erp_payment_privileged',
                      'erp_creator_needs_no_approval','expense_actor_may_approve','company_role_has_holder')
    AND p.prosecdef AND p.prosrc !~ '\massert_company_access\M';

  RETURN format('v3.75.41 ok - 16 measured doors locked - 2 doors that never worked are gone - %s trigger-called permission oracle(s) still open, held for a batch proven by a live write (counted, not silenced).', v_held);
END
$check$;

REVOKE ALL ON FUNCTION public.assert_baseline_v3_75_41_check() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assert_baseline_v3_75_41_check() TO service_role;

SELECT public.assert_baseline_v3_75_39_check();
SELECT public.assert_baseline_v3_75_40_check();
SELECT public.assert_baseline_v3_75_41_check();
