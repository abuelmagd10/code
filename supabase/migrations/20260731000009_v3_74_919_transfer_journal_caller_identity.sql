-- ═══════════════════════════════════════════════════════════════════
-- v3.74.919 — دالة قيد النقل لا تُنادى إلا بحقّها
-- ═══════════════════════════════════════════════════════════════════
--
-- كشفه فاحص سلامة النظام على لوحة المالك بعد ساعتين من نشر 918:
--
--   «دوال تكتب بصلاحيات كاملة بلا تحقق من هوية المُنادى: ١ دالة»
--   inventory_transfer_post_journal — high, أمنية
--
-- وهو صحيح، والدالة **دالتى من 918**. أنشأتُها `SECURITY DEFINER` (وهو
-- لازم: تكتب قيداً وتُحدّث حركات المخزون)، ثم منحتُ تنفيذها لدور
-- `authenticated` بلا أن تسأل **من المُنادى**. فأى مستخدمٍ مسجَّل كان
-- يستطيع نداءها بمعرِّف حركةِ استلامٍ من **شركةٍ أخرى** ويُرحّل قيداً فى
-- دفاترها.
--
-- ولم يكن ذلك مستغَلاً: لا شاشة ولا مسارَ API ينادى هذه الدالة إطلاقاً —
-- تُنادى من المحفِّز ومن كتلة الإصلاح وحدهما. لكن «غير مستعمَل» ليس
-- «غير ممكن»، والباب المفتوح يُغلق لأنه مفتوح لا لأنه دخل منه أحد.
--
-- ═══════════ ولماذا طبقتان لا واحدة ═══════════
--
-- الفاحص يقبل أيّاً منهما وحدها. وأخذتُهما معاً لأن كلاًّ منهما يحرس ما
-- لا يحرسه الآخر:
--
--   (١) **سحب التنفيذ من `authenticated`**: أقلُّ صلاحيةٍ ممكنة. التطبيق
--       لا ينادى الدالة أصلاً، فلا يخسر شيئاً. والمحفِّز لا يحتاج المنحة:
--       هو `SECURITY DEFINER` مملوكٌ لـpostgres، فالنداء الداخلى يُقاس
--       بصلاحية المالك لا بصلاحية من أدرج الصف.
--
--   (٢) **`assert_company_access` داخل الدالة**: تحسّباً لمنحةٍ تعود يوماً
--       بيدٍ أو بهجرة. ولا تكسر شيئاً قائماً: مُدرِج حركة الاستلام عضوٌ فى
--       الشركة فيمرّ، وكتلة الإصلاح تعمل بلا هوية (`auth.uid()` فارغة)
--       فتعود الدالة مبكراً بحكم تصميمها المعلن.
--
-- والدرس المسجَّل: **كل دالة `SECURITY DEFINER` تكتب، تُسأل سؤالين قبل
-- نشرها — من يملك نداءها؟ وهل تتحقق من هويته؟** ولو أجبتُهما فى 918 لما
-- ظهر التنبيه. ولهذا يصحبه حارسٌ فى الدفعة (`check-exposed-definer-
-- functions.js`) يمنع تكرارها بدل انتظار لوحة المالك.
-- ═══════════════════════════════════════════════════════════════════

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

  -- v3.74.919 — من المُنادى؟ الدالة تكتب فى الدفاتر بصلاحياتٍ كاملة،
  -- فتُسأل عن هوية صاحبها قبل أن تفعل. ومن لا هوية له (المحفِّز الداخلى،
  -- كتلة الإصلاح، مفتاح الخدمة) تمرّ عليه بحكم تصميم `assert_company_access`.
  PERFORM public.assert_company_access(v_in.company_id);

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

-- الطبقة الأولى: أقلُّ صلاحيةٍ ممكنة. لا شاشة ولا مسار API ينادى هذه
-- الدالة (قِيس)، والمحفِّز يناديها بصلاحية مالكه لا بصلاحية المُدرِج.
REVOKE EXECUTE ON FUNCTION public.inventory_transfer_post_journal(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.inventory_transfer_post_journal(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.inventory_transfer_post_journal(uuid) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.inventory_transfer_post_journal(uuid) TO service_role;

COMMENT ON FUNCTION public.inventory_transfer_post_journal(uuid) IS
  'v3.74.919 — قيد نقل المخزون بين الفروع. تسأل عن هوية المُنادى (assert_company_access) ولا تُنفَّذ إلا بمفتاح الخدمة أو من المحفِّز؛ سُحبت من authenticated لأن التطبيق لا يناديها.';
