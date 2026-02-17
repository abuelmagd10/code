-- =============================================
-- CREDIT NOTES TABLE & COMMISSION FIXES
-- Date: 2026-02-17
-- Description: Create credit_notes table and enhance RPC functions
-- =============================================

-- =============================================
-- 1. CREATE credit_notes TABLE
-- =============================================

CREATE TABLE IF NOT EXISTS public.credit_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    
    -- Reference
    credit_note_number TEXT NOT NULL,
    invoice_id UUID REFERENCES invoices(id),
    
    -- Dates
    issue_date DATE NOT NULL,
    
    -- Amounts
    subtotal DECIMAL(15,2) DEFAULT 0,
    discount_amount DECIMAL(15,2) DEFAULT 0,
    vat_amount DECIMAL(15,2) DEFAULT 0,
    total_amount DECIMAL(15,2) NOT NULL,
    
    -- Status
    status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'cancelled')),
    
    -- Reason
    reason TEXT,
    notes TEXT,
    
    -- Audit
    created_by UUID REFERENCES auth.users(id),
    approved_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    approved_at TIMESTAMPTZ,
    
    -- Unique credit note number per company
    CONSTRAINT uniq_credit_note_number UNIQUE (company_id, credit_note_number)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_credit_notes_company ON public.credit_notes(company_id);
CREATE INDEX IF NOT EXISTS idx_credit_notes_invoice ON public.credit_notes(invoice_id);
CREATE INDEX IF NOT EXISTS idx_credit_notes_status ON public.credit_notes(company_id, status);

-- RLS
ALTER TABLE public.credit_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS credit_notes_company_isolation ON public.credit_notes;

CREATE POLICY credit_notes_company_isolation ON public.credit_notes
    USING (company_id IN (
        SELECT company_id FROM company_members WHERE user_id = auth.uid()
    ));

-- =============================================
-- 2. ADD FK CONSTRAINT TO commission_ledger
-- =============================================

ALTER TABLE public.commission_ledger 
ADD CONSTRAINT fk_commission_ledger_credit_note 
FOREIGN KEY (source_credit_note_id) REFERENCES credit_notes(id) ON DELETE SET NULL;

