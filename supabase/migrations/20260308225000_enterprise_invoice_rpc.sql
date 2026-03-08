-- Migration: Sales Invoice Enterprise RPC and Accounting Engine
-- Date: 2026-03-08
-- Description: Creates an atomic RPC for invoice creation and an intelligent accounting engine
-- that respects product-level income/expense accounts (grouping lines in Journal Entries).

-- 1. Create the Advanced Accounting Router Function
CREATE OR REPLACE FUNCTION execute_sales_invoice_accounting(p_invoice_id UUID)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_invoice RECORD;
    v_company_id UUID;
    v_branch_id UUID;
    v_cost_center_id UUID;
    v_ar_id UUID;
    v_vat_id UUID;
    v_default_revenue_id UUID;
    v_default_cogs_id UUID;
    v_default_inventory_id UUID;
    v_revenue_je_id UUID;
    v_cogs_je_id UUID;
    v_item RECORD;
BEGIN
    SELECT * INTO v_invoice FROM invoices WHERE id = p_invoice_id;
    IF NOT FOUND THEN RETURN FALSE; END IF;

    v_company_id := v_invoice.company_id;
    v_branch_id := v_invoice.branch_id;
    v_cost_center_id := v_invoice.cost_center_id;

    -- Idempotency check: Skip if Revenue JE already exists for this invoice
    IF EXISTS (
        SELECT 1 FROM journal_entries
        WHERE reference_type = 'invoice' AND reference_id = p_invoice_id AND (is_deleted IS NULL OR is_deleted = false)
    ) THEN
        RETURN TRUE; 
    END IF;

    -- Fetch global defaults for fallback
    SELECT id INTO v_ar_id FROM chart_of_accounts 
    WHERE company_id = v_company_id AND is_active = true AND sub_type = 'accounts_receivable' LIMIT 1;
    
    SELECT id INTO v_default_revenue_id FROM chart_of_accounts 
    WHERE company_id = v_company_id AND is_active = true AND (sub_type = 'sales_revenue' OR account_type = 'income') LIMIT 1;
    
    SELECT id INTO v_default_cogs_id FROM chart_of_accounts 
    WHERE company_id = v_company_id AND is_active = true AND (sub_type IN ('cost_of_goods_sold', 'cogs') OR account_code = '5000') LIMIT 1;
    
    -- VAT Account
    SELECT id INTO v_vat_id FROM chart_of_accounts 
    WHERE company_id = v_company_id AND is_active = true AND (sub_type IN ('vat_output','tax_payable') OR account_name ILIKE '%ضريبة%' OR account_name ILIKE '%vat%') LIMIT 1;

    IF v_ar_id IS NULL THEN 
        RAISE EXCEPTION 'MISSING_AR_ACCOUNT: Accounts Receivable not configured for company %', v_company_id; 
    END IF;
    IF v_default_revenue_id IS NULL THEN 
        RAISE EXCEPTION 'MISSING_REVENUE_ACCOUNT: Master Sales Revenue not configured for company %', v_company_id; 
    END IF;

    -- We must ensure allow_direct_post is set so triggers don't block our draft->posted transition
    PERFORM set_config('app.allow_direct_post', 'true', true);

    -- Create Draft Revenue JE
    INSERT INTO journal_entries (
        company_id, branch_id, reference_type, reference_id, entry_date, description, status, cost_center_id, warehouse_id
    ) VALUES (
        v_company_id, v_branch_id, 'invoice', p_invoice_id, COALESCE(v_invoice.invoice_date, CURRENT_DATE), 'فاتورة مبيعات - ' || v_invoice.invoice_number, 'draft', v_cost_center_id, v_invoice.warehouse_id
    ) RETURNING id INTO v_revenue_je_id;

    -- Add AR Line (Debit)
    INSERT INTO journal_entry_lines (
        journal_entry_id, account_id, debit_amount, credit_amount, description, branch_id, cost_center_id
    ) VALUES (
        v_revenue_je_id, v_ar_id, COALESCE(v_invoice.total_amount, 0), 0, 'الذمم المدينة - ' || v_invoice.invoice_number, v_branch_id, v_cost_center_id
    );

    -- Add VAT Line if any (Credit)
    IF COALESCE(v_invoice.tax_amount, 0) > 0 AND v_vat_id IS NOT NULL THEN
        INSERT INTO journal_entry_lines (
            journal_entry_id, account_id, debit_amount, credit_amount, description, branch_id, cost_center_id
        ) VALUES (
            v_revenue_je_id, v_vat_id, 0, v_invoice.tax_amount, 'ضريبة القيمة المضافة - ' || v_invoice.invoice_number, v_branch_id, v_cost_center_id
        );
    END IF;

    -- Group Revenue by Product's income_account_id
    FOR v_item IN (
        SELECT 
            COALESCE(p.income_account_id, v_default_revenue_id) as acc_id,
            SUM(ii.line_total) as grouped_amount
        FROM invoice_items ii
        JOIN products p ON p.id = ii.product_id
        WHERE ii.invoice_id = p_invoice_id
        GROUP BY COALESCE(p.income_account_id, v_default_revenue_id)
        HAVING SUM(ii.line_total) > 0
    ) LOOP
        INSERT INTO journal_entry_lines (
            journal_entry_id, account_id, debit_amount, credit_amount, description, branch_id, cost_center_id
        ) VALUES (
            v_revenue_je_id, v_item.acc_id, 0, v_item.grouped_amount, 'إيرادات المبيعات - ' || v_invoice.invoice_number, v_branch_id, v_cost_center_id
        );
    END LOOP;

    -- Handle Shipping fee as revenue fallback if shipping > 0
    IF COALESCE(v_invoice.shipping, 0) > 0 THEN
        INSERT INTO journal_entry_lines (
            journal_entry_id, account_id, debit_amount, credit_amount, description, branch_id, cost_center_id
        ) VALUES (
            v_revenue_je_id, v_default_revenue_id, 0, v_invoice.shipping, 'إيرادات الشحن - ' || v_invoice.invoice_number, v_branch_id, v_cost_center_id
        );
    END IF;

    -- Handle Adjustment (Credit or Debit depending on sign)
    IF COALESCE(v_invoice.adjustment, 0) != 0 THEN
        IF v_invoice.adjustment > 0 THEN
             -- Add to revenue
             INSERT INTO journal_entry_lines (
                 journal_entry_id, account_id, debit_amount, credit_amount, description, branch_id, cost_center_id
             ) VALUES (
                 v_revenue_je_id, v_default_revenue_id, 0, v_invoice.adjustment, 'تسويات - ' || v_invoice.invoice_number, v_branch_id, v_cost_center_id
             );
        ELSE
             -- Reduce revenue
             INSERT INTO journal_entry_lines (
                 journal_entry_id, account_id, debit_amount, credit_amount, description, branch_id, cost_center_id
             ) VALUES (
                 v_revenue_je_id, v_default_revenue_id, ABS(v_invoice.adjustment), 0, 'تسويات خصم - ' || v_invoice.invoice_number, v_branch_id, v_cost_center_id
             );
        END IF;
    END IF;

    -- Post Revenue JE
    UPDATE journal_entries SET status = 'posted' WHERE id = v_revenue_je_id;

    -- COGS Entry logic: group by product's expense_account_id (fallback = company default COGS)
    -- Inventory account resolved from company-level chart_of_accounts (sub_type = 'inventory')
    CREATE TEMP TABLE tmp_cogs_grouping ON COMMIT DROP AS
    SELECT 
        COALESCE(p.expense_account_id, v_default_cogs_id) as cogs_acc_id,
        (SELECT id FROM chart_of_accounts WHERE company_id = v_company_id AND is_active = true AND sub_type = 'inventory' LIMIT 1) as inv_acc_id,
        SUM(ii.quantity * COALESCE(p.cost_price, 0)) as grouped_cogs_amount
    FROM invoice_items ii
    JOIN products p ON p.id = ii.product_id
    WHERE ii.invoice_id = p_invoice_id AND p.item_type != 'service'
    GROUP BY COALESCE(p.expense_account_id, v_default_cogs_id)
    HAVING SUM(ii.quantity * COALESCE(p.cost_price, 0)) > 0;

    IF EXISTS (SELECT 1 FROM tmp_cogs_grouping) THEN
        -- Create COGS JE as draft
        INSERT INTO journal_entries (
            company_id, branch_id, reference_type, reference_id, entry_date, description, status, cost_center_id, warehouse_id
        ) VALUES (
            v_company_id, v_branch_id, 'invoice_cogs', p_invoice_id, COALESCE(v_invoice.invoice_date, CURRENT_DATE), 'تكلفة البضاعة المباعة - ' || v_invoice.invoice_number, 'draft', v_cost_center_id, v_invoice.warehouse_id
        ) RETURNING id INTO v_cogs_je_id;

        FOR v_item IN (SELECT * FROM tmp_cogs_grouping) LOOP
            IF v_item.cogs_acc_id IS NULL OR v_item.inv_acc_id IS NULL THEN
                RAISE EXCEPTION 'MISSING_COGS_OR_INVENTORY_ACCOUNT_FOR_PRODUCT (Company: %)', v_company_id;
            END IF;

            -- COGS Debit
            INSERT INTO journal_entry_lines (
                journal_entry_id, account_id, debit_amount, credit_amount, description, branch_id, cost_center_id
            ) VALUES (
                v_cogs_je_id, v_item.cogs_acc_id, v_item.grouped_cogs_amount, 0, 'تكلفة مبيعات - ' || v_invoice.invoice_number, v_branch_id, v_cost_center_id
            );

            -- Inventory Credit
            INSERT INTO journal_entry_lines (
                journal_entry_id, account_id, debit_amount, credit_amount, description, branch_id, cost_center_id
            ) VALUES (
                v_cogs_je_id, v_item.inv_acc_id, 0, v_item.grouped_cogs_amount, 'المخزون - ' || v_invoice.invoice_number, v_branch_id, v_cost_center_id
            );
        END LOOP;

        -- Post COGS JE
        UPDATE journal_entries SET status = 'posted' WHERE id = v_cogs_je_id;
    END IF;

    -- Reset config
    PERFORM set_config('app.allow_direct_post', 'false', true);
    
    RETURN TRUE;
EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('app.allow_direct_post', 'false', true);
    RAISE;
END;
$$;


-- 2. Update the existing trigger handle_invoice_sent_accrual to use the new engine
CREATE OR REPLACE FUNCTION handle_invoice_sent_accrual()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF NOT (OLD.status = 'draft' AND NEW.status = 'sent') THEN
        RETURN NEW;
    END IF;

    PERFORM execute_sales_invoice_accounting(NEW.id);
    
    RETURN NEW;
END;
$$;


-- 3. Create the Atomic Invoice RPC
CREATE OR REPLACE FUNCTION create_sales_invoice_atomic(
    p_invoice_data JSONB,
    p_invoice_items JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_invoice_id UUID;
    v_item JSONB;
BEGIN
    -- Insert Invoice
    INSERT INTO invoices (
        company_id, customer_id, invoice_date, due_date, subtotal, tax_amount, total_amount,
        discount_type, discount_value, discount_position, tax_inclusive, shipping, shipping_tax_rate,
        shipping_provider_id, adjustment, status, sales_order_id, branch_id, cost_center_id, warehouse_id,
        created_by_user_id, currency_code, exchange_rate, exchange_rate_used, exchange_rate_id, rate_source,
        base_currency_total, original_currency, original_total, original_subtotal, original_tax_amount,
        customer_name_snapshot, customer_email_snapshot, customer_phone_snapshot, customer_address_snapshot,
        customer_city_snapshot, customer_country_snapshot, customer_tax_id_snapshot, customer_governorate_snapshot,
        customer_detailed_address_snapshot
    )
    SELECT
        (p_invoice_data->>'company_id')::UUID,
        (p_invoice_data->>'customer_id')::UUID,
        (p_invoice_data->>'invoice_date')::DATE,
        (p_invoice_data->>'due_date')::DATE,
        (p_invoice_data->>'subtotal')::NUMERIC,
        (p_invoice_data->>'tax_amount')::NUMERIC,
        (p_invoice_data->>'total_amount')::NUMERIC,
        p_invoice_data->>'discount_type',
        (p_invoice_data->>'discount_value')::NUMERIC,
        p_invoice_data->>'discount_position',
        (p_invoice_data->>'tax_inclusive')::BOOLEAN,
        (p_invoice_data->>'shipping')::NUMERIC,
        (p_invoice_data->>'shipping_tax_rate')::NUMERIC,
        (p_invoice_data->>'shipping_provider_id')::UUID,
        (p_invoice_data->>'adjustment')::NUMERIC,
        COALESCE(p_invoice_data->>'status', 'draft'),
        (p_invoice_data->>'sales_order_id')::UUID,
        (p_invoice_data->>'branch_id')::UUID,
        (p_invoice_data->>'cost_center_id')::UUID,
        (p_invoice_data->>'warehouse_id')::UUID,
        (p_invoice_data->>'created_by_user_id')::UUID,
        p_invoice_data->>'currency_code',
        (p_invoice_data->>'exchange_rate')::NUMERIC,
        (p_invoice_data->>'exchange_rate_used')::NUMERIC,
        (p_invoice_data->>'exchange_rate_id')::UUID,
        p_invoice_data->>'rate_source',
        (p_invoice_data->>'base_currency_total')::NUMERIC,
        p_invoice_data->>'original_currency',
        (p_invoice_data->>'original_total')::NUMERIC,
        (p_invoice_data->>'original_subtotal')::NUMERIC,
        (p_invoice_data->>'original_tax_amount')::NUMERIC,
        p_invoice_data->>'customer_name_snapshot',
        p_invoice_data->>'customer_email_snapshot',
        p_invoice_data->>'customer_phone_snapshot',
        p_invoice_data->>'customer_address_snapshot',
        p_invoice_data->>'customer_city_snapshot',
        p_invoice_data->>'customer_country_snapshot',
        p_invoice_data->>'customer_tax_id_snapshot',
        p_invoice_data->>'customer_governorate_snapshot',
        p_invoice_data->>'customer_detailed_address_snapshot'
    RETURNING id INTO v_invoice_id;

    -- Insert Items
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_invoice_items)
    LOOP
        INSERT INTO invoice_items (
            invoice_id,
            product_id,
            quantity,
            unit_price,
            tax_rate,
            discount_percent,
            line_total,
            returned_quantity,
            item_type
        ) VALUES (
            v_invoice_id,
            (v_item->>'product_id')::UUID,
            (v_item->>'quantity')::INTEGER,
            (v_item->>'unit_price')::NUMERIC,
            (v_item->>'tax_rate')::NUMERIC,
            (v_item->>'discount_percent')::NUMERIC,
            (v_item->>'line_total')::NUMERIC,
            COALESCE((v_item->>'returned_quantity')::INTEGER, 0),
            COALESCE(v_item->>'item_type', 'product')
        );
    END LOOP;

    -- If inserted directly as 'sent', run the accounting engine synchronously
    IF COALESCE(p_invoice_data->>'status', 'draft') = 'sent' THEN
        PERFORM execute_sales_invoice_accounting(v_invoice_id);
    END IF;

    RETURN jsonb_build_object('success', true, 'invoice_id', v_invoice_id);
EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Invoice creation failed: %', SQLERRM;
END;
$$;
