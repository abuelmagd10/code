-- =============================================
-- FIX: Commission Attribution to Sales Order Creator
-- Date: 2026-02-17
-- Critical Fix: Commission must go to Sales Order creator, not Invoice creator
-- =============================================

-- =============================================
-- ENHANCED calculate_commission_for_period
-- WITH SALES ORDER ATTRIBUTION
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
    v_sales_order_creator UUID;
BEGIN
    -- ✅ IDEMPOTENCY CHECK
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
    
    -- Get company_id first
    SELECT e.company_id INTO v_company_id
    FROM employees e
    WHERE e.id = p_employee_id;
    
    -- Get Plan Details
    SELECT cp.* INTO v_plan
    FROM commission_plans cp
    WHERE cp.id = p_commission_plan_id
    AND cp.company_id = v_company_id
    AND cp.is_active = TRUE;

    
    IF v_plan IS NULL THEN
        RAISE EXCEPTION 'Commission plan not found or inactive';
    END IF;
    
    -- ✅ CRITICAL FIX: Fetch Invoices based on SALES ORDER CREATOR
    FOR v_invoice IN
        SELECT 
            i.id,
            i.total_amount,
            i.discount_amount,
            i.vat_amount,
            i.invoice_date,
            i.paid_at,
            so.created_by as sales_order_creator_id,
            so.id as sales_order_id
        FROM invoices i
        -- ✅ JOIN with sales_orders to get the REAL commission owner
        LEFT JOIN sales_orders so ON so.id = i.sales_order_id
        WHERE i.company_id = v_company_id
        AND i.status = 'paid'
        AND (
            (v_plan.basis = 'invoice_issuance' AND i.invoice_date BETWEEN p_period_start AND p_period_end)
            OR
            (v_plan.basis = 'payment_collection' AND i.paid_at BETWEEN p_period_start AND p_period_end)
        )
        -- ✅ CRITICAL: Commission goes to Sales Order creator
        AND (
            -- If sales order exists, check its creator
            (so.id IS NOT NULL AND so.created_by = (SELECT user_id FROM employees WHERE id = p_employee_id))
            OR
            -- Fallback: If no sales order, use invoice creator (for backward compatibility)
            (so.id IS NULL AND i.created_by_user_id = (SELECT user_id FROM employees WHERE id = p_employee_id))
        )
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
        
        -- Subtract Credit Notes (if handle_returns = 'auto_reverse')
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
        
        -- Skip if amount is negative or zero
        IF v_invoice_amount <= 0 THEN
            CONTINUE;
        END IF;
        
        -- Calculate commission
        v_commission_amount := 0;
        
        IF v_plan.type = 'flat_percent' THEN
            SELECT commission_rate INTO v_highest_tier_rate
            FROM commission_rules
            WHERE plan_id = p_commission_plan_id
            LIMIT 1;
            
            v_commission_amount := v_invoice_amount * (COALESCE(v_highest_tier_rate, 0) / 100);
            
        ELSIF v_plan.type = 'tiered_revenue' THEN
            IF v_plan.tier_type = 'progressive' THEN
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
        
        -- Insert into commission_ledger
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
                status,
                notes
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
                'draft',
                CASE 
                    WHEN v_invoice.sales_order_id IS NOT NULL 
                    THEN 'Commission for Sales Order #' || v_invoice.sales_order_id
                    ELSE 'Commission for Invoice (no sales order)'
                END
            );
            
            v_inserted_count := v_inserted_count + 1;
            v_net_sales := v_net_sales + v_invoice_amount;
            v_total_commission := v_total_commission + v_commission_amount;
            
        EXCEPTION WHEN unique_violation THEN
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

-- =============================================
-- COMMENT: Document the attribution logic
-- =============================================

COMMENT ON FUNCTION calculate_commission_for_period IS 
'Calculates commissions for an employee based on SALES ORDER CREATOR, not invoice creator. 
This ensures commission goes to the person who made the sale, regardless of who processed the invoice.
Fallback: If no sales_order exists, uses invoice creator for backward compatibility.';