-- =============================================
-- 3. ENHANCED reverse_commission_for_credit_note
-- WITH AUTOMATIC ADJUSTMENT AFTER PAYMENT
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
    v_adjustment_journal_id UUID;
    v_company_id UUID;
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
    
    v_company_id := v_credit_note.company_id;
    
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
                'draft', -- Will be posted with next run or as adjustment
                'Auto-reversal for Credit Note ' || v_credit_note.credit_note_number
            );
            
            v_inserted_count := v_inserted_count + 1;
            
        EXCEPTION WHEN unique_violation THEN
            -- Already reversed - idempotent behavior
            CONTINUE;
        END;
        
        -- ✅ AUTOMATIC ADJUSTMENT IF ALREADY POSTED/PAID
        IF v_original_commission.status IN ('posted', 'paid') THEN
            -- Create immediate adjustment journal entry
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
                v_company_id,
                v_credit_note.issue_date,
                'Commission Adjustment - Credit Note ' || v_credit_note.credit_note_number,
                'commission_adjustment',
                v_credit_note.id,
                'posted',
                auth.uid(),
                NOW()
            ) RETURNING id INTO v_adjustment_journal_id;
            
            -- Dr Commission Payable (reduce liability)
            INSERT INTO journal_entry_lines (
                journal_entry_id,
                account_id,
                description,
                debit_amount,
                credit_amount
            ) VALUES (
                v_adjustment_journal_id,
                (SELECT id FROM chart_of_accounts WHERE company_id = v_company_id AND account_code = '2110' LIMIT 1), -- Commission Payable
                'Commission Adjustment',
                v_reversal_amount,
                0
            );
            
            -- Cr Commission Expense (reduce expense)
            INSERT INTO journal_entry_lines (
                journal_entry_id,
                account_id,
                description,
                debit_amount,
                credit_amount
            ) VALUES (
                v_adjustment_journal_id,
                (SELECT id FROM chart_of_accounts WHERE company_id = v_company_id AND account_code = '6210' LIMIT 1), -- Commission Expense
                'Commission Adjustment',
                0,
                v_reversal_amount
            );
            
            -- Update clawback entry with journal reference
            UPDATE commission_ledger
            SET 
                journal_entry_id = v_adjustment_journal_id,
                status = 'posted'
            WHERE source_credit_note_id = v_credit_note.id
            AND employee_id = v_original_commission.employee_id;
        END IF;
    END LOOP;
    
    RETURN jsonb_build_object(
        'success', TRUE,
        'reversed_count', v_inserted_count,
        'credit_note_id', p_credit_note_id,
        'adjustment_journal_id', v_adjustment_journal_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- 4. ENHANCED calculate_commission_for_period
-- WITH IDEMPOTENCY GUARDS
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
    v_total_commission DECIMAL(15,2) := 0;
    v_invoice_amount DECIMAL(15,2);
    v_commission_amount DECIMAL(15,2);
    v_tier RECORD;
    v_remaining_amount DECIMAL(15,2);
    v_tier_commission DECIMAL(15,2);
    v_highest_tier_rate DECIMAL(5,2) := 0;
    v_inserted_count INT := 0;
    v_existing_count INT := 0;
BEGIN
    -- ✅ IDEMPOTENCY CHECK: Prevent re-calculation for same run
    IF p_commission_run_id IS NOT NULL THEN
        SELECT COUNT(*) INTO v_existing_count
        FROM commission_ledger
        WHERE commission_run_id = p_commission_run_id
        AND employee_id = p_employee_id
        AND commission_plan_id = p_commission_plan_id;
        
        IF v_existing_count > 0 THEN
            RETURN jsonb_build_object(
                'success', TRUE,
                'message', 'Already calculated for this run',
                'commission_amount', 0,
                'net_sales', 0,
                'invoices_processed', 0
            );
        END IF;
    END IF;
    
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
            i.invoice_date,
            i.paid_at,
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
        
        -- ✅ TIER CALCULATION ON NET SALES AFTER RETURNS
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
        
        -- Calculate commission for this invoice (on NET amount after returns)
        v_commission_amount := 0;
        
        IF v_plan.type = 'flat_percent' THEN
            -- Simple flat percentage
            SELECT commission_rate INTO v_highest_tier_rate
            FROM commission_rules
            WHERE plan_id = p_commission_plan_id
            LIMIT 1;
            
            v_commission_amount := v_invoice_amount * (COALESCE(v_highest_tier_rate, 0) / 100);
            
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
                        v_remaining_amount := 0;
                    ELSE
                        DECLARE
                            v_tier_range DECIMAL(15,2);
                            v_amount_in_tier DECIMAL(15,2);
                        BEGIN
                            v_tier_range := v_tier.max_amount - v_tier.min_amount;
                            v_amount_in_tier := LEAST(v_remaining_amount, v_tier_range);
                            v_tier_commission := v_amount_in_tier * (v_tier.commission_rate / 100);
                            v_remaining_amount := v_remaining_amount - v_amount_in_tier;
                        END;
                    END IF;
                    
                    v_commission_amount := v_commission_amount + v_tier_commission + COALESCE(v_tier.fixed_amount, 0);
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
                NULL,
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
            v_total_commission := v_total_commission + v_commission_amount;
            
        EXCEPTION WHEN unique_violation THEN
            -- Already calculated for this invoice/plan combination - skip
            CONTINUE;
        END;
    END LOOP;
    
    RETURN jsonb_build_object(
        'success', TRUE,
        'commission_amount', v_total_commission,
        'net_sales', v_net_sales,
        'invoices_processed', v_inserted_count
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
