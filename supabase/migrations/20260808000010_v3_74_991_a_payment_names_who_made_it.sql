-- =============================================================================
-- v3.74.991 — دفعةٌ لا تقول من صنعها
-- =============================================================================
-- اثنتا عشرة دفعةَ تحصيلٍ من العملاء (٢٠٬٢٠٨٫٧٩ مجموعُ الثلاثة والعشرين)
-- **لا منشئَ لها ولا معتمِد**. وقِيس قبل أن يُكتب حرف: **الحقيقةُ مسجَّلةٌ فى
-- مكانٍ آخر** — سجلُّ التدقيق يحمل لإحدى عشرةَ منها فاعلاً **واحداً لا ثانىَ
-- له**: مالكُ الشركة نفسُه.
--
-- والثانيةَ عشرة صفُّ إبطالٍ (−١٥٠٠) **لا فاعلَ له فى السجلّ إطلاقاً**، وهو
-- مُعلَّمٌ بأنّه يُبطل صفّاً آخر. **فلا يُملأ — ولا أحكم بلا مقياس.**
--
-- ═══ والجذر: ثلاثةُ بيوتٍ لعملٍ واحد، اثنان منها ينسيان الفاعل ═══
--
-- ثلاثُ دوالَّ تُدرج دفعةَ عميل:
--   • `process_invoice_payment_atomic`        (١٣ وسيطاً) — **لا تسمّى الفاعل**
--   • `process_invoice_payment_atomic_v2`     (١٥ وسيطاً) — **لا تسمّى الفاعل**
--   • `process_invoice_payment_atomic_v2`     (٢٠ وسيطاً) — تسمّيه (أُصلحت فى ٩٨٤)
--
-- وكلُّها تحمل الفاعلَ فى وسيطها `p_user_id` — **تعرفه ولا تكتبه**. وهذا هو
-- بيتُ الداء: **بيتان لقاعدةٍ واحدةٍ يفترقان، والمستعمَلُ منهما هو الأضعف.**
--
-- والمُشغِّلُ الذى يملأ اسمَ المنشئ يقرأ الجلسة، **وإن لم تكن جلسةٌ سكت ومضى** —
-- فكلُّ دفعةٍ تُكتب من الخادم بمفتاح الخدمة تولد بلا اسم.
--
-- > **وحقلٌ يصمت وفى النظام من يعرف ليس فراغاً، بل خبراً أُلقى.**
-- =============================================================================

-- -----------------------------------------------------------------------------
-- ١) البيتان الناسيان يكتبان ما يعرفان
-- -----------------------------------------------------------------------------
-- ولا يُمسّ حرفٌ غيرُ عمودَين وقيمتَيهما: يُعاد النصُّ الجديدُ إلى القديم بعكس
-- الاستبدال، فإن لم يطابقه **حرفاً بحرف** تُلغى الهجرةُ كلُّها.

DO $rewrite$
DECLARE
  v_oid oid;
  v_def text;
  v_new text;
  v_n int := 0;
  -- كلُّ بابٍ ولغتُه: العمودان ثمّ القيمتان
  v_all jsonb := jsonb_build_object(
    'process_invoice_payment_atomic(uuid,uuid,uuid,numeric,date,text,text,text,uuid,uuid,uuid,uuid,uuid)',
      jsonb_build_array(
        jsonb_build_array(
          E'    account_id, branch_id, cost_center_id, warehouse_id\n  ) VALUES (',
          E'    account_id, branch_id, cost_center_id, warehouse_id,\n    created_by, created_by_user_id\n  ) VALUES ('),
        jsonb_build_array(
          E'    p_account_id, v_branch_id, p_cost_center_id, p_warehouse_id\n  ) RETURNING id INTO v_payment_id;',
          E'    p_account_id, v_branch_id, p_cost_center_id, p_warehouse_id,\n    p_user_id, p_user_id\n  ) RETURNING id INTO v_payment_id;')
      ),
    'process_invoice_payment_atomic_v2(uuid,uuid,uuid,numeric,date,text,text,text,uuid,uuid,uuid,uuid,uuid,text,text)',
      jsonb_build_array(
        jsonb_build_array(
          E'    warehouse_id\r\n  ) VALUES (',
          E'    warehouse_id,\r\n    created_by,\r\n    created_by_user_id\r\n  ) VALUES ('),
        jsonb_build_array(
          E'    p_warehouse_id\r\n  )\r\n  RETURNING id INTO v_payment_id;',
          E'    p_warehouse_id,\r\n    p_user_id,\r\n    p_user_id\r\n  )\r\n  RETURNING id INTO v_payment_id;')
      )
  );
  v_pairs jsonb;
  v_sig text;
  v_pair jsonb;
  v_old text;
  v_rep text;
  v_hits int;
