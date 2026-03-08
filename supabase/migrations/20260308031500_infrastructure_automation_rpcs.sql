-- Migration: Enterprise ERP Infrastructure Automation RPCs
-- Date: 2026-03-08
-- Description: Creates atomic functions for company and branch creation to ensure partial infrastructure is never created.

-- 1. create_company_atomic
CREATE OR REPLACE FUNCTION create_company_atomic(
    p_user_id UUID,
    p_email TEXT,
    p_company_name TEXT,
    p_contact_name TEXT,
    p_phone TEXT,
    p_country TEXT,
    p_city TEXT
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_company_id UUID;
    v_member_id UUID;
    v_branch_id UUID;
    v_cc_id UUID;
    v_wh_id UUID;
    v_result jsonb;
BEGIN
    -- 1. Create Company
    INSERT INTO companies (
        user_id, name, email, phone, country, city, subscription_plan, max_users, subscription_status
    ) VALUES (
        p_user_id, p_company_name, p_email, p_phone, p_country, p_city, 'free', 1, 'active'
    ) RETURNING id INTO v_company_id;

    -- 2. Create Company Member (Owner)
    INSERT INTO company_members (
        company_id, user_id, role, email, full_name
    ) VALUES (
        v_company_id, p_user_id, 'owner', p_email, p_contact_name
    ) RETURNING id INTO v_member_id;

    -- 3. Create Main Branch
    INSERT INTO branches (
        company_id, name, branch_name, code, branch_code, email, phone, is_main, is_active, is_head_office
    ) VALUES (
        v_company_id, 'الفرع الرئيسي', 'الفرع الرئيسي', 'MAIN', 'MAIN', p_email, p_phone, true, true, true
    ) RETURNING id INTO v_branch_id;

    -- 4. Create Default Cost Center
    INSERT INTO cost_centers (
        company_id, branch_id, cost_center_name, cost_center_code, is_active
    ) VALUES (
        v_company_id, v_branch_id, 'مركز التكلفة الرئيسي', 'CC-MAIN', true
    ) RETURNING id INTO v_cc_id;

    -- 5. Create Default Warehouse
    INSERT INTO warehouses (
        company_id, branch_id, name, type, is_active
    ) VALUES (
        v_company_id, v_branch_id, 'المستودع الرئيسي', 'main', true
    ) RETURNING id INTO v_wh_id;

    -- 6. Update Branch with Defaults
    UPDATE branches 
    SET default_cost_center_id = v_cc_id, 
        default_warehouse_id = v_wh_id
    WHERE id = v_branch_id;

    v_result := jsonb_build_object(
        'success', true,
        'company_id', v_company_id,
        'branch_id', v_branch_id,
        'cost_center_id', v_cc_id,
        'warehouse_id', v_wh_id
    );

    RETURN v_result;
EXCEPTION
    WHEN OTHERS THEN
        -- Re-raise exception to trigger rollback
        RAISE EXCEPTION 'Failed to create company infrastructure: %', SQLERRM;
END;
$$;

-- 2. create_branch_atomic
CREATE OR REPLACE FUNCTION create_branch_atomic(
    p_company_id UUID,
    p_name TEXT,
    p_code TEXT,
    p_address TEXT,
    p_city TEXT,
    p_phone TEXT,
    p_email TEXT,
    p_manager_name TEXT,
    p_is_active BOOLEAN
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_branch_id UUID;
    v_cc_id UUID;
    v_wh_id UUID;
    v_result jsonb;
BEGIN
    -- 1. Create Branch
    INSERT INTO branches (
        company_id, name, branch_name, code, branch_code, address, city, phone, email, manager_name, is_active, is_main, is_head_office
    ) VALUES (
        p_company_id, p_name, p_name, p_code, p_code, p_address, p_city, p_phone, p_email, p_manager_name, COALESCE(p_is_active, true), false, false
    ) RETURNING id INTO v_branch_id;

    -- 2. Create Cost Center
    INSERT INTO cost_centers (
        company_id, branch_id, cost_center_name, cost_center_code, is_active
    ) VALUES (
        p_company_id, v_branch_id, 'مركز تكلفة - ' || p_name, 'CC-' || p_code, true
    ) RETURNING id INTO v_cc_id;

    -- 3. Create Warehouse
    INSERT INTO warehouses (
        company_id, branch_id, name, type, is_active
    ) VALUES (
        p_company_id, v_branch_id, 'مستودع - ' || p_name, 'branch', true
    ) RETURNING id INTO v_wh_id;

    -- 4. Update Branch with Defaults
    UPDATE branches 
    SET default_cost_center_id = v_cc_id, 
        default_warehouse_id = v_wh_id
    WHERE id = v_branch_id;

    v_result := jsonb_build_object(
        'success', true,
        'branch_id', v_branch_id,
        'branch_name', p_name,
        'cost_center_id', v_cc_id,
        'warehouse_id', v_wh_id
    );

    RETURN v_result;
EXCEPTION
    WHEN OTHERS THEN
        RAISE EXCEPTION 'Failed to create branch infrastructure: %', SQLERRM;
END;
$$;
