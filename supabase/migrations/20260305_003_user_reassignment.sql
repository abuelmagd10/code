-- Migration: 20260305_003_user_reassignment.sql
-- Description: Adds RPCs for checking user dependencies and reassigning data before deletion.

-- 1. Function to check dependencies
CREATE OR REPLACE FUNCTION public.get_user_dependencies(p_company_id UUID, p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_result JSONB := '{}'::JSONB;
    v_count INT;
    v_total INT := 0;
BEGIN
    -- Check Invoices
    SELECT count(*) INTO v_count FROM invoices WHERE company_id = p_company_id AND created_by_user_id = p_user_id;
    IF v_count > 0 THEN v_result := jsonb_set(v_result, '{invoices}', to_jsonb(v_count)); v_total := v_total + v_count; END IF;
    
    -- Check Sales Orders
    SELECT count(*) INTO v_count FROM sales_orders WHERE company_id = p_company_id AND created_by_user_id = p_user_id;
    IF v_count > 0 THEN v_result := jsonb_set(v_result, '{sales_orders}', to_jsonb(v_count)); v_total := v_total + v_count; END IF;

    -- Check Purchase Orders
    SELECT count(*) INTO v_count FROM purchase_orders WHERE company_id = p_company_id AND created_by_user_id = p_user_id;
    IF v_count > 0 THEN v_result := jsonb_set(v_result, '{purchase_orders}', to_jsonb(v_count)); v_total := v_total + v_count; END IF;

    -- Check Bills
    SELECT count(*) INTO v_count FROM bills WHERE company_id = p_company_id AND (created_by_user_id = p_user_id OR created_by = p_user_id);
    IF v_count > 0 THEN v_result := jsonb_set(v_result, '{bills}', to_jsonb(v_count)); v_total := v_total + v_count; END IF;

    -- Check Customers
    SELECT count(*) INTO v_count FROM customers WHERE company_id = p_company_id AND created_by_user_id = p_user_id;
    IF v_count > 0 THEN v_result := jsonb_set(v_result, '{customers}', to_jsonb(v_count)); v_total := v_total + v_count; END IF;

    -- Check Suppliers
    SELECT count(*) INTO v_count FROM suppliers WHERE company_id = p_company_id AND created_by_user_id = p_user_id;
    IF v_count > 0 THEN v_result := jsonb_set(v_result, '{suppliers}', to_jsonb(v_count)); v_total := v_total + v_count; END IF;

    -- Check Journal Entries
    SELECT count(*) INTO v_count FROM journal_entries WHERE company_id = p_company_id AND posted_by = p_user_id;
    IF v_count > 0 THEN v_result := jsonb_set(v_result, '{journal_entries}', to_jsonb(v_count)); v_total := v_total + v_count; END IF;
    
    -- Expose total for easy checking
    v_result := jsonb_set(v_result, '{total}', to_jsonb(v_total));

    RETURN v_result;
END;
$$;


-- 2. Function to reassign and remove user from company
CREATE OR REPLACE FUNCTION public.reassign_user_data_and_remove(p_company_id UUID, p_old_user_id UUID, p_new_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_old_role TEXT;
    v_is_target_active BOOLEAN;
BEGIN
    -- Validate old user
    SELECT role INTO v_old_role FROM company_members WHERE company_id = p_company_id AND user_id = p_old_user_id;
    IF v_old_role = 'owner' THEN
        RAISE EXCEPTION 'Cannot reassign and delete the company owner.';
    END IF;
    IF v_old_role IS NULL THEN
        RAISE EXCEPTION 'Source user is not a member of this company.';
    END IF;

    -- Validate new user
    SELECT TRUE INTO v_is_target_active FROM company_members WHERE company_id = p_company_id AND user_id = p_new_user_id;
    IF v_is_target_active IS NULL THEN
        RAISE EXCEPTION 'Target user is not a member of this company.';
    END IF;

    -- ===========================================
    -- REASSIGNMENTS: Change ownership / audit trails
    -- ===========================================
    
    -- Main Entities
    UPDATE invoices SET created_by_user_id = p_new_user_id WHERE company_id = p_company_id AND created_by_user_id = p_old_user_id;
    UPDATE sales_orders SET created_by_user_id = p_new_user_id WHERE company_id = p_company_id AND created_by_user_id = p_old_user_id;
    UPDATE purchase_orders SET created_by_user_id = p_new_user_id WHERE company_id = p_company_id AND created_by_user_id = p_old_user_id;
    UPDATE bills SET created_by_user_id = p_new_user_id WHERE company_id = p_company_id AND created_by_user_id = p_old_user_id;
    UPDATE bills SET created_by = p_new_user_id WHERE company_id = p_company_id AND created_by = p_old_user_id;
    UPDATE bills SET approved_by = p_new_user_id WHERE company_id = p_company_id AND approved_by = p_old_user_id;
    UPDATE bills SET rejected_by = p_new_user_id WHERE company_id = p_company_id AND rejected_by = p_old_user_id;
    UPDATE bills SET received_by = p_new_user_id WHERE company_id = p_company_id AND received_by = p_old_user_id;
    UPDATE customers SET created_by_user_id = p_new_user_id WHERE company_id = p_company_id AND created_by_user_id = p_old_user_id;
    UPDATE suppliers SET created_by_user_id = p_new_user_id WHERE company_id = p_company_id AND created_by_user_id = p_old_user_id;

    -- Financials & Ledger
    UPDATE journal_entries SET posted_by = p_new_user_id WHERE company_id = p_company_id AND posted_by = p_old_user_id;
    UPDATE expenses SET created_by = p_new_user_id WHERE company_id = p_company_id AND created_by = p_old_user_id;
    UPDATE expenses SET approved_by = p_new_user_id WHERE company_id = p_company_id AND approved_by = p_old_user_id;
    UPDATE expenses SET rejected_by = p_new_user_id WHERE company_id = p_company_id AND rejected_by = p_old_user_id;
    UPDATE expenses SET paid_by = p_new_user_id WHERE company_id = p_company_id AND paid_by = p_old_user_id;
    UPDATE vendor_credits SET created_by = p_new_user_id WHERE company_id = p_company_id AND created_by = p_old_user_id;
    UPDATE customer_credit_ledger SET created_by = p_new_user_id WHERE company_id = p_company_id AND created_by = p_old_user_id;
    UPDATE dividend_payments SET created_by = p_new_user_id WHERE company_id = p_company_id AND created_by = p_old_user_id;
    UPDATE profit_distributions SET approved_by = p_new_user_id WHERE company_id = p_company_id AND approved_by = p_old_user_id;
    UPDATE shareholder_drawings SET created_by = p_new_user_id WHERE company_id = p_company_id AND created_by = p_old_user_id;
    UPDATE shareholder_drawings SET approved_by = p_new_user_id WHERE company_id = p_company_id AND approved_by = p_old_user_id;
    UPDATE shareholder_drawings SET rejected_by = p_new_user_id WHERE company_id = p_company_id AND rejected_by = p_old_user_id;
    UPDATE commission_advance_payments SET created_by = p_new_user_id WHERE company_id = p_company_id AND created_by = p_old_user_id;
    UPDATE credit_notes SET created_by = p_new_user_id WHERE company_id = p_company_id AND created_by = p_old_user_id;
    UPDATE credit_notes SET approved_by = p_new_user_id WHERE company_id = p_company_id AND approved_by = p_old_user_id;
    
    -- Inventory & Operations
    UPDATE inventory_transfers SET created_by = p_new_user_id WHERE company_id = p_company_id AND created_by = p_old_user_id;
    UPDATE inventory_transfers SET approved_by = p_new_user_id WHERE company_id = p_company_id AND approved_by = p_old_user_id;
    UPDATE inventory_transfers SET rejected_by = p_new_user_id WHERE company_id = p_company_id AND rejected_by = p_old_user_id;
    UPDATE inventory_transfers SET received_by = p_new_user_id WHERE company_id = p_company_id AND received_by = p_old_user_id;
    UPDATE inventory_write_offs SET created_by = p_new_user_id WHERE company_id = p_company_id AND created_by = p_old_user_id;
    UPDATE inventory_write_offs SET approved_by = p_new_user_id WHERE company_id = p_company_id AND approved_by = p_old_user_id;
    UPDATE inventory_write_offs SET rejected_by = p_new_user_id WHERE company_id = p_company_id AND rejected_by = p_old_user_id;
    UPDATE inventory_write_offs SET cancelled_by = p_new_user_id WHERE company_id = p_company_id AND cancelled_by = p_old_user_id;
    UPDATE shipments SET created_by = p_new_user_id WHERE company_id = p_company_id AND created_by = p_old_user_id;
    UPDATE asset_transactions SET created_by = p_new_user_id WHERE company_id = p_company_id AND created_by = p_old_user_id;
    UPDATE fixed_assets SET employee_id = p_new_user_id WHERE company_id = p_company_id AND employee_id = p_old_user_id;
    UPDATE fixed_assets SET created_by = p_new_user_id WHERE company_id = p_company_id AND created_by = p_old_user_id;
    UPDATE fixed_assets SET updated_by = p_new_user_id WHERE company_id = p_company_id AND updated_by = p_old_user_id;
    UPDATE cogs_transactions SET created_by_user_id = p_new_user_id WHERE company_id = p_company_id AND created_by_user_id = p_old_user_id;

    -- Approvals, Planning & Miscellaneous
    UPDATE approval_workflows SET requested_by = p_new_user_id WHERE company_id = p_company_id AND requested_by = p_old_user_id;
    UPDATE approval_workflows SET approver_id = p_new_user_id WHERE company_id = p_company_id AND approver_id = p_old_user_id;
    UPDATE approval_workflows SET rejected_by = p_new_user_id WHERE company_id = p_company_id AND rejected_by = p_old_user_id;
    UPDATE approval_workflows SET executed_by = p_new_user_id WHERE company_id = p_company_id AND executed_by = p_old_user_id;
    UPDATE system_audit_log SET user_id = p_new_user_id WHERE company_id = p_company_id AND user_id = p_old_user_id;
    UPDATE notifications SET created_by = p_new_user_id WHERE company_id = p_company_id AND created_by = p_old_user_id;
    UPDATE notifications SET assigned_to_user = p_new_user_id WHERE company_id = p_company_id AND assigned_to_user = p_old_user_id;
    UPDATE fiscal_periods SET closed_by = p_new_user_id WHERE company_id = p_company_id AND closed_by = p_old_user_id;
    UPDATE fiscal_periods SET reopened_by = p_new_user_id WHERE company_id = p_company_id AND reopened_by = p_old_user_id;
    UPDATE budgets SET created_by = p_new_user_id WHERE company_id = p_company_id AND created_by = p_old_user_id;
    UPDATE budgets SET approved_by = p_new_user_id WHERE company_id = p_company_id AND approved_by = p_old_user_id;
    UPDATE commission_runs SET created_by = p_new_user_id WHERE company_id = p_company_id AND created_by = p_old_user_id;
    UPDATE commission_runs SET reviewed_by = p_new_user_id WHERE company_id = p_company_id AND reviewed_by = p_old_user_id;
    UPDATE commission_runs SET approved_by = p_new_user_id WHERE company_id = p_company_id AND approved_by = p_old_user_id;
    UPDATE commission_runs SET posted_by = p_new_user_id WHERE company_id = p_company_id AND posted_by = p_old_user_id;
    UPDATE commission_runs SET paid_by = p_new_user_id WHERE company_id = p_company_id AND paid_by = p_old_user_id;
    UPDATE exchange_rate_log SET created_by = p_new_user_id WHERE company_id = p_company_id AND created_by = p_old_user_id;
    UPDATE shipping_providers SET created_by = p_new_user_id WHERE company_id = p_company_id AND created_by = p_old_user_id;
    UPDATE shareholder_percentage_history SET created_by = p_new_user_id WHERE company_id = p_company_id AND created_by = p_old_user_id;
    UPDATE restore_queue SET user_id = p_new_user_id WHERE company_id = p_company_id AND user_id = p_old_user_id;

    -- HR / Employees constraint detaching
    -- We DONT reassign HR properties (like payroll or contracts). We just unlink the employee record from the deleted auth.user
    UPDATE employees SET user_id = NULL WHERE company_id = p_company_id AND user_id = p_old_user_id;

    -- ===========================================
    -- DELETIONS: Remove access records for old user
    -- ===========================================
    
    DELETE FROM user_branch_access WHERE company_id = p_company_id AND user_id = p_old_user_id;
    -- Change ownership of access granted BY the old user
    UPDATE user_branch_access SET created_by = p_new_user_id WHERE company_id = p_company_id AND created_by = p_old_user_id;
    
    DELETE FROM user_branch_cost_center WHERE company_id = p_company_id AND user_id = p_old_user_id;
    DELETE FROM permission_sharing WHERE company_id = p_company_id AND grantee_user_id = p_old_user_id;
    
    -- Reassign permission_sharing where old user was the grantor
    UPDATE permission_sharing SET grantor_user_id = p_new_user_id WHERE company_id = p_company_id AND grantor_user_id = p_old_user_id;
    UPDATE permission_sharing SET created_by = p_new_user_id WHERE company_id = p_company_id AND created_by = p_old_user_id;
    
    DELETE FROM permission_transfers WHERE company_id = p_company_id AND to_user_id = p_old_user_id;
    UPDATE permission_transfers SET from_user_id = p_new_user_id WHERE company_id = p_company_id AND from_user_id = p_old_user_id;
    UPDATE permission_transfers SET transferred_by = p_new_user_id WHERE company_id = p_company_id AND transferred_by = p_old_user_id;

    -- Drop security events if any are still logged locally for the user
    DELETE FROM user_security_events WHERE user_id = p_old_user_id;

    -- Finally delete company membership
    DELETE FROM company_members WHERE company_id = p_company_id AND user_id = p_old_user_id;

    RETURN jsonb_build_object('ok', true, 'message', 'User data reassigned and access removed successfully');
END;
$$;