BEGIN
  FOR v_sig, v_pairs IN SELECT key, value FROM jsonb_each(v_all) LOOP
    SELECT p.oid INTO v_oid FROM pg_proc p WHERE p.oid::regprocedure::text = v_sig;
    IF v_oid IS NULL THEN
      RAISE EXCEPTION 'v3.74.991: لا وجود لـ % — ولا أكتب على العمياء.', v_sig;
    END IF;

    v_def := pg_get_functiondef(v_oid);

    IF position('created_by' in v_def) > 0 THEN
      CONTINUE;  -- مُصلَحٌ سلفاً
    END IF;

    v_new := v_def;
    FOR v_pair IN SELECT * FROM jsonb_array_elements(v_pairs) LOOP
      v_old := v_pair->>0;
      v_rep := v_pair->>1;
      v_hits := (length(v_new) - length(replace(v_new, v_old, ''))) / length(v_old);
      IF v_hits <> 1 THEN
        RAISE EXCEPTION 'v3.74.991: المرساةُ ظهرت % مرّة فى % — ولا أستبدل ما لا أُحصيه.', v_hits, v_sig;
      END IF;
      v_new := replace(v_new, v_old, v_rep);
    END LOOP;

    -- والعكسُ يُثبت أنّى لم أمسّ حرفاً غيرَ ما قصدتُ
    v_rep := v_new;
    FOR v_pair IN SELECT * FROM jsonb_array_elements(v_pairs) LOOP
      v_rep := replace(v_rep, v_pair->>1, v_pair->>0);
    END LOOP;
    IF v_rep IS DISTINCT FROM v_def THEN
      RAISE EXCEPTION 'v3.74.991: الاستبدالُ فى % لم يعكس نفسَه — أُلغيت الهجرة.', v_sig;
    END IF;

    EXECUTE v_new;
    v_n := v_n + 1;
  END LOOP;

  RAISE NOTICE 'v3.74.991 · صُحّح % بيتاً.', v_n;
END $rewrite$;

-- -----------------------------------------------------------------------------
-- ٢) والماضى يُملأ بما هو مسجَّل، لا بما يُظنّ
-- -----------------------------------------------------------------------------
-- الفاعلُ يُقرأ من سجلّ التدقيق (حدثُ الإدراج)، **ولا يُملأ إلّا حيث كان
-- الفاعلُ واحداً لا ثانىَ له**. والاعتمادُ يُكتب باسمه **فقط إن كان ممّن لا
-- يحتاج من يعتمد له** — تُسأل عنه القاعدةُ نفسُها (`erp_creator_needs_no_approval`)
-- ولا يُقرَّر هنا. **وزمنُ الاعتماد هو زمنُ الإنشاء لأنّهما فعلٌ واحد**، لا
-- ختمٌ آلىٌّ كالذى كُشف فى ٩٨٤.

WITH truth AS (
  SELECT p.id, p.company_id, p.created_at,
         (SELECT a.user_id FROM public.audit_logs a
           WHERE a.target_table = 'payments' AND a.record_id = p.id
             AND a.action = 'INSERT' AND a.user_id IS NOT NULL
           ORDER BY a.created_at LIMIT 1) AS actor,
         (SELECT count(DISTINCT a.user_id) FROM public.audit_logs a
           WHERE a.target_table = 'payments' AND a.record_id = p.id
             AND a.action = 'INSERT' AND a.user_id IS NOT NULL) AS actors
  FROM public.payments p
  WHERE p.customer_id IS NOT NULL
    AND coalesce(p.is_deleted, false) = false
    AND p.created_by IS NULL
    AND p.created_by_user_id IS NULL
)
UPDATE public.payments p
   SET created_by         = t.actor,
       created_by_user_id = t.actor,
       approved_by        = t.actor,
       approved_at        = t.created_at
  FROM truth t
 WHERE p.id = t.id
   AND t.actor IS NOT NULL
   AND t.actors = 1
   AND public.erp_creator_needs_no_approval(t.company_id, t.actor);

