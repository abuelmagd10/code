/*
  Enterprise Purchase Return Workflow Engine
  Mirrors the PO Approval Engine pattern.
*/

-- ==========================================
-- 1. Add Enterprise Approval Columns to purchase_returns
-- ==========================================

ALTER TABLE public.purchase_returns
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejected_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
  ADD COLUMN IF NOT EXISTS is_locked BOOLEAN DEFAULT false;

-- Document the enterprise status lifecycle
COMMENT ON COLUMN public.purchase_returns.status IS
  'draft, pending_approval, approved, rejected, sent_to_vendor, partially_returned, returned, closed';

-- ==========================================
-- 2. Register purchase_return workflow type
-- ==========================================

INSERT INTO public.approval_workflows (company_id, document_type, name, is_active)
SELECT 
  c.id,
  'purchase_return',
  'Purchase Return Approval Workflow',
  true
FROM public.companies c
ON CONFLICT DO NOTHING;

-- ==========================================
-- 3. Auto-lock trigger: lock PRs on approval/send
-- ==========================================

CREATE OR REPLACE FUNCTION lock_purchase_return_on_status()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status IN ('approved', 'sent_to_vendor') THEN
    NEW.is_locked := true;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS purchase_return_auto_lock ON public.purchase_returns;
CREATE TRIGGER purchase_return_auto_lock
  BEFORE UPDATE OF status ON public.purchase_returns
  FOR EACH ROW
  EXECUTE FUNCTION lock_purchase_return_on_status();

-- ==========================================
-- 4. Atomic Approval RPC
-- ==========================================

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
  IF v_user_branch IS NOT NULL AND v_pr.branch_id IS NOT NULL AND v_user_branch != v_pr.branch_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Branch isolation violation: Cannot approve return for a different branch');
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
    company_id, user_id, action, entity_type, entity_id, old_values, new_values, created_at
  ) VALUES (
    p_company_id,
    p_user_id,
    v_audit_action,
    'purchase_return',
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
