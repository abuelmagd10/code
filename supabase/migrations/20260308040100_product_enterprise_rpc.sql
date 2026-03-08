-- Migration: Enterprise ERP Product Creation RPC
-- Date: 2026-03-08
-- Description: Creates atomic function for product creation that safely enforces default cost centers and warehouses at the database level.

CREATE OR REPLACE FUNCTION create_product_atomic(
    p_company_id UUID,
    p_sku TEXT,
    p_name TEXT,
    p_description TEXT,
    p_unit_price NUMERIC,
    p_cost_price NUMERIC,
    p_unit TEXT,
    p_quantity_on_hand NUMERIC,
    p_reorder_level NUMERIC,
    p_item_type TEXT,
    p_income_account_id UUID,
    p_expense_account_id UUID,
    p_tax_code_id TEXT,
    p_branch_id UUID,
    p_warehouse_id UUID,
    p_cost_center_id UUID,
    p_original_unit_price NUMERIC,
    p_original_cost_price NUMERIC,
    p_original_currency TEXT,
    p_exchange_rate_used NUMERIC
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_product_id UUID;
    v_final_cc_id UUID := p_cost_center_id;
    v_final_wh_id UUID := p_warehouse_id;
    v_branch_record RECORD;
    v_result jsonb;
BEGIN

    -- 1. Fetch branch defaults if provided branch_id and missing cc/wh
    IF p_branch_id IS NOT NULL AND (p_cost_center_id IS NULL OR (p_item_type = 'product' AND p_warehouse_id IS NULL)) THEN
        SELECT default_cost_center_id, default_warehouse_id 
        INTO v_branch_record
        FROM branches 
        WHERE id = p_branch_id AND company_id = p_company_id;

        IF FOUND THEN
            IF p_cost_center_id IS NULL THEN
                v_final_cc_id := v_branch_record.default_cost_center_id;
            END IF;
            
            IF p_item_type = 'product' AND p_warehouse_id IS NULL THEN
                v_final_wh_id := v_branch_record.default_warehouse_id;
            END IF;
        END IF;
    END IF;

    -- 2. Enforce Service Rules (Services do NOT have a warehouse)
    IF p_item_type = 'service' THEN
        v_final_wh_id := NULL;
    END IF;

    -- 3. Insert Product Atomically
    INSERT INTO products (
        company_id,
        sku,
        name,
        description,
        unit_price,
        cost_price,
        unit,
        quantity_on_hand,
        reorder_level,
        item_type,
        income_account_id,
        expense_account_id,
        tax_code_id,
        branch_id,
        warehouse_id,
        cost_center_id,
        original_unit_price,
        original_cost_price,
        original_currency,
        exchange_rate_used
    ) VALUES (
        p_company_id,
        p_sku,
        p_name,
        p_description,
        p_unit_price,
        p_cost_price,
        p_unit,
        p_quantity_on_hand,
        p_reorder_level,
        p_item_type,
        p_income_account_id,
        p_expense_account_id,
        p_tax_code_id,
        p_branch_id,
        v_final_wh_id,
        v_final_cc_id,
        p_original_unit_price,
        p_original_cost_price,
        p_original_currency,
        p_exchange_rate_used
    ) RETURNING id INTO v_product_id;

    v_result := jsonb_build_object(
        'success', true,
        'product_id', v_product_id,
        'final_warehouse_id', v_final_wh_id,
        'final_cost_center_id', v_final_cc_id
    );

    RETURN v_result;
EXCEPTION
    WHEN OTHERS THEN
        RAISE EXCEPTION 'Failed to create product atomically: %', SQLERRM;
END;
$$;