-- -----------------------------------------------------------------------------
-- ٣) ولا تولد دفعةٌ بلا اسمٍ بعد اليوم
-- -----------------------------------------------------------------------------
-- إصلاحُ البيتين يغلق الطريقَ المعروفة، **وهذا وحدَه مسكّن**: يبقى كلُّ مسارٍ
-- جديدٍ قادراً على كتابة دفعةٍ بلا فاعل. فالقاعدةُ تُحرَس عند الجدول نفسِه،
-- **بعد** المُشغِّل الذى يملأ الاسمَ من الجلسة (فلا يُطلب ما يُملأ تلقائيّاً).
--
-- واسمُه يبدأ بـ«aa» ليعمل **أوّلاً**: فلو سبقه حارسٌ آخرُ لَرفض لسببٍ
-- غيرِ سببه، ولَبقى العطبُ الحقيقىُّ مستوراً خلف رسالةٍ لا تصفه.
--
-- ويُعفى صفُّ الإبطال: **يولد من صفٍّ آخرَ لا من قرارِ إنسانٍ جديد**، وأبوه
-- يحمل اسمَ صاحبه. وهذا هو الصفُّ الوحيدُ الذى وُجد بلا فاعلٍ فى السجلّ كلِّه.

CREATE OR REPLACE FUNCTION public.enforce_payment_names_its_author()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_catalog'
AS $function$
BEGIN
  -- **ولا يُطلب ما يُعرَف**: إن كانت جلسةٌ فصاحبُها هو الفاعل. ويُملأ العمودان
  -- معاً — فهما بيتان لخبرٍ واحد، وافتراقُهما هو ما جعل الصفَّ يبدو مجهولاً
  -- وأحدُهما يعرف.
  IF NEW.created_by_user_id IS NULL THEN
    NEW.created_by_user_id := auth.uid();
  END IF;
  IF NEW.created_by IS NULL THEN
    NEW.created_by := NEW.created_by_user_id;
  END IF;
  IF NEW.created_by_user_id IS NULL THEN
    NEW.created_by_user_id := NEW.created_by;
  END IF;

  -- صفُّ الإبطال يولد من صفٍّ آخر، وأبوه يحمل اسمَ صاحبه
  IF NEW.voids_payment_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.created_by IS NOT NULL THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'دفعةٌ بلا اسمِ من صنعها لا تُكتب — سَمِّ الفاعل (created_by). ومن يكتب من الخادم يسمّيه بنفسه، فلا جلسةَ تسمّيه عنه.'
    USING ERRCODE = 'P0001';
END;
$function$;

DROP TRIGGER IF EXISTS aa_payment_names_its_author ON public.payments;
CREATE TRIGGER aa_payment_names_its_author
BEFORE INSERT ON public.payments
FOR EACH ROW
EXECUTE FUNCTION public.enforce_payment_names_its_author();

-- -----------------------------------------------------------------------------
-- ٤) وفحصٌ مرجعىٌّ يُثبت الاتّجاهين ولا يترك ما زرع
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.assert_baseline_v3_74_991_check()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_orphans int;
  v_enabled char;
  v_msg text;
  v_voice text := 'دفعةٌ بلا اسمِ من صنعها';
  v_company uuid;
  v_customer uuid;
