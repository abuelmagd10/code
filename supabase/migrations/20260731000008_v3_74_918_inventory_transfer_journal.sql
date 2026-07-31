-- ═══════════════════════════════════════════════════════════════════
-- v3.74.918 — نقل المخزون بين الفروع يُقيَّد فى الدفاتر
-- ═══════════════════════════════════════════════════════════════════
--
-- أول نقلٍ حقيقى فى تاريخ النظام (TRF-0001، ٥ قطع من «كشاف» من مدينة نصر
-- إلى الرئيسى) كشف أن **النقل لا يُنشئ قيداً**. شاشة النقل تُحرّك الكمية
-- وتُنشئ حركتَى مخزون ثم تتوقف. فبقى حساب المخزون ١١٤٠ يحمل الـ٨٦٥ كلها
-- تحت مدينة نصر، بينما نصف البضاعة صار فى الرئيسى فعلاً.
--
--   الأرصدة وقت الاكتشاف: نصر ٨٦٦٫٩١ · الرئيسى ٢٩٥٫٨٦ · بلا فرع ٢٢٫٦٩
--   والصواب:              نصر ٤٣٤٫٤١ · الرئيسى ٧٢٨٫٣٦
--   الفرق: **٤٣٢٫٥٠ فى غير موضعها** (٥ × ٨٦٫٥٠).
--
-- وإجمالى الشركة صحيحٌ طول الوقت — ولهذا صمتت كل الفواحص التى تقيس
-- الإجمالى. والخلل فى **البُعد**: أى تقريرٍ يقارن الفروع أو مراكز التكلفة
-- يكذب.
--
-- ⚠️ ولمَ لم يظهر قبل اليوم؟ لأن عدد أوامر النقل المنفَّذة منذ بدء النظام
--    كان **صفراً**. العطب كان قائماً من أول يوم، ونائماً حتى أول نقل.
--
-- ═══════════ ولماذا الآلية لا القيد وحده ═══════════
--
-- بنصّ المالك: «نحن هنا لحل المشكلة والتأكد من عدم تكرارها فى المستقبل
-- بحلٍّ جذرى… نحن لا نعطى مسكنات».
--
-- فقيدٌ يدوىٌّ لـTRF-0001 يُصلح الماضى ويترك الغد كما هو. ولذلك ثلاثة
-- أجزاء لا واحد:
--   (أ) **الآلية**: محفِّزٌ فى القاعدة يُنشئ القيد لحظة تسجيل الاستلام.
--   (ب) **الماضى**: كتلةٌ لا تتكرر تُصحّح TRF-0001 بنفس الآلية لا بيدٍ
--       أخرى — فما يُصحَّح به الماضى هو عينه ما يحرس المستقبل.
--   (ج) **الحارس**: فاحص سلامة الدفاتر يُرفع عنه استثناءُ النقل، فيصير
--       كلُّ نقلٍ بلا قيدٍ خطأً مسموعاً.
--
-- وموضع الآلية فى **القاعدة** لا فى الشاشة: شاشة النقل ليست الطريق
-- الوحيد، وما يعيش فى شاشةٍ يُنسى فى غيرها ويُتجاوَز بنداءٍ مباشر. وهذا
-- الدرس تكرّر ثلاث مرات فى يومين (915 و917 وهنا).
-- ═══════════════════════════════════════════════════════════════════

