-- =============================================================================
-- v3.74.988 — الرفضُ ليس عكساً محاسبيّاً
-- =============================================================================
-- قُرئ البابان اللذان أشرتُ إليهما فى تقرير ٩٨٧. وخرج من ثانيهما ما هو أخطرُ
-- ممّا ذهبتُ إليه.
--
--   قلتُ: «اعتمادُ دفعة المورّد محروسٌ من الطابق السفلىّ». وهو صحيحٌ **فى
--   الاعتماد وحدَه**. أمّا **الرفض** فيمرُّ فى الدالّة نفسِها **قبل أىِّ فحصٍ
--   للدور وقبل أىِّ فحصٍ للحالة**:
--
--       IF p_action = 'REJECT' THEN
--         UPDATE payments SET status = 'rejected' ... ;
--         RETURN;
--       END IF;
--
--   فالشرطُ الوحيدُ أن يكون الطالبُ عضواً فى الشركة — أىَّ عضوٍ من الاثنى عشر
--   دوراً. **وأخطرُ من ذلك: لا فحصَ للحالة.** فدفعةٌ اعتُمدت وقُيّدت فى
--   الدفاتر تُقلَب إلى «مرفوضة» بنداءٍ واحد.
--
-- وقِيس الأثرُ بالتشغيل على الإنتاج — بزرعٍ أُلغى بعده — على أكبر دفعةٍ قائمة:
--
--   | المبلغ | مدفوعُ الفاتورة قبل | بعد | حالةُ الفاتورة | القيدُ المحاسبىّ |
--   |--------|--------------------|-----|----------------|-------------------|
--   | ٦٠٬٠٠٠ | ٦٠٬٠٠٠            | ٠   | مدفوعة ← مُستلَمة | **باقٍ مُرحَّلاً** |
--
--   أى أنّ النقديّة تخرج فى الدفاتر والفاتورةُ تعود تقول «لم تُدفَع».
--   وتسعُ دفعاتٍ قائمة بمجموع ٦٠٬٢٦٤٫٤٥ كلُّها على بُعد نداءٍ واحدٍ من ذلك.
--
-- > **والرفضُ منعٌ قبل الفعل، لا محوٌ بعده. وما رُحِّل لا يُمحى بتغيير حالة،
-- > بل يُعالَج بعكسٍ محاسبىٍّ يُبقى الأثرَ ظاهراً.**
--
-- والقاعدةُ ليست اختراعاً منّى: **هى مكتوبةٌ فى المشروع بالفعل** فى دالّةٍ
-- أخرى اسمها `reject_supplier_payment` — تشترط سبباً، وتشترط أن تكون الحالةُ
-- `pending_approval`، وتقصر الرفضَ على المالك والمدير العامّ. **لكنّ البابَ
-- الذى تطرقه الشاشةُ يقرأ بيتاً آخرَ لا قاعدةَ فيه.** وهذا بعينُه ما تُثبته
-- قاعدةُ البيت الواحد: **بيتان لقاعدةٍ واحدةٍ يفترقان، والمستعمَلُ منهما هو
-- الأضعفُ دائماً.**
-- =============================================================================

-- -----------------------------------------------------------------------------
-- ١) سُلَّمُ الاعتماد فى بيتٍ واحد — يُقرأ ولا يُنسخ
-- -----------------------------------------------------------------------------
-- يُرجع الحالةَ التالية إن جاز لهذا الدور أن يعتمد فى هذه المرحلة، وإلّا NULL.
-- وهو نفسُ السُّلَّم الذى كان مكتوباً داخل الدالّة، مُخرَجاً إلى بيته.

