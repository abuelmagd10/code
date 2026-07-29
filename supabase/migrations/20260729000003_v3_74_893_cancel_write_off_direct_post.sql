-- =============================================================================
-- v3.74.893 — إصلاح مسار حى مكسور: إلغاء إهلاك المخزون المعتمد
-- =============================================================================
-- من قياس مرشَّح «تغيير افتراضى journal_entries.status» (درس 883):
--   * حصر كامل أظهر 11 موضع INSERT فى 10 دوال قاعدة بيانات تعتمد على
--     الافتراضى 'posted' (كود TS كله يصرّح بالحالة — صفر اعتماد).
--   * `cancel_approved_write_off` يُستدعى مباشرةً من شاشة الإهلاكات
--     (app/inventory/write-offs/page.tsx) وقيده يولد posted عبر الافتراضى
--     بلا ضبط `app.allow_direct_post` ⇒ حارس `enforce_je_integrity` يرفضه
--     (DIRECT_POST_BLOCKED) ⇒ **زر إلغاء الإهلاك المعتمد لم يعمل قط منذ
--     ولادة الحارس** — خطأ خام يظهر للعميل. صفر قيد write_off_reversal
--     فى الإنتاج يؤكد ذلك.
--   * أُثبت على قاعدة الاختبار بمعاملة ملغاة (2026-07-29):
--     «pre-fix cancel result: DIRECT_POST_BLOCKED [caller=postgres, flag=false]»
--
-- العلاج بنمط الدوال الذرّية المجرَّب (post_bill_receipt_atomic):
--   set_config('app.allow_direct_post','true', true) قبل إنشاء قيد العكس،
--   وإعادته 'false' فور إدراج السطور، مع التصريح بـ status='posted' بدل
--   الاعتماد الصامت على الافتراضى. لا تغيير آخر فى جسم الدالة.
--
-- قرار القياس المصاحب: افتراضى status يبقى 'posted' — قلبه إلى 'draft'
-- كان سيحوّل قيود COGS الحية (auto_create_cogs_journal تعتمد على الافتراضى
-- تحت سياق موثوق) إلى مسودّات صامتة لا تدخل الدفاتر. موثَّق فى HANDOVER.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.cancel_approved_write_off(p_write_off_id uuid, p_cancelled_by uuid, p_cancellation_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_write_off RECORD;
  v_item RECORD;
  v_reversal_journal_id UUID;
BEGIN
  -- v3.74.747 — reject a caller acting on another company's data.
  PERFORM public.assert_company_access_by_row('inventory_write_offs', p_write_off_id);

  SELECT * INTO v_write_off FROM public.inventory_write_offs WHERE id = p_write_off_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'لم يتم العثور على الإهلاك');
  END IF;

  IF v_write_off.status != 'approved' THEN
    RETURN jsonb_build_object('success', false, 'error', 'لا يمكن إلغاء إهلاك غير معتمد');
  END IF;

  -- v3.74.893 — القيد كان يولد posted عبر الافتراضى بلا سياق موثوق فيرفضه
  -- enforce_je_integrity (DIRECT_POST_BLOCKED) ويفشل الإلغاء كله. الدالة
  -- ذرّية موثوقة (SECURITY DEFINER + تحقق انتماء الشركة أعلاه) فتُمنح
  -- السياق الموثوق حول إنشاء قيد العكس فقط، وبتصريحٍ بالحالة لا اعتماداً
  -- على افتراضى العمود.
  PERFORM set_config('app.allow_direct_post', 'true', true);

  INSERT INTO public.journal_entries (
    company_id, reference_type, reference_id, entry_date, description,
    branch_id, cost_center_id, status
  ) VALUES (
    v_write_off.company_id,
    'write_off_reversal',
    p_write_off_id,
    CURRENT_DATE,
    'إلغاء إهلاك - ' || v_write_off.write_off_number,
    v_write_off.branch_id,
    v_write_off.cost_center_id,
    'posted'
  ) RETURNING id INTO v_reversal_journal_id;

  INSERT INTO public.journal_entry_lines (
    journal_entry_id, account_id, debit_amount, credit_amount, description
  )
  SELECT
    v_reversal_journal_id,
    account_id,
    credit_amount,
    debit_amount,
    'عكس: ' || COALESCE(description, '')
  FROM public.journal_entry_lines
  WHERE journal_entry_id = v_write_off.journal_entry_id;

  -- v3.74.893 — انتهى الجزء المحتاج للسياق الموثوق؛ يُعاد فوراً.
  PERFORM set_config('app.allow_direct_post', 'false', true);

  FOR v_item IN SELECT * FROM public.inventory_write_off_items WHERE write_off_id = p_write_off_id LOOP
    INSERT INTO public.inventory_transactions (
      company_id, product_id, transaction_type, quantity_change,
      reference_id, journal_entry_id, notes,
      branch_id, cost_center_id, warehouse_id
    ) VALUES (
      v_write_off.company_id,
      v_item.product_id,
      'write_off_reversal',
      v_item.quantity,
      p_write_off_id,
      v_reversal_journal_id,
      'إلغاء إهلاك - ' || v_write_off.write_off_number,
      v_write_off.branch_id,
      v_write_off.cost_center_id,
      v_write_off.warehouse_id
    );
  END LOOP;

  UPDATE public.inventory_write_offs SET
    status = 'cancelled',
    cancelled_by = p_cancelled_by,
    cancelled_at = now(),
    cancellation_reason = p_cancellation_reason,
    last_status_changed_at = now(),
    updated_at = now()
  WHERE id = p_write_off_id;

  RETURN jsonb_build_object(
    'success', true,
    'reversal_journal_id', v_reversal_journal_id,
    'message', 'تم إلغاء الإهلاك بنجاح'
  );
END;
$function$;

-- درس 844: CREATE OR REPLACE يعيد منح EXECUTE للعموم — يُسحب ويُعاد للمخوَّلين.
REVOKE EXECUTE ON FUNCTION public.cancel_approved_write_off(uuid, uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cancel_approved_write_off(uuid, uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.cancel_approved_write_off(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_approved_write_off(uuid, uuid, text) TO service_role;
