-- ================================================================
-- Fix: Correct audit_logs column names in purchase return RPCs
--      entity_type   → target_table
--      entity_id     → record_id
--      old_values    → old_data
--      new_values    → new_data
-- ================================================================

-- Fix approve_purchase_return_atomic
CREATE OR REPLACE FUNCTION approve_purchase_return_atomic(
  p_pr_id      UUID,
  p_user_id    UUID,
  p_company_id UUID,
  p_action     TEXT,
  p_reason     TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_pr          RECORD;
  v_user_role   TEXT;
  v_user_branch UUID;
  v_new_status  TEXT;
  v_new_wf      TEXT;
BEGIN
  SELECT role, branch_id INTO v_user_role, v_user_branch
  FROM public.company_members
  WHERE company_id = p_company_id AND user_id = p_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'User is not a member of this company');
  END IF;

  IF v_user_role NOT IN ('admin', 'owner', 'general_manager') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient permissions to approve purchase returns');
  END IF;

  SELECT * INTO v_pr
  FROM public.purchase_returns
  WHERE id = p_pr_id AND company_id = p_company_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Purchase return not found');
  END IF;

  IF v_user_role NOT IN ('owner', 'admin') THEN
    IF v_user_branch IS NOT NULL AND v_pr.branch_id IS NOT NULL AND v_user_branch != v_pr.branch_id THEN
      RETURN jsonb_build_object('success', false, 'error', 'Branch isolation violation');
    END IF;
  END IF;

  IF v_pr.workflow_status NOT IN ('pending_admin_approval', 'pending_approval') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format(
        'Purchase return is not pending admin approval. Current workflow_status: %s',
        v_pr.workflow_status
      )
    );
  END IF;

  IF p_action = 'approve' THEN
    v_new_status := 'approved';
    v_new_wf     := 'pending_warehouse';

    UPDATE public.purchase_returns
    SET
      status          = v_new_status,
      workflow_status = v_new_wf,
      approved_by     = p_user_id,
      approved_at     = NOW(),
      is_locked       = true,
      updated_at      = NOW()
    WHERE id = p_pr_id;

  ELSIF p_action = 'reject' THEN
    IF p_reason IS NULL OR TRIM(p_reason) = '' THEN
      RETURN jsonb_build_object('success', false, 'error', 'Rejection reason is required');
    END IF;

    v_new_status := 'rejected';
    v_new_wf     := 'rejected';

    UPDATE public.purchase_returns
    SET
      status           = v_new_status,
      workflow_status  = v_new_wf,
      rejected_by      = p_user_id,
      rejected_at      = NOW(),
      rejection_reason = p_reason,
      is_locked        = false,
      updated_at       = NOW()
    WHERE id = p_pr_id;

  ELSE
    RETURN jsonb_build_object('success', false, 'error', 'Invalid action. Must be approve or reject');
  END IF;

  INSERT INTO public.audit_logs (
    company_id, user_id, action, target_table, record_id, old_data, new_data, created_at
  ) VALUES (
    p_company_id, p_user_id,
    CASE p_action WHEN 'approve' THEN 'purchase_return_approved' ELSE 'purchase_return_rejected' END,
    'purchase_returns',
    p_pr_id,
    jsonb_build_object('status', v_pr.status, 'workflow_status', v_pr.workflow_status),
    jsonb_build_object('status', v_new_status, 'workflow_status', v_new_wf, 'reason', p_reason),
    NOW()
  );

  RETURN jsonb_build_object(
    'success',          true,
    'pr_id',            p_pr_id,
    'status',           v_new_status,
    'workflow_status',  v_new_wf,
    'created_by',       v_pr.created_by
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- Fix reject_warehouse_return
CREATE OR REPLACE FUNCTION reject_warehouse_return(
  p_purchase_return_id  UUID,
  p_rejected_by         UUID,
  p_reason              TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_pr RECORD;
BEGIN
  IF p_reason IS NULL OR TRIM(p_reason) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Warehouse rejection reason is required');
  END IF;

  SELECT * INTO v_pr
  FROM purchase_returns
  WHERE id = p_purchase_return_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Purchase return not found');
  END IF;

  IF v_pr.workflow_status NOT IN ('pending_warehouse', 'pending_approval') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format(
        'Cannot reject: return is not pending warehouse confirmation. Current status: %s',
        v_pr.workflow_status
      )
    );
  END IF;

  UPDATE purchase_returns
  SET
    workflow_status            = 'warehouse_rejected',
    warehouse_rejection_reason = p_reason,
    warehouse_rejected_by      = p_rejected_by,
    warehouse_rejected_at      = NOW(),
    is_locked                  = false,
    updated_at                 = NOW()
  WHERE id = p_purchase_return_id;

  INSERT INTO audit_logs (
    company_id, user_id, action, target_table, record_id, old_data, new_data, created_at
  ) VALUES (
    v_pr.company_id, p_rejected_by,
    'purchase_return_warehouse_rejected',
    'purchase_returns',
    p_purchase_return_id,
    jsonb_build_object('workflow_status', v_pr.workflow_status),
    jsonb_build_object('workflow_status', 'warehouse_rejected', 'reason', p_reason),
    NOW()
  );

  RETURN jsonb_build_object(
    'success',          true,
    'pr_id',            p_purchase_return_id,
    'workflow_status',  'warehouse_rejected',
    'created_by',       v_pr.created_by
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;
