-- 20260321030000_enterprise_pr_upgrade_phase1.sql

-- ==============================================================================
-- 1. SYSTEM EVENTS TABLE (Event Router Destination)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS system_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    event_type VARCHAR(255) NOT NULL, -- e.g., 'purchase_return.created', 'purchase_return.approved'
    reference_type VARCHAR(100) NOT NULL, -- e.g., 'purchase_return'
    reference_id UUID NOT NULL,
    payload JSONB DEFAULT '{}'::jsonb,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'processed', 'failed'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    processed_at TIMESTAMP WITH TIME ZONE,
    error_message TEXT,
    event_key VARCHAR(255) UNIQUE -- strictly used to prevent duplicate identical events
);

DROP INDEX IF EXISTS idx_system_events_status;
CREATE INDEX idx_system_events_status ON system_events(status, company_id);

DROP INDEX IF EXISTS idx_system_events_ref;
CREATE INDEX idx_system_events_ref ON system_events(reference_type, reference_id);

-- ==============================================================================
-- 2. IMMUTABLE BILLS TRIGGER (Total Amount)
-- ==============================================================================
CREATE OR REPLACE FUNCTION trg_prevent_bill_modification()
RETURNS TRIGGER AS $$
BEGIN
    -- Only protect bills that are received or paid in some form
    IF OLD.receipt_status = 'received' OR OLD.status IN ('paid', 'partially_paid') THEN
        -- Prevent changing the total_amount
        IF NEW.total_amount IS DISTINCT FROM OLD.total_amount THEN
            RAISE EXCEPTION 'Enterprise Constraint Failed: Cannot modify total_amount of a received or paid bill (Bill %). Only returned_amount can be modified.', OLD.bill_number;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_bill_modification_trigger ON bills;
CREATE TRIGGER trg_prevent_bill_modification_trigger
BEFORE UPDATE ON bills
FOR EACH ROW
EXECUTE FUNCTION trg_prevent_bill_modification();

