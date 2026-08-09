-- =============================================================================
-- v3.74.992 — لا تُبعث وثيقةٌ أُلغيت
-- =============================================================================
-- **هذا العطبُ كشفه حارسٌ بعد أن وطئتُه بيدى، فأُثبت هنا بلا تجميل.**
--
-- فى ٩٩١ ملأتُ اسمَ صاحبِ إحدى عشرةَ دفعة. فحصتُ الأثرَ المباشر — أحدَ عشرَ
-- صفّاً يُصحَّح — **ولم أفحص ما تُوقظه اللمسةُ من مُشغِّلات**. فانطلق مُشغِّلُ
-- إعادة حساب المدفوع، **ودالّةُ إعادة الحساب تشتقُّ حالةَ الفاتورة من المال
-- وحدَه وتكتبها فوق ما كان**:
--
--     v_new_status := CASE WHEN v_paid <= 0 THEN 'sent' ... END;
--     UPDATE invoices SET paid_amount = v_paid, status = v_new_status ...;
--
-- فمحت «ملغاة» وكتبت «مُرسَلة». **وفاتورةٌ أُلغيت بُعثت من قبرها بلمسةِ دفعة.**
--
-- وقِيس نطاقُ الضرر من سجلّ التدقيق: **صفّان اثنان لا ثالثَ لهما** — فاتورةُ
-- بيعٍ أُلغيت بعد استردادٍ قبل الشحن، وأمرُ البيع المرتبطُ بها. وأُعيدا إلى
-- «ملغاة» فى اليوم نفسِه، وأُثبت بعد الإصلاح أنّ لمسةَ الدفعة لم تعد تُحرّكهما.
--
-- ═══ والعطبُ أقدمُ منّى ═══
--
-- الدالّتان تفعلان هذا منذ كُتبتا: **أىُّ لمسةِ دفعةٍ على أىِّ وثيقةٍ ملغاةٍ
-- كانت تبعثها**. لم أصنع اللغم؛ وطئتُه فظهر. ولولا حارسُ الإشعارات — الذى
-- اشتكى من إشعارٍ على دورٍ لا يشغله أحد **لأنّ سيرَ العمل عاد مفتوحاً** — ما
-- عرفنا.
--
-- > **والمالُ يقرّر بين حالات المال وحدَها. وما كان مُلغًى أو مسوّدةً فحالتُه
-- > قرارُ إنسانٍ لا حاصلُ جمع.**
-- =============================================================================

-- -----------------------------------------------------------------------------
-- ١) القاعدةُ تُدَسُّ فى بيتَى إعادة الحساب — الفاتورة وفاتورة الشراء
-- -----------------------------------------------------------------------------
-- ولا يُمسّ حرفٌ غيرُ جملة التحديث: يُعاد النصُّ الجديدُ إلى القديم بعكس
-- الاستبدال، فإن لم يطابقه **حرفاً بحرف** تُلغى الهجرةُ كلُّها.

DO $fix$
DECLARE
  v_def text; v_new text; v_old text; v_rep text; v_oid oid; v_hits int; v_n int := 0;
