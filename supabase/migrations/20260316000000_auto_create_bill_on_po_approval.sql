-- Migration: Auto Create Draft Bill on Purchase Order Approval
-- Description: Updates the approve_purchase_order_atomic RPC to auto-generate a draft bill when a PO is approved, mapping all relevant fields and items.

CREATE OR REPLACE FUNCTION approve_purchase_order_atomic(
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
    v_new_bill_id UUID;
    v_bill_number TEXT;
    v_item RECORD;
BEGIN
    -- 1. Fetch user context (branch isolation & permissions)
    SELECT role, branch_id INTO v_user_role, v_user_branch
    FROM public.company_members
    WHERE company_id = p_company_id AND user_id = p_user_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'User is not a member of this company');
    END IF;

    -- Verify role (Only admin, owner, gm can approve - per current logic)
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

    -- 3. Enforce Branch Isolation
    IF v_user_branch IS NOT NULL AND v_po.branch_id IS NOT NULL AND v_user_branch != v_po.branch_id THEN
         RETURN jsonb_build_object('success', false, 'error', 'Branch isolation violation: Cannot approve PO for a different branch');
    END IF;

    -- 4. Validate current status
    IF v_po.status != 'pending_approval' THEN
        RETURN jsonb_build_object('success', false, 'error', 'PO is not in a pending_approval state');
    END IF;

    -- 5. Apply action
    IF p_action = 'approve' THEN
        v_new_status := 'approved'; -- ✅ Changing from 'draft' to 'approved'
        v_audit_action := 'po_approved';
        
        -- Update PO Status
        UPDATE public.purchase_orders
        SET status = v_new_status,
            approved_by = p_user_id,
            approved_at = NOW()
        WHERE id = p_po_id;

        -- ✅ 6. Auto-Create Draft Bill
        -- Generate new bill UUID
        v_new_bill_id := gen_random_uuid();
        
        -- Generate Bill Number based on company
        SELECT COALESCE(MAX(CAST(SUBSTRING(bill_number FROM 'BILL-([0-9]+)') AS INTEGER)), 0) + 1 INTO v_bill_number
        FROM public.bills
        WHERE company_id = p_company_id AND bill_number ~ '^BILL-[0-9]+$';
        
        v_bill_number := 'BILL-' || LPAD(COALESCE(v_bill_number, 1)::TEXT, 4, '0');

        -- Insert into bills
        INSERT INTO public.bills (
            id,
            company_id,
            supplier_id,
            bill_number,
            bill_date,
            due_date,
            subtotal,
            tax_amount,
            total_amount,
            status,
            created_at,
            is_deleted,
            purchase_order_id,
            branch_id,
            cost_center_id,
            warehouse_id,
            created_by_user_id,
            currency_code,
            discount_type,
            discount_value,
            shipping,
            adjustment,
            original_currency,
            original_total,
            display_currency,
            display_total,
            display_subtotal,
            original_subtotal,
            original_tax_amount
        ) VALUES (
            v_new_bill_id,
            v_po.company_id,
            v_po.supplier_id,
            v_bill_number,
            CURRENT_DATE, -- bill_date
            v_po.due_date,
            v_po.subtotal,
            v_po.tax_amount,
            v_po.total_amount,
            'draft', -- status
            NOW(),
            false,
            v_po.id, -- purchase_order_id
            v_po.branch_id,
            v_po.cost_center_id,
            v_po.warehouse_id,
            p_user_id, -- created_by_user_id
            v_po.currency,
            v_po.discount_type,
            v_po.discount_value,
            v_po.shipping,
            v_po.adjustment,
            v_po.currency,
            v_po.total_amount,
            v_po.currency,
            v_po.total_amount,
            v_po.subtotal,
            v_po.subtotal,
            v_po.tax_amount
        );

        -- Link PO to the new bill
        UPDATE public.purchase_orders
        SET bill_id = v_new_bill_id
        WHERE id = p_po_id;

        -- Insert Bill Items
        FOR v_item IN (SELECT * FROM public.purchase_order_items WHERE purchase_order_id = p_po_id) LOOP
            INSERT INTO public.bill_items (
                id,
                bill_id,
                product_id,
                description,
                quantity,
                unit_price,
                tax_rate,
                discount_percent,
                line_total
            ) VALUES (
                gen_random_uuid(),
                v_new_bill_id,
                v_item.product_id,
                v_item.description,
                v_item.quantity,
                v_item.unit_price,
                v_item.tax_rate,
                v_item.discount_percent,
                v_item.line_total
            );
        END LOOP;

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

    -- 7. Audit Logging
    INSERT INTO public.audit_logs (
        company_id, user_id, action, entity_type, entity_id, old_values, new_values, created_at
    ) VALUES (
        p_company_id,
        p_user_id,
        v_audit_action,
        'purchase_order',
        p_po_id,
        jsonb_build_object('status', v_po.status),
        jsonb_build_object('status', v_new_status, 'reason', p_reason),
        NOW()
    );

    RETURN jsonb_build_object(
        'success', true, 
        'po_id', p_po_id, 
        'status', v_new_status,
        'bill_id', v_new_bill_id,
        'creator_id', v_po.created_by_user_id
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;
