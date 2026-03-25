-- ============================================================
-- FIX: Bill status must be recalculated after purchase return
-- ============================================================
-- Edge case covered:
--   Bill total=1000, paid=1000 (status='paid')
--   Return is filed for 300
-- Expected result after return confirmation:
--   returned_amount = 300
--   net_outstanding = 1000 - 1000 - 300 = -300 → clamped to 0
--   The bill is now *overpaid* from a settlement perspective.
--   status MUST revert to 'paid' but vendor_credit is created for 300
--   (handled by v_vendor_credit_amount path in RPC already)
--
-- Core fix: also recalculate bill status when returned_amount changes
-- so that partial-return on an unpaid / partially-paid bill is reflected
-- correctly (e.g. bill=1000, paid=0, return=300 → status stays 'received'
-- but net_outstanding=700; bill=1000, paid=700, return=300 → status='paid')
-- ============================================================

CREATE OR REPLACE FUNCTION public.confirm_purchase_return_delivery_v2(
  p_purchase_return_id uuid,
  p_confirmed_by uuid,
  p_notes text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_pr                      RECORD;
  v_company_id              UUID;
  v_supplier_id             UUID;
  v_bill_id                 UUID;
  v_transition              JSONB;
  v_item                    RECORD;
  v_inventory_account_id    UUID;
  v_vat_account_id          UUID;
  v_ap_account_id           UUID;
  v_vc_liability_account_id UUID;
  v_fallback_liability_id   UUID;
  v_fx_account_id           UUID;
  v_je_id                   UUID;
  v_credit_id               UUID;
  v_branch_id               UUID;
  v_cc_id                   UUID;
  v_bill_total              NUMERIC(18, 4);
  v_bill_paid               NUMERIC(18, 4);
  v_remaining_ap            NUMERIC(18, 4);
  v_return_total            NUMERIC(18, 4);
  v_ap_reduction            NUMERIC(18, 4);
  v_vendor_credit_amount    NUMERIC(18, 4);
  v_vc_ratio                NUMERIC(18, 8);
  v_vc_sub                  NUMERIC(18, 4);
  v_vc_tax                  NUMERIC(18, 4);
  v_round_fix               NUMERIC(18, 4);
  v_financial_status        TEXT;
  v_rate_at_invoice         NUMERIC(18, 8);
  v_rate_at_return          NUMERIC(18, 8);
  v_fx_difference           NUMERIC(18, 4);
  v_is_foreign_currency     BOOLEAN;
  v_vc_gl_account           UUID;
  -- NEW: for bill status recalculation
  v_new_returned            NUMERIC(18, 4);
  v_net_amount              NUMERIC(18, 4);
  v_new_bill_status         TEXT;
  v_current_bill_status     TEXT;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_purchase_return_id::text));

  SELECT * INTO v_pr FROM purchase_returns WHERE id = p_purchase_return_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Purchase return not found'; END IF;

  v_company_id  := v_pr.company_id;
  v_supplier_id := v_pr.supplier_id;
  v_bill_id     := v_pr.bill_id;

  IF v_pr.workflow_status NOT IN ('pending_warehouse', 'pending_approval') THEN
    RAISE EXCEPTION 'Return not pending confirmation. workflow_status: %', v_pr.workflow_status;
  END IF;

  v_branch_id := COALESCE(v_pr.branch_id, (
    SELECT b.id FROM branches b
    WHERE b.company_id = v_company_id AND COALESCE(b.is_active, true)
    ORDER BY b.is_main DESC NULLS LAST, b.name LIMIT 1
  ));
  v_cc_id := v_pr.cost_center_id;
  IF v_branch_id IS NULL THEN RAISE EXCEPTION 'No branch found for company %', v_company_id; END IF;

  v_transition := transition_purchase_return_state(p_purchase_return_id, v_company_id, p_confirmed_by, 'completed', p_notes);
  IF (v_transition->>'success')::boolean IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'State transition failed: %', v_transition;
  END IF;

  v_bill_total := 0; v_bill_paid := 0; v_rate_at_invoice := 1.0;
  IF v_bill_id IS NOT NULL THEN
    SELECT COALESCE(b.total_amount, 0), COALESCE(b.paid_amount, 0), COALESCE(b.exchange_rate, 1.0),
           COALESCE(b.status, 'received')
    INTO v_bill_total, v_bill_paid, v_rate_at_invoice, v_current_bill_status
    FROM bills b WHERE b.id = v_bill_id AND b.company_id = v_company_id FOR UPDATE;
    IF NOT FOUND THEN v_bill_id := NULL; v_bill_total := 0; v_bill_paid := 0; v_rate_at_invoice := 1.0; END IF;
  END IF;

  v_rate_at_return      := COALESCE(v_pr.exchange_rate_at_return, 1.0);
  v_is_foreign_currency := (COALESCE(v_pr.original_currency, 'EGP') NOT IN ('EGP', '') AND v_rate_at_invoice != 1.0);
  v_remaining_ap         := GREATEST(v_bill_total - v_bill_paid, 0);
  v_return_total         := COALESCE(v_pr.total_amount, 0);

  IF v_bill_id IS NULL THEN
    v_ap_reduction := 0; v_vendor_credit_amount := v_return_total;
  ELSE
    v_ap_reduction         := LEAST(v_return_total, v_remaining_ap);
    v_vendor_credit_amount := GREATEST(v_return_total - v_ap_reduction, 0);
  END IF;

  v_fx_difference := 0;
  IF v_is_foreign_currency AND v_ap_reduction > 0 AND v_rate_at_invoice > 0 THEN
    v_fx_difference := ROUND(v_ap_reduction * (v_rate_at_return - v_rate_at_invoice), 4);
  END IF;

  v_financial_status := CASE WHEN v_pr.settlement_method IN ('cash', 'bank_transfer') THEN 'pending_refund' ELSE 'not_applicable' END;

  v_je_id := v_pr.journal_entry_id;
  PERFORM set_config('app.allow_direct_post', 'true', true);

  IF v_je_id IS NOT NULL THEN
    UPDATE journal_entries SET status = 'posted', branch_id = COALESCE(branch_id, v_branch_id),
      cost_center_id = COALESCE(cost_center_id, v_cc_id), updated_at = NOW()
    WHERE id = v_je_id AND status = 'draft';
  ELSE
    SELECT id INTO v_inventory_account_id FROM chart_of_accounts WHERE company_id = v_company_id AND sub_type = 'inventory' AND COALESCE(is_active, true) LIMIT 1;
    SELECT id INTO v_vat_account_id FROM chart_of_accounts WHERE company_id = v_company_id AND sub_type = 'vat_input' AND COALESCE(is_active, true) LIMIT 1;
    SELECT id INTO v_ap_account_id FROM chart_of_accounts WHERE company_id = v_company_id AND (sub_type = 'accounts_payable' OR sub_type = 'ap') AND COALESCE(is_active, true) ORDER BY CASE WHEN sub_type = 'accounts_payable' THEN 0 ELSE 1 END LIMIT 1;
    SELECT id INTO v_vc_liability_account_id FROM chart_of_accounts WHERE company_id = v_company_id AND sub_type = 'vendor_credit_liability' AND COALESCE(is_active, true) LIMIT 1;
    SELECT id INTO v_fallback_liability_id FROM chart_of_accounts WHERE company_id = v_company_id AND COALESCE(is_active, true) AND (sub_type = 'vendor_credit_liability' OR sub_type = 'accounts_payable' OR sub_type = 'ap') LIMIT 1;
    IF v_fx_difference != 0 THEN v_fx_account_id := get_or_create_fx_account(v_company_id); END IF;
    IF v_ap_reduction > 0 AND v_ap_account_id IS NULL THEN v_vendor_credit_amount := v_vendor_credit_amount + v_ap_reduction; v_ap_reduction := 0; END IF;
    IF v_vendor_credit_amount > 0 AND v_vc_liability_account_id IS NULL AND v_ap_account_id IS NOT NULL THEN v_ap_reduction := v_ap_reduction + v_vendor_credit_amount; v_vendor_credit_amount := 0; END IF;

    INSERT INTO journal_entries (company_id, branch_id, cost_center_id, reference_type, reference_id, entry_date, description, status)
    VALUES (v_company_id, v_branch_id, v_cc_id, 'purchase_return', p_purchase_return_id, COALESCE(v_pr.return_date, CURRENT_DATE), 'مرتجع مشتريات ' || COALESCE(v_pr.return_number, ''), 'posted')
    RETURNING id INTO v_je_id;
    UPDATE purchase_returns SET journal_entry_id = v_je_id WHERE id = p_purchase_return_id;

    IF v_return_total > 0 THEN
      IF v_ap_reduction > 0 AND v_ap_account_id IS NOT NULL THEN
        INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit_amount, credit_amount, description, branch_id, cost_center_id)
        VALUES (v_je_id, v_ap_account_id, v_ap_reduction, 0, 'تخفيض ذمم دائنة (AP) — مرتجع مشتريات', v_branch_id, v_cc_id);
      END IF;
      IF v_vendor_credit_amount > 0 THEN
        v_vc_gl_account := COALESCE(v_vc_liability_account_id, v_fallback_liability_id);
        IF v_vc_gl_account IS NULL THEN RAISE EXCEPTION 'No liability account found for company %', v_company_id; END IF;
        INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit_amount, credit_amount, description, branch_id, cost_center_id)
        VALUES (v_je_id, v_vc_gl_account, v_vendor_credit_amount, 0, CASE WHEN v_vc_liability_account_id IS NOT NULL THEN 'إشعار دائن مورد — يتجاوز AP المفتوح' ELSE 'تسوية مرتجع مشتريات (احتياطي)' END, v_branch_id, v_cc_id);
      END IF;
    END IF;

    IF v_fx_difference != 0 AND v_fx_account_id IS NOT NULL AND v_ap_account_id IS NOT NULL THEN
      IF v_fx_difference > 0 THEN
        INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit_amount, credit_amount, description, branch_id, cost_center_id) VALUES (v_je_id, v_fx_account_id, v_fx_difference, 0, 'خسارة فروق العملة — مرتجع مشتريات', v_branch_id, v_cc_id);
        INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit_amount, credit_amount, description, branch_id, cost_center_id) VALUES (v_je_id, v_ap_account_id, 0, v_fx_difference, 'تعديل AP — فروق العملة', v_branch_id, v_cc_id);
      ELSE
        INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit_amount, credit_amount, description, branch_id, cost_center_id) VALUES (v_je_id, v_ap_account_id, ABS(v_fx_difference), 0, 'تعديل AP — فروق العملة', v_branch_id, v_cc_id);
        INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit_amount, credit_amount, description, branch_id, cost_center_id) VALUES (v_je_id, v_fx_account_id, 0, ABS(v_fx_difference), 'ربح فروق العملة — مرتجع مشتريات', v_branch_id, v_cc_id);
      END IF;
    END IF;

    IF v_inventory_account_id IS NOT NULL AND COALESCE(v_pr.subtotal, 0) > 0 THEN
      INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit_amount, credit_amount, description, branch_id, cost_center_id) VALUES (v_je_id, v_inventory_account_id, 0, v_pr.subtotal, 'مخزون مرتجع للمورد', v_branch_id, v_cc_id);
    END IF;
    IF v_vat_account_id IS NOT NULL AND COALESCE(v_pr.tax_amount, 0) > 0 THEN
      INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit_amount, credit_amount, description, branch_id, cost_center_id) VALUES (v_je_id, v_vat_account_id, 0, v_pr.tax_amount, 'عكس ضريبة المشتريات', v_branch_id, v_cc_id);
    END IF;
  END IF;

  PERFORM set_config('app.allow_direct_post', 'false', true);

  UPDATE purchase_return_items SET is_deducted = true WHERE purchase_return_id = p_purchase_return_id AND COALESCE(is_deducted, false) = false;

  FOR v_item IN SELECT * FROM purchase_return_items WHERE purchase_return_id = p_purchase_return_id LOOP
    IF v_item.product_id IS NOT NULL THEN
      INSERT INTO inventory_transactions (company_id, product_id, transaction_type, quantity_change, reference_id, reference_type, journal_entry_id, notes, branch_id, cost_center_id, warehouse_id)
      VALUES (v_company_id, v_item.product_id, 'purchase_return', -(v_item.quantity), p_purchase_return_id, 'purchase_return', v_je_id,
        'مرتجع مشتريات للمورد' || CASE WHEN v_pr.return_date IS NOT NULL THEN ' — ' || v_pr.return_date::text ELSE '' END,
        v_branch_id, v_cc_id, v_pr.warehouse_id);
    END IF;
    IF v_item.bill_item_id IS NOT NULL THEN
      UPDATE bill_items SET returned_quantity = COALESCE(returned_quantity, 0) + v_item.quantity WHERE id = v_item.bill_item_id;
    END IF;
  END LOOP;

  -- ============================================================
  -- ✅ FIX (Edge Case 4): Recalculate bill status after return
  -- 
  -- Scenarios handled:
  --   A) Return before any payment   → status stays 'received' (net goes down, not yet paid)
  --   B) Partial return + partial pay → 'partially_paid' if paid < net; 'paid' if paid >= net
  --   C) Return after full payment   → paid_amount >= net_amount → status = 'paid'  
  --      (vendor credit already created for the overshoot — v_vendor_credit_amount)
  --      No status change needed — bill stays 'paid' and credit is tracked separately.
  --   D) Partial return, bill not yet paid → status reset to 'received' from prior 'paid'
  --      This happens if previous logic incorrectly set it to paid.
  -- ============================================================
  IF v_bill_id IS NOT NULL THEN
    -- Step 1: Accumulate new returned_amount
    v_new_returned := COALESCE((SELECT returned_amount FROM bills WHERE id = v_bill_id), 0) + v_pr.total_amount;

    -- Step 2: net payable = total - returned (floor at 0)
    v_net_amount := GREATEST(v_bill_total - v_new_returned, 0);

    -- Step 3: Determine correct status
    --   If bill was in draft/voided, don't touch status
    --   Otherwise recalculate based on net_amount vs paid_amount
    v_new_bill_status := CASE
      WHEN v_current_bill_status IN ('draft', 'voided') THEN v_current_bill_status
      WHEN v_bill_paid >= v_net_amount THEN 'paid'           -- paid >= net (covers returns after full pay)
      WHEN v_bill_paid > 0             THEN 'partially_paid' -- some paid but < net
      ELSE v_current_bill_status                             -- 'received' or 'partially_returned'
    END;

    UPDATE bills SET
      returned_amount = v_new_returned,
      return_status   = CASE
                          WHEN v_new_returned >= v_bill_total THEN 'fully_returned'
                          ELSE 'partially_returned'
                        END,
      status          = v_new_bill_status,
      updated_at      = NOW()
    WHERE id = v_bill_id;
  END IF;

  IF v_vendor_credit_amount > 0 AND COALESCE(v_pr.total_amount, 0) > 0
     AND NOT EXISTS (SELECT 1 FROM vendor_credits vc WHERE vc.source_purchase_return_id = p_purchase_return_id)
  THEN
    v_vc_ratio  := COALESCE(v_vendor_credit_amount / NULLIF(v_return_total, 0), 0);
    v_vc_sub    := ROUND(COALESCE(v_pr.subtotal, 0) * v_vc_ratio, 2);
    v_vc_tax    := ROUND(COALESCE(v_pr.tax_amount, 0) * v_vc_ratio, 2);
    v_round_fix := v_vendor_credit_amount - (v_vc_sub + v_vc_tax); v_vc_tax := v_vc_tax + v_round_fix;

    INSERT INTO vendor_credits (company_id, supplier_id, bill_id, source_purchase_return_id, source_purchase_invoice_id, journal_entry_id, credit_number, credit_date, status, subtotal, tax_amount, total_amount, applied_amount, branch_id, cost_center_id, notes)
    VALUES (v_company_id, v_supplier_id, v_bill_id, p_purchase_return_id, v_bill_id, v_je_id,
      'VC-' || REPLACE(COALESCE(v_pr.return_number, 'PR'), 'PRET-', ''), COALESCE(v_pr.return_date, CURRENT_DATE),
      CASE WHEN v_pr.settlement_method IN ('cash', 'bank_transfer') THEN 'pending_refund' ELSE 'open' END,
      v_vc_sub, v_vc_tax, v_vendor_credit_amount, 0, v_branch_id, v_cc_id,
      CASE WHEN v_pr.settlement_method IN ('cash', 'bank_transfer') THEN 'إشعار دائن — انتظار استرداد نقدي/بنكي ' || COALESCE(v_pr.return_number, '') ELSE 'إشعار دائن — فوق AP المفتوح ' || COALESCE(v_pr.return_number, '') END
    ) RETURNING id INTO v_credit_id;

    INSERT INTO vendor_credit_items (vendor_credit_id, product_id, description, quantity, unit_price, tax_rate, discount_percent, line_total)
    SELECT v_credit_id, pri.product_id, pri.description, pri.quantity, pri.unit_price, pri.tax_rate, pri.discount_percent, ROUND(COALESCE(pri.line_total, 0) * v_vc_ratio, 2)
    FROM purchase_return_items pri WHERE pri.purchase_return_id = p_purchase_return_id;
  END IF;

  UPDATE purchase_returns SET workflow_status = 'completed', financial_status = v_financial_status, updated_at = NOW() WHERE id = p_purchase_return_id;

  RETURN jsonb_build_object(
    'success', true, 'purchase_return_id', p_purchase_return_id,
    'journal_entry_id', v_je_id, 'vendor_credit_id', v_credit_id,
    'open_ap_before_return', v_remaining_ap, 'ap_reduction_amount', v_ap_reduction,
    'vendor_credit_accounting_amount', v_vendor_credit_amount,
    'financial_status', v_financial_status,
    'fx_difference', v_fx_difference, 'rate_at_invoice', v_rate_at_invoice, 'rate_at_return', v_rate_at_return,
    'bill_status_after_return', v_new_bill_status,
    'bill_net_outstanding', v_net_amount
  );
END;
$function$;