-- ==============================================================================
-- 3. STATE MACHINE TRANSITION RPC & VALIDATION
-- ==============================================================================
CREATE OR REPLACE FUNCTION transition_purchase_return_state(
    p_pr_id UUID,
    p_company_id UUID,
    p_user_id UUID,
    p_new_state VARCHAR, -- 'approved', 'rejected', 'pending_warehouse_execution', 'completed', 'closed'
    p_notes TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_old_state VARCHAR;
    v_pr_number VARCHAR;
    v_payload JSONB;
    v_event_key VARCHAR;
BEGIN
    -- 1. Lock the row to prevent concurrent transitions
    SELECT status, return_number INTO v_old_state, v_pr_number
    FROM purchase_returns
    WHERE id = p_pr_id AND company_id = p_company_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Purchase return not found or access denied';
    END IF;

    -- 2. State Machine Validation Matrix
    IF p_new_state = 'approved' THEN
        IF v_old_state != 'pending_approval' THEN
            RAISE EXCEPTION 'Invalid transition: Cannot approve a purchase return in % state', v_old_state;
        END IF;

    ELSIF p_new_state = 'rejected' THEN
        IF v_old_state != 'pending_approval' THEN
            RAISE EXCEPTION 'Invalid transition: Cannot reject a purchase return in % state', v_old_state;
        END IF;

    ELSIF p_new_state = 'completed' THEN
        -- It must be approved before it can be completed (or 'sent_to_vendor' historically)
        IF v_old_state NOT IN ('approved', 'partially_returned') THEN
            RAISE EXCEPTION 'Invalid transition: Cannot complete a purchase return in % state (must be approved)', v_old_state;
        END IF;

    ELSIF p_new_state = 'closed' THEN
        IF v_old_state NOT IN ('completed', 'returned') THEN
            RAISE EXCEPTION 'Invalid transition: Cannot close a purchase return in % state (must be completed first)', v_old_state;
        END IF;

    ELSE
        RAISE EXCEPTION 'Invalid new state: %', p_new_state;
    END IF;

    -- 3. Update the state
    UPDATE purchase_returns
    SET 
        status = p_new_state,
        workflow_status = p_new_state,
        updated_at = NOW(),
        notes = CASE WHEN p_notes IS NOT NULL THEN p_notes ELSE notes END,
        approved_by = CASE WHEN p_new_state = 'approved' THEN p_user_id ELSE approved_by END,
        approved_at = CASE WHEN p_new_state = 'approved' THEN NOW() ELSE approved_at END,
        rejected_by = CASE WHEN p_new_state = 'rejected' THEN p_user_id ELSE rejected_by END,
        rejected_at = CASE WHEN p_new_state = 'rejected' THEN NOW() ELSE rejected_at END
    WHERE id = p_pr_id;

    -- 4. Emit System Event (Idempotent)
    v_payload := jsonb_build_object(
        'return_id', p_pr_id,
        'return_number', v_pr_number,
        'old_state', v_old_state,
        'new_state', p_new_state,
        'notes', p_notes
    );
    v_event_key := 'purchase_return.' || p_new_state || '.' || p_pr_id::text;

    INSERT INTO system_events (
        company_id, event_type, reference_type, reference_id, payload, user_id, event_key
    ) VALUES (
        p_company_id, 
        'purchase_return.' || p_new_state, 
        'purchase_return', 
        p_pr_id, 
        v_payload, 
        p_user_id, 
        v_event_key
    )
    ON CONFLICT (event_key) DO NOTHING;

    -- 5. Unified Audit Log
    INSERT INTO audit_logs (
        company_id, user_id, action, entity_type, entity_id, new_values, created_at
    ) VALUES (
        p_company_id, p_user_id, 'purchase_return_state_transition', 'purchase_return', p_pr_id,
        jsonb_build_object(
            'from_state', v_old_state,
            'to_state', p_new_state,
            'notes', p_notes,
            'transitioned_at', NOW()
        ),
        NOW()
    );

    RETURN jsonb_build_object('success', true, 'old_state', v_old_state, 'new_state', p_new_state);
END;
$$;


-- ==============================================================================
-- 4. ATOMIC CONFIRM DELIVERY RPC
-- ==============================================================================
CREATE OR REPLACE FUNCTION confirm_purchase_return_delivery_v2(
    p_purchase_return_id UUID,
    p_confirmed_by UUID,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_pr RECORD;
    v_company_id UUID;
    v_supplier_id UUID;
    v_bill_id UUID;
    v_transition_result JSONB;
    v_item RECORD;
    v_inventory_account_id UUID;
    v_purchase_account_id UUID;
    v_vat_account_id UUID;
    v_vendor_credit_account_id UUID;
    v_je_id UUID;
    v_credit_id UUID;
BEGIN
    -- 1. Fetch & Lock PR
    SELECT * INTO v_pr
    FROM purchase_returns
    WHERE id = p_purchase_return_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Purchase return not found';
    END IF;

    v_company_id := v_pr.company_id;
    v_supplier_id := v_pr.supplier_id;
    v_bill_id := v_pr.bill_id;

    -- 2. State Transition (Will throw exception if not approved)
    -- This handles the Audit Log and System Event Emit!
    v_transition_result := transition_purchase_return_state(
        p_purchase_return_id,
        v_company_id,
        p_confirmed_by,
        'completed',
        p_notes
    );
    
    -- 3. Deduct Inventory
    UPDATE purchase_return_items
    SET is_deducted = true
    WHERE purchase_return_id = p_purchase_return_id AND is_deducted = false;

    FOR v_item IN (SELECT * FROM purchase_return_items WHERE purchase_return_id = p_purchase_return_id)
    LOOP
        INSERT INTO inventory_transactions (
            company_id, branch_id, warehouse_id, product_id,
            transaction_type, reference_type, reference_id,
            quantity_change, unit_cost, total_cost,
            transaction_date, notes, is_deleted
        ) VALUES (
            v_company_id, v_pr.branch_id, v_pr.warehouse_id, v_item.product_id,
            'purchase_return', 'purchase_return', p_purchase_return_id,
            -(v_item.quantity), v_item.unit_price, -(v_item.quantity * v_item.unit_price),
            NOW(), 'مرتجع مشتريات للمورد', false
        );

        -- Adjust bill returned quantity
        UPDATE bill_items
        SET returned_quantity = COALESCE(returned_quantity, 0) + v_item.quantity
        WHERE id = v_item.bill_item_id;
    END LOOP;

    -- 4. Update Bill 'returned_amount' globally (Trigger prevents total_amount modifications)
    UPDATE bills
    SET 
        returned_amount = COALESCE(returned_amount, 0) + v_pr.total_amount,
        return_status = CASE 
            WHEN (COALESCE(returned_amount, 0) + v_pr.total_amount) >= total_amount THEN 'fully_returned'
            ELSE 'partially_returned'
        END
    WHERE id = v_bill_id;

    -- 5. Vendor Credit Generation (Single Source of Truth)
    -- We only generate vendor credit if settlement_method is debit_note / credit
    IF v_pr.settlement_method IN ('debit_note', 'credit') THEN
        INSERT INTO vendor_credits (
            company_id, supplier_id, reference_number,
            credit_date, total_amount, remaining_amount,
            status, notes,
            original_currency, exchange_rate_used, exchange_rate_id,
            created_by
        ) VALUES (
            v_company_id, v_supplier_id, v_pr.return_number,
            v_pr.return_date, v_pr.total_amount, v_pr.total_amount,
            'open', 'Generated by Return ' || v_pr.return_number,
            v_pr.original_currency, v_pr.exchange_rate_used, v_pr.exchange_rate_id,
            p_confirmed_by
        ) RETURNING id INTO v_credit_id;
        
        -- Emit event for Vendor Credit creation
        INSERT INTO system_events (
            company_id, event_type, reference_type, reference_id, payload, user_id, event_key
        ) VALUES (
            v_company_id, 'vendor_credit.created', 'vendor_credit', v_credit_id, 
            jsonb_build_object('return_id', p_purchase_return_id, 'amount', v_pr.total_amount), 
            p_confirmed_by, 'vendor_credit.created.' || v_credit_id::text
        ) ON CONFLICT (event_key) DO NOTHING;
    END IF;

    -- 6. Journal Entries
    -- Get Accounts
    SELECT id INTO v_inventory_account_id FROM chart_of_accounts WHERE company_id = v_company_id AND sub_type = 'inventory' LIMIT 1;
    SELECT id INTO v_vat_account_id FROM chart_of_accounts WHERE company_id = v_company_id AND sub_type = 'vat_input' LIMIT 1;
    SELECT id INTO v_vendor_credit_account_id FROM chart_of_accounts WHERE company_id = v_company_id AND (sub_type = 'vendor_credit_liability' OR sub_type = 'accounts_payable') LIMIT 1;

    INSERT INTO journal_entries (
        company_id, entry_number, entry_date, description,
        reference_type, reference_id, status, created_by
    ) VALUES (
        v_company_id, 'JE-PR-' || v_pr.return_number, v_pr.return_date, 'مرتجع مشتريات ' || v_pr.return_number,
        'purchase_return', p_purchase_return_id, 'posted', p_confirmed_by
    ) RETURNING id INTO v_je_id;

    -- Debit Vendor (Vendor Credit Account)
    IF v_vendor_credit_account_id IS NOT NULL AND v_pr.total_amount > 0 THEN
        INSERT INTO journal_entry_lines (
            journal_entry_id, account_id, debit_amount, credit_amount,
            description, original_currency, exchange_rate_used
        ) VALUES (
            v_je_id, v_vendor_credit_account_id, v_pr.total_amount, 0,
            'تخفيض الموردين - إشعار مدين', v_pr.original_currency, v_pr.exchange_rate_used
        );
    END IF;

    -- Credit Inventory
    IF v_inventory_account_id IS NOT NULL AND v_pr.subtotal > 0 THEN
        INSERT INTO journal_entry_lines (
            journal_entry_id, account_id, debit_amount, credit_amount,
            description, original_currency, exchange_rate_used
        ) VALUES (
            v_je_id, v_inventory_account_id, 0, v_pr.subtotal,
            'مخزون مرتجع للمورد', v_pr.original_currency, v_pr.exchange_rate_used
        );
    END IF;

    -- Credit VAT
    IF v_vat_account_id IS NOT NULL AND v_pr.tax_amount > 0 THEN
        INSERT INTO journal_entry_lines (
            journal_entry_id, account_id, debit_amount, credit_amount,
            description, original_currency, exchange_rate_used
        ) VALUES (
            v_je_id, v_vat_account_id, 0, v_pr.tax_amount,
            'عكس ضريبة المشتريات', v_pr.original_currency, v_pr.exchange_rate_used
        );
    END IF;

    -- Finalize
    UPDATE purchase_returns SET workflow_status = 'completed' WHERE id = p_purchase_return_id;

    RETURN jsonb_build_object(
        'success', true, 
        'purchase_return_id', p_purchase_return_id,
        'vendor_credit_id', v_credit_id,
        'journal_entry_id', v_je_id
    );
END;
$$;
