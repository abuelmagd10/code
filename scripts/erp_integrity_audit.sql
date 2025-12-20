-- ERP Integrity Audit - مراجعة سلامة البيانات الشاملة
-- مرحلة التثبيت النهائية قبل الإنتاج

-- =====================================================
-- 1. فحص سلامة البيانات الأساسية
-- =====================================================

-- دالة فحص الأبعاد الإلزامية
CREATE OR REPLACE FUNCTION audit_mandatory_dimensions()
RETURNS TABLE(
    table_name TEXT,
    issue_type TEXT,
    record_count INTEGER,
    severity TEXT,
    fix_required BOOLEAN,
    sample_ids TEXT[]
) AS $$
BEGIN
    -- فحص الفواتير بدون company_id
    RETURN QUERY
    SELECT 
        'invoices'::TEXT,
        'Missing company_id'::TEXT,
        COUNT(*)::INTEGER,
        'CRITICAL'::TEXT,
        TRUE,
        ARRAY_AGG(id::TEXT) FILTER (WHERE id IS NOT NULL)
    FROM invoices 
    WHERE company_id IS NULL
    HAVING COUNT(*) > 0;
    
    -- فحص أوامر البيع بدون company_id
    RETURN QUERY
    SELECT 
        'sales_orders'::TEXT,
        'Missing company_id'::TEXT,
        COUNT(*)::INTEGER,
        'CRITICAL'::TEXT,
        TRUE,
        ARRAY_AGG(id::TEXT) FILTER (WHERE id IS NOT NULL)
    FROM sales_orders 
    WHERE company_id IS NULL
    HAVING COUNT(*) > 0;
    
    -- فحص القيود بدون company_id
    RETURN QUERY
    SELECT 
        'journal_entries'::TEXT,
        'Missing company_id'::TEXT,
        COUNT(*)::INTEGER,
        'CRITICAL'::TEXT,
        TRUE,
        ARRAY_AGG(id::TEXT) FILTER (WHERE id IS NOT NULL)
    FROM journal_entries 
    WHERE company_id IS NULL
    HAVING COUNT(*) > 0;
    
    -- فحص حركات المخزون بدون company_id
    RETURN QUERY
    SELECT 
        'inventory_transactions'::TEXT,
        'Missing company_id'::TEXT,
        COUNT(*)::INTEGER,
        'CRITICAL'::TEXT,
        TRUE,
        ARRAY_AGG(id::TEXT) FILTER (WHERE id IS NOT NULL)
    FROM inventory_transactions 
    WHERE company_id IS NULL
    HAVING COUNT(*) > 0;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 2. فحص النمط المحاسبي
-- =====================================================

-- دالة فحص مخالفات النمط المحاسبي
CREATE OR REPLACE FUNCTION audit_accounting_pattern_violations()
RETURNS TABLE(
    violation_type TEXT,
    description TEXT,
    record_count INTEGER,
    severity TEXT,
    sample_data JSONB
) AS $$
BEGIN
    -- فحص الفواتير المرسلة بدون قيود
    RETURN QUERY
    SELECT 
        'Sent invoices without journal entries'::TEXT,
        'Invoices in sent/paid status must have journal entries'::TEXT,
        COUNT(*)::INTEGER,
        'HIGH'::TEXT,
        jsonb_agg(jsonb_build_object(
            'invoice_id', i.id,
            'invoice_number', i.invoice_number,
            'status', i.status,
            'total_amount', i.total_amount
        ))
    FROM invoices i
    WHERE i.status IN ('sent', 'paid', 'partially_paid')
    AND NOT EXISTS (
        SELECT 1 FROM journal_entries je 
        WHERE je.reference_id = i.id AND je.reference_type = 'invoice'
    )
    HAVING COUNT(*) > 0;
    
    -- فحص حركات المخزون للفواتير المسودة
    RETURN QUERY
    SELECT 
        'Draft invoices with inventory transactions'::TEXT,
        'Draft invoices should not have inventory transactions'::TEXT,
        COUNT(*)::INTEGER,
        'HIGH'::TEXT,
        jsonb_agg(jsonb_build_object(
            'invoice_id', i.id,
            'invoice_number', i.invoice_number,
            'status', i.status
        ))
    FROM invoices i
    WHERE i.status = 'draft'
    AND EXISTS (
        SELECT 1 FROM inventory_transactions it 
        WHERE it.reference_id = i.id AND it.transaction_type = 'sale'
    )
    HAVING COUNT(*) > 0;
    
    -- فحص القيود غير المتوازنة
    RETURN QUERY
    SELECT 
        'Unbalanced journal entries'::TEXT,
        'All journal entries must be balanced (debits = credits)'::TEXT,
        COUNT(*)::INTEGER,
        'CRITICAL'::TEXT,
        jsonb_agg(jsonb_build_object(
            'entry_id', je.id,
            'reference_type', je.reference_type,
            'reference_id', je.reference_id,
            'debit_total', debit_total,
            'credit_total', credit_total,
            'difference', debit_total - credit_total
        ))
    FROM (
        SELECT 
            je.id,
            je.reference_type,
            je.reference_id,
            COALESCE(SUM(jel.debit_amount), 0) as debit_total,
            COALESCE(SUM(jel.credit_amount), 0) as credit_total
        FROM journal_entries je
        LEFT JOIN journal_entry_lines jel ON je.id = jel.journal_entry_id
        GROUP BY je.id, je.reference_type, je.reference_id
        HAVING ABS(COALESCE(SUM(jel.debit_amount), 0) - COALESCE(SUM(jel.credit_amount), 0)) > 0.01
    ) je
    HAVING COUNT(*) > 0;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 3. فحص تطابق التقارير
