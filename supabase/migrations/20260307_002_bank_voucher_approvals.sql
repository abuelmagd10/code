-- =============================================================================
-- دورة اعتماد سندات الصرف والقبض (Bank/Cash Voucher Approvals)
-- جدول لطلبات السندات المعلقة، ودوال الاعتماد والرفض
-- =============================================================================

-- 1. Create the bank_voucher_requests table
CREATE TABLE IF NOT EXISTS public.bank_voucher_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id),
    branch_id UUID REFERENCES branches(id), -- Nullable initially to match existing logic if missing branch
    voucher_type TEXT NOT NULL CHECK (voucher_type IN ('deposit', 'withdraw')),
    account_id UUID NOT NULL REFERENCES chart_of_accounts(id),
    counter_id UUID NOT NULL REFERENCES chart_of_accounts(id),
    amount NUMERIC NOT NULL,
    currency TEXT NOT NULL DEFAULT 'EGP',
    base_amount NUMERIC NOT NULL,
    exchange_rate NUMERIC DEFAULT 1,
    exchange_rate_source TEXT,
    exchange_rate_id UUID,
    entry_date DATE NOT NULL,
    description TEXT,
    cost_center_id UUID REFERENCES cost_centers(id),
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    rejection_reason TEXT,
    created_by UUID REFERENCES auth.users(id),
    reviewed_by UUID REFERENCES auth.users(id),
    reviewed_at TIMESTAMPTZ,
    journal_entry_id UUID REFERENCES journal_entries(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.bank_voucher_requests IS 'طلبات سندات الصرف والقبض المعلقة بانتظار الاعتماد من الإدارة';

-- RLS Policies
ALTER TABLE public.bank_voucher_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view voucher requests in their company"
    ON public.bank_voucher_requests FOR SELECT
    USING (company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid()));

CREATE POLICY "Users can insert voucher requests in their company"
    ON public.bank_voucher_requests FOR INSERT
    WITH CHECK (company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid()));

CREATE POLICY "Company members can update voucher requests"
    ON public.bank_voucher_requests FOR UPDATE
    USING (company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid()));




-- 2. RPC to approve a bank voucher request
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
    v_journal_id UUID;
    v_reference_type TEXT;
BEGIN
    SELECT * INTO v_req FROM public.bank_voucher_requests WHERE id = p_request_id FOR UPDATE;

    IF v_req IS NULL THEN
        RAISE EXCEPTION 'Request not found';
    END IF;

    IF v_req.status != 'pending' THEN
        RAISE EXCEPTION 'Request is already %', v_req.status;
    END IF;

    -- Validate period
    PERFORM validate_transaction_period(v_req.company_id, v_req.entry_date);

    v_reference_type := CASE WHEN v_req.voucher_type = 'deposit' THEN 'bank_deposit' ELSE 'cash_withdrawal' END;

    -- Create Journal Entry
    INSERT INTO public.journal_entries (
        company_id, branch_id, entry_date, description, reference_type, reference_id, status, cost_center_id, posted_by
    ) VALUES (
        v_req.company_id, v_req.branch_id, v_req.entry_date, v_req.description, v_reference_type, v_req.id,
        'posted', v_req.cost_center_id, p_approved_by
    ) RETURNING id INTO v_journal_id;

    -- Insert lines based on voucher type
    IF v_req.voucher_type = 'deposit' THEN
        -- Deposit: debit account_id, credit counter_id
        INSERT INTO public.journal_entry_lines (
            journal_entry_id, account_id, debit_amount, credit_amount, description,
            original_debit, original_credit, original_currency, exchange_rate_used, exchange_rate_id, rate_source,
            branch_id, cost_center_id
        ) VALUES 
        (v_journal_id, v_req.account_id, v_req.base_amount, 0, 'إيداع', v_req.amount, 0, v_req.currency, v_req.exchange_rate, v_req.exchange_rate_id, v_req.exchange_rate_source, v_req.branch_id, v_req.cost_center_id),
        (v_journal_id, v_req.counter_id, 0, v_req.base_amount, 'مقابل الإيداع', 0, v_req.amount, v_req.currency, v_req.exchange_rate, v_req.exchange_rate_id, v_req.exchange_rate_source, v_req.branch_id, v_req.cost_center_id);
    ELSE
        -- Withdraw: debit counter_id, credit account_id
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
        status = 'approved',
        reviewed_by = p_approved_by,
        reviewed_at = NOW(),
        journal_entry_id = v_journal_id
    WHERE id = p_request_id;

    RETURN jsonb_build_object('success', true, 'journal_entry_id', v_journal_id);
END;
$$;


-- 3. RPC to reject a bank voucher request
CREATE OR REPLACE FUNCTION public.reject_bank_voucher(
    p_request_id UUID,
    p_rejected_by UUID,
    p_reason TEXT
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

    UPDATE public.bank_voucher_requests SET
        status = 'rejected',
        reviewed_by = p_rejected_by,
        reviewed_at = NOW(),
        rejection_reason = p_reason
    WHERE id = p_request_id;

    RETURN jsonb_build_object('success', true);
END;
$$;
