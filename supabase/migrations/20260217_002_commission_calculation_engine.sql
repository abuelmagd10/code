-- =============================================
-- ENTERPRISE COMMISSION SYSTEM - CALCULATION ENGINE
-- Date: 2026-02-17
-- Description:
-- RPC Functions for:
-- - Commission Calculation (Tiered/Progressive/Slab)
-- - Credit Note Reversal (Auto Clawback)
-- - Commission Run Posting (Accounting Integration)
-- - Commission Run Payment
-- =============================================

-- =============================================
-- 1. CALCULATE COMMISSION FOR PERIOD
-- =============================================

CREATE OR REPLACE FUNCTION calculate_commission_for_period(
    p_employee_id UUID,
    p_period_start DATE,
    p_period_end DATE,
    p_commission_plan_id UUID,
    p_commission_run_id UUID DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
    v_plan RECORD;
    v_company_id UUID;
    v_invoice RECORD;
    v_credit_note RECORD;
    v_net_sales DECIMAL(15,2) := 0;
    v_commission_amount DECIMAL(15,2) := 0;
    v_invoice_amount DECIMAL(15,2);
    v_tier RECORD;
    v_remaining_amount DECIMAL(15,2);
    v_tier_commission DECIMAL(15,2);
    v_highest_tier_rate DECIMAL(5,2) := 0;
    v_inserted_count INT := 0;
BEGIN
    -- 1. Get Plan Details
    SELECT cp.*, e.company_id INTO v_plan, v_company_id
    FROM commission_plans cp
    JOIN employees e ON e.id = p_employee_id
    WHERE cp.id = p_commission_plan_id
    AND cp.is_active = TRUE;
    
    IF v_plan IS NULL THEN
        RAISE EXCEPTION 'Commission plan not found or inactive';
    END IF;
    
    -- 2. Fetch Invoices based on Plan Basis
    FOR v_invoice IN
        SELECT 
            i.id,
            i.total_amount,
            i.discount_amount,
            i.vat_amount,
            i.created_at as invoice_date,
            i.created_by_user_id
        FROM invoices i
        WHERE i.company_id = v_company_id
        AND i.status = 'paid'
        AND (
            (v_plan.basis = 'invoice_issuance' AND i.invoice_date BETWEEN p_period_start AND p_period_end)
            OR
            (v_plan.basis = 'payment_collection' AND i.paid_at BETWEEN p_period_start AND p_period_end)
        )
        AND (i.created_by_user_id = (SELECT user_id FROM employees WHERE id = p_employee_id))
    LOOP
        -- Calculate invoice amount based on calculation_basis
        v_invoice_amount := v_invoice.total_amount;
        
        IF v_plan.calculation_basis = 'before_discount' THEN
            v_invoice_amount := v_invoice.total_amount + COALESCE(v_invoice.discount_amount, 0);
        ELSIF v_plan.calculation_basis = 'after_discount' THEN
            v_invoice_amount := v_invoice.total_amount;
        ELSIF v_plan.calculation_basis = 'before_vat' THEN
            v_invoice_amount := v_invoice.total_amount - COALESCE(v_invoice.vat_amount, 0);
        ELSIF v_plan.calculation_basis = 'after_vat' THEN
            v_invoice_amount := v_invoice.total_amount;
        END IF;
        
        -- Subtract Credit Notes for this invoice (if handle_returns = 'auto_reverse')
        IF v_plan.handle_returns = 'auto_reverse' THEN
            FOR v_credit_note IN
                SELECT cn.total_amount
                FROM credit_notes cn
                WHERE cn.company_id = v_company_id
                AND cn.invoice_id = v_invoice.id
                AND cn.status = 'approved'
                AND cn.issue_date BETWEEN p_period_start AND p_period_end
            LOOP
                v_invoice_amount := v_invoice_amount - v_credit_note.total_amount;
            END LOOP;
        END IF;
        
        -- Skip if invoice amount is negative or zero after returns
        IF v_invoice_amount <= 0 THEN
            CONTINUE;
        END IF;
        
        -- Calculate commission for this invoice
        IF v_plan.type = 'flat_percent' THEN
            -- Simple flat percentage
            SELECT commission_rate INTO v_highest_tier_rate
            FROM commission_rules
            WHERE plan_id = p_commission_plan_id
            LIMIT 1;
            
            v_commission_amount := v_invoice_amount * (v_highest_tier_rate / 100);
            
        ELSIF v_plan.type = 'tiered_revenue' THEN
            -- Tiered calculation
            IF v_plan.tier_type = 'progressive' THEN
                -- Progressive: Each tier rate applies to its bracket
                v_remaining_amount := v_invoice_amount;
                v_commission_amount := 0;
                
                FOR v_tier IN
                    SELECT min_amount, max_amount, commission_rate, fixed_amount
                    FROM commission_rules
                    WHERE plan_id = p_commission_plan_id
                    ORDER BY min_amount ASC
                LOOP
                    IF v_remaining_amount <= 0 THEN
                        EXIT;
                    END IF;
                    
                    -- Calculate amount in this tier
                    IF v_tier.max_amount IS NULL THEN
                        v_tier_commission := v_remaining_amount * (v_tier.commission_rate / 100);
                    ELSE
                        v_tier_commission := LEAST(v_remaining_amount, v_tier.max_amount - v_tier.min_amount) * (v_tier.commission_rate / 100);
                    END IF;
                    
                    v_commission_amount := v_commission_amount + v_tier_commission + COALESCE(v_tier.fixed_amount, 0);
                    v_remaining_amount := v_remaining_amount - (v_tier.max_amount - v_tier.min_amount);
                END LOOP;
                
            ELSIF v_plan.tier_type = 'slab' THEN
                -- Slab: Highest tier rate applies to total
                SELECT commission_rate INTO v_highest_tier_rate
                FROM commission_rules
                WHERE plan_id = p_commission_plan_id
                AND v_invoice_amount >= min_amount
                AND (max_amount IS NULL OR v_invoice_amount < max_amount)
                ORDER BY min_amount DESC
                LIMIT 1;
                
                v_commission_amount := v_invoice_amount * (COALESCE(v_highest_tier_rate, 0) / 100);
            END IF;
        END IF;
        
        -- Insert into commission_ledger (with UNIQUE constraint protection)
        BEGIN
            INSERT INTO commission_ledger (
                company_id,
                employee_id,
                commission_id,
                commission_plan_id,
                commission_run_id,
                source_type,
                source_id,
                transaction_date,
                amount,
                is_clawback,
                status
            ) VALUES (
                v_company_id,
                p_employee_id,
                NULL, -- Will be set when run is approved
                p_commission_plan_id,
                p_commission_run_id,
                'invoice',
                v_invoice.id,
                p_period_end,
                v_commission_amount,
                FALSE,
                'draft'
            );
            
            v_inserted_count := v_inserted_count + 1;
            v_net_sales := v_net_sales + v_invoice_amount;
            
        EXCEPTION WHEN unique_violation THEN
            -- Already calculated for this invoice/plan combination - skip
            CONTINUE;
        END;
    END LOOP;
    
    RETURN jsonb_build_object(
        'success', TRUE,
        'commission_amount', v_commission_amount,
        'net_sales', v_net_sales,
        'invoices_processed', v_inserted_count
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- 2. REVERSE COMMISSION FOR CREDIT NOTE
-- =============================================

CREATE OR REPLACE FUNCTION reverse_commission_for_credit_note(
    p_credit_note_id UUID
) RETURNS JSONB AS $$
DECLARE
    v_credit_note RECORD;
    v_original_commission RECORD;
    v_reversal_amount DECIMAL(15,2);
    v_reversal_percentage DECIMAL(5,4);
    v_inserted_count INT := 0;
BEGIN
    -- 1. Get Credit Note Details
    SELECT * INTO v_credit_note
    FROM credit_notes
    WHERE id = p_credit_note_id;
    
    IF v_credit_note IS NULL THEN
        RAISE EXCEPTION 'Credit note not found';
    END IF;
    
    IF v_credit_note.invoice_id IS NULL THEN
        RAISE EXCEPTION 'Credit note must be linked to an invoice';
    END IF;
    
    -- 2. Find Original Invoice Commissions
    FOR v_original_commission IN
        SELECT 
            cl.*,
            i.total_amount as invoice_total
        FROM commission_ledger cl
        JOIN invoices i ON i.id = cl.source_id
        WHERE cl.source_type = 'invoice'
        AND cl.source_id = v_credit_note.invoice_id
        AND cl.is_clawback = FALSE
        AND cl.company_id = v_credit_note.company_id
    LOOP
        -- Calculate reversal percentage (proportional to return)
        v_reversal_percentage := v_credit_note.total_amount / v_original_commission.invoice_total;
        v_reversal_amount := v_original_commission.amount * v_reversal_percentage;
        
        -- Insert Clawback Entry (Idempotent - UNIQUE constraint will prevent duplicates)
        BEGIN
            INSERT INTO commission_ledger (
                company_id,
                employee_id,
                commission_id,
                commission_plan_id,
                commission_run_id,
                source_type,
                source_id,
                source_credit_note_id,
                transaction_date,
                amount,
                reversal_amount,
                is_clawback,
                status,
                notes
            ) VALUES (
                v_credit_note.company_id,
                v_original_commission.employee_id,
                v_original_commission.commission_id,
                v_original_commission.commission_plan_id,
                v_original_commission.commission_run_id,
                'credit_note',
                v_credit_note.id,
                v_credit_note.id,
                v_credit_note.issue_date,
                -v_reversal_amount, -- Negative amount for clawback
                v_reversal_amount,
                TRUE,
                CASE 
                    WHEN v_original_commission.status IN ('posted', 'paid') THEN 'draft' -- Needs accounting adjustment
                    ELSE 'draft'
                END,
                'Auto-reversal for Credit Note ' || v_credit_note.credit_note_number
            );
            
            v_inserted_count := v_inserted_count + 1;
            
        EXCEPTION WHEN unique_violation THEN
            -- Already reversed - idempotent behavior
            CONTINUE;
        END;
        
        -- If original commission was already posted/paid, create adjustment journal entry
        IF v_original_commission.status IN ('posted', 'paid') THEN
            -- TODO: Create adjustment journal entry
            -- This will be handled in the post_commission_adjustment function
            NULL;
        END IF;
    END LOOP;
    
    RETURN jsonb_build_object(
        'success', TRUE,
        'reversed_count', v_inserted_count,
        'credit_note_id', p_credit_note_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- 3. POST COMMISSION RUN (Accounting Integration)
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
-- 4. PAY COMMISSION RUN
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
-- MIGRATION COMPLETE
-- =============================================