BEGIN
  -- الفاتورة
  SELECT p.oid INTO v_oid FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'fn_recalc_invoice_paid_status';
  IF v_oid IS NULL THEN
    RAISE EXCEPTION 'v3.74.992: لا وجود لـ fn_recalc_invoice_paid_status — ولا أكتب على العمياء.';
  END IF;
  v_def := pg_get_functiondef(v_oid);
  IF position('لا تُبعث وثيقةٌ أُلغيت' in v_def) = 0 THEN
    v_old := E'  UPDATE public.invoices\n  SET paid_amount = v_paid, status = v_new_status, updated_at = NOW()\n  WHERE id = p_invoice_id;';
    v_rep := E'  -- v3.74.992 — **لا تُبعث وثيقةٌ أُلغيت**: المالُ يقرّر بين حالات المال\n'
          || E'  -- وحدَها (مُرسَلة · مدفوعةٌ جزئيّاً · مدفوعة). وما كان مُلغًى أو مسوّدةً\n'
          || E'  -- فحالتُه قرارُ إنسانٍ لا حاصلُ جمع — يُحدَّث مبلغُه ولا تُمسّ حالتُه.\n'
          || E'  UPDATE public.invoices\n'
          || E'  SET paid_amount = v_paid,\n'
          || E'      status = CASE WHEN COALESCE(status,'''') IN (''sent'',''partially_paid'',''paid'')\n'
          || E'                    THEN v_new_status ELSE status END,\n'
          || E'      updated_at = NOW()\n'
          || E'  WHERE id = p_invoice_id;';
    v_hits := (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old);
    IF v_hits <> 1 THEN
      RAISE EXCEPTION 'v3.74.992: المرساةُ ظهرت % مرّة فى الفاتورة — ولا أستبدل ما لا أُحصيه.', v_hits;
    END IF;
    v_new := replace(v_def, v_old, v_rep);
    IF replace(v_new, v_rep, v_old) IS DISTINCT FROM v_def THEN
      RAISE EXCEPTION 'v3.74.992: استبدالُ الفاتورة لم يعكس نفسَه — أُلغيت الهجرة.';
    END IF;
    EXECUTE v_new;
    v_n := v_n + 1;
  END IF;

  -- فاتورة الشراء — القاعدةُ نفسُها، والمفرداتُ مفرداتُها
  SELECT p.oid INTO v_oid FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'fn_recalc_bill_paid_status';
  IF v_oid IS NULL THEN
    RAISE EXCEPTION 'v3.74.992: لا وجود لـ fn_recalc_bill_paid_status — ولا أكتب على العمياء.';
  END IF;
  v_def := pg_get_functiondef(v_oid);
  IF position('لا تُبعث وثيقةٌ أُلغيت' in v_def) = 0 THEN
    v_old := E'  UPDATE public.bills\n  SET paid_amount = v_paid, status = v_new_status, updated_at = NOW()\n  WHERE id ';
    v_rep := E'  -- v3.74.992 — **لا تُبعث وثيقةٌ أُلغيت** (انظر مثيلتَها فى الفاتورة).\n'
          || E'  UPDATE public.bills\n'
          || E'  SET paid_amount = v_paid,\n'
          || E'      status = CASE WHEN COALESCE(status,'''') IN (''received'',''partially_paid'',''paid'')\n'
          || E'                    THEN v_new_status ELSE status END,\n'
          || E'      updated_at = NOW()\n'
          || E'  WHERE id ';
    v_hits := (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old);
    IF v_hits <> 1 THEN
      RAISE EXCEPTION 'v3.74.992: المرساةُ ظهرت % مرّة فى فاتورة الشراء — ولا أستبدل ما لا أُحصيه.', v_hits;
    END IF;
    v_new := replace(v_def, v_old, v_rep);
    IF replace(v_new, v_rep, v_old) IS DISTINCT FROM v_def THEN
      RAISE EXCEPTION 'v3.74.992: استبدالُ فاتورة الشراء لم يعكس نفسَه — أُلغيت الهجرة.';
    END IF;
    EXECUTE v_new;
    v_n := v_n + 1;
  END IF;

  RAISE NOTICE 'v3.74.992 · حُصّن % بيتاً من بيتَى إعادة الحساب.', v_n;
END $fix$;

-- -----------------------------------------------------------------------------
-- ٢) وفحصٌ مرجعىٌّ يُثبت الاتّجاهين على صفوفٍ حقيقيّة، والزرعُ يُلغى دائماً
-- -----------------------------------------------------------------------------
-- **المذنب**: لمسةُ دفعةٍ على وثيقةٍ ملغاةٍ لا تُحرّك حالتَها.
-- **والبرىء**: لمسةُ دفعةٍ على وثيقةٍ حيّةٍ تُحدّث حالتَها كما كانت تفعل —
-- فلا يُجمَّد المالُ عن عمله بحجّة حمايته.

CREATE OR REPLACE FUNCTION public.assert_baseline_v3_74_992_check()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_inv uuid;
  v_pay uuid;
  v_before text;
  v_after text;
  v_paid_before numeric;
  v_paid_after numeric;
