-- v3.74.373 — Extend get_user_approval_badges to count pending
-- discount approvals for the sidebar/inbox badge.
--
-- Stage 2 of the discount-approval rollout (the inbox UI). The
-- existing /approvals page already polls this RPC for every other
-- workflow it knows about; adding the discount counter here is what
-- makes the new "خصومات" tab show a non-zero number on the sidebar
-- without any other plumbing.
--
-- Governance
--   Per the owner's call (recorded in v3.74.372), only the owner +
--   general manager approve discounts. We match that exactly: any
--   role in {owner, admin, general_manager} sees the count; everyone
--   else gets zero (and the row will be omitted from the jsonb).
--
-- Compatibility
--   Body of the RPC is byte-identical to v3.74.372 except for the
--   final block that adds the discount_approval key. No existing
--   counts change shape or value, so the sidebar component continues
--   to render the other workflows exactly as before.

CREATE OR REPLACE FUNCTION public.get_user_approval_badges(p_user_id uuid, p_company_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_role         text;
  v_branch_id    uuid;
  v_warehouse_id uuid;
  v_result       jsonb := '{}'::jsonb;
  v_n            int;
  v_is_admin     boolean;
BEGIN
  IF p_user_id IS NULL OR p_company_id IS NULL THEN RETURN '{}'::jsonb; END IF;
  SELECT role, branch_id, warehouse_id INTO v_role, v_branch_id, v_warehouse_id
  FROM company_members WHERE user_id = p_user_id AND company_id = p_company_id;
  IF v_role IS NULL THEN RETURN '{}'::jsonb; END IF;
  v_is_admin := v_role IN ('owner','admin');

  IF v_is_admin OR v_role IN ('general_manager','manager','accountant') THEN
    SELECT count(*) INTO v_n FROM sales_return_requests
    WHERE company_id = p_company_id
      AND status IN ('pending','pending_approval_level_1')
      AND (v_is_admin OR v_role = 'general_manager'
           OR (v_role IN ('manager','accountant') AND v_branch_id IS NOT NULL AND branch_id = v_branch_id));
    v_result := v_result || jsonb_build_object('sales_return_request_l1', v_n);
  END IF;

  IF v_is_admin OR v_role IN ('store_manager','warehouse_manager','general_manager') THEN
    SELECT count(*) INTO v_n FROM sales_return_requests
    WHERE company_id = p_company_id AND status = 'pending_warehouse_approval'
      AND (v_is_admin OR v_role = 'general_manager'
           OR (v_warehouse_id IS NOT NULL AND warehouse_id = v_warehouse_id)
           OR (v_warehouse_id IS NULL AND v_branch_id IS NOT NULL AND branch_id = v_branch_id));
    v_result := v_result || jsonb_build_object('sales_return_request_warehouse', v_n);
  END IF;

  IF v_is_admin OR v_role IN ('general_manager','manager','accountant') THEN
    SELECT count(*) INTO v_n FROM customer_debit_notes
    WHERE company_id = p_company_id AND approval_status = 'pending_approval'
      AND (v_is_admin OR v_role = 'general_manager'
           OR (v_role IN ('manager','accountant') AND v_branch_id IS NOT NULL AND branch_id = v_branch_id));
    v_result := v_result || jsonb_build_object('customer_debit_note', v_n);
  END IF;

  IF v_is_admin OR v_role IN ('general_manager','accountant') THEN
    SELECT count(*) INTO v_n FROM customer_refund_requests
    WHERE company_id = p_company_id AND status = 'pending';
    v_result := v_result || jsonb_build_object('customer_refund_request', v_n);
  END IF;

  IF v_is_admin OR v_role IN ('general_manager','manager','purchasing_officer') THEN
    SELECT count(*) INTO v_n FROM purchase_requests
    WHERE company_id = p_company_id AND status = 'pending_approval'
      AND (v_is_admin OR v_role = 'general_manager'
           OR (v_role IN ('manager','purchasing_officer') AND v_branch_id IS NOT NULL AND branch_id = v_branch_id));
    v_result := v_result || jsonb_build_object('purchase_request', v_n);
  END IF;

  IF v_is_admin OR v_role IN ('general_manager','manager','accountant') THEN
    SELECT count(*) INTO v_n FROM purchase_returns
    WHERE company_id = p_company_id AND workflow_status = 'pending_admin_approval'
      AND (v_is_admin OR v_role = 'general_manager'
           OR (v_role IN ('manager','accountant') AND v_branch_id IS NOT NULL AND branch_id = v_branch_id));
    v_result := v_result || jsonb_build_object('purchase_return_admin', v_n);
  END IF;

  IF v_is_admin OR v_role IN ('store_manager','warehouse_manager','general_manager') THEN
    SELECT count(*) INTO v_n FROM purchase_returns
    WHERE company_id = p_company_id AND workflow_status = 'pending_warehouse'
      AND (v_is_admin OR v_role = 'general_manager'
           OR (v_warehouse_id IS NOT NULL AND warehouse_id = v_warehouse_id)
           OR (v_warehouse_id IS NULL AND v_branch_id IS NOT NULL AND branch_id = v_branch_id));
    v_result := v_result || jsonb_build_object('purchase_return_warehouse', v_n);
  END IF;

  IF v_is_admin OR v_role IN ('general_manager','accountant') THEN
    SELECT count(*) INTO v_n FROM vendor_refund_requests
    WHERE company_id = p_company_id AND status = 'pending_approval'
      AND (v_is_admin OR v_role = 'general_manager'
           OR (v_branch_id IS NOT NULL AND branch_id = v_branch_id));
    v_result := v_result || jsonb_build_object('vendor_refund_request', v_n);
  END IF;

  IF v_is_admin OR v_role IN ('store_manager','warehouse_manager','general_manager') THEN
    SELECT count(*) INTO v_n FROM bills
    WHERE company_id = p_company_id AND receipt_status = 'pending'
      AND COALESCE(status,'') NOT IN ('cancelled','draft')
      AND (v_is_admin OR v_role = 'general_manager'
           OR (v_warehouse_id IS NOT NULL AND warehouse_id = v_warehouse_id)
           OR (v_warehouse_id IS NULL AND v_branch_id IS NOT NULL AND branch_id = v_branch_id));
    v_result := v_result || jsonb_build_object('bill_receipt', v_n);
  END IF;

  IF v_is_admin OR v_role IN ('store_manager','warehouse_manager','general_manager') THEN
    SELECT count(*) INTO v_n FROM invoices
    WHERE company_id = p_company_id
      AND warehouse_status = 'pending'
      AND status IN ('sent','paid','partially_paid')
      AND (v_is_admin OR v_role = 'general_manager'
           OR (v_warehouse_id IS NOT NULL AND warehouse_id = v_warehouse_id)
           OR (v_warehouse_id IS NULL AND v_branch_id IS NOT NULL AND branch_id = v_branch_id));
    v_result := v_result || jsonb_build_object('dispatch_approval', v_n);
  END IF;

  IF v_is_admin OR v_role IN ('store_manager','warehouse_manager','general_manager','manager','accountant') THEN
    SELECT count(*) INTO v_n FROM inventory_transfers
    WHERE company_id = p_company_id AND status IN ('pending_approval','pending','in_transit')
      AND (
        v_is_admin OR v_role = 'general_manager'
        OR (v_role IN ('manager','accountant') AND status = 'pending_approval' AND v_branch_id IS NOT NULL
            AND (source_branch_id = v_branch_id OR destination_branch_id = v_branch_id))
        OR (v_role IN ('store_manager','warehouse_manager') AND status = 'pending'
            AND v_warehouse_id IS NOT NULL AND source_warehouse_id = v_warehouse_id)
        OR (v_role IN ('store_manager','warehouse_manager') AND status = 'in_transit'
            AND v_warehouse_id IS NOT NULL AND destination_warehouse_id = v_warehouse_id)
      );
    v_result := v_result || jsonb_build_object('inventory_transfer', v_n);
  END IF;

  IF v_is_admin OR v_role IN ('manager','general_manager','store_manager','warehouse_manager') THEN
    SELECT count(*) INTO v_n FROM inventory_write_offs
    WHERE company_id = p_company_id AND status = 'pending'
      AND (v_is_admin OR v_role = 'general_manager'
           OR (v_role = 'manager' AND v_branch_id IS NOT NULL AND branch_id = v_branch_id)
           OR (v_role IN ('store_manager','warehouse_manager') AND v_warehouse_id IS NOT NULL AND warehouse_id = v_warehouse_id));
    v_result := v_result || jsonb_build_object('inventory_write_off', v_n);
  END IF;

  IF v_is_admin OR v_role IN ('general_manager','manager','accountant') THEN
    SELECT count(*) INTO v_n FROM expenses
    WHERE company_id = p_company_id AND status = 'pending_approval'
      AND (v_is_admin OR v_role = 'general_manager'
           OR (v_role IN ('manager','accountant') AND v_branch_id IS NOT NULL AND branch_id = v_branch_id));
    v_result := v_result || jsonb_build_object('expense', v_n);
  END IF;

  IF v_is_admin OR v_role IN ('general_manager','manager','accountant') THEN
    SELECT count(*) INTO v_n FROM payments
    WHERE company_id = p_company_id AND status = 'pending_approval'
      AND (v_is_admin OR v_role = 'general_manager'
           OR (v_role IN ('manager','accountant') AND v_branch_id IS NOT NULL AND branch_id = v_branch_id));
    v_result := v_result || jsonb_build_object('payment_approval', v_n);
  END IF;

  IF v_is_admin OR v_role IN ('general_manager','accountant') THEN
    SELECT count(*) INTO v_n FROM bank_voucher_requests
    WHERE company_id = p_company_id AND status = 'pending'
      AND (v_is_admin OR v_role = 'general_manager'
           OR (v_branch_id IS NOT NULL AND branch_id = v_branch_id));
    v_result := v_result || jsonb_build_object('bank_voucher_request', v_n);
  END IF;

  IF v_is_admin OR v_role IN ('manufacturing_officer','manager','general_manager') THEN
    SELECT count(*) INTO v_n FROM manufacturing_material_issue_approvals
    WHERE company_id = p_company_id AND status = 'pending'
      AND (v_is_admin OR v_role IN ('general_manager','manager','manufacturing_officer'));
    v_result := v_result || jsonb_build_object('mfg_material_issue', v_n);
    SELECT count(*) INTO v_n FROM manufacturing_product_receive_approvals
    WHERE company_id = p_company_id AND status = 'pending';
    v_result := v_result || jsonb_build_object('mfg_product_receive', v_n);
  END IF;

  IF v_is_admin OR v_role IN ('general_manager','manager') THEN
    SELECT count(*) INTO v_n FROM permission_transfers
    WHERE company_id = p_company_id AND status = 'pending'
      AND transferred_by IS DISTINCT FROM p_user_id;
    v_result := v_result || jsonb_build_object('permission_transfer', v_n);
  END IF;

  -- v3.74.373 — discount approvals badge. Only owner/admin/general_manager
  -- are approvers per the owner's governance decision.
  IF v_is_admin OR v_role = 'general_manager' THEN
    SELECT count(*) INTO v_n FROM discount_approvals
    WHERE company_id = p_company_id AND status = 'pending';
    v_result := v_result || jsonb_build_object('discount_approval', v_n);
  END IF;

  RETURN v_result;
END;
$function$;

COMMENT ON FUNCTION public.get_user_approval_badges(uuid, uuid) IS
  'v3.74.373 - Returns pending-approval counts as a jsonb of {workflow_key: count}. Discount approvals (added in v3.74.373) are counted only for owner/admin/general_manager.';
