-- ═══════════════════════════════════════════════════════════════════════════
-- v3.74.904 — تعديل الإشعار الدائن المرفوض وإعادة إرساله (طلب المالك الحى)
--
-- الحادثة (30/7): رفض المالك CR-51543 بسبب «جرب بالخصم والضريبة» فوصل
-- الإخطار للمنشئ — ثم سأل المالك: «يجب أن يظهر زر التعديل للمنشئ فى حالة
-- الرفض مثل باقى الاعتمادات المتواجدة فى المشروع». النمط المعتمد فى
-- المشروع (نقل المخزون): المرفوض يعدّله منشئه ويعيد إرساله للاعتماد.
--
-- التصميم:
--   * المنشئ وحده يعدّل مرفوضه (فصل المهام من الجهة الأخرى: من لا يملك
--     المستند لا يعيد صياغته).
--   * من حالة rejected فقط، وبلا قيدٍ مرحَّل وبلا تطبيقٍ سابق — دفاعاً.
--   * الأعمدة مسمّاة لا ممرَّرة كما جاءت (درس check-request-body-written-raw)؛
--     و company_id / credit_number / bill_id / source_* / reference_* /
--     journal_entry_id / created_by_user_id / applied_amount محصَّنة لا
--     يغيّرها التعديل — التعديل يصحّح المحتوى لا يبدّل هوية المستند.
--   * بعد التعديل تُطبَّق مصفوفة 865 من جديد بدور المنشئ لحظةَ الإرسال:
--     مالك ⇒ ترحيل مباشر · مدير عام ⇒ بانتظار المالك · محاسب ⇒ مقيَّد
--     بفرعه وبانتظار المالك أو المدير العام · غيرهم ممنوع.
--   * ترتيب حاسم: البنود تُستبدل والقيد NULL — فمُشغِّل المخزون على
--     إدراج البنود (auto_inventory_for_vendor_credit) لا يتحرك إلا بقيدٍ
--     موجود؛ ترحيل المالك يأتى بعد البنود فلا تتولد حركة بضاعة لإشعارٍ
--     مستقل (تصميم 897).
--   * إخطار المالك من جديد بمفتاح حدثٍ فريد لكل إعادة إرسال — الفهرس
--     uniq_notifications_active_event_key يمنع تكرار (company, event_key)
--     لغير المقروء، فالمفتاح يحمل رقم إعادة الإرسال، وتُؤرشف الإخطارات
--     المعلّقة السابقة لذات الإشعار كى لا يزدحم وارد المالك بنسختين.
--
-- المرجع الحى: بُرهنت الدالة بمعاملات ملغاة على قاعدة الاختبار قبل الدفع
-- (منشئ غير المالك يُرفض NOT_CREATOR · غير المرفوض NOT_REJECTED · محاسب
-- خارج فرعه BRANCH_SCOPE · إعادة الإرسال الصحيحة pending_approval ببنودٍ
-- مستبدلة وإخطارٍ جديد · ثم الاعتماد يرحّل).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.update_vendor_credit_with_items(p_credit_id uuid, p_credit jsonb, p_items jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_vc public.vendor_credits%ROWTYPE;
  v_role text;
  v_member_branch uuid;
  v_new_branch uuid;
  v_item jsonb;
  v_count int;
  v_rows int;
  v_je uuid;
  v_resubmit_no bigint;
BEGIN
  IF v_actor IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'NO_ACTOR');
  END IF;
  IF p_credit IS NULL OR jsonb_typeof(p_credit) <> 'object' THEN
    RAISE EXCEPTION 'p_credit must be a JSON object';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'p_items must be a JSON array';
  END IF;

  SELECT * INTO v_vc FROM vendor_credits WHERE id = p_credit_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'NOT_FOUND');
  END IF;
  PERFORM public.assert_company_access(v_vc.company_id);

  -- المرفوض وحده يُعدَّل — المعلّق يُقرَّر فى صندوق الموافقات، والمرحَّل
  -- تحكمه أدوات التصحيح المحاسبية لا التعديل الحر.
  IF v_vc.status <> 'rejected' THEN
    RETURN jsonb_build_object('success', false, 'error', 'NOT_REJECTED', 'status', v_vc.status);
  END IF;
  IF v_vc.journal_entry_id IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'ALREADY_POSTED');
  END IF;
  IF COALESCE(v_vc.applied_amount, 0) <> 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'ALREADY_APPLIED');
  END IF;

  -- المنشئ وحده — والمجهول منشئُه لا يملكه أحد فلا يُعدَّل من هذا الباب.
  IF v_vc.created_by_user_id IS NULL OR v_vc.created_by_user_id IS DISTINCT FROM v_actor THEN
    RETURN jsonb_build_object('success', false, 'error', 'NOT_CREATOR');
  END IF;

  SELECT lower(btrim(cm.role)), cm.branch_id INTO v_role, v_member_branch
    FROM company_members cm
   WHERE cm.company_id = v_vc.company_id AND cm.user_id = v_actor
   LIMIT 1;
  IF v_role IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'NOT_MEMBER');
  END IF;
  IF v_role NOT IN ('owner', 'general_manager', 'accountant') THEN
    RAISE EXCEPTION 'VENDOR_CREDIT_ROLE_FORBIDDEN: role % may not resubmit vendor credits | هذا الدور لا يعيد إرسال إشعارات دائنة (مصفوفة 865)', v_role;
  END IF;

  v_new_branch := COALESCE((p_credit->>'branch_id')::uuid, v_vc.branch_id);
  IF v_role = 'accountant' THEN
    -- محاسب الفرع مقيَّد بفرعه — ومحاسبٌ بلا فرعٍ مسجَّل يُرفض (865).
    IF v_member_branch IS NULL OR v_new_branch IS DISTINCT FROM v_member_branch THEN
      RAISE EXCEPTION 'VENDOR_CREDIT_BRANCH_SCOPE: branch accountant may only resubmit credits for their own branch | محاسب الفرع مقيَّد بفرعه';
    END IF;
  END IF;

  -- الرأس: أعمدة مسمّاة، والهوية محصَّنة، والحالة تعود للانتظار.
  UPDATE vendor_credits SET
    supplier_id          = COALESCE((p_credit->>'supplier_id')::uuid, supplier_id),
    credit_date          = COALESCE((p_credit->>'credit_date')::date, credit_date),
    subtotal             = COALESCE((p_credit->>'subtotal')::numeric, subtotal),
    tax_amount           = COALESCE((p_credit->>'tax_amount')::numeric, tax_amount),
    total_amount         = COALESCE((p_credit->>'total_amount')::numeric, total_amount),
    discount_type        = COALESCE(p_credit->>'discount_type', discount_type),
    discount_value       = COALESCE((p_credit->>'discount_value')::numeric, discount_value),
    discount_position    = COALESCE(p_credit->>'discount_position', discount_position),
    tax_inclusive        = COALESCE((p_credit->>'tax_inclusive')::boolean, tax_inclusive),
    shipping             = COALESCE((p_credit->>'shipping')::numeric, shipping),
    shipping_tax_rate    = COALESCE((p_credit->>'shipping_tax_rate')::numeric, shipping_tax_rate),
    notes                = CASE WHEN p_credit ? 'notes' THEN p_credit->>'notes' ELSE notes END,
    original_currency    = COALESCE(p_credit->>'original_currency', original_currency),
    original_subtotal    = COALESCE((p_credit->>'original_subtotal')::numeric, original_subtotal),
    original_tax_amount  = COALESCE((p_credit->>'original_tax_amount')::numeric, original_tax_amount),
    original_total_amount = COALESCE((p_credit->>'original_total_amount')::numeric, original_total_amount),
    exchange_rate_used   = COALESCE((p_credit->>'exchange_rate_used')::numeric, exchange_rate_used),
    exchange_rate_id     = COALESCE((p_credit->>'exchange_rate_id')::uuid, exchange_rate_id),
    branch_id            = v_new_branch,
    cost_center_id       = COALESCE((p_credit->>'cost_center_id')::uuid, cost_center_id),
    status               = 'pending_approval',
    updated_at           = now()
  WHERE id = p_credit_id AND status = 'rejected';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'VENDOR_CREDIT_RESUBMIT_RACE: % rows updated, expected 1', v_rows;
  END IF;

  -- البنود تُستبدل والقيد NULL — فلا يتولد أثر مخزونٍ من إدراجها (897).
  DELETE FROM vendor_credit_items WHERE vendor_credit_id = p_credit_id;
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    INSERT INTO public.vendor_credit_items (
      vendor_credit_id, product_id, description, quantity, unit_price,
      tax_rate, tax_code_id, discount_percent, account_id, line_total
    ) VALUES (
      p_credit_id,
      (v_item->>'product_id')::uuid,
       v_item->>'description',
      (v_item->>'quantity')::int,
      (v_item->>'unit_price')::numeric,
      COALESCE((v_item->>'tax_rate')::numeric, 0),
      (v_item->>'tax_code_id')::uuid,
      COALESCE((v_item->>'discount_percent')::numeric, 0),
      (v_item->>'account_id')::uuid,
      (v_item->>'line_total')::numeric
    );
  END LOOP;
  SELECT count(*) INTO v_count FROM public.vendor_credit_items WHERE vendor_credit_id = p_credit_id;
  IF jsonb_array_length(p_items) > 0 AND v_count <> jsonb_array_length(p_items) THEN
    RAISE EXCEPTION 'vendor credit % : % line(s) sent but % stored', p_credit_id, jsonb_array_length(p_items), v_count;
  END IF;

  -- مصفوفة 865 من جديد بدور المنشئ لحظةَ إعادة الإرسال.
  IF v_role = 'owner' THEN
    SELECT * INTO v_vc FROM vendor_credits WHERE id = p_credit_id;
    v_je := public.vendor_credit_post_journal(v_vc);
    UPDATE vendor_credits
       SET journal_entry_id = v_je, status = 'open', updated_at = now()
     WHERE id = p_credit_id AND status = 'pending_approval';
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows <> 1 THEN
      RAISE EXCEPTION 'VENDOR_CREDIT_RESUBMIT_RACE: % rows updated, expected 1', v_rows;
    END IF;
    RETURN jsonb_build_object('success', true, 'status', 'open', 'entry_id', v_je);
  END IF;

  -- إخطارات معلّقة سابقة لذات الإشعار تُؤرشف كى لا تزدحم النسختان.
  UPDATE notifications
     SET status = 'archived'
   WHERE company_id = v_vc.company_id
     AND reference_type = 'vendor_credit_pending'
     AND reference_id = p_credit_id
     AND status = 'unread';

  SELECT count(*) + 1 INTO v_resubmit_no
    FROM notifications
   WHERE company_id = v_vc.company_id
     AND reference_type = 'vendor_credit_pending'
     AND reference_id = p_credit_id;

  INSERT INTO notifications (
    company_id, branch_id, reference_type, reference_id,
    created_by, assigned_to_role,
    title, message, priority, status, event_key
  ) VALUES (
    v_vc.company_id, v_new_branch, 'vendor_credit_pending', p_credit_id,
    v_actor, 'owner',
    'إشعار دائن معدَّل بانتظار الاعتماد',
    'أُعيد إرسال الإشعار الدائن ' || COALESCE(v_vc.credit_number, '') || ' بعد تعديله بواسطة ' ||
      CASE WHEN v_role = 'general_manager' THEN 'المدير العام' ELSE 'محاسب الفرع' END ||
      ' — يحتاج اعتماداً قبل الترحيل (مصفوفة 865).',
    'high', 'unread',
    'vendor_credit_pending:' || p_credit_id::text || ':r' || v_resubmit_no::text
  );

  RETURN jsonb_build_object('success', true, 'status', 'pending_approval');
END;
$function$;

-- درس 844: تُضبط المنح — الدالة تفحص المنشئ والدور داخلياً فتُمنح للمسجَّلين.
REVOKE EXECUTE ON FUNCTION public.update_vendor_credit_with_items(uuid, jsonb, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_vendor_credit_with_items(uuid, jsonb, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.update_vendor_credit_with_items(uuid, jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_vendor_credit_with_items(uuid, jsonb, jsonb) TO service_role;