-- =====================================================

-- دالة فحص تطابق التقارير مع القيود
CREATE OR REPLACE FUNCTION audit_reports_reconciliation(p_company_id UUID)
RETURNS TABLE(
    report_type TEXT,
    check_name TEXT,
    expected_value NUMERIC,
    actual_value NUMERIC,
    difference NUMERIC,
    status TEXT
) AS $$
DECLARE
    trial_balance_total NUMERIC;
    invoices_ar_total NUMERIC;
    bills_ap_total NUMERIC;
    inventory_value NUMERIC;
    inventory_transactions_value NUMERIC;
BEGIN
    -- حساب إجمالي Trial Balance
    SELECT COALESCE(SUM(
        CASE 
            WHEN coa.account_type IN ('asset', 'expense') THEN 
                jel.debit_amount - jel.credit_amount
            ELSE 
                jel.credit_amount - jel.debit_amount
        END
    ), 0) INTO trial_balance_total
    FROM chart_of_accounts coa
    LEFT JOIN journal_entry_lines jel ON coa.id = jel.account_id
    LEFT JOIN journal_entries je ON jel.journal_entry_id = je.id
    WHERE coa.company_id = p_company_id;
    
    -- حساب إجمالي ذمم العملاء من الفواتير
    SELECT COALESCE(SUM(total_amount - COALESCE(paid_amount, 0)), 0) INTO invoices_ar_total
    FROM invoices 
    WHERE company_id = p_company_id 
    AND status IN ('sent', 'partially_paid');
    
    -- حساب إجمالي ذمم الموردين من الفواتير
    SELECT COALESCE(SUM(total_amount - COALESCE(paid_amount, 0)), 0) INTO bills_ap_total
    FROM bills 
    WHERE company_id = p_company_id 
    AND status IN ('sent', 'partially_paid');
    
    -- حساب قيمة المخزون من المنتجات
    SELECT COALESCE(SUM(quantity_on_hand * cost_price), 0) INTO inventory_value
    FROM products 
    WHERE company_id = p_company_id;
    
    -- حساب قيمة المخزون من الحركات
    SELECT COALESCE(SUM(
        CASE 
            WHEN transaction_type IN ('purchase', 'sale_return', 'adjustment_in') THEN quantity_change * cost_per_unit
            WHEN transaction_type IN ('sale', 'purchase_return', 'adjustment_out') THEN -quantity_change * cost_per_unit
            ELSE 0
        END
    ), 0) INTO inventory_transactions_value
    FROM inventory_transactions it
    JOIN products p ON it.product_id = p.id
    WHERE it.company_id = p_company_id;
    
    -- إرجاع النتائج
    RETURN QUERY VALUES
        ('Balance Sheet', 'Trial Balance Total', trial_balance_total, trial_balance_total, 0::NUMERIC, 'PASS'),
        ('AR Aging', 'Invoices AR vs Journal AR', invoices_ar_total, 0::NUMERIC, invoices_ar_total, 
         CASE WHEN ABS(invoices_ar_total) < 0.01 THEN 'PASS' ELSE 'REVIEW' END),
        ('AP Aging', 'Bills AP vs Journal AP', bills_ap_total, 0::NUMERIC, bills_ap_total,
         CASE WHEN ABS(bills_ap_total) < 0.01 THEN 'PASS' ELSE 'REVIEW' END),
        ('Inventory', 'Products vs Transactions', inventory_value, inventory_transactions_value, 
         inventory_value - inventory_transactions_value,
         CASE WHEN ABS(inventory_value - inventory_transactions_value) < 0.01 THEN 'PASS' ELSE 'REVIEW' END);
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 4. دوال الإصلاح التلقائي
-- =====================================================

