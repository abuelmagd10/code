-- نظام التقارير المحسن - متوافق مع النمط المحاسبي الصارم
-- يضمن مصدر واحد للحقيقة وعدم وجود تضارب في البيانات

-- =====================================================
-- 1. دوال التقارير المالية الأساسية
-- =====================================================

-- دالة الميزانية العمومية المحسنة
CREATE OR REPLACE FUNCTION get_enhanced_balance_sheet(
    p_company_id UUID,
    p_branch_id UUID DEFAULT NULL,
    p_cost_center_id UUID DEFAULT NULL,
    p_as_of_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE(
    account_id UUID,
    account_code TEXT,
    account_name TEXT,
    account_type TEXT,
    sub_type TEXT,
    balance NUMERIC,
    branch_id UUID,
    cost_center_id UUID
) AS $$
BEGIN
    -- التحقق من صحة المعاملات
    IF p_company_id IS NULL THEN
        RAISE EXCEPTION 'Company ID is required';
    END IF;
    
    RETURN QUERY
    SELECT 
        coa.id as account_id,
        coa.account_code,
        coa.account_name,
        coa.account_type,
        coa.sub_type,
        COALESCE(SUM(
            CASE 
                WHEN coa.account_type IN ('asset', 'expense') THEN 
                    jel.debit_amount - jel.credit_amount
                ELSE 
                    jel.credit_amount - jel.debit_amount
            END
        ), 0) as balance,
        jel.branch_id,
        jel.cost_center_id
    FROM chart_of_accounts coa
    LEFT JOIN journal_entry_lines jel ON coa.id = jel.account_id
    LEFT JOIN journal_entries je ON jel.journal_entry_id = je.id
    WHERE coa.company_id = p_company_id
    AND coa.account_type IN ('asset', 'liability', 'equity')
    AND (je.entry_date IS NULL OR je.entry_date <= p_as_of_date)
    AND (p_branch_id IS NULL OR jel.branch_id = p_branch_id OR jel.branch_id IS NULL)
    AND (p_cost_center_id IS NULL OR jel.cost_center_id = p_cost_center_id OR jel.cost_center_id IS NULL)
    GROUP BY coa.id, coa.account_code, coa.account_name, coa.account_type, coa.sub_type, jel.branch_id, jel.cost_center_id
    HAVING ABS(COALESCE(SUM(
        CASE 
            WHEN coa.account_type IN ('asset', 'expense') THEN 
                jel.debit_amount - jel.credit_amount
            ELSE 
                jel.credit_amount - jel.debit_amount
        END
    ), 0)) >= 0.01
    ORDER BY coa.account_type, coa.account_code;
END;
$$ LANGUAGE plpgsql;

-- دالة قائمة الدخل المحسنة (بدون COGS حسب النمط المعتمد)
CREATE OR REPLACE FUNCTION get_enhanced_income_statement(
    p_company_id UUID,
    p_branch_id UUID DEFAULT NULL,
    p_cost_center_id UUID DEFAULT NULL,
    p_from_date DATE DEFAULT DATE_TRUNC('year', CURRENT_DATE)::DATE,
    p_to_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE(
    account_id UUID,
    account_code TEXT,
    account_name TEXT,
    account_type TEXT,
    sub_type TEXT,
    amount NUMERIC,
    branch_id UUID,
    cost_center_id UUID
) AS $$
BEGIN
    -- التحقق من صحة المعاملات
    IF p_company_id IS NULL THEN
        RAISE EXCEPTION 'Company ID is required';
    END IF;
    
    IF p_from_date > p_to_date THEN
        RAISE EXCEPTION 'From date cannot be after to date';
    END IF;
    
    RETURN QUERY
    SELECT 
        coa.id as account_id,
        coa.account_code,
        coa.account_name,
        coa.account_type,
        coa.sub_type,
        COALESCE(SUM(
            CASE 
                WHEN coa.account_type = 'income' THEN 
                    jel.credit_amount - jel.debit_amount
                WHEN coa.account_type = 'expense' THEN 
                    jel.debit_amount - jel.credit_amount
                ELSE 0
            END
        ), 0) as amount,
        jel.branch_id,
        jel.cost_center_id
    FROM chart_of_accounts coa
    LEFT JOIN journal_entry_lines jel ON coa.id = jel.account_id
    LEFT JOIN journal_entries je ON jel.journal_entry_id = je.id
    WHERE coa.company_id = p_company_id
    AND coa.account_type IN ('income', 'expense')
    AND coa.sub_type != 'cogs' -- استبعاد COGS حسب النمط المعتمد
    AND je.entry_date BETWEEN p_from_date AND p_to_date
    AND (p_branch_id IS NULL OR jel.branch_id = p_branch_id OR jel.branch_id IS NULL)
    AND (p_cost_center_id IS NULL OR jel.cost_center_id = p_cost_center_id OR jel.cost_center_id IS NULL)
    GROUP BY coa.id, coa.account_code, coa.account_name, coa.account_type, coa.sub_type, jel.branch_id, jel.cost_center_id
    HAVING ABS(COALESCE(SUM(
        CASE 
            WHEN coa.account_type = 'income' THEN 
                jel.credit_amount - jel.debit_amount
            WHEN coa.account_type = 'expense' THEN 
                jel.debit_amount - jel.credit_amount
            ELSE 0
        END
    ), 0)) >= 0.01
    ORDER BY coa.account_type DESC, coa.account_code;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 2. دوال تقارير الذمم المحسنة
-- =====================================================

-- دالة ذمم العملاء المحسنة
CREATE OR REPLACE FUNCTION get_enhanced_accounts_receivable(
    p_company_id UUID,
    p_branch_id UUID DEFAULT NULL,
    p_cost_center_id UUID DEFAULT NULL,
    p_customer_id UUID DEFAULT NULL,
    p_as_of_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE(
    customer_id UUID,
    customer_name TEXT,
    invoice_id UUID,
    invoice_number TEXT,
    invoice_date DATE,
    due_date DATE,
    original_amount NUMERIC,
    paid_amount NUMERIC,
    returned_amount NUMERIC,
    balance NUMERIC,
    days_overdue INTEGER,
    aging_bucket TEXT,
    branch_id UUID,
    cost_center_id UUID
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        i.customer_id,
        c.name as customer_name,
        i.id as invoice_id,
        i.invoice_number,
        i.invoice_date,
        i.due_date,
        i.total_amount as original_amount,
        COALESCE(i.paid_amount, 0) as paid_amount,
        COALESCE(i.returned_amount, 0) as returned_amount,
        (i.total_amount - COALESCE(i.paid_amount, 0)) as balance,
        CASE 
            WHEN i.due_date IS NULL THEN 0
            ELSE GREATEST(0, p_as_of_date - i.due_date)
        END as days_overdue,
        CASE 
            WHEN i.due_date IS NULL OR p_as_of_date <= i.due_date THEN 'Current'
            WHEN p_as_of_date - i.due_date <= 30 THEN '1-30 Days'
            WHEN p_as_of_date - i.due_date <= 60 THEN '31-60 Days'
            WHEN p_as_of_date - i.due_date <= 90 THEN '61-90 Days'
            ELSE '90+ Days'
        END as aging_bucket,
        i.branch_id,
        i.cost_center_id
    FROM invoices i
    JOIN customers c ON i.customer_id = c.id
    WHERE i.company_id = p_company_id
    AND i.status IN ('sent', 'partially_paid') -- فقط الفواتير المرسلة وغير المدفوعة بالكامل
    AND i.invoice_date <= p_as_of_date
    AND (i.total_amount - COALESCE(i.paid_amount, 0)) > 0.01 -- فقط الفواتير التي لها رصيد
    AND (p_branch_id IS NULL OR i.branch_id = p_branch_id)
    AND (p_cost_center_id IS NULL OR i.cost_center_id = p_cost_center_id)
    AND (p_customer_id IS NULL OR i.customer_id = p_customer_id)
    ORDER BY c.name, i.invoice_date;
END;
$$ LANGUAGE plpgsql;

-- دالة ذمم الموردين المحسنة
CREATE OR REPLACE FUNCTION get_enhanced_accounts_payable(
    p_company_id UUID,
    p_branch_id UUID DEFAULT NULL,
    p_cost_center_id UUID DEFAULT NULL,
    p_supplier_id UUID DEFAULT NULL,
    p_as_of_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE(
    supplier_id UUID,
    supplier_name TEXT,
    bill_id UUID,
    bill_number TEXT,
    bill_date DATE,
    due_date DATE,
    original_amount NUMERIC,
    paid_amount NUMERIC,
    returned_amount NUMERIC,
    balance NUMERIC,
    days_overdue INTEGER,
    aging_bucket TEXT,
    branch_id UUID,
    cost_center_id UUID
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        b.supplier_id,
        s.name as supplier_name,
        b.id as bill_id,
        b.bill_number,
        b.bill_date,
        b.due_date,
        b.total_amount as original_amount,
        COALESCE(b.paid_amount, 0) as paid_amount,
        COALESCE(b.returned_amount, 0) as returned_amount,
        (b.total_amount - COALESCE(b.paid_amount, 0)) as balance,
        CASE 
            WHEN b.due_date IS NULL THEN 0
            ELSE GREATEST(0, p_as_of_date - b.due_date)
        END as days_overdue,
        CASE 
            WHEN b.due_date IS NULL OR p_as_of_date <= b.due_date THEN 'Current'
            WHEN p_as_of_date - b.due_date <= 30 THEN '1-30 Days'
            WHEN p_as_of_date - b.due_date <= 60 THEN '31-60 Days'
            WHEN p_as_of_date - b.due_date <= 90 THEN '61-90 Days'
            ELSE '90+ Days'
        END as aging_bucket,
        b.branch_id,
        b.cost_center_id
    FROM bills b
    JOIN suppliers s ON b.supplier_id = s.id
    WHERE b.company_id = p_company_id
    AND b.status IN ('sent', 'partially_paid') -- فقط الفواتير المرسلة وغير المدفوعة بالكامل
    AND b.bill_date <= p_as_of_date
    AND (b.total_amount - COALESCE(b.paid_amount, 0)) > 0.01 -- فقط الفواتير التي لها رصيد
    AND (p_branch_id IS NULL OR b.branch_id = p_branch_id)
    AND (p_cost_center_id IS NULL OR b.cost_center_id = p_cost_center_id)
    AND (p_supplier_id IS NULL OR b.supplier_id = p_supplier_id)
    ORDER BY s.name, b.bill_date;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 3. دوال تقارير المبيعات والمشتريات
-- =====================================================

-- دالة تقرير المبيعات المحسنة
CREATE OR REPLACE FUNCTION get_enhanced_sales_report(
    p_company_id UUID,
    p_branch_id UUID DEFAULT NULL,
    p_cost_center_id UUID DEFAULT NULL,
    p_customer_id UUID DEFAULT NULL,
    p_created_by_user_id UUID DEFAULT NULL,
    p_from_date DATE DEFAULT DATE_TRUNC('month', CURRENT_DATE)::DATE,
    p_to_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE(
    invoice_id UUID,
    invoice_number TEXT,
    invoice_date DATE,
    customer_id UUID,
    customer_name TEXT,
    subtotal NUMERIC,
    tax_amount NUMERIC,
    total_amount NUMERIC,
    paid_amount NUMERIC,
    status TEXT,
    created_by_user_id UUID,
    branch_id UUID,
    cost_center_id UUID
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        i.id as invoice_id,
        i.invoice_number,
        i.invoice_date,
        i.customer_id,
        c.name as customer_name,
        i.subtotal,
        i.tax_amount,
        i.total_amount,
        COALESCE(i.paid_amount, 0) as paid_amount,
        i.status,
        so.created_by_user_id, -- من أمر البيع المرتبط
        i.branch_id,
        i.cost_center_id
    FROM invoices i
    JOIN customers c ON i.customer_id = c.id
    LEFT JOIN sales_orders so ON i.sales_order_id = so.id
    WHERE i.company_id = p_company_id
    AND i.status IN ('sent', 'paid', 'partially_paid') -- فقط الفواتير المرسلة (لا مسودات)
    AND i.invoice_date BETWEEN p_from_date AND p_to_date
    AND (p_branch_id IS NULL OR i.branch_id = p_branch_id)
    AND (p_cost_center_id IS NULL OR i.cost_center_id = p_cost_center_id)
    AND (p_customer_id IS NULL OR i.customer_id = p_customer_id)
    AND (p_created_by_user_id IS NULL OR so.created_by_user_id = p_created_by_user_id)
    ORDER BY i.invoice_date DESC, i.invoice_number;
END;
$$ LANGUAGE plpgsql;

-- دالة تقرير المشتريات المحسنة
CREATE OR REPLACE FUNCTION get_enhanced_purchases_report(
    p_company_id UUID,
    p_branch_id UUID DEFAULT NULL,
    p_cost_center_id UUID DEFAULT NULL,
    p_supplier_id UUID DEFAULT NULL,
    p_created_by_user_id UUID DEFAULT NULL,
    p_from_date DATE DEFAULT DATE_TRUNC('month', CURRENT_DATE)::DATE,
    p_to_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE(
    bill_id UUID,
    bill_number TEXT,
    bill_date DATE,
    supplier_id UUID,
    supplier_name TEXT,
    subtotal NUMERIC,
    tax_amount NUMERIC,
    total_amount NUMERIC,
    paid_amount NUMERIC,
    status TEXT,
    created_by_user_id UUID,
    branch_id UUID,
    cost_center_id UUID
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        b.id as bill_id,
        b.bill_number,
        b.bill_date,
        b.supplier_id,
        s.name as supplier_name,
        b.subtotal,
        b.tax_amount,
        b.total_amount,
        COALESCE(b.paid_amount, 0) as paid_amount,
        b.status,
        po.created_by_user_id, -- من أمر الشراء المرتبط
        b.branch_id,
        b.cost_center_id
    FROM bills b
    JOIN suppliers s ON b.supplier_id = s.id
    LEFT JOIN purchase_orders po ON b.purchase_order_id = po.id
    WHERE b.company_id = p_company_id
    AND b.status IN ('sent', 'paid', 'partially_paid') -- فقط الفواتير المستلمة (لا مسودات)
    AND b.bill_date BETWEEN p_from_date AND p_to_date
    AND (p_branch_id IS NULL OR b.branch_id = p_branch_id)
    AND (p_cost_center_id IS NULL OR b.cost_center_id = p_cost_center_id)
    AND (p_supplier_id IS NULL OR b.supplier_id = p_supplier_id)
    AND (p_created_by_user_id IS NULL OR po.created_by_user_id = p_created_by_user_id)
    ORDER BY b.bill_date DESC, b.bill_number;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 4. دوال تقارير المخزون
-- =====================================================

-- دالة تقرير المخزون المحسنة (تعتمد على حركات المخزون فقط)
CREATE OR REPLACE FUNCTION get_enhanced_inventory_report(
    p_company_id UUID,
    p_branch_id UUID DEFAULT NULL,
    p_cost_center_id UUID DEFAULT NULL,
    p_warehouse_id UUID DEFAULT NULL,
    p_product_id UUID DEFAULT NULL,
    p_as_of_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE(
    product_id UUID,
    product_name TEXT,
    product_code TEXT,
    warehouse_id UUID,
    warehouse_name TEXT,
    opening_quantity NUMERIC,
    in_quantity NUMERIC,
    out_quantity NUMERIC,
    closing_quantity NUMERIC,
    unit_cost NUMERIC,
    total_value NUMERIC,
    branch_id UUID,
    cost_center_id UUID
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        p.id as product_id,
        p.name as product_name,
        p.product_code,
        COALESCE(it.warehouse_id, w.id) as warehouse_id,
        COALESCE(w.name, 'Default') as warehouse_name,
        -- الكمية الافتتاحية (حركات قبل تاريخ البداية)
        COALESCE(SUM(
            CASE WHEN it.transaction_date < DATE_TRUNC('year', p_as_of_date) 
            THEN it.quantity_change ELSE 0 END
        ), 0) as opening_quantity,
        -- الكميات الداخلة
        COALESCE(SUM(
            CASE WHEN it.transaction_date BETWEEN DATE_TRUNC('year', p_as_of_date) AND p_as_of_date 
            AND it.quantity_change > 0 
            THEN it.quantity_change ELSE 0 END
        ), 0) as in_quantity,
        -- الكميات الخارجة
        COALESCE(SUM(
            CASE WHEN it.transaction_date BETWEEN DATE_TRUNC('year', p_as_of_date) AND p_as_of_date 
            AND it.quantity_change < 0 
            THEN ABS(it.quantity_change) ELSE 0 END
        ), 0) as out_quantity,
        -- الكمية الختامية
        COALESCE(SUM(
            CASE WHEN it.transaction_date <= p_as_of_date 
            THEN it.quantity_change ELSE 0 END
        ), 0) as closing_quantity,
        p.cost_price as unit_cost,
        -- القيمة الإجمالية
        COALESCE(SUM(
            CASE WHEN it.transaction_date <= p_as_of_date 
            THEN it.quantity_change ELSE 0 END
        ), 0) * p.cost_price as total_value,
        it.branch_id,
        it.cost_center_id
    FROM products p
    LEFT JOIN inventory_transactions it ON p.id = it.product_id
    LEFT JOIN warehouses w ON it.warehouse_id = w.id OR (it.warehouse_id IS NULL AND w.company_id = p_company_id)
    WHERE p.company_id = p_company_id
    AND (p_branch_id IS NULL OR it.branch_id = p_branch_id OR it.branch_id IS NULL)
    AND (p_cost_center_id IS NULL OR it.cost_center_id = p_cost_center_id OR it.cost_center_id IS NULL)
    AND (p_warehouse_id IS NULL OR it.warehouse_id = p_warehouse_id OR it.warehouse_id IS NULL)
    AND (p_product_id IS NULL OR p.id = p_product_id)
    GROUP BY p.id, p.name, p.product_code, p.cost_price, it.warehouse_id, w.id, w.name, it.branch_id, it.cost_center_id
    HAVING COALESCE(SUM(
        CASE WHEN it.transaction_date <= p_as_of_date 
        THEN it.quantity_change ELSE 0 END
    ), 0) != 0 -- فقط المنتجات التي لها كمية
    ORDER BY p.name, w.name;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 5. دالة التحقق من صحة التقارير
-- =====================================================

CREATE OR REPLACE FUNCTION validate_reports_integrity(
    p_company_id UUID,
    p_as_of_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE(
    check_name TEXT,
    status TEXT,
    expected_value NUMERIC,
    actual_value NUMERIC,
    difference NUMERIC,
    is_critical BOOLEAN
) AS $$
DECLARE
    total_debits NUMERIC;
    total_credits NUMERIC;
    balance_sheet_assets NUMERIC;
    balance_sheet_liab_equity NUMERIC;
BEGIN
    -- التحقق من توازن القيود
    SELECT 
        COALESCE(SUM(jel.debit_amount), 0),
        COALESCE(SUM(jel.credit_amount), 0)
    INTO total_debits, total_credits
    FROM journal_entry_lines jel
    JOIN journal_entries je ON jel.journal_entry_id = je.id
    WHERE je.company_id = p_company_id
    AND je.entry_date <= p_as_of_date;
    
    RETURN QUERY SELECT 
        'Journal Entries Balance'::TEXT,
        CASE WHEN ABS(total_debits - total_credits) < 0.01 THEN 'OK' ELSE 'ERROR' END::TEXT,
        total_debits,
        total_credits,
        total_debits - total_credits,
        ABS(total_debits - total_credits) >= 0.01;
    
    -- التحقق من توازن الميزانية
    SELECT 
        COALESCE(SUM(CASE WHEN account_type = 'asset' THEN balance ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN account_type IN ('liability', 'equity') THEN balance ELSE 0 END), 0)
    INTO balance_sheet_assets, balance_sheet_liab_equity
    FROM get_enhanced_balance_sheet(p_company_id, NULL, NULL, p_as_of_date);
    
    RETURN QUERY SELECT 
        'Balance Sheet Balance'::TEXT,
        CASE WHEN ABS(balance_sheet_assets - balance_sheet_liab_equity) < 0.01 THEN 'OK' ELSE 'ERROR' END::TEXT,
        balance_sheet_assets,
        balance_sheet_liab_equity,
        balance_sheet_assets - balance_sheet_liab_equity,
        ABS(balance_sheet_assets - balance_sheet_liab_equity) >= 0.01;
END;
$$ LANGUAGE plpgsql;

-- عرض نتائج التحقق
SELECT 'تم إنشاء نظام التقارير المحسن بنجاح' as status;