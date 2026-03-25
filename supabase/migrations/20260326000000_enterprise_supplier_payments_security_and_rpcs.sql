-- Phase 2 & 3: Enterprise Supplier Payments - Security, RLS, Audit Triggers, and Stored Procedures

-- 1. Add company_id to payment_allocations and payment_audit_logs for robust RLS identical to payments
ALTER TABLE public.payment_allocations 
ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;

UPDATE public.payment_allocations pa
SET company_id = p.company_id
FROM public.payments p
WHERE pa.payment_id = p.id AND pa.company_id IS NULL;

ALTER TABLE public.payment_allocations ALTER COLUMN company_id SET NOT NULL;

ALTER TABLE public.payment_audit_logs 
ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;

UPDATE public.payment_audit_logs pal
SET company_id = p.company_id
FROM public.payments p
WHERE pal.payment_id = p.id AND pal.company_id IS NULL;

-- 2. Enable RLS
ALTER TABLE public.payment_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_audit_logs ENABLE ROW LEVEL SECURITY;

-- 3. RLS Policies for payment_allocations (Derived from payments)
DROP POLICY IF EXISTS "payment_alloc_select" ON public.payment_allocations;
CREATE POLICY "payment_alloc_select" ON public.payment_allocations
FOR SELECT USING (
  company_id IN (SELECT get_user_company_ids()) 
  AND (
    EXISTS (SELECT 1 FROM payments p WHERE p.id = payment_id AND can_access_record_branch(p.company_id, p.branch_id))
  )
);

DROP POLICY IF EXISTS "payment_alloc_insert" ON public.payment_allocations;
CREATE POLICY "payment_alloc_insert" ON public.payment_allocations
FOR INSERT WITH CHECK (company_id IN (SELECT get_user_company_ids()));

DROP POLICY IF EXISTS "payment_alloc_update" ON public.payment_allocations;
CREATE POLICY "payment_alloc_update" ON public.payment_allocations
FOR UPDATE USING (company_id IN (SELECT get_user_company_ids()));

DROP POLICY IF EXISTS "payment_alloc_delete" ON public.payment_allocations;
CREATE POLICY "payment_alloc_delete" ON public.payment_allocations
FOR DELETE USING (company_id IN (SELECT get_user_company_ids()));

-- 4. RLS Policies for payment_audit_logs (ReadOnly for security except triggers)
DROP POLICY IF EXISTS "payment_audit_select" ON public.payment_audit_logs;
CREATE POLICY "payment_audit_select" ON public.payment_audit_logs
FOR SELECT USING (
  company_id IN (SELECT get_user_company_ids())
  AND (
    EXISTS (SELECT 1 FROM payments p WHERE p.id = payment_id AND can_access_record_branch(p.company_id, p.branch_id))
  )
);

-- 5. Audit Trigger for Payments
CREATE OR REPLACE FUNCTION audit_payment_changes() RETURNS trigger
SECURITY DEFINER
AS $$
DECLARE
  v_action VARCHAR(50);
  v_changed_by UUID := auth.uid();
  v_company_id UUID;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action := 'CREATE';
    v_company_id := NEW.company_id;
    INSERT INTO public.payment_audit_logs (payment_id, company_id, action, new_values, changed_by)
    VALUES (NEW.id, v_company_id, v_action, to_jsonb(NEW), v_changed_by);
    RETURN NEW;
    
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.status != NEW.status THEN
      IF NEW.status = 'approved' THEN
        v_action := 'APPROVE_FINAL';
      ELSIF NEW.status = 'rejected' THEN
        v_action := 'REJECT';
      ELSIF NEW.status LIKE 'pending_%' THEN
        v_action := 'APPROVE_STAGE';
      ELSE
        v_action := 'STATUS_CHANGE';
      END IF;
    ELSE
      v_action := 'UPDATE';
    END IF;
    
    v_company_id := NEW.company_id;
    
    -- Log full old and new rows. Discarding huge arrays if any, but payments row is flat.
    INSERT INTO public.payment_audit_logs (payment_id, company_id, action, old_values, new_values, changed_by)
    VALUES (NEW.id, v_company_id, v_action, to_jsonb(OLD), to_jsonb(NEW), v_changed_by);
    
    RETURN NEW;
    
  ELSIF TG_OP = 'DELETE' THEN
    v_action := 'DELETE';
    v_company_id := OLD.company_id;
    INSERT INTO public.payment_audit_logs (payment_id, company_id, action, old_values, changed_by)
    VALUES (OLD.id, v_company_id, v_action, to_jsonb(OLD), v_changed_by);
    RETURN OLD;
  END IF;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_payments_trigger ON payments;
CREATE TRIGGER audit_payments_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.payments
FOR EACH ROW EXECUTE FUNCTION audit_payment_changes();


-- 6. Stored Procedure: Atomic creation of Payment + N Allocations
CREATE OR REPLACE FUNCTION process_supplier_payment_allocation(
  p_company_id UUID,
  p_supplier_id UUID,
  p_payment_amount NUMERIC,
  p_payment_date DATE,
  p_payment_method VARCHAR,
  p_account_id UUID,
  p_branch_id UUID,
  p_currency_code VARCHAR,
  p_exchange_rate NUMERIC,
  p_base_currency_amount NUMERIC,
  p_allocations JSONB -- JSON Array of { "bill_id": "<uuid>", "amount": 100 }
) RETURNS UUID
SECURITY DEFINER
AS $$
DECLARE
  v_payment_id UUID;
  v_status VARCHAR := 'pending_approval';
  v_user_id UUID := auth.uid();
  v_user_role VARCHAR;
  v_alloc_record JSONB;
  v_total_allocated NUMERIC := 0;
