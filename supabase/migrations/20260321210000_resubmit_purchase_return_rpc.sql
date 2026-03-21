-- ================================================================
-- RPC: resubmit_purchase_return
-- Allows creator to edit a rejected/warehouse_rejected return
-- and resubmit for admin approval. Resets workflow to pending_admin_approval.
-- ================================================================
CREATE OR REPLACE FUNCTION resubmit_purchase_return(
  p_return_id       UUID,
  p_user_id         UUID,
  p_purchase_return JSONB,
  p_return_items    JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_pr       RECORD;
  v_item     JSONB;
BEGIN
  -- Load and lock the return
  SELECT * INTO v_pr
  FROM purchase_returns
  WHERE id = p_return_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Purchase return not found');
  END IF;

  -- Only the creator or admin can resubmit
  IF v_pr.created_by != p_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only the creator can resubmit this return');
  END IF;

  -- Only allow resubmission from rejected states
  IF v_pr.workflow_status NOT IN ('rejected', 'warehouse_rejected') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format(
        'Cannot resubmit: return is not in a rejected state. Current status: %s',
        v_pr.workflow_status
      )
    );
  END IF;

  -- Update the return record with new data, reset workflow
  UPDATE purchase_returns SET
    reason             = COALESCE(NULLIF(p_purchase_return->>'reason', ''), reason),
    notes              = COALESCE(NULLIF(p_purchase_return->>'notes', ''), notes),
    settlement_method  = COALESCE(NULLIF(p_purchase_return->>'settlement_method', ''), settlement_method),
    return_date        = COALESCE(NULLIF(p_purchase_return->>'return_date', '')::DATE, return_date),
    subtotal           = COALESCE(NULLIF(p_purchase_return->>'subtotal', '')::NUMERIC, subtotal),
    tax_amount         = COALESCE(NULLIF(p_purchase_return->>'tax_amount', '')::NUMERIC, tax_amount),
    total_amount       = COALESCE(NULLIF(p_purchase_return->>'total_amount', '')::NUMERIC, total_amount),
    original_subtotal  = COALESCE(NULLIF(p_purchase_return->>'original_subtotal', '')::NUMERIC, original_subtotal),
    original_tax_amount= COALESCE(NULLIF(p_purchase_return->>'original_tax_amount', '')::NUMERIC, original_tax_amount),
    original_total_amount = COALESCE(NULLIF(p_purchase_return->>'original_total_amount', '')::NUMERIC, original_total_amount),
    -- Reset workflow
    status             = 'pending_approval',
    workflow_status    = 'pending_admin_approval',
    is_locked          = false,
    rejected_by        = NULL,
    rejected_at        = NULL,
    rejection_reason   = NULL,
    warehouse_rejected_by     = NULL,
    warehouse_rejected_at     = NULL,
    warehouse_rejection_reason = NULL,
    updated_at         = NOW()
  WHERE id = p_return_id;

  -- Replace return items
  DELETE FROM purchase_return_items WHERE purchase_return_id = p_return_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_return_items) LOOP
    INSERT INTO purchase_return_items (
      purchase_return_id, bill_item_id, product_id,
      description, quantity, unit_price, tax_rate, discount_percent, line_total
    ) VALUES (
      p_return_id,
      NULLIF(v_item->>'bill_item_id', '')::UUID,
      NULLIF(v_item->>'product_id', '')::UUID,
      v_item->>'description',
      COALESCE((v_item->>'quantity')::NUMERIC, 0),
      COALESCE((v_item->>'unit_price')::NUMERIC, 0),
      COALESCE((v_item->>'tax_rate')::NUMERIC, 0),
      COALESCE((v_item->>'discount_percent')::NUMERIC, 0),
      COALESCE((v_item->>'line_total')::NUMERIC, 0)
    );
  END LOOP;

  -- Audit log
  INSERT INTO audit_logs (
    company_id, user_id, action, target_table, record_id, old_data, new_data, created_at
  ) VALUES (
    v_pr.company_id, p_user_id,
    'SUBMIT',
    'purchase_returns',
    p_return_id,
    jsonb_build_object('workflow_status', v_pr.workflow_status, 'status', v_pr.status),
    jsonb_build_object('workflow_status', 'pending_admin_approval', 'status', 'pending_approval'),
    NOW()
  );

  RETURN jsonb_build_object(
    'success',         true,
    'purchase_return_id', p_return_id,
    'workflow_status', 'pending_admin_approval',
    'company_id',      v_pr.company_id,
    'bill_id',         v_pr.bill_id
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

COMMENT ON FUNCTION resubmit_purchase_return IS
  'Allows the return creator to edit and resubmit a rejected/warehouse_rejected return. Resets workflow to pending_admin_approval.';