CREATE OR REPLACE FUNCTION public.supplier_payment_stage_next_status(
    p_status text,
    p_role   text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public', 'pg_catalog'
AS $function$
  SELECT CASE
    WHEN lower(btrim(coalesce(p_status,''))) = 'pending_approval'
         AND lower(btrim(coalesce(p_role,''))) IN ('owner','admin','general_manager')
      THEN 'approved'
    WHEN lower(btrim(coalesce(p_status,''))) = 'pending_approval'
         AND lower(btrim(coalesce(p_role,''))) = 'manager'
      THEN 'pending_director'
    WHEN lower(btrim(coalesce(p_status,''))) = 'pending_manager'
         AND lower(btrim(coalesce(p_role,''))) IN ('manager','owner','admin','general_manager')
      THEN 'pending_director'
    WHEN lower(btrim(coalesce(p_status,''))) = 'pending_director'
         AND lower(btrim(coalesce(p_role,''))) IN ('owner','admin','general_manager')
      THEN 'approved'
    ELSE NULL
  END;
$function$;

REVOKE ALL ON FUNCTION public.supplier_payment_stage_next_status(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.supplier_payment_stage_next_status(text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.supplier_payment_stage_next_status(text, text) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- ٢) وبيتٌ واحدٌ يقول: أيجوز هذا القرارُ فى هذه الحالة لهذا الدور؟
-- -----------------------------------------------------------------------------
-- يُرجع NULL إن جاز، وإلّا **فالسببَ بالعربيّة ليقرأه المستخدمُ لا المبرمج**.

CREATE OR REPLACE FUNCTION public.supplier_payment_decision_error(
    p_status text,
    p_action text,
    p_role   text
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_status text := lower(btrim(coalesce(p_status,'')));
  v_action text := upper(btrim(coalesce(p_action,'')));
  v_role   text := lower(btrim(coalesce(p_role,'')));
BEGIN
  IF v_role = '' THEN
    RETURN 'لستَ عضواً فى هذه الشركة';
  END IF;

  IF v_action = 'REJECT' THEN
    -- ما رُحِّل فى الدفاتر لا يُمحى بتغيير حالة
    IF v_status IN ('approved','posted','paid','partially_paid') THEN
      RETURN 'دفعةٌ اعتُمدت وصار لها أثرٌ فى الدفاتر لا تُرفض — الرفضُ قبل الاعتماد. وما بعده يُعالَج بعكسٍ محاسبىٍّ يُبقى الأثرَ ظاهراً، لا بتغيير الحالة';
    END IF;
    IF v_status NOT IN ('draft','pending_approval','pending_manager','pending_director') THEN
      RETURN 'لا قرارَ يُتّخذ على دفعةٍ حالتُها «' || v_status || '»';
    END IF;
    -- والقاعدةُ هى المكتوبةُ سلفاً فى reject_supplier_payment، لا قاعدةٌ جديدة
    IF v_role NOT IN ('owner','admin','general_manager') THEN
      RETURN 'رفضُ دفعة المورّد للمالك أو المدير العامّ — ودورُك «' || v_role || '»';
    END IF;
    RETURN NULL;
  END IF;

  IF v_action = 'APPROVE' THEN
    IF public.supplier_payment_stage_next_status(v_status, v_role) IS NOT NULL THEN
      RETURN NULL;
    END IF;
    IF v_status NOT IN ('pending_approval','pending_manager','pending_director') THEN
      RETURN 'الدفعةُ حالتُها «' || v_status || '» فلا اعتمادَ عليها';
    END IF;
    RETURN 'دورُك «' || v_role || '» لا يعتمد فى مرحلة «' || v_status || '»';
  END IF;

  RETURN 'إجراءٌ غيرُ معروف: «' || v_action || '»';
END;
$function$;

REVOKE ALL ON FUNCTION public.supplier_payment_decision_error(text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.supplier_payment_decision_error(text, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.supplier_payment_decision_error(text, text, text) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- ٣) والبابُ نفسُه صار يقرأ البيتين — للاعتماد وللرفض معاً
-- -----------------------------------------------------------------------------
-- وثلاثةُ فروقٍ عن السابق، لا رابعَ لها:
--   • الرفضُ يمرُّ بالفحص كما يمرُّ الاعتماد (كان يمرُّ بلا فحصٍ إطلاقاً).
--   • سُلَّمُ الاعتماد يُقرأ من بيته بدل أن يُكتب هنا مرّةً أخرى.
--   • و`search_path` مثبَّتٌ — ودالّةٌ تعمل بصلاحية مالكها ولا تثبّت مسارَها
--     بابٌ خلفىٌّ معروف.
-- وما عدا ذلك فالسلوكُ هو هو: نفسُ الحالات، ونفسُ الأعمدة المكتوبة.

CREATE OR REPLACE FUNCTION public.process_payment_approval_stage(
    p_payment_id uuid,
    p_action character varying,
    p_rejection_reason character varying DEFAULT NULL::character varying
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_payment RECORD;
  v_user_role VARCHAR;
  v_user_id UUID := auth.uid();
  v_next_status VARCHAR;
  v_error TEXT;
BEGIN
  SELECT * INTO v_payment FROM public.payments WHERE id = p_payment_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'الدفعةُ غير موجودة' USING ERRCODE = 'P0001';
  END IF;

  SELECT role INTO v_user_role
  FROM public.company_members
  WHERE user_id = v_user_id AND company_id = v_payment.company_id;

  -- والقرارُ يُقاس فى بيته، لا هنا
  v_error := public.supplier_payment_decision_error(v_payment.status, p_action, v_user_role);
  IF v_error IS NOT NULL THEN
    RAISE EXCEPTION '%', v_error USING ERRCODE = 'P0001';
  END IF;

  IF upper(btrim(p_action)) = 'REJECT' THEN
    UPDATE public.payments SET
      status = 'rejected',
      rejection_reason = p_rejection_reason,
      rejected_by = v_user_id,
      rejected_at = NOW()
    WHERE id = p_payment_id;
    RETURN;
  END IF;

  v_next_status := public.supplier_payment_stage_next_status(v_payment.status, v_user_role);

  UPDATE public.payments SET
    status = v_next_status,
    approved_by = CASE WHEN v_next_status = 'approved' THEN v_user_id ELSE approved_by END,
    approved_at = CASE WHEN v_next_status = 'approved' THEN NOW() ELSE approved_at END,
    current_approval_role = CASE WHEN v_next_status = 'approved' THEN NULL ELSE 'director' END
  WHERE id = p_payment_id;

  RETURN;
END;
$function$;

-- -----------------------------------------------------------------------------
-- ٤) وحارسٌ فى الطابق السفلىّ يغلق البابَ على كلِّ الطرق لا على طريقٍ واحدة
-- -----------------------------------------------------------------------------
-- إصلاحُ الدالّة يغلق البابَ الذى تطرقه الشاشة. **وهذا وحدَه مسكّن**: يبقى كلُّ
-- مسارٍ آخرَ — قديمٍ أو يُكتب غداً — قادراً على قلب دفعةٍ مُرحَّلةٍ إلى «مرفوضة».
-- فالقاعدةُ تُحرَس عند الجدول نفسِه.
--
-- ويُعفى الإبطالُ الحقيقىّ: حين تُوسَم الدفعةُ محذوفةً أو مُبطَلةً فى الحركة
-- نفسِها، فذلك تراجعٌ معلَنٌ لا رفضٌ صامت — **ومسارُ التعويض فى إنشاء دفعة
-- العميل يفعل ذلك بالضبط، فلا يُكسَر.**

CREATE OR REPLACE FUNCTION public.enforce_rejection_is_not_a_reversal()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_catalog'
AS $function$
BEGIN
  IF coalesce(NEW.is_deleted, false) = true OR NEW.voided_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'دفعةٌ حالتُها «%» صار لها أثرٌ فى الدفاتر — ولا تُمحى بالرفض. والتراجعُ عنها يكون بعكسٍ محاسبىٍّ أو إبطالٍ يُبقى الأثرَ ظاهراً.', OLD.status
    USING ERRCODE = 'P0001';
END;
$function$;

DROP TRIGGER IF EXISTS trg_rejection_is_not_a_reversal ON public.payments;
CREATE TRIGGER trg_rejection_is_not_a_reversal
BEFORE UPDATE OF status ON public.payments
FOR EACH ROW
WHEN (
  OLD.status IN ('approved','posted','paid','partially_paid')
  AND NEW.status = 'rejected'
)
EXECUTE FUNCTION public.enforce_rejection_is_not_a_reversal();

-- -----------------------------------------------------------------------------
-- ٥) وفحصٌ مرجعىٌّ يُثبت الاتّجاهين: يرفض المذنبَ ويعفو عن البرىء
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.assert_baseline_v3_74_988_check()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_pay uuid;
  v_blocked boolean;
  v_spared boolean;
  v_enabled char;
  v_msg text;
  -- صوتُ حارسِنا وحدَه — لا يُخلط بصوت غيره
  v_voice text := 'لا تُمحى بالرفض';
BEGIN
  -- ═══ السُّلَّم: أربعةُ اتّجاهاتٍ تُقاس واحداً واحداً ═══
  IF public.supplier_payment_stage_next_status('pending_approval','owner') IS DISTINCT FROM 'approved' THEN
    RAISE EXCEPTION 'BASELINE FAIL: المالكُ لا يُنهى الاعتمادَ عند pending_approval (v3.74.988)';
  END IF;
  IF public.supplier_payment_stage_next_status('pending_approval','manager') IS DISTINCT FROM 'pending_director' THEN
    RAISE EXCEPTION 'BASELINE FAIL: المديرُ لا يُحوّل إلى pending_director (v3.74.988)';
  END IF;
  IF public.supplier_payment_stage_next_status('pending_director','manager') IS NOT NULL THEN
    RAISE EXCEPTION 'BASELINE FAIL: المديرُ أنهى مرحلةً ليست له (v3.74.988)';
  END IF;
  IF public.supplier_payment_stage_next_status('approved','owner') IS NOT NULL THEN
    RAISE EXCEPTION 'BASELINE FAIL: سُلَّمٌ يعتمد دفعةً معتمَدةً سلفاً (v3.74.988)';
  END IF;

  -- ═══ الرفض: يرفض المذنب ═══
  IF public.supplier_payment_decision_error('approved','REJECT','owner') IS NULL THEN
    RAISE EXCEPTION 'BASELINE FAIL: أجاز رفضَ دفعةٍ معتمَدةٍ مُرحَّلة (v3.74.988)';
  END IF;
  IF public.supplier_payment_decision_error('pending_approval','REJECT','accountant') IS NULL THEN
    RAISE EXCEPTION 'BASELINE FAIL: أجاز الرفضَ لدورٍ لا يملكه (v3.74.988)';
  END IF;
  IF public.supplier_payment_decision_error('pending_approval','REJECT','') IS NULL THEN
    RAISE EXCEPTION 'BASELINE FAIL: أجاز القرارَ لمن ليس عضواً فى الشركة (v3.74.988)';
  END IF;

  -- ═══ ولا يصرخ على البرىء ═══
  IF public.supplier_payment_decision_error('pending_approval','REJECT','owner') IS NOT NULL THEN
    RAISE EXCEPTION 'BASELINE FAIL: منع المالكَ من رفض دفعةٍ بانتظار الاعتماد (v3.74.988)';
  END IF;
  IF public.supplier_payment_decision_error('pending_director','APPROVE','general_manager') IS NOT NULL THEN
    RAISE EXCEPTION 'BASELINE FAIL: منع المديرَ العامَّ من إنهاء مرحلة المدير (v3.74.988)';
  END IF;

  -- ═══ والحارسُ السفلىّ موجودٌ ومُفعَّل ═══
  SELECT t.tgenabled INTO v_enabled
  FROM pg_trigger t
  JOIN pg_class c ON c.oid = t.tgrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'payments'
    AND t.tgname = 'trg_rejection_is_not_a_reversal';

  IF v_enabled IS NULL THEN
    RAISE EXCEPTION 'BASELINE FAIL: حارسُ الجدول غائب — والإصلاحُ فى الدالّة وحدَها مسكّن (v3.74.988)';
  END IF;
  IF v_enabled = 'D' THEN
    RAISE EXCEPTION 'BASELINE FAIL: حارسُ الجدول موجودٌ لكنّه مُعطَّل (v3.74.988)';
  END IF;

  -- ═══ ويُجرَّب بالتشغيل على صفٍّ حقيقىٍّ إن وُجد — والزرعُ يُلغى دائماً ═══
  SELECT id INTO v_pay
  FROM public.payments
  WHERE status = 'approved'
    AND coalesce(is_deleted, false) = false
    AND voided_at IS NULL
  LIMIT 1;

  IF v_pay IS NULL THEN
    -- **وبحثٌ لا يجد ليس دليلَ غياب**: لا صفَّ يُجرَّب عليه، فيُكتفى بوجود
    -- الحارس أعلاه ولا يُدَّعى أنّه جُرِّب.
    RAISE NOTICE 'v3.74.988 · لا دفعةَ معتمَدةٌ حيّةٌ لتُجرَّب — أُثبت وجودُ الحارس ولم يُدَّعَ تشغيلُه.';
    RETURN;
  END IF;

  -- ولا يُنسب إلى حارسِنا خطأُ غيره: يُميَّز صوتُه بعبارته وحدَها.
  -- المذنب: قلبُ دفعةٍ معتمَدةٍ إلى «مرفوضة» بلا إبطال
  BEGIN
    UPDATE public.payments SET status = 'rejected' WHERE id = v_pay;
    v_msg := 'ROLLBACK_PROBE_988';
    RAISE EXCEPTION 'ROLLBACK_PROBE_988';
  EXCEPTION WHEN OTHERS THEN
    v_msg := SQLERRM;
  END;

  v_blocked := position(v_voice in v_msg) > 0;
  IF NOT v_blocked THEN
    IF position('ROLLBACK_PROBE_988' in v_msg) > 0 THEN
      RAISE EXCEPTION 'BASELINE FAIL: مرَّ قلبُ دفعةٍ معتمَدةٍ إلى «مرفوضة» (v3.74.988)';
    END IF;
    RAISE NOTICE 'v3.74.988 · لم يُقَس المذنبُ: أوقفه حارسٌ آخرُ (%) — ولا أنسب إلى حارسى فعلَ غيره.', v_msg;
  END IF;

  -- البرىء: الإبطالُ المعلَن يمرُّ ولا يُوقَف
  BEGIN
    UPDATE public.payments
       SET status = 'rejected', is_deleted = true, deleted_at = NOW()
     WHERE id = v_pay;
    v_msg := 'ROLLBACK_PROBE_988';
    RAISE EXCEPTION 'ROLLBACK_PROBE_988';
  EXCEPTION WHEN OTHERS THEN
    v_msg := SQLERRM;
  END;

  v_spared := position(v_voice in v_msg) = 0;
  IF NOT v_spared THEN
    RAISE EXCEPTION 'BASELINE FAIL: صرخ على إبطالٍ معلَنٍ يُبقى الأثرَ ظاهراً (v3.74.988)';
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.assert_baseline_v3_74_988_check() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assert_baseline_v3_74_988_check() FROM anon;
GRANT EXECUTE ON FUNCTION public.assert_baseline_v3_74_988_check() TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- ولا تمرّ الدفعةُ إلّا بعد أن تُثبت نفسَها بالتشغيل
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  PERFORM public.assert_baseline_v3_74_988_check();
  RAISE NOTICE 'v3.74.988 · تمّت وأثبتت نفسَها.';
END $$;