BEGIN
  -- Validate user
  SELECT role INTO v_user_role FROM company_members WHERE user_id = v_user_id AND company_id = p_company_id;
  IF v_user_role IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;

  -- Privileged users bypass approval
  IF v_user_role IN ('owner', 'admin', 'general_manager') THEN
    v_status := 'approved';
  END IF;

  -- Create Payment
  INSERT INTO payments (
    company_id, supplier_id, payment_date, amount, payment_method, account_id, branch_id,
    currency_code, exchange_rate, base_currency_amount,
    status, created_by,
    unallocated_amount
  ) VALUES (
    p_company_id, p_supplier_id, p_payment_date, p_payment_amount, p_payment_method, p_account_id, p_branch_id,
    p_currency_code, p_exchange_rate, p_base_currency_amount,
    v_status, v_user_id,
    p_payment_amount -- Initially full amount unallocated
  ) RETURNING id INTO v_payment_id;

  -- Auto-Approve logic fields (if privileged)
  IF v_status = 'approved' THEN
    UPDATE payments SET approved_by = v_user_id, approved_at = NOW() WHERE id = v_payment_id;
  END IF;

  -- Process Allocations from JSON Array
  IF p_allocations IS NOT NULL AND jsonb_array_length(p_allocations) > 0 THEN
    FOR v_alloc_record IN SELECT * FROM jsonb_array_elements(p_allocations)
    LOOP
      INSERT INTO payment_allocations (payment_id, bill_id, allocated_amount, company_id)
      VALUES (
        v_payment_id, 
        (v_alloc_record->>'bill_id')::uuid, 
        (v_alloc_record->>'amount')::numeric,
        p_company_id
      );
      v_total_allocated := v_total_allocated + (v_alloc_record->>'amount')::numeric;
    END LOOP;
  END IF;

  -- Update unallocated amount
  UPDATE payments SET unallocated_amount = p_payment_amount - v_total_allocated WHERE id = v_payment_id;

  RETURN v_payment_id;
END;
$$ LANGUAGE plpgsql;


-- 7. Stored Procedure: Multi-Level Approval Engine Process
CREATE OR REPLACE FUNCTION process_payment_approval_stage(
  p_payment_id UUID, 
  p_action VARCHAR, -- 'APPROVE', 'REJECT'
  p_rejection_reason VARCHAR DEFAULT NULL
) RETURNS VOID
SECURITY DEFINER
AS $$
DECLARE
  v_payment RECORD;
  v_user_role VARCHAR;
  v_user_id UUID := auth.uid();
  v_next_status VARCHAR;
BEGIN
  -- Get payment
  SELECT * INTO v_payment FROM payments WHERE id = p_payment_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payment not found'; END IF;

  -- Get user role in the company
  SELECT role INTO v_user_role FROM company_members 
  WHERE user_id = v_user_id AND company_id = v_payment.company_id;

  IF v_user_role IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;

  IF p_action = 'REJECT' THEN
    UPDATE payments SET 
      status = 'rejected', 
      rejection_reason = p_rejection_reason,
      rejected_by = v_user_id,
      rejected_at = NOW()
    WHERE id = p_payment_id;
    RETURN;
  END IF;

  IF p_action = 'APPROVE' THEN
    -- Configurable Hierarchy: Accountant -> Manager -> Owner/Admin/GM
    IF v_payment.status = 'pending_approval' THEN
        IF v_user_role IN ('owner', 'admin', 'general_manager') THEN
            v_next_status := 'approved';
        ELSIF v_user_role IN ('manager') THEN
            v_next_status := 'pending_director';
        ELSE
            RAISE EXCEPTION 'Role % cannot approve this stage', v_user_role;
        END IF;
    ELSIF v_payment.status = 'pending_manager' THEN
        IF v_user_role IN ('manager', 'owner', 'admin', 'general_manager') THEN
             v_next_status := 'pending_director';
        ELSE
             RAISE EXCEPTION 'Role % cannot approve manager stage', v_user_role;
        END IF;
    ELSIF v_payment.status = 'pending_director' THEN
        IF v_user_role IN ('owner', 'admin', 'general_manager') THEN
             v_next_status := 'approved';
        ELSE
             RAISE EXCEPTION 'Role % cannot approve director stage', v_user_role;
        END IF;
    ELSE
        RAISE EXCEPTION 'Payment is in status %, cannot approve', v_payment.status;
    END IF;

    -- Execute stage update
    UPDATE payments SET 
      status = v_next_status,
      approved_by = CASE WHEN v_next_status = 'approved' THEN v_user_id ELSE approved_by END,
      approved_at = CASE WHEN v_next_status = 'approved' THEN NOW() ELSE approved_at END,
      current_approval_role = CASE WHEN v_next_status = 'approved' THEN NULL ELSE 'director' END
    WHERE id = p_payment_id;
    
    RETURN;
  END IF;
END;
$$ LANGUAGE plpgsql;
