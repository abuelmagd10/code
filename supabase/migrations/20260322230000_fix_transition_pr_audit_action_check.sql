-- ==============================================================================
-- إصلاح: audit_logs_action_check لا يقبل 'purchase_return_state_transition'
-- الخطأ: new row for relation "audit_logs" violates check constraint "audit_logs_action_check"
-- الحل: تعيين action من القيم المسموحة حسب الحالة (CONFIRM عند اكتمال المخزن، إلخ)
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.transition_purchase_return_state(
  p_pr_id      UUID,
  p_company_id UUID,
  p_user_id    UUID,
  p_new_state  VARCHAR,
  p_notes      TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_state VARCHAR;
  v_pr_number VARCHAR;
  v_payload JSONB;
  v_event_key VARCHAR;
  v_audit_action TEXT;
BEGIN
  SELECT status, return_number INTO v_old_state, v_pr_number
  FROM purchase_returns
  WHERE id = p_pr_id AND company_id = p_company_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Purchase return not found or access denied';
  END IF;

  IF p_new_state = 'approved' THEN
    IF v_old_state != 'pending_approval' THEN
      RAISE EXCEPTION 'Invalid transition: Cannot approve a purchase return in % state', v_old_state;
    END IF;

  ELSIF p_new_state = 'rejected' THEN
    IF v_old_state != 'pending_approval' THEN
      RAISE EXCEPTION 'Invalid transition: Cannot reject a purchase return in % state', v_old_state;
    END IF;

  ELSIF p_new_state = 'completed' THEN
    -- approved / partially_returned: التدفق القياسي؛ pending_warehouse: إن كان status متزامناً مع workflow
    IF v_old_state NOT IN ('approved', 'partially_returned', 'pending_warehouse') THEN
      RAISE EXCEPTION 'Invalid transition: Cannot complete a purchase return in % state (must be approved)', v_old_state;
    END IF;

  ELSIF p_new_state = 'closed' THEN
    IF v_old_state NOT IN ('completed', 'returned') THEN
      RAISE EXCEPTION 'Invalid transition: Cannot close a purchase return in % state (must be completed first)', v_old_state;
    END IF;

  ELSE
    RAISE EXCEPTION 'Invalid new state: %', p_new_state;
  END IF;

  v_audit_action := CASE trim(lower(p_new_state::text))
    WHEN 'completed' THEN 'CONFIRM'
    WHEN 'approved'  THEN 'APPROVE'
    WHEN 'rejected'  THEN 'REJECT'
    WHEN 'closed'    THEN 'CLOSE'
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
    'old_state', v_old_state,
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
    jsonb_build_object('status', v_old_state),
    jsonb_build_object(
      'from_state', v_old_state,
      'to_state', p_new_state,
      'notes', p_notes,
      'transitioned_at', NOW()
    ),
    NOW()
  );

  RETURN jsonb_build_object('success', true, 'old_state', v_old_state, 'new_state', p_new_state);
END;
$$;

COMMENT ON FUNCTION public.transition_purchase_return_state(uuid, uuid, uuid, varchar, text) IS
  'PR state machine; audit_logs.action uses APPROVE/REJECT/CONFIRM/CLOSE per audit_logs_action_check.';

GRANT EXECUTE ON FUNCTION public.transition_purchase_return_state(uuid, uuid, uuid, varchar, text) TO authenticated;
