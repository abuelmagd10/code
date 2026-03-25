-- Make purchase return state transitions resilient to legacy status/workflow mismatches.
-- This specifically avoids warehouse confirmation failures when
-- status='approved' but workflow_status='pending_warehouse' (or similar legacy combinations).

CREATE OR REPLACE FUNCTION public.transition_purchase_return_state(
  p_pr_id uuid,
  p_company_id uuid,
  p_user_id uuid,
  p_new_state varchar,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_status varchar;
  v_old_workflow varchar;
  v_pr_number varchar;
  v_payload jsonb;
  v_event_key varchar;
  v_audit_action text;
  v_effective_state varchar;
BEGIN
  SELECT status, workflow_status, return_number
  INTO v_old_status, v_old_workflow, v_pr_number
  FROM purchase_returns
  WHERE id = p_pr_id AND company_id = p_company_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Purchase return not found or access denied';
  END IF;

  v_effective_state := COALESCE(NULLIF(v_old_workflow, ''), v_old_status);

  IF p_new_state = 'approved' THEN
    IF COALESCE(v_old_workflow, v_old_status) NOT IN ('pending_admin_approval', 'pending_approval') THEN
      RAISE EXCEPTION
        'Invalid transition: Cannot approve a purchase return in status % / workflow_status %',
        v_old_status, v_old_workflow;
    END IF;

  ELSIF p_new_state = 'rejected' THEN
    IF COALESCE(v_old_workflow, v_old_status) NOT IN ('pending_admin_approval', 'pending_approval') THEN
      RAISE EXCEPTION
        'Invalid transition: Cannot reject a purchase return in status % / workflow_status %',
        v_old_status, v_old_workflow;
    END IF;

  ELSIF p_new_state = 'completed' THEN
    IF v_old_status NOT IN ('approved', 'partially_returned', 'pending_warehouse')
       AND v_effective_state NOT IN ('pending_warehouse', 'pending_approval', 'approved', 'partially_returned')
    THEN
      RAISE EXCEPTION
        'Invalid transition: Cannot complete a purchase return in status % / workflow_status %',
        v_old_status, v_old_workflow;
    END IF;

  ELSIF p_new_state = 'closed' THEN
    IF COALESCE(v_old_workflow, v_old_status) NOT IN ('completed', 'returned') THEN
      RAISE EXCEPTION
        'Invalid transition: Cannot close a purchase return in status % / workflow_status %',
        v_old_status, v_old_workflow;
    END IF;

  ELSE
    RAISE EXCEPTION 'Invalid new state: %', p_new_state;
  END IF;

  v_audit_action := CASE trim(lower(p_new_state::text))
    WHEN 'completed' THEN 'CONFIRM'
    WHEN 'approved' THEN 'APPROVE'
    WHEN 'rejected' THEN 'REJECT'
    WHEN 'closed' THEN 'CLOSE'
    ELSE 'UPDATE'
  END;

  UPDATE purchase_returns
  SET
    status = p_new_state,
    workflow_status = p_new_state,
    updated_at = NOW(),
    notes = CASE WHEN p_notes IS NOT NULL THEN p_notes ELSE notes END,
    approved_by = CASE WHEN p_new_state = 'approved' THEN p_user_id ELSE approved_by END,
    approved_at = CASE WHEN p_new_state = 'approved' THEN NOW() ELSE approved_at END,
    rejected_by = CASE WHEN p_new_state = 'rejected' THEN p_user_id ELSE rejected_by END,
    rejected_at = CASE WHEN p_new_state = 'rejected' THEN NOW() ELSE rejected_at END
  WHERE id = p_pr_id;

  v_payload := jsonb_build_object(
    'return_id', p_pr_id,
    'return_number', v_pr_number,
    'old_status', v_old_status,
    'old_workflow_status', v_old_workflow,
    'new_state', p_new_state,
    'notes', p_notes
  );
  v_event_key := 'purchase_return.' || p_new_state || '.' || p_pr_id::text;

  INSERT INTO system_events (
    company_id, event_type, reference_type, reference_id, payload, user_id, event_key
  ) VALUES (
    p_company_id,
    'purchase_return.' || p_new_state,
    'purchase_return',
    p_pr_id,
    v_payload,
    p_user_id,
    v_event_key
  )
  ON CONFLICT (event_key) DO NOTHING;

  INSERT INTO audit_logs (
    company_id, user_id, action, target_table, record_id, old_data, new_data, created_at
  ) VALUES (
    p_company_id,
    p_user_id,
    v_audit_action,
    'purchase_returns',
    p_pr_id,
    jsonb_build_object('status', v_old_status, 'workflow_status', v_old_workflow),
    jsonb_build_object(
      'from_status', v_old_status,
      'from_workflow_status', v_old_workflow,
      'to_state', p_new_state,
      'notes', p_notes,
      'transitioned_at', NOW()
    ),
    NOW()
  );

  RETURN jsonb_build_object(
    'success', true,
    'old_status', v_old_status,
    'old_workflow_status', v_old_workflow,
    'new_state', p_new_state
  );
END;
$$;

COMMENT ON FUNCTION public.transition_purchase_return_state(uuid, uuid, uuid, varchar, text) IS
  'PR state machine; tolerant of legacy status/workflow mismatches during warehouse confirmation.';
