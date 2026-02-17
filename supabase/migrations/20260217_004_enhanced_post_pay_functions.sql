-- =============================================
-- ENHANCED POST & PAY FUNCTIONS WITH IDEMPOTENCY
-- Date: 2026-02-17
-- =============================================

-- =============================================
-- ENHANCED post_commission_run_atomic
-- =============================================

CREATE OR REPLACE FUNCTION post_commission_run_atomic(
    p_commission_run_id UUID,
    p_expense_account_id UUID,
    p_payable_account_id UUID,
    p_user_id UUID
) RETURNS JSONB AS $$
DECLARE
    v_run RECORD;
    v_journal_id UUID;
    v_total_commission DECIMAL(15,2) := 0;
    v_total_clawbacks DECIMAL(15,2) := 0;
    v_net_commission DECIMAL(15,2) := 0;
BEGIN
    -- 1. Get Run Info & Validate
    SELECT * INTO v_run FROM commission_runs WHERE id = p_commission_run_id;
    
    IF v_run IS NULL THEN
        RAISE EXCEPTION 'Commission run not found';
    END IF;
    
    -- ✅ IDEMPOTENCY: If already posted, return existing journal
    IF v_run.status = 'posted' OR v_run.status = 'paid' THEN
        RETURN jsonb_build_object(
            'success', TRUE,
            'message', 'Already posted',
            'journal_entry_id', v_run.journal_entry_id,
            'net_commission', v_run.net_commission
        );
    END IF;
    
    -- Validate status transition
    PERFORM validate_commission_run_transition(p_commission_run_id, 'posted');
    
    -- 2. Validate Period Locking
    PERFORM validate_transaction_period(v_run.company_id, v_run.period_end);
    
    -- 3. Calculate Totals
    SELECT 
        COALESCE(SUM(amount) FILTER (WHERE is_clawback = FALSE), 0),
        COALESCE(SUM(ABS(amount)) FILTER (WHERE is_clawback = TRUE), 0),
        COALESCE(SUM(amount), 0)
    INTO v_total_commission, v_total_clawbacks, v_net_commission
    FROM commission_ledger
    WHERE commission_run_id = p_commission_run_id;
    
    -- 4. Create Journal Entry
    INSERT INTO journal_entries (
        company_id,
        entry_date,
        description,
        reference_type,
        reference_id,
        status,
        posted_by,
        posted_at
    ) VALUES (
        v_run.company_id,
        v_run.period_end,
        'Sales Commission Accrual - ' || v_run.period_start || ' to ' || v_run.period_end,
        'commission_run',
        p_commission_run_id,
        'posted',
        p_user_id,
        NOW()
    ) RETURNING id INTO v_journal_id;
    
    -- 5. Journal Lines
    -- Dr Commission Expense
    INSERT INTO journal_entry_lines (
        journal_entry_id,
        account_id,
        description,
        debit_amount,
        credit_amount
    ) VALUES (
        v_journal_id,
        p_expense_account_id,
        'Commission Expense',
        v_net_commission,
        0
    );
    
    -- Cr Commission Payable
    INSERT INTO journal_entry_lines (
        journal_entry_id,
        account_id,
        description,
        debit_amount,
        credit_amount
    ) VALUES (
        v_journal_id,
        p_payable_account_id,
        'Commission Payable',
        0,
        v_net_commission
    );
    
    -- 6. Update Run Status
    UPDATE commission_runs
    SET 
        status = 'posted',
        journal_entry_id = v_journal_id,
        posted_by = p_user_id,
        posted_at = NOW(),
        total_commission = v_total_commission,
        total_clawbacks = v_total_clawbacks,
        net_commission = v_net_commission
    WHERE id = p_commission_run_id;
    
    -- 7. Update Ledger Entries Status
    UPDATE commission_ledger
    SET 
        status = 'posted',
        journal_entry_id = v_journal_id
    WHERE commission_run_id = p_commission_run_id;
    
    RETURN jsonb_build_object(
        'success', TRUE,
        'journal_entry_id', v_journal_id,
        'net_commission', v_net_commission
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- ENHANCED pay_commission_run_atomic
-- =============================================

CREATE OR REPLACE FUNCTION pay_commission_run_atomic(
    p_commission_run_id UUID,
    p_payable_account_id UUID,
    p_bank_account_id UUID,
    p_user_id UUID
) RETURNS JSONB AS $$
DECLARE
    v_run RECORD;
    v_journal_id UUID;
BEGIN
    -- 1. Get Run Info & Validate
    SELECT * INTO v_run FROM commission_runs WHERE id = p_commission_run_id;
    
    IF v_run IS NULL THEN
        RAISE EXCEPTION 'Commission run not found';
    END IF;
    
    -- ✅ IDEMPOTENCY: If already paid, return existing journal
    IF v_run.status = 'paid' THEN
        RETURN jsonb_build_object(
            'success', TRUE,
            'message', 'Already paid',
            'payment_journal_id', v_run.payment_journal_id
        );
    END IF;
    
    -- Validate status transition
    PERFORM validate_commission_run_transition(p_commission_run_id, 'paid');
    
    -- 2. Validate Period Locking
    PERFORM validate_transaction_period(v_run.company_id, CURRENT_DATE);
    
    -- 3. Create Payment Journal Entry
    INSERT INTO journal_entries (
        company_id,
        entry_date,
        description,
        reference_type,
        reference_id,
        status,
        posted_by,
        posted_at
    ) VALUES (
        v_run.company_id,
        CURRENT_DATE,
        'Commission Payment - ' || v_run.period_start || ' to ' || v_run.period_end,
        'commission_payment',
        p_commission_run_id,
        'posted',
        p_user_id,
        NOW()
    ) RETURNING id INTO v_journal_id;
    
    -- 4. Journal Lines
    -- Dr Commission Payable
    INSERT INTO journal_entry_lines (
        journal_entry_id,
        account_id,
        description,
        debit_amount,
        credit_amount
    ) VALUES (
        v_journal_id,
        p_payable_account_id,
        'Commission Payable',
        v_run.net_commission,
        0
    );
    
    -- Cr Bank
    INSERT INTO journal_entry_lines (
        journal_entry_id,
        account_id,
        description,
        debit_amount,
        credit_amount
    ) VALUES (
        v_journal_id,
        p_bank_account_id,
        'Bank Payment',
        0,
        v_run.net_commission
    );
    
    -- 5. Update Run Status
    UPDATE commission_runs
    SET 
        status = 'paid',
        payment_journal_id = v_journal_id,
        paid_by = p_user_id,
        paid_at = NOW()
    WHERE id = p_commission_run_id;
    
    -- 6. Update Ledger Entries Status
    UPDATE commission_ledger
    SET status = 'paid'
    WHERE commission_run_id = p_commission_run_id;
    
    RETURN jsonb_build_object(
        'success', TRUE,
        'payment_journal_id', v_journal_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- HELPER VIEW (Fixed employee name column)
-- =============================================

CREATE OR REPLACE VIEW v_commission_summary_by_employee AS
SELECT 
    cl.company_id,
    cl.employee_id,
    e.full_name as employee_name,
    cl.commission_run_id,
    cr.period_start,
    cr.period_end,
    cr.status as run_status,
    COUNT(*) FILTER (WHERE cl.is_clawback = FALSE) as invoice_count,
    COUNT(*) FILTER (WHERE cl.is_clawback = TRUE) as clawback_count,
    SUM(cl.amount) FILTER (WHERE cl.is_clawback = FALSE) as gross_commission,
    SUM(cl.amount) FILTER (WHERE cl.is_clawback = TRUE) as total_clawbacks,
    SUM(cl.amount) as net_commission
FROM commission_ledger cl
LEFT JOIN employees e ON cl.employee_id = e.id
LEFT JOIN commission_runs cr ON cl.commission_run_id = cr.id
GROUP BY 
    cl.company_id, 
    cl.employee_id, 
    e.full_name,
    cl.commission_run_id,
    cr.period_start,
    cr.period_end,
    cr.status;
