-- Fix: approve_vendor_refund_request — enforce_je_integrity trigger blocked UPDATE to 'posted'
-- because it required current_user to be superuser when updating an empty JE.
-- Solution: Insert JE as 'draft', add lines, THEN update to 'posted' (lines exist = trigger passes).

CREATE OR REPLACE FUNCTION public.approve_vendor_refund_request(
  p_request_id  UUID,
  p_company_id  UUID,
  p_action      TEXT,
  p_reason      TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_user_id       UUID := auth.uid();
  v_user_role     TEXT;
  v_req           RECORD;
  v_je_id         UUID;
  v_supplier_debit UUID;
  v_je_ref_id     UUID := gen_random_uuid();
  v_branch_id     UUID;
BEGIN
  -- التحقق من الصلاحية
  SELECT role INTO v_user_role
  FROM public.company_members
  WHERE company_id = p_company_id AND user_id = v_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'User is not a member of this company');
  END IF;

  IF v_user_role NOT IN ('owner', 'admin', 'general_manager', 'manager') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient permissions. Only admin/owner/manager can approve.');
  END IF;

  -- جلب وقفل الطلب
  SELECT * INTO v_req
  FROM public.vendor_refund_requests
  WHERE id = p_request_id AND company_id = p_company_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Request not found');
  END IF;

  IF v_req.status != 'pending_approval' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Request is not in pending_approval state. Current status: ' || v_req.status);
  END IF;

  -- ===== رفض =====
  IF p_action = 'reject' THEN
    IF p_reason IS NULL OR TRIM(p_reason) = '' THEN
      RETURN jsonb_build_object('success', false, 'error', 'Rejection reason is required');
    END IF;

    UPDATE public.vendor_refund_requests
    SET status = 'rejected', rejected_by = v_user_id, rejected_at = NOW(),
        rejection_reason = p_reason, updated_at = NOW()
    WHERE id = p_request_id;

    INSERT INTO public.audit_logs (company_id, user_id, action, target_table, record_id, old_data, new_data, created_at)
    VALUES (p_company_id, v_user_id, 'UPDATE', 'vendor_refund_requests', p_request_id,
            jsonb_build_object('status', 'pending_approval'),
            jsonb_build_object('status', 'rejected', 'rejection_reason', p_reason), NOW());

    RETURN jsonb_build_object('success', true, 'action', 'rejected', 'request_id', p_request_id);
  END IF;

  -- ===== اعتماد =====
  IF p_action != 'approve' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid action. Must be approve or reject.');
  END IF;

  -- البحث عن حساب سلف الموردين
  SELECT id INTO v_supplier_debit
  FROM public.chart_of_accounts
  WHERE company_id = p_company_id
    AND sub_type IN ('vendor_debit', 'supplier_advance', 'vendor_advance')
    AND is_active = TRUE
  ORDER BY created_at
  LIMIT 1;

  IF v_supplier_debit IS NULL THEN
    SELECT id INTO v_supplier_debit
    FROM public.chart_of_accounts
    WHERE company_id = p_company_id
      AND (account_name ILIKE '%سلف الموردين%' OR account_name ILIKE '%رصيد الموردين%'
           OR account_name ILIKE '%vendor advance%' OR account_name ILIKE '%supplier advance%')
      AND is_active = TRUE
    ORDER BY created_at
    LIMIT 1;
  END IF;

  IF v_supplier_debit IS NULL THEN
    SELECT id INTO v_supplier_debit
    FROM public.chart_of_accounts
    WHERE company_id = p_company_id
      AND sub_type IN ('accounts_payable', 'ap')
      AND is_active = TRUE
    ORDER BY created_at
    LIMIT 1;
  END IF;

  IF v_supplier_debit IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'لم يتم العثور على حساب الموردين الرئيسي أو حساب سلف الموردين في الدليل المحاسبي. لا يمكن إنشاء القيد.');
  END IF;

  -- تحديد الفرع
  v_branch_id := COALESCE(
    v_req.branch_id,
    (SELECT b.id FROM branches b WHERE b.company_id = p_company_id AND COALESCE(b.is_active, true) ORDER BY b.is_main DESC NULLS LAST, b.name LIMIT 1)
  );

  IF v_branch_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'لم يتم العثور على فرع فعال للقيام بالعملية.');
  END IF;

  -- السماح بـ allow_direct_post للقيد
  PERFORM set_config('app.allow_direct_post', 'true', true);

  -- إنشاء رأس القيد المحاسبي كـ 'draft' أولاً
  INSERT INTO public.journal_entries (
    company_id, reference_type, reference_id,
    entry_date, description, branch_id, cost_center_id, status
  )
  VALUES (
    p_company_id,
    'vendor_refund',
    v_je_ref_id,
    v_req.receipt_date,
    COALESCE(v_req.notes, 'استرداد نقدي من المورد - اعتمد بواسطة النظام'),
    v_branch_id,
    v_req.cost_center_id,
    'draft'
  )
  RETURNING id INTO v_je_id;

  -- إضافة سطر مدين: النقد/البنك (دخول المبلغ)
  INSERT INTO public.journal_entry_lines (
    journal_entry_id, account_id,
    debit_amount, credit_amount, description,
    original_currency, original_debit, original_credit,
    exchange_rate_used, branch_id, cost_center_id
  )
  VALUES (
    v_je_id,
    v_req.receipt_account_id,
    v_req.base_amount, 0,
    'استقبال نقدي/بنكي من المورد',
    v_req.currency, v_req.amount, 0,
    v_req.exchange_rate,
    v_branch_id, v_req.cost_center_id
  );

  -- إضافة سطر دائن: الموردين أو سلف الموردين
  INSERT INTO public.journal_entry_lines (
      journal_entry_id, account_id,
      debit_amount, credit_amount, description,
      original_currency, original_debit, original_credit,
      exchange_rate_used, branch_id, cost_center_id
  )
  VALUES (
      v_je_id,
      v_supplier_debit,
      0, v_req.base_amount,
      'تسوية رصيد المورد المدين - استرداد',
      v_req.currency, 0, v_req.amount,
      v_req.exchange_rate,
      v_branch_id, v_req.cost_center_id
  );

  -- الآن نُرحّل القيد (بعد وجود الأسطر — يتجاوز شرط enforce_je_integrity)
  UPDATE public.journal_entries
  SET status = 'posted', updated_at = NOW()
  WHERE id = v_je_id;

  -- إعادة ضبط app.allow_direct_post
  PERFORM set_config('app.allow_direct_post', 'false', true);

  -- خصم من vendor_credits
  DECLARE
    v_remaining   NUMERIC := v_req.amount;
    v_credit      RECORD;
    v_available   NUMERIC;
    v_deduct      NUMERIC;
    v_new_applied NUMERIC;
    v_new_status  TEXT;
  BEGIN
    FOR v_credit IN (
      SELECT id, total_amount, applied_amount
      FROM public.vendor_credits
      WHERE company_id = p_company_id
        AND supplier_id = v_req.supplier_id
        AND status IN ('open', 'partially_applied')
      ORDER BY credit_date ASC
      FOR UPDATE
    ) LOOP
      EXIT WHEN v_remaining <= 0;
      v_available := COALESCE(v_credit.total_amount, 0) - COALESCE(v_credit.applied_amount, 0);
      CONTINUE WHEN v_available <= 0;
      v_deduct := LEAST(v_available, v_remaining);
      v_new_applied := COALESCE(v_credit.applied_amount, 0) + v_deduct;
      v_new_status := CASE WHEN v_new_applied >= COALESCE(v_credit.total_amount, 0) THEN 'applied' ELSE 'partially_applied' END;
      UPDATE public.vendor_credits
      SET applied_amount = v_new_applied, status = v_new_status, updated_at = NOW()
      WHERE id = v_credit.id;
      v_remaining := v_remaining - v_deduct;
    END LOOP;
  END;

  -- تحديث حالة الطلب
  UPDATE public.vendor_refund_requests
  SET status = 'approved', approved_by = v_user_id, approved_at = NOW(),
      journal_entry_id = v_je_id, updated_at = NOW()
  WHERE id = p_request_id;

  -- سجل تدقيق
  INSERT INTO public.audit_logs (company_id, user_id, action, target_table, record_id, old_data, new_data, created_at)
  VALUES (p_company_id, v_user_id, 'UPDATE', 'vendor_refund_requests', p_request_id,
          jsonb_build_object('status', 'pending_approval'),
          jsonb_build_object('status', 'approved', 'journal_entry_id', v_je_id), NOW());

  RETURN jsonb_build_object(
    'success', true,
    'action', 'approved',
    'request_id', p_request_id,
    'journal_entry_id', v_je_id,
    'created_by', v_req.created_by
  );

EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.allow_direct_post', 'false', true);
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;