-- ═══════════ (أ) الآلية ═══════════
--
-- **أساس التكلفة**: متوسط FIFO المرجَّح للصنف على مستوى الشركة لحظةَ
-- الاستلام. ولماذا هذا بالذات؟ لأن طبقات FIFO **لا تُقسَّم بالفرع** فى
-- هذا النظام (`consume_fifo_lots` تستهلك على مستوى الشركة بترتيب التاريخ،
-- بلا نظرٍ إلى الفرع) — فلا توجد «طبقةُ فرعٍ» تُنقل. وهو نفس الأساس الذى
-- يستعمله تقرير تقييم المخزون بالفرع بالفعل (كمياتٌ من الحركات × متوسط
-- FIFO للشركة)، فيتّفق التقرير والدفتر بدل أن يتناقضا.
--
-- **ولا يُقيَّد نقلٌ بلا أساس تكلفة**: يُرفض بصوتٍ عالٍ. حركةٌ بلا تكلفة
-- هى بالضبط ما نُصلحه هنا، فلا تُمرَّر باسم التسامح.
CREATE OR REPLACE FUNCTION public.inventory_transfer_post_journal(p_in_tx_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_in          inventory_transactions;
  v_out         inventory_transactions;
  v_inv_account UUID;
  v_qty         NUMERIC;
  v_unit_cost   NUMERIC;
  v_value       NUMERIC;
  v_product     TEXT;
  v_transfer_no TEXT;
  v_lines       JSONB;
  v_result      JSONB;
BEGIN
  SELECT * INTO v_in FROM inventory_transactions WHERE id = p_in_tx_id;

  IF v_in.id IS NULL OR v_in.transaction_type <> 'transfer_in' THEN
    RETURN NULL;
  END IF;

  -- تُنادى مرتين فلا تُقيَّد مرتين (الكتلة الإصلاحية تنادى نفس الدالة).
  IF v_in.journal_entry_id IS NOT NULL THEN
    RETURN v_in.journal_entry_id;
  END IF;

  -- الساق المقابلة: خروجٌ من نفس أمر النقل ونفس الصنف.
  SELECT * INTO v_out
    FROM inventory_transactions t
   WHERE t.reference_id = v_in.reference_id
     AND t.product_id   = v_in.product_id
     AND t.transaction_type = 'transfer_out'
     AND COALESCE(t.is_deleted, false) = false
   ORDER BY t.created_at
   LIMIT 1;

  IF v_out.id IS NULL THEN
    RAISE EXCEPTION
      'TRANSFER_IN_WITHOUT_OUT: حركة استلام نقلٍ بلا حركة خروجٍ مقابلة (%) — لا يمكن معرفة الفرع المُرسِل',
      p_in_tx_id;
  END IF;

  -- نقلٌ داخل الفرع الواحد (بين مخزنين): لا يتغيّر بُعد الدفتر، فلا قيد.
  -- ويُستثنى صراحةً فى الفاحص بنفس الشرط، لا بالسكوت عنه.
  IF v_out.branch_id = v_in.branch_id THEN
    RETURN NULL;
  END IF;

  SELECT id INTO v_inv_account
    FROM chart_of_accounts
   WHERE company_id = v_in.company_id
     AND sub_type = 'inventory'
     AND COALESCE(is_active, true) = true
   ORDER BY account_code
   LIMIT 1;

  IF v_inv_account IS NULL THEN
    RAISE EXCEPTION
      'TRANSFER_NO_INVENTORY_ACCOUNT: الشركة % بلا حساب مخزون — لا يمكن تقييد النقل',
      v_in.company_id;
  END IF;

  v_qty := ABS(COALESCE(v_in.quantity_change, 0));
  IF v_qty <= 0 THEN
    RETURN NULL;
  END IF;

  SELECT CASE WHEN SUM(f.remaining_quantity) > 0
              THEN SUM(f.remaining_quantity * f.unit_cost) / SUM(f.remaining_quantity)
         END
    INTO v_unit_cost
    FROM fifo_cost_lots f
   WHERE f.product_id = v_in.product_id
     AND f.company_id = v_in.company_id
     AND f.remaining_quantity > 0;

  IF v_unit_cost IS NULL OR v_unit_cost <= 0 THEN
    RAISE EXCEPTION
      'TRANSFER_NO_COST_BASIS: لا طبقات تكلفة قائمة للصنف % — نقلٌ بلا تكلفة لا يُقيَّد',
      v_in.product_id;
  END IF;

  v_value := ROUND(v_qty * v_unit_cost, 2);

  SELECT name INTO v_product FROM products WHERE id = v_in.product_id;
  SELECT transfer_number INTO v_transfer_no FROM inventory_transfers WHERE id = v_in.reference_id;

  -- سطران على نفس الحساب وبُعدان مختلفان: المخزون ينتقل من فرعٍ إلى فرع.
  v_lines := jsonb_build_array(
    jsonb_build_object(
      'account_id',     v_inv_account,
      'debit_amount',   v_value,
      'credit_amount',  0,
      'branch_id',      v_in.branch_id,
      'cost_center_id', v_in.cost_center_id,
      'description',    'مخزون وارد بالنقل — ' || COALESCE(v_product, v_in.product_id::text)
    ),
    jsonb_build_object(
      'account_id',     v_inv_account,
      'debit_amount',   0,
      'credit_amount',  v_value,
      'branch_id',      v_out.branch_id,
      'cost_center_id', v_out.cost_center_id,
      'description',    'مخزون صادر بالنقل — ' || COALESCE(v_product, v_in.product_id::text)
    )
  );

  v_result := public.create_journal_entry_atomic(
    v_in.company_id,
    'inventory_transfer',
    v_in.reference_id,
    COALESCE(v_in.created_at::date, CURRENT_DATE),
    'نقل مخزون ' || COALESCE(v_transfer_no, '') || ' — ' ||
      COALESCE(v_product, '') || ' × ' || v_qty::text,
    v_in.branch_id,
    v_in.cost_center_id,
    v_in.warehouse_id,
    v_lines
  );

  IF COALESCE((v_result->>'success')::BOOLEAN, false) IS NOT TRUE THEN
    RAISE EXCEPTION
      'TRANSFER_JOURNAL_FAILED: أمر النقل % — %',
      COALESCE(v_transfer_no, v_in.reference_id::text), COALESCE(v_result->>'error', 'unknown');
  END IF;

  -- الحركتان تحملان قيمتَهما ورابطَ قيدهما. وكانت `unit_cost` فارغةً فى
  -- الاثنتين، فالنقل بلا قيمةٍ مسجَّلة أصلاً.
  UPDATE inventory_transactions
     SET journal_entry_id = (v_result->>'entry_id')::UUID,
         unit_cost        = v_unit_cost,
         total_cost       = v_value
   WHERE id IN (v_in.id, v_out.id);

  RETURN (v_result->>'entry_id')::UUID;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.inventory_transfer_post_journal(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.inventory_transfer_post_journal(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.inventory_transfer_post_journal(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.inventory_transfer_post_journal(uuid) TO service_role;

COMMENT ON FUNCTION public.inventory_transfer_post_journal(uuid) IS
  'v3.74.918 — قيد نقل المخزون بين الفروع: مدين مخزون الفرع المستلِم / دائن مخزون الفرع المُرسِل، بمتوسط FIFO المرجَّح. لا يُقيَّد النقل داخل الفرع الواحد، ولا يُقيَّد نقلٌ بلا أساس تكلفة (يُرفض).';

-- ═══════════ والمحفِّز: لحظة وصول البضاعة، لا قبلها ═══════════
--
-- على `transfer_in` وحدها: هى لحظةُ الاستلام المعتمَد. أما `transfer_out`
-- فهى إرسالٌ قد لا يصل، وتقييدُه عندها يُنشئ قيداً لبضاعةٍ فى الطريق بلا
-- طرفٍ ثانٍ. والدالة تكتب رابط القيد على الساقين معاً، فلا تبقى إحداهما
-- يتيمة أمام الفاحص.
CREATE OR REPLACE FUNCTION public.inventory_transfer_post_journal_trg()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
BEGIN
  PERFORM public.inventory_transfer_post_journal(NEW.id);
  RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS trg_inventory_transfer_post_journal ON public.inventory_transactions;
CREATE TRIGGER trg_inventory_transfer_post_journal
AFTER INSERT ON public.inventory_transactions
FOR EACH ROW
WHEN (NEW.transaction_type = 'transfer_in')
EXECUTE FUNCTION public.inventory_transfer_post_journal_trg();

-- ═══════════ (ب) الماضى: TRF-0001 يُصحَّح بنفس الآلية ═══════════
--
-- لا بيدٍ ثانية ولا بقيدٍ مكتوبٍ حرفياً: تُنادى الدالةُ نفسها على كل حركة
-- استلامٍ قائمةٍ بلا قيد. فما يُصحَّح به الماضى هو عينه ما يحرس المستقبل —
-- ولو كان فيه خطأٌ لظهر فى الاثنين معاً لا فى أحدهما.
DO $repair$
DECLARE
  r RECORD;
  v_entry UUID;
  v_done INT := 0;
BEGIN
  FOR r IN
    SELECT t.id
      FROM inventory_transactions t
     WHERE t.transaction_type = 'transfer_in'
       AND t.journal_entry_id IS NULL
       AND COALESCE(t.is_deleted, false) = false
     ORDER BY t.created_at
  LOOP
    v_entry := public.inventory_transfer_post_journal(r.id);
    IF v_entry IS NOT NULL THEN
      v_done := v_done + 1;
    END IF;
  END LOOP;

  IF v_done > 0 THEN
    RAISE NOTICE 'v3.74.918 — قُيّد % نقلٌ قائمٌ بأثرٍ رجعى', v_done;
  END IF;
END
$repair$;
