-- v3.74.952 — أمرُ الشراء الجديد يُرى ساعةَ ميلاده
-- ============================================================================
-- العطبُ المقيس:
--   قاعدةُ الرؤية الوحيدةُ على purchase_orders كانت:
--       USING (can_access_purchase_order(id))
--   وتلك دالةٌ تعود فتبحث عن الصفِّ **فى الجدول** بمُعرِّفه. وPostgreSQL يطبّق
--   قواعدَ الرؤية على الصفِّ العائد من RETURNING، وPostgREST يستعمل RETURNING
--   دائماً. فالصفُّ الوليدُ ليس فى الجدول بعدُ لحظةَ سؤال الدالة، فتُجيب «لا»،
--   فيُرفض الإدراجُ كلُّه بـ 42501.
--   قِيس على الإنتاج داخل معاملاتٍ مُرجَعة: الإدراجُ **بلا** RETURNING ينجح،
--   و**مع** RETURNING يُرفض للأدوارِ الأربعةِ جميعاً — بما فيها المالك.
--   والفواتيرُ نجت وحدَها لأنّ لها ثلاثَ قواعدِ رؤيةٍ تجتمع بـ OR.
--
-- العلاج: تقرأ القاعدةُ عمودَى الصفِّ نفسِه بدل أن تعودَ فتبحثَ عنه. والمعنى
-- واحدٌ حرفاً بحرف: أُثبت على ١٠٨ زوجٍ حقيقىٍّ (١٢ عضوية × ٩ أوامر) أنّ
-- الجوابَ القديمَ والجديدَ لم يختلفا مرةً واحدة (٥١ «نعم» فى الحالتين).
--
-- وعطبٌ ثانٍ مستقلّ كان مختبئاً خلف الأول: auto_generate_po_number يحسب
-- MAX(po_number) على ما **يراه المستدعى**. ومسئولُ المشتريات يرى ٦ من ٨،
-- فيولّد PO-0008 وهو محجوزٌ فى فرعٍ آخر ⇒ 23505. التسلسلُ خاصيةٌ للشركة،
-- لا للرؤية؛ فيُقرأ الآن كاملاً بصلاحيةٍ مرتفعةٍ ضيّقةِ النطاق.
--
-- ما لم يُمَسّ عمداً: can_access_purchase_order باقيةٌ كما هى، لأنّ
-- purchase_order_items تستعملها بمعناها الصحيح — إشارةً إلى أمرٍ **قائم**.
-- ============================================================================

-- (١) قاعدةُ الرؤية تقرأ الصفَّ الذى بين يديها ----------------------------
DROP POLICY IF EXISTS purchase_orders_select_branch_isolation ON public.purchase_orders;

CREATE POLICY purchase_orders_select_branch_isolation
  ON public.purchase_orders
  FOR SELECT
  USING (
    company_id IN (SELECT public.get_user_company_ids())
    AND public.can_access_record_branch(company_id, branch_id)
  );

-- (٢) رقمُ أمر الشراء يُولَّد من تسلسل الشركة كاملاً ----------------------
-- VOLATILE عن قصد: فى READ COMMITTED تأخذ الدالةُ المتقلّبة لقطةً جديدةً عند
-- كلِّ نداء، فترى ما أُودع بعد أن أفرج القفلُ الاستشارىُّ عن المعاملة السابقة.
CREATE OR REPLACE FUNCTION public.next_po_number(p_company_id uuid)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_max INTEGER;
BEGIN
  IF p_company_id IS NULL THEN
    RAISE EXCEPTION 'v3.74.952: لا يُولَّد رقمُ أمرِ شراءٍ بلا شركة.';
  END IF;

  -- صلاحيةٌ مرتفعةٌ لا تعنى بابًا مفتوحاً: جلسةُ مستخدمٍ لا تسأل عن شركةٍ
  -- ليست له. وغيابُ الجلسة (خادمٌ موثوق) يمرّ.
  IF auth.uid() IS NOT NULL
     AND p_company_id NOT IN (SELECT public.get_user_company_ids()) THEN
    RAISE EXCEPTION 'v3.74.952: لا صلةَ لك بهذه الشركة.';
  END IF;

  SELECT COALESCE(MAX(CAST(SUBSTRING(po_number FROM 'PO-([0-9]+)') AS INTEGER)), 0)
    INTO v_max
    FROM public.purchase_orders
   WHERE company_id = p_company_id
     AND po_number ~ '^PO-[0-9]+$';

  RETURN 'PO-' || LPAD((v_max + 1)::TEXT, 4, '0');
END;
$function$;

REVOKE ALL ON FUNCTION public.next_po_number(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.next_po_number(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.next_po_number(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.next_po_number(uuid) TO service_role;

-- (٣) المُشغِّلُ يبقى بصلاحية المستدعى، ويستعير القراءةَ وحدَها ------------
CREATE OR REPLACE FUNCTION public.auto_generate_po_number()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_lock_key BIGINT;
BEGIN
  IF NEW.po_number IS NULL OR NEW.po_number = '' THEN
    IF NEW.company_id IS NULL THEN
      RAISE EXCEPTION 'v3.74.952: أمرُ شراءٍ بلا شركة — لا يمكن توليدُ رقمه.';
    END IF;
    v_lock_key := hashtext('po_' || NEW.company_id::TEXT);
    PERFORM pg_advisory_xact_lock(v_lock_key);
    NEW.po_number := public.next_po_number(NEW.company_id);
  END IF;
  RETURN NEW;
END;
$function$;
