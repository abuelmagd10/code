-- v3.74.191 — approve_vendor_refund_request was matching the Vendor
-- Advances asset account by name pattern "%سلف الموردين%". The Egyptian
-- chart name "سلف ومقدمات للموردين" (note the connector and the prefix)
-- does NOT match that pattern, so the lookup fell through to the third
-- fallback, which picked accounts_payable / AP (code 2110). The refund
-- entry then credited AP instead of clearing the asset balance, leaving
-- a 3 EGP phantom credit on 2110 with no corresponding open bill — the
-- exact symptom ic_ap_balance flagged on 2026-06-17.
--
-- Two changes in this version:
--   1. Broaden the name match: %سلف%مورد% / %مقدمات%مورد% / English
--      variants — so the Egyptian spelling matches.
--   2. Add an account_code lookup (1180 / 1230 / 1240) BEFORE the name
--      pattern, because account_code is much more stable than localised
--      account names.
--   3. REMOVE the AP fallback. Silently turning a Vendor Advance
--      settlement into an AP credit is a footgun. If the chart is
--      misconfigured we now fail with a clear instruction to the user.
--
-- A companion audit-correction JE was posted at deploy time to move the
-- existing 3 EGP from 2110 to 1180 (see commit notes).

CREATE OR REPLACE FUNCTION public.approve_vendor_refund_request(p_request_id uuid, p_company_id uuid, p_action text, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id       UUID := auth.uid();
  v_user_role     TEXT;
  v_req           RECORD;
  v_je_id         UUID;
  v_supplier_debit UUID;
  v_je_ref_id     UUID := gen_random_uuid();
  v_branch_id     UUID;
BEGIN
  SELECT role INTO v_user_role
  FROM public.company_members
  WHERE company_id = p_company_id AND user_id = v_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'User is not a member of this company');
  END IF;

  IF v_user_role NOT IN ('owner', 'admin', 'general_manager', 'manager') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient permissions. Only admin/owner/manager can approve.');
  END IF;

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

  IF p_action != 'approve' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid action. Must be approve or reject.');
  END IF;

  -- (1) sub_type — cleanest contract.
  SELECT id INTO v_supplier_debit
  FROM public.chart_of_accounts
  WHERE company_id = p_company_id
    AND sub_type IN ('vendor_debit', 'supplier_advance', 'vendor_advance')
    AND is_active = TRUE
  ORDER BY created_at
  LIMIT 1;

  -- (2) Standard codes for Vendor Advances.
  IF v_supplier_debit IS NULL THEN
    SELECT id INTO v_supplier_debit
    FROM public.chart_of_accounts
    WHERE company_id = p_company_id
      AND account_code IN ('1180', '1230', '1240')
      AND is_active = TRUE
    ORDER BY account_code
    LIMIT 1;
  END IF;

  -- (3) Broadened name patterns — Arabic + English.
  IF v_supplier_debit IS NULL THEN
    SELECT id INTO v_supplier_debit
    FROM public.chart_of_accounts
    WHERE company_id = p_company_id
      AND (
        account_name ILIKE '%سلف%مورد%'
        OR account_name ILIKE '%مقدمات%مورد%'
        OR account_name ILIKE '%رصيد%مورد%مدين%'
        OR account_name ILIKE '%vendor advance%'
        OR account_name ILIKE '%supplier advance%'
        OR account_name ILIKE '%prepaid%vendor%'
        OR account_name ILIKE '%prepaid%supplier%'
      )
      AND is_active = TRUE
    ORDER BY created_at
    LIMIT 1;
  END IF;

  -- AP fallback REMOVED — fail loud rather than corrupt the AP ledger.
  IF v_supplier_debit IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'لم يتم العثور على حساب «سلف ومقدمات للموردين». أضف الحساب فى الدليل المحاسبى (كود 1180) أو ضع sub_type = vendor_advance قبل إعادة المحاولة. لن يتم الترحيل على حساب الموردين الدائن.'
    );
  END IF;

  v_branch_id := COALESCE(
    v_req.branch_id,
    (SELECT b.id FROM branches b WHERE b.company_id = p_company_id AND COALESCE(b.is_active, true) ORDER BY b.is_main DESC NULLS LAST, b.name LIMIT 1)
  );

  IF v_branch_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'لم يتم العثور على فرع فعال للقيام بالعملية.');
  END IF;

  PERFORM set_config('app.allow_direct_post', 'true', true);

  INSERT INTO public.journal_entries (
    company_id, reference_type, reference_id,
    entry_date, description, branch_id, cost_center_id, status
  )
  VALUES (
    p_company_id, 'vendor_refund', v_je_ref_id, v_req.receipt_date,
    COALESCE(v_req.notes, 'استرداد نقدي من المورد - اعتمد بواسطة النظام'),
    v_branch_id, v_req.cost_center_id, 'draft'
  )
  RETURNING id INTO v_je_id;

  INSERT INTO public.journal_entry_lines (
    journal_entry_id, account_id, debit_amount, credit_amount, description,
    original_currency, original_debit, original_credit, exchange_rate_used,
    branch_id, cost_center_id
  )
  VALUES (
    v_je_id, v_req.receipt_account_id, v_req.base_amount, 0,
    'استقبال نقدي/بنكي من المورد',
    v_req.currency, v_req.amount, 0, v_req.exchange_rate,
    v_branch_id, v_req.cost_center_id
  );

  INSERT INTO public.journal_entry_lines (
    journal_entry_id, account_id, debit_amount, credit_amount, description,
    original_currency, original_debit, original_credit, exchange_rate_used,
    branch_id, cost_center_id
  )
  VALUES (
    v_je_id, v_supplier_debit, 0, v_req.base_amount,
    'تسوية سلفة المورد - استرداد',
    v_req.currency, 0, v_req.amount, v_req.exchange_rate,
    v_branch_id, v_req.cost_center_id
  );

  UPDATE public.journal_entries SET status = 'posted', updated_at = NOW() WHERE id = v_je_id;
  PERFORM set_config('app.allow_direct_post', 'false', true);

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
      WHERE company_id = p_company_id AND supplier_id = v_req.supplier_id
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

  UPDATE public.vendor_refund_requests
  SET status = 'approved', approved_by = v_user_id, approved_at = NOW(),
      journal_entry_id = v_je_id, updated_at = NOW()
  WHERE id = p_request_id;

  INSERT INTO public.audit_logs (company_id, user_id, action, target_table, record_id, old_data, new_data, created_at)
  VALUES (p_company_id, v_user_id, 'UPDATE', 'vendor_refund_requests', p_request_id,
          jsonb_build_object('status', 'pending_approval'),
          jsonb_build_object('status', 'approved', 'journal_entry_id', v_je_id), NOW());

  RETURN jsonb_build_object('success', true, 'action', 'approved',
    'request_id', p_request_id, 'journal_entry_id', v_je_id,
    'created_by', v_req.created_by);

EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.allow_direct_post', 'false', true);
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$function$;
