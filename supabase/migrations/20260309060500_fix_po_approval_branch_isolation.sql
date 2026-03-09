-- Fix Branch Isolation Violation when Admin/Owner/GM is assigned to a specific branch
-- Allow these roles to approve POs across any branch

CREATE OR REPLACE FUNCTION public.approve_purchase_order_atomic(
    p_po_id UUID,
    p_user_id UUID,
    p_company_id UUID,
    p_action TEXT, -- 'approve' or 'reject'
    p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_po RECORD;
    v_user_role TEXT;
    v_user_branch UUID;
    v_new_status TEXT;
    v_audit_action TEXT;
    v_result JSONB;
BEGIN
    -- 1. Fetch user context (branch isolation & permissions)
    SELECT role, branch_id INTO v_user_role, v_user_branch
    FROM public.company_members
    WHERE company_id = p_company_id AND user_id = p_user_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'User is not a member of this company');
    END IF;

    -- Verify role (Only admin, owner, gm can approve)
    IF v_user_role NOT IN ('admin', 'owner', 'general_manager') THEN
         RETURN jsonb_build_object('success', false, 'error', 'Insufficient permissions to approve POs');
    END IF;

    -- 2. Fetch the PO and lock for update
    SELECT * INTO v_po
    FROM public.purchase_orders
    WHERE id = p_po_id AND company_id = p_company_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Purchase order not found');
    END IF;

    -- 3. Enforce Branch Isolation (Enterprise Requirement)
    -- BUT allow 'owner', 'admin', 'general_manager' to bypass branch checks even if they are assigned to a branch
    IF v_user_role NOT IN ('owner', 'admin', 'general_manager') THEN
        IF v_user_branch IS NOT NULL AND v_po.branch_id IS NOT NULL AND v_user_branch != v_po.branch_id THEN
             RETURN jsonb_build_object('success', false, 'error', 'Branch isolation violation: Cannot approve PO for a different branch');
        END IF;
    END IF;

    -- 4. Validate current status
    IF v_po.status != 'pending_approval' THEN
        RETURN jsonb_build_object('success', false, 'error', 'PO is not in a pending_approval state');
    END IF;

    -- 5. Apply action
    IF p_action = 'approve' THEN
        v_new_status := 'draft'; -- Transition to draft (or 'approved') as per business logic
        v_audit_action := 'po_approved';
        
        UPDATE public.purchase_orders
        SET status = v_new_status,
            approved_by = p_user_id,
            approved_at = NOW()
        WHERE id = p_po_id;

    ELSIF p_action = 'reject' THEN
        IF p_reason IS NULL OR TRIM(p_reason) = '' THEN
            RETURN jsonb_build_object('success', false, 'error', 'Rejection reason is required');
        END IF;

        v_new_status := 'rejected';
        v_audit_action := 'po_rejected';

        UPDATE public.purchase_orders
        SET status = v_new_status,
            rejection_reason = p_reason,
            rejected_by = p_user_id,
            rejected_at = NOW()
        WHERE id = p_po_id;

    ELSE
        RETURN jsonb_build_object('success', false, 'error', 'Invalid action');
    END IF;

    -- 6. Audit Logging (Enterprise Requirement)
    INSERT INTO public.audit_logs (
        company_id, user_id, action, entity_type, entity_id, old_values, new_values, created_at
    ) VALUES (
        p_company_id,
        p_user_id,
        v_audit_action,
        'purchase_order',
        p_po_id,
        jsonb_build_object('status', v_po.status),
        jsonb_build_object('status', v_new_status, 'reason', p_reason),
        NOW()
    );

    RETURN jsonb_build_object(
        'success', true, 
        'po_id', p_po_id, 
        'status', v_new_status,
        'creator_id', v_po.created_by
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;
