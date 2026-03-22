-- ==========================================================================
-- Fix transition_purchase_return_state: audit_logs correct writable columns
-- entity       → target_table  (entity is GENERATED ALWAYS from target_table)
-- entity_id    → record_id     (entity_id is GENERATED ALWAYS from record_id)
-- new_values   → new_data
-- ==========================================================================
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
BEGIN
    -- 1. Lock the row to prevent concurrent transitions
    SELECT status, return_number INTO v_old_state, v_pr_number
    FROM purchase_returns
    WHERE id = p_pr_id AND company_id = p_company_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Purchase return not found or access denied';
    END IF;

    -- 2. State Machine Validation Matrix
    IF p_new_state = 'approved' THEN
        IF v_old_state != 'pending_approval' THEN
            RAISE EXCEPTION 'Invalid transition: Cannot approve a purchase return in % state', v_old_state;
        END IF;

    ELSIF p_new_state = 'rejected' THEN
        IF v_old_state != 'pending_approval' THEN
            RAISE EXCEPTION 'Invalid transition: Cannot reject a purchase return in % state', v_old_state;
        END IF;

    ELSIF p_new_state = 'completed' THEN
        IF v_old_state NOT IN ('approved', 'partially_returned') THEN
            RAISE EXCEPTION 'Invalid transition: Cannot complete a purchase return in % state (must be approved)', v_old_state;
        END IF;

    ELSIF p_new_state = 'closed' THEN
        IF v_old_state NOT IN ('completed', 'returned') THEN
            RAISE EXCEPTION 'Invalid transition: Cannot close a purchase return in % state (must be completed first)', v_old_state;
        END IF;

    ELSE
        RAISE EXCEPTION 'Invalid new state: %', p_new_state;
    END IF;

    -- 3. Update the state
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

    -- 4. Emit System Event (Idempotent)
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

    -- 5. Unified Audit Log
    -- target_table and record_id are the writable columns;
    -- entity and entity_id are GENERATED ALWAYS AS target_table/record_id
    INSERT INTO audit_logs (
        company_id, user_id, action, target_table, record_id, new_data, created_at
    ) VALUES (
        p_company_id, p_user_id, 'purchase_return_state_transition', 'purchase_returns', p_pr_id,
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

GRANT EXECUTE ON FUNCTION public.transition_purchase_return_state(uuid, uuid, uuid, varchar, text) TO authenticated;
