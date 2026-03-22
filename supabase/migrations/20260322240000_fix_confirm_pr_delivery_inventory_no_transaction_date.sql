-- ==============================================================================
-- Fix: inventory_transactions has no column transaction_date on production (42703)
-- Align confirm_purchase_return_delivery_v2 with schema used elsewhere (e.g. multi-warehouse PR).
-- Timestamp of movement = created_at (default).
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.confirm_purchase_return_delivery_v2(
  p_purchase_return_id UUID,
  p_confirmed_by UUID,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pr RECORD;
  v_company_id UUID;
  v_supplier_id UUID;
  v_bill_id UUID;
  v_transition JSONB;
  v_item RECORD;
  v_inventory_account_id UUID;
  v_vat_account_id UUID;
  v_vendor_credit_account_id UUID;
  v_je_id UUID;
  v_credit_id UUID;
  v_branch_id UUID;
  v_cc_id UUID;
BEGIN
  SELECT * INTO v_pr
  FROM purchase_returns
  WHERE id = p_purchase_return_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Purchase return not found';
  END IF;

  v_company_id := v_pr.company_id;
  v_supplier_id := v_pr.supplier_id;
  v_bill_id := v_pr.bill_id;

  IF v_pr.workflow_status NOT IN ('pending_warehouse', 'pending_approval') THEN
    RAISE EXCEPTION 'Return is not pending warehouse confirmation. Current workflow_status: %', v_pr.workflow_status;
  END IF;

  v_branch_id := COALESCE(
    v_pr.branch_id,
    (SELECT b.id FROM branches b
     WHERE b.company_id = v_company_id AND COALESCE(b.is_active, true)
     ORDER BY b.is_main DESC NULLS LAST, b.name
     LIMIT 1)
  );
  v_cc_id := v_pr.cost_center_id;

  IF v_branch_id IS NULL THEN
    RAISE EXCEPTION 'Cannot confirm return: no branch on purchase return and no active branch for company';
  END IF;

  v_transition := transition_purchase_return_state(
    p_purchase_return_id,
    v_company_id,
    p_confirmed_by,
    'completed',
    p_notes
  );

  IF (v_transition->>'success')::boolean IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'State transition failed: %', v_transition;
  END IF;

  v_je_id := v_pr.journal_entry_id;

  IF v_je_id IS NOT NULL THEN
    UPDATE journal_entries
    SET
      status = 'posted',
      branch_id = COALESCE(branch_id, v_branch_id),
      cost_center_id = COALESCE(cost_center_id, v_cc_id),
      updated_at = NOW()
    WHERE id = v_je_id
      AND status = 'draft';
  ELSE
    SELECT id INTO v_inventory_account_id
    FROM chart_of_accounts
    WHERE company_id = v_company_id AND sub_type = 'inventory'
    LIMIT 1;

    SELECT id INTO v_vat_account_id
    FROM chart_of_accounts
    WHERE company_id = v_company_id AND sub_type = 'vat_input'
    LIMIT 1;

    SELECT id INTO v_vendor_credit_account_id
    FROM chart_of_accounts
    WHERE company_id = v_company_id
      AND (sub_type = 'vendor_credit_liability' OR sub_type = 'accounts_payable')
    LIMIT 1;

    INSERT INTO journal_entries (
      company_id, branch_id, cost_center_id,
      reference_type, reference_id,
      entry_date, description, status
    ) VALUES (
      v_company_id, v_branch_id, v_cc_id,
      'purchase_return', p_purchase_return_id,
      COALESCE(v_pr.return_date, CURRENT_DATE),
      'مرتجع مشتريات ' || COALESCE(v_pr.return_number, ''),
      'posted'
    ) RETURNING id INTO v_je_id;

    UPDATE purchase_returns SET journal_entry_id = v_je_id WHERE id = p_purchase_return_id;

    IF v_vendor_credit_account_id IS NOT NULL AND COALESCE(v_pr.total_amount, 0) > 0 THEN
      INSERT INTO journal_entry_lines (
        journal_entry_id, account_id, debit_amount, credit_amount,
        description, branch_id, cost_center_id
      ) VALUES (
        v_je_id, v_vendor_credit_account_id, v_pr.total_amount, 0,
        'تخفيض الموردين - إشعار مدين', v_branch_id, v_cc_id
      );
    END IF;

    IF v_inventory_account_id IS NOT NULL AND COALESCE(v_pr.subtotal, 0) > 0 THEN
      INSERT INTO journal_entry_lines (
        journal_entry_id, account_id, debit_amount, credit_amount,
        description, branch_id, cost_center_id
      ) VALUES (
        v_je_id, v_inventory_account_id, 0, v_pr.subtotal,
        'مخزون مرتجع للمورد', v_branch_id, v_cc_id
      );
    END IF;

    IF v_vat_account_id IS NOT NULL AND COALESCE(v_pr.tax_amount, 0) > 0 THEN
      INSERT INTO journal_entry_lines (
        journal_entry_id, account_id, debit_amount, credit_amount,
        description, branch_id, cost_center_id
      ) VALUES (
        v_je_id, v_vat_account_id, 0, v_pr.tax_amount,
        'عكس ضريبة المشتريات', v_branch_id, v_cc_id
      );
    END IF;
  END IF;

  UPDATE purchase_return_items
  SET is_deducted = true
  WHERE purchase_return_id = p_purchase_return_id
    AND COALESCE(is_deducted, false) = false;

  FOR v_item IN
    SELECT * FROM purchase_return_items
    WHERE purchase_return_id = p_purchase_return_id
  LOOP
    IF v_item.product_id IS NOT NULL THEN
      INSERT INTO inventory_transactions (
        company_id, product_id, transaction_type, quantity_change,
        reference_id, reference_type, journal_entry_id, notes,
        branch_id, cost_center_id, warehouse_id
      ) VALUES (
        v_company_id, v_item.product_id, 'purchase_return', -(v_item.quantity),
        p_purchase_return_id, 'purchase_return', v_je_id,
        'مرتجع مشتريات للمورد'
          || CASE
               WHEN v_pr.return_date IS NOT NULL
               THEN ' — تاريخ المرتجع: ' || v_pr.return_date::text
               ELSE ''
             END,
        v_branch_id, v_cc_id, v_pr.warehouse_id
      );
    END IF;

    IF v_item.bill_item_id IS NOT NULL THEN
      UPDATE bill_items
      SET returned_quantity = COALESCE(returned_quantity, 0) + v_item.quantity
      WHERE id = v_item.bill_item_id;
    END IF;
  END LOOP;

  IF v_bill_id IS NOT NULL THEN
    UPDATE bills
    SET
      returned_amount = COALESCE(returned_amount, 0) + v_pr.total_amount,
      return_status = CASE
        WHEN (COALESCE(returned_amount, 0) + v_pr.total_amount) >= COALESCE(total_amount, 0)
        THEN 'fully_returned'
        ELSE 'partially_returned'
      END,
      updated_at = NOW()
    WHERE id = v_bill_id;
  END IF;

  IF v_pr.settlement_method IN ('debit_note', 'credit') AND COALESCE(v_pr.total_amount, 0) > 0 THEN
    IF NOT EXISTS (
      SELECT 1 FROM vendor_credits vc
      WHERE vc.source_purchase_return_id = p_purchase_return_id
    ) THEN
      INSERT INTO vendor_credits (
        company_id, supplier_id, bill_id,
        source_purchase_return_id, source_purchase_invoice_id, journal_entry_id,
        credit_number, credit_date, status,
        subtotal, tax_amount, total_amount, applied_amount,
        branch_id, cost_center_id, notes
      ) VALUES (
        v_company_id, v_supplier_id, v_bill_id,
        p_purchase_return_id, v_bill_id, v_je_id,
        'VC-' || REPLACE(COALESCE(v_pr.return_number, 'PR'), 'PRET-', ''),
        COALESCE(v_pr.return_date, CURRENT_DATE), 'open',
        COALESCE(v_pr.subtotal, 0), COALESCE(v_pr.tax_amount, 0), v_pr.total_amount, 0,
        v_branch_id, v_cc_id,
        'إشعار دائن — اعتماد مرتجع ' || COALESCE(v_pr.return_number, '')
      ) RETURNING id INTO v_credit_id;

      INSERT INTO vendor_credit_items (
        vendor_credit_id, product_id, description,
        quantity, unit_price, tax_rate, discount_percent, line_total
      )
      SELECT v_credit_id, pri.product_id, pri.description,
        pri.quantity, pri.unit_price, pri.tax_rate, pri.discount_percent, pri.line_total
      FROM purchase_return_items pri
      WHERE pri.purchase_return_id = p_purchase_return_id;
    END IF;
  END IF;

  UPDATE purchase_returns
  SET workflow_status = 'completed', updated_at = NOW()
  WHERE id = p_purchase_return_id;

  RETURN jsonb_build_object(
    'success', true,
    'purchase_return_id', p_purchase_return_id,
    'journal_entry_id', v_je_id,
    'vendor_credit_id', v_credit_id
  );
END;
$$;

COMMENT ON FUNCTION public.confirm_purchase_return_delivery_v2(uuid, uuid, text) IS
  'Warehouse confirms PR delivery. inventory_transactions: no transaction_date column on DB — use created_at; return_date echoed in notes when set.';

GRANT EXECUTE ON FUNCTION public.confirm_purchase_return_delivery_v2(uuid, uuid, text) TO authenticated;