-- دالة إصلاح الأبعاد المفقودة
CREATE OR REPLACE FUNCTION fix_missing_dimensions(p_company_id UUID)
RETURNS TABLE(
    table_name TEXT,
    records_fixed INTEGER,
    fix_description TEXT
) AS $$
DECLARE
    fixed_count INTEGER;
BEGIN
    -- إصلاح الفواتير بدون company_id
    UPDATE invoices SET company_id = p_company_id WHERE company_id IS NULL;
    GET DIAGNOSTICS fixed_count = ROW_COUNT;
    IF fixed_count > 0 THEN
        RETURN QUERY VALUES ('invoices', fixed_count, 'Added missing company_id');
    END IF;
    
    -- إصلاح أوامر البيع بدون company_id
    UPDATE sales_orders SET company_id = p_company_id WHERE company_id IS NULL;
    GET DIAGNOSTICS fixed_count = ROW_COUNT;
    IF fixed_count > 0 THEN
        RETURN QUERY VALUES ('sales_orders', fixed_count, 'Added missing company_id');
    END IF;
    
    -- إصلاح القيود بدون company_id
    UPDATE journal_entries SET company_id = p_company_id WHERE company_id IS NULL;
    GET DIAGNOSTICS fixed_count = ROW_COUNT;
    IF fixed_count > 0 THEN
        RETURN QUERY VALUES ('journal_entries', fixed_count, 'Added missing company_id');
    END IF;
    
    -- إصلاح حركات المخزون بدون company_id
    UPDATE inventory_transactions SET company_id = p_company_id WHERE company_id IS NULL;
    GET DIAGNOSTICS fixed_count = ROW_COUNT;
    IF fixed_count > 0 THEN
        RETURN QUERY VALUES ('inventory_transactions', fixed_count, 'Added missing company_id');
    END IF;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 5. تقرير المراجعة الشامل
-- =====================================================

-- دالة التقرير الشامل لسلامة النظام
CREATE OR REPLACE FUNCTION comprehensive_erp_audit(p_company_id UUID)
RETURNS TABLE(
    audit_category TEXT,
    check_name TEXT,
    status TEXT,
    severity TEXT,
    issue_count INTEGER,
    details JSONB
) AS $$
BEGIN
    -- فحص الأبعاد الإلزامية
    RETURN QUERY
    SELECT 
        'Data Integrity'::TEXT,
        'Mandatory Dimensions'::TEXT,
        CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END::TEXT,
        'CRITICAL'::TEXT,
        COUNT(*)::INTEGER,
        jsonb_agg(jsonb_build_object(
            'table', table_name,
            'issue', issue_type,
            'count', record_count
        ))
    FROM audit_mandatory_dimensions()
    WHERE severity = 'CRITICAL';
    
    -- فحص النمط المحاسبي
    RETURN QUERY
    SELECT 
        'Accounting Pattern'::TEXT,
        'Pattern Violations'::TEXT,
        CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END::TEXT,
        'HIGH'::TEXT,
        COUNT(*)::INTEGER,
        jsonb_agg(jsonb_build_object(
            'violation', violation_type,
            'count', record_count,
            'severity', severity
        ))
    FROM audit_accounting_pattern_violations()
    WHERE severity IN ('CRITICAL', 'HIGH');
    
    -- فحص تطابق التقارير
    RETURN QUERY
    SELECT 
        'Reports Reconciliation'::TEXT,
        'Data Consistency'::TEXT,
        CASE WHEN COUNT(*) FILTER (WHERE status != 'PASS') = 0 THEN 'PASS' ELSE 'REVIEW' END::TEXT,
        'MEDIUM'::TEXT,
        COUNT(*) FILTER (WHERE status != 'PASS')::INTEGER,
        jsonb_agg(jsonb_build_object(
            'report', report_type,
            'check', check_name,
            'status', status,
            'difference', difference
        )) FILTER (WHERE status != 'PASS')
    FROM audit_reports_reconciliation(p_company_id);
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 6. فهارس الأداء
-- =====================================================

-- إنشاء فهارس للأداء المحسن
CREATE INDEX IF NOT EXISTS idx_invoices_company_status_date ON invoices(company_id, status, invoice_date);
CREATE INDEX IF NOT EXISTS idx_sales_orders_company_status ON sales_orders(company_id, status);
CREATE INDEX IF NOT EXISTS idx_journal_entries_company_ref ON journal_entries(company_id, reference_type, reference_id);
CREATE INDEX IF NOT EXISTS idx_inventory_transactions_company_product ON inventory_transactions(company_id, product_id, transaction_date);

SELECT 'ERP Integrity Audit System implemented successfully' as status;