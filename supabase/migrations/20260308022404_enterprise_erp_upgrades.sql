-- =============================================================================
-- Enterprise ERP Upgrades
-- Includes: ENUMs, Branch Access Functions, Workflow Expansion
-- =============================================================================

-- 1. Add columns to bank_voucher_requests
ALTER TABLE public.bank_voucher_requests 
ADD COLUMN IF NOT EXISTS payment_method VARCHAR(20) CHECK (payment_method IN ('cash', 'bank_transfer', 'check', 'credit_card')),
ADD COLUMN IF NOT EXISTS reference_number VARCHAR(100),
ADD COLUMN IF NOT EXISTS posted_by UUID REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS posted_at TIMESTAMPTZ;

-- Drop old constraint safely and add new one
ALTER TABLE public.bank_voucher_requests DROP CONSTRAINT IF EXISTS bank_voucher_requests_status_check;
ALTER TABLE public.bank_voucher_requests ADD CONSTRAINT bank_voucher_requests_status_check CHECK (status IN ('draft', 'pending', 'approved', 'posted', 'rejected'));

-- 2. Modify approve_bank_voucher to only approve
CREATE OR REPLACE FUNCTION public.approve_bank_voucher(
    p_request_id UUID,
    p_approved_by UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_req RECORD;
BEGIN
    SELECT * INTO v_req FROM public.bank_voucher_requests WHERE id = p_request_id FOR UPDATE;

    IF v_req IS NULL THEN
        RAISE EXCEPTION 'Request not found';
    END IF;

    IF v_req.status != 'pending' THEN
        RAISE EXCEPTION 'Request is already %', v_req.status;
    END IF;

    -- Only update status to approved
    UPDATE public.bank_voucher_requests SET
        status = 'approved',
        reviewed_by = p_approved_by,
        reviewed_at = NOW()
    WHERE id = p_request_id;

    RETURN jsonb_build_object('success', true);
END;
$$;

-- 3. Create post_bank_voucher to generate Journal Entries
CREATE OR REPLACE FUNCTION public.post_bank_voucher(
    p_request_id UUID,
    p_posted_by UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_req RECORD;
    v_journal_id UUID;
    v_reference_type TEXT;
BEGIN
    SELECT * INTO v_req FROM public.bank_voucher_requests WHERE id = p_request_id FOR UPDATE;

    IF v_req IS NULL THEN
        RAISE EXCEPTION 'Request not found';
    END IF;

    -- Must be approved before posting
    IF v_req.status != 'approved' THEN
        RAISE EXCEPTION 'Request must be approved before posting. Current status: %', v_req.status;
    END IF;

    -- Validate period
    PERFORM validate_transaction_period(v_req.company_id, v_req.entry_date);

    v_reference_type := CASE WHEN v_req.voucher_type = 'deposit' THEN 'bank_deposit' ELSE 'cash_withdrawal' END;

    -- Create Journal Entry
    INSERT INTO public.journal_entries (
        company_id, branch_id, entry_date, description, reference_type, reference_id, status, cost_center_id, posted_by
    ) VALUES (
        v_req.company_id, v_req.branch_id, v_req.entry_date, 
        COALESCE(v_req.description, '') || CASE WHEN v_req.reference_number IS NOT NULL THEN ' | المرجع: ' || v_req.reference_number ELSE '' END, 
        v_reference_type, v_req.id,
        'posted', v_req.cost_center_id, p_posted_by
    ) RETURNING id INTO v_journal_id;

    -- Insert lines based on voucher type
    IF v_req.voucher_type = 'deposit' THEN
        INSERT INTO public.journal_entry_lines (
            journal_entry_id, account_id, debit_amount, credit_amount, description,
            original_debit, original_credit, original_currency, exchange_rate_used, exchange_rate_id, rate_source,
            branch_id, cost_center_id
        ) VALUES 
        (v_journal_id, v_req.account_id, v_req.base_amount, 0, 'إيداع', v_req.amount, 0, v_req.currency, v_req.exchange_rate, v_req.exchange_rate_id, v_req.exchange_rate_source, v_req.branch_id, v_req.cost_center_id),
        (v_journal_id, v_req.counter_id, 0, v_req.base_amount, 'مقابل الإيداع', 0, v_req.amount, v_req.currency, v_req.exchange_rate, v_req.exchange_rate_id, v_req.exchange_rate_source, v_req.branch_id, v_req.cost_center_id);
    ELSE
        INSERT INTO public.journal_entry_lines (
            journal_entry_id, account_id, debit_amount, credit_amount, description,
            original_debit, original_credit, original_currency, exchange_rate_used, exchange_rate_id, rate_source,
            branch_id, cost_center_id
        ) VALUES 
        (v_journal_id, v_req.counter_id, v_req.base_amount, 0, 'مقابل السحب', v_req.amount, 0, v_req.currency, v_req.exchange_rate, v_req.exchange_rate_id, v_req.exchange_rate_source, v_req.branch_id, v_req.cost_center_id),
        (v_journal_id, v_req.account_id, 0, v_req.base_amount, 'سحب', 0, v_req.amount, v_req.currency, v_req.exchange_rate, v_req.exchange_rate_id, v_req.exchange_rate_source, v_req.branch_id, v_req.cost_center_id);
    END IF;

    -- Update request status
    UPDATE public.bank_voucher_requests SET
        status = 'posted',
        posted_by = p_posted_by,
        posted_at = NOW(),
        journal_entry_id = v_journal_id
    WHERE id = p_request_id;

    RETURN jsonb_build_object('success', true, 'journal_entry_id', v_journal_id);
END;
$$;

-- 4. Branch Access DB validation function
CREATE OR REPLACE FUNCTION public.is_branch_accessible(p_branch_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_role TEXT;
    v_user_branch UUID;
BEGIN
    IF p_branch_id IS NULL THEN
        RETURN TRUE;
    END IF;

    -- Get user role and branch in the associated company
    SELECT role, branch_id INTO v_role, v_user_branch
    FROM public.company_members
    WHERE user_id = p_user_id 
    AND company_id = (SELECT company_id FROM public.branches WHERE id = p_branch_id);

    IF v_role IN ('super_admin', 'admin', 'owner', 'manager', 'general_manager') THEN
        RETURN TRUE;
    END IF;

    RETURN v_user_branch = p_branch_id;
END;
$$;

-- 5. Triggers for branch isolation on Expenses & Vouchers
CREATE OR REPLACE FUNCTION public.enforce_branch_isolation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $trig$
BEGIN
    IF auth.uid() IS NOT NULL THEN
        IF NOT public.is_branch_accessible(NEW.branch_id, auth.uid()) THEN
            RAISE EXCEPTION 'Access Denied: You cannot create or modify records for a branch you do not have permissions for.';
        END IF;
    END IF;
    RETURN NEW;
END;
$trig$;

DROP TRIGGER IF EXISTS trg_enforce_branch_isolation_bank_vouchers ON public.bank_voucher_requests;
CREATE TRIGGER trg_enforce_branch_isolation_bank_vouchers
BEFORE INSERT OR UPDATE ON public.bank_voucher_requests
FOR EACH ROW
EXECUTE FUNCTION public.enforce_branch_isolation();

DROP TRIGGER IF EXISTS trg_enforce_branch_isolation_expenses ON public.expenses;
CREATE TRIGGER trg_enforce_branch_isolation_expenses
BEFORE INSERT OR UPDATE ON public.expenses
FOR EACH ROW
EXECUTE FUNCTION public.enforce_branch_isolation();