BEGIN
  -- ═══ القاعدةُ مكتوبةٌ فى البيتين ═══
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('fn_recalc_invoice_paid_status', 'fn_recalc_bill_paid_status')
      AND position('لا تُبعث وثيقةٌ أُلغيت' in p.prosrc) = 0
  ) THEN
    RAISE EXCEPTION 'BASELINE FAIL: بيتُ إعادة حسابٍ يكتب الحالةَ بلا شرط — تُبعث الملغاةُ بلمسةِ دفعة (v3.74.992)';
  END IF;

  -- ═══ المذنب: وثيقةٌ ملغاةٌ لها دفعة ═══
  SELECT i.id, p.id INTO v_inv, v_pay
  FROM public.invoices i
  JOIN public.payments p ON p.invoice_id = i.id
  WHERE i.status = 'cancelled'
  LIMIT 1;

  IF v_inv IS NOT NULL THEN
    SELECT status INTO v_before FROM public.invoices WHERE id = v_inv;
    BEGIN
      UPDATE public.payments SET notes = COALESCE(notes, '') WHERE id = v_pay;
      SELECT status INTO v_after FROM public.invoices WHERE id = v_inv;
      IF v_after IS DISTINCT FROM v_before THEN
        RAISE EXCEPTION 'BASELINE FAIL: بُعثت وثيقةٌ ملغاة: % ← % (v3.74.992)', v_before, v_after;
      END IF;
      RAISE EXCEPTION 'ROLLBACK_PROBE_992';
    EXCEPTION WHEN OTHERS THEN
      IF position('BASELINE FAIL' in SQLERRM) > 0 THEN
        RAISE EXCEPTION '%', SQLERRM;
      END IF;
    END;
  ELSE
    -- **وبحثٌ لا يجد ليس دليلَ غياب**: لا وثيقةَ ملغاةٌ لها دفعة، فيُكتفى
    -- بإثبات القاعدة فى البيتين ولا يُدَّعى أنّها جُرّبت.
    RAISE NOTICE 'v3.74.992 · لا وثيقةَ ملغاةٌ ذاتُ دفعةٍ تُقاس عليها — أُثبتت القاعدةُ ولم يُدَّعَ تشغيلُها.';
  END IF;

  -- ═══ والبرىء: وثيقةٌ حيّةٌ ما زال مالُها يحكم حالتَها ═══
  SELECT i.id, p.id INTO v_inv, v_pay
  FROM public.invoices i
  JOIN public.payments p ON p.invoice_id = i.id
  WHERE i.status IN ('sent', 'partially_paid', 'paid')
  LIMIT 1;

  IF v_inv IS NOT NULL THEN
    SELECT paid_amount INTO v_paid_before FROM public.invoices WHERE id = v_inv;
    BEGIN
      UPDATE public.payments SET notes = COALESCE(notes, '') WHERE id = v_pay;
      SELECT paid_amount, status INTO v_paid_after, v_after FROM public.invoices WHERE id = v_inv;
      IF v_paid_after IS DISTINCT FROM v_paid_before THEN
        RAISE EXCEPTION 'BASELINE FAIL: توقّف حسابُ المدفوع على وثيقةٍ حيّة: % ← % (v3.74.992)', v_paid_before, v_paid_after;
      END IF;
      IF v_after NOT IN ('sent', 'partially_paid', 'paid') THEN
        RAISE EXCEPTION 'BASELINE FAIL: خرجت وثيقةٌ حيّةٌ من حالات المال إلى «%» (v3.74.992)', v_after;
      END IF;
      RAISE EXCEPTION 'ROLLBACK_PROBE_992';
    EXCEPTION WHEN OTHERS THEN
      IF position('BASELINE FAIL' in SQLERRM) > 0 THEN
        RAISE EXCEPTION '%', SQLERRM;
      END IF;
    END;
  END IF;
END;
$function$;

-- **وهذا الفحصُ يكتب ليُلغى ما كتب** — فلا يُمنح لمستخدمٍ نهائىّ.
REVOKE ALL ON FUNCTION public.assert_baseline_v3_74_992_check() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assert_baseline_v3_74_992_check() FROM anon;
REVOKE ALL ON FUNCTION public.assert_baseline_v3_74_992_check() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.assert_baseline_v3_74_992_check() TO service_role;

-- -----------------------------------------------------------------------------
-- ولا تمرّ الدفعةُ إلّا بعد أن تُثبت نفسَها بالتشغيل
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  PERFORM public.assert_baseline_v3_74_992_check();
  RAISE NOTICE 'v3.74.992 · تمّت وأثبتت نفسَها.';
END $$;
