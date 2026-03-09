-- Fix audit logs and remove duplicate get_user_notifications

DROP FUNCTION IF EXISTS public.get_user_notifications(uuid, uuid, uuid, uuid, character varying, character varying, character varying);
DROP FUNCTION IF EXISTS public.get_user_notifications(uuid, uuid, uuid, uuid, character varying, text, text);

CREATE OR REPLACE FUNCTION public.get_user_notifications(p_user_id uuid, p_company_id uuid, p_branch_id uuid DEFAULT NULL::uuid, p_warehouse_id uuid DEFAULT NULL::uuid, p_status character varying DEFAULT NULL::character varying, p_severity text DEFAULT NULL::text, p_category text DEFAULT NULL::text)
 RETURNS TABLE(id uuid, reference_type character varying, reference_id uuid, title character varying, message text, priority character varying, status character varying, created_at timestamp with time zone, branch_name character varying, warehouse_name character varying, severity text, category text, event_key character varying)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_user_role VARCHAR(50);
BEGIN
  SELECT cm.role INTO v_user_role
  FROM company_members cm
  WHERE cm.user_id = p_user_id
    AND cm.company_id = p_company_id
  LIMIT 1;

  RETURN QUERY
  SELECT
    n.id,
    n.reference_type,
    n.reference_id,
    n.title,
    n.message,
    n.priority,
    n.status,
    n.created_at,
    b.name::VARCHAR(255) AS branch_name,
    w.name::VARCHAR(255) AS warehouse_name,
    COALESCE(n.severity, 'info')::TEXT AS severity,
    COALESCE(n.category, 'system')::TEXT AS category,
    n.event_key
  FROM notifications n
  LEFT JOIN branches b ON (n.branch_id = b.id AND b.company_id = p_company_id)
  LEFT JOIN warehouses w ON (n.warehouse_id = w.id AND w.company_id = p_company_id)
  WHERE n.company_id = p_company_id
    AND (
      n.assigned_to_user = p_user_id
      OR (
        n.assigned_to_user IS NULL
        AND (
          n.assigned_to_role = v_user_role
          OR n.assigned_to_role IS NULL
          OR v_user_role IN ('owner', 'admin', 'general_manager')
        )
      )
    )
    AND (p_branch_id IS NULL OR n.branch_id = p_branch_id OR n.branch_id IS NULL)
    AND (p_warehouse_id IS NULL OR n.warehouse_id = p_warehouse_id OR n.warehouse_id IS NULL)
    AND (
      (p_status IS NULL AND n.status != 'archived')
      OR (p_status IS NOT NULL AND n.status = p_status)
    )
    AND (p_severity IS NULL OR COALESCE(n.severity, 'info') = p_severity)
    AND (p_category IS NULL OR COALESCE(n.category, 'system') = p_category)
    AND (n.expires_at IS NULL OR n.expires_at > NOW())
  ORDER BY
    CASE n.priority
      WHEN 'urgent' THEN 1
      WHEN 'high' THEN 2
      WHEN 'normal' THEN 3
      WHEN 'low' THEN 4
    END,
    n.created_at DESC;
END;
$function$;

-- Update approve_purchase_order_atomic to use the correct schema for audit_logs
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

    -- 6. Audit Logging Using Correct Columns
    INSERT INTO public.audit_logs (
        company_id, user_id, action, target_table, record_id, old_data, new_data, created_at
    ) VALUES (
        p_company_id,
        p_user_id,
        v_audit_action,
        'purchase_orders',
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


-- Update approve_purchase_return_atomic to use the correct schema for audit_logs and bypass branch isolation
CREATE OR REPLACE FUNCTION approve_purchase_return_atomic(
  p_pr_id UUID,
  p_user_id UUID,
  p_company_id UUID,
  p_action TEXT,        -- 'approve' or 'reject'
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_pr RECORD;
  v_user_role TEXT;
  v_user_branch UUID;
  v_new_status TEXT;
  v_audit_action TEXT;
BEGIN
  -- 1. Fetch user context
  SELECT role, branch_id INTO v_user_role, v_user_branch
  FROM public.company_members
  WHERE company_id = p_company_id AND user_id = p_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'User is not a member of this company');
  END IF;

  -- 2. Role check
  IF v_user_role NOT IN ('admin', 'owner', 'general_manager') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient permissions to approve purchase returns');
  END IF;

  -- 3. Fetch & lock the PR
  SELECT * INTO v_pr
  FROM public.purchase_returns
  WHERE id = p_pr_id AND company_id = p_company_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Purchase return not found');
  END IF;

  -- 4. Branch isolation
  IF v_user_role NOT IN ('owner', 'admin', 'general_manager') THEN
      IF v_user_branch IS NOT NULL AND v_pr.branch_id IS NOT NULL AND v_user_branch != v_pr.branch_id THEN
        RETURN jsonb_build_object('success', false, 'error', 'Branch isolation violation: Cannot approve return for a different branch');
      END IF;
  END IF;

  -- 5. Validate state
  IF v_pr.status != 'pending_approval' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Purchase return is not in pending_approval state');
  END IF;

  -- 6. Apply action
  IF p_action = 'approve' THEN
    v_new_status := 'approved';
    v_audit_action := 'purchase_return_approved';

    UPDATE public.purchase_returns
    SET
      status      = v_new_status,
      approved_by = p_user_id,
      approved_at = NOW(),
      is_locked   = true,
      updated_at  = NOW()
    WHERE id = p_pr_id;

  ELSIF p_action = 'reject' THEN
    IF p_reason IS NULL OR TRIM(p_reason) = '' THEN
      RETURN jsonb_build_object('success', false, 'error', 'Rejection reason is required');
    END IF;

    v_new_status := 'rejected';
    v_audit_action := 'purchase_return_rejected';

    UPDATE public.purchase_returns
    SET
      status           = v_new_status,
      rejected_by      = p_user_id,
      rejected_at      = NOW(),
      rejection_reason = p_reason,
      updated_at       = NOW()
    WHERE id = p_pr_id;

  ELSE
    RETURN jsonb_build_object('success', false, 'error', 'Invalid action. Must be approve or reject');
  END IF;

  -- 7. Audit log
  INSERT INTO public.audit_logs (
    company_id, user_id, action, target_table, record_id, old_data, new_data, created_at
  ) VALUES (
    p_company_id,
    p_user_id,
    v_audit_action,
    'purchase_returns',
    p_pr_id,
    jsonb_build_object('status', v_pr.status),
    jsonb_build_object('status', v_new_status, 'reason', p_reason),
    NOW()
  );

  RETURN jsonb_build_object(
    'success', true,
    'pr_id', p_pr_id,
    'status', v_new_status
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;