BEGIN
  -- ═══ لا صفَّ بقى فارغاً وفى السجلّ من يعرفه ═══
  SELECT count(*) INTO v_orphans
  FROM public.payments p
  WHERE p.customer_id IS NOT NULL
    AND coalesce(p.is_deleted, false) = false
    AND p.created_by IS NULL AND p.created_by_user_id IS NULL
    AND EXISTS (SELECT 1 FROM public.audit_logs a
                 WHERE a.target_table = 'payments' AND a.record_id = p.id
                   AND a.action = 'INSERT' AND a.user_id IS NOT NULL);

  IF v_orphans > 0 THEN
    RAISE EXCEPTION 'BASELINE FAIL: % دفعةً فارغةَ المنشئ والسجلُّ يعرف فاعلَها (v3.74.991)', v_orphans;
  END IF;

  -- ═══ والبيوتُ الثلاثةُ تسمّى الفاعل ═══
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('process_invoice_payment_atomic', 'process_invoice_payment_atomic_v2')
      AND p.prosrc NOT ILIKE '%created_by%'
  ) THEN
    RAISE EXCEPTION 'BASELINE FAIL: بيتٌ يُدرج دفعةً ولا يسمّى فاعلَها (v3.74.991)';
  END IF;

  -- ═══ والحارسُ عند الجدول موجودٌ ومُفعَّل ═══
  SELECT t.tgenabled INTO v_enabled
  FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'payments'
    AND t.tgname = 'aa_payment_names_its_author';

  IF v_enabled IS NULL THEN
    RAISE EXCEPTION 'BASELINE FAIL: حارسُ الجدول غائب — وإصلاحُ البيوت وحدَه مسكّن (v3.74.991)';
  END IF;
  IF v_enabled = 'D' THEN
    RAISE EXCEPTION 'BASELINE FAIL: حارسُ الجدول مُعطَّل (v3.74.991)';
  END IF;

  SELECT p.company_id, p.customer_id INTO v_company, v_customer
  FROM public.payments p
  WHERE p.customer_id IS NOT NULL AND coalesce(p.is_deleted,false) = false
  LIMIT 1;

  IF v_company IS NULL THEN
    RAISE NOTICE 'v3.74.991 · لا دفعةَ عميلٍ تُقاس عليها — أُثبت وجودُ الحارس ولم يُدَّعَ تشغيلُه.';
    RETURN;
  END IF;

  -- ═══ المذنب: دفعةٌ بلا اسم ═══
  -- وتُمحى الجلسةُ داخل التجربة: **وإلّا ملأ الحارسُ الاسمَ من صاحبها فبدا
  -- المذنبُ برىئاً، ولَقِيس غيرُ ما أردتُ قياسه.**
  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM set_config('request.jwt.claim.sub', '', true);
  BEGIN
    INSERT INTO public.payments (company_id, customer_id, payment_date, amount, payment_method)
    VALUES (v_company, v_customer, CURRENT_DATE, 1, 'cash');
    v_msg := 'ROLLBACK_PROBE_991';
    RAISE EXCEPTION 'ROLLBACK_PROBE_991';
  EXCEPTION WHEN OTHERS THEN
    v_msg := SQLERRM;
  END;

  IF position(v_voice in v_msg) = 0 THEN
    IF position('ROLLBACK_PROBE_991' in v_msg) > 0 THEN
      RAISE EXCEPTION 'BASELINE FAIL: مرّت دفعةٌ بلا اسمِ من صنعها (v3.74.991)';
    END IF;
    RAISE NOTICE 'v3.74.991 · لم يُقَس المذنبُ: أوقفه حارسٌ آخرُ (%) — ولا أنسب إلى حارسى فعلَ غيره.', v_msg;
  END IF;

  -- ═══ والبرىء: صفُّ إبطالٍ يولد من صفٍّ آخر ═══
  BEGIN
    INSERT INTO public.payments (company_id, customer_id, payment_date, amount, payment_method, voids_payment_id)
    VALUES (v_company, v_customer, CURRENT_DATE, -1, 'void',
            (SELECT id FROM public.payments WHERE customer_id IS NOT NULL LIMIT 1));
    v_msg := 'ROLLBACK_PROBE_991';
    RAISE EXCEPTION 'ROLLBACK_PROBE_991';
  EXCEPTION WHEN OTHERS THEN
    v_msg := SQLERRM;
  END;

  IF position(v_voice in v_msg) > 0 THEN
    RAISE EXCEPTION 'BASELINE FAIL: صرخ على صفِّ إبطالٍ يولد من صفٍّ آخر (v3.74.991)';
  END IF;
END;
$function$;

-- **وهذا الفحصُ يكتب ليُلغى ما كتب** — فلا يُمنح لمستخدمٍ نهائىّ. ومن يقيس
-- بالزرع لا يُترك بابُه مفتوحاً لكلِّ من يمرّ.
REVOKE ALL ON FUNCTION public.assert_baseline_v3_74_991_check() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assert_baseline_v3_74_991_check() FROM anon;
REVOKE ALL ON FUNCTION public.assert_baseline_v3_74_991_check() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.assert_baseline_v3_74_991_check() TO service_role;

-- -----------------------------------------------------------------------------
-- ولا تمرّ الدفعةُ إلّا بعد أن تُثبت نفسَها بالتشغيل
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  PERFORM public.assert_baseline_v3_74_991_check();
  RAISE NOTICE 'v3.74.991 · تمّت وأثبتت نفسَها.';
END $$;
