-- =============================================
-- نظام التحقق من سلامة البيانات المحاسبية
-- Accounting Data Integrity Verification System
-- =============================================

-- =============================================
-- 1. دالة التحقق من توازن القيود المحاسبية
-- =============================================
CREATE OR REPLACE FUNCTION verify_journal_entries_balance(p_company_id UUID)
RETURNS TABLE (
  entry_id UUID,
  entry_date DATE,
  description TEXT,
  total_debit DECIMAL,
  total_credit DECIMAL,
  difference DECIMAL,
  is_balanced BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    je.id as entry_id,
    je.entry_date,
    je.description,
    COALESCE(SUM(jel.debit_amount), 0) as total_debit,
    COALESCE(SUM(jel.credit_amount), 0) as total_credit,
    COALESCE(SUM(jel.debit_amount), 0) - COALESCE(SUM(jel.credit_amount), 0) as difference,
    ABS(COALESCE(SUM(jel.debit_amount), 0) - COALESCE(SUM(jel.credit_amount), 0)) < 0.01 as is_balanced
  FROM journal_entries je
  LEFT JOIN journal_entry_lines jel ON je.id = jel.journal_entry_id
  WHERE je.company_id = p_company_id
  GROUP BY je.id, je.entry_date, je.description
  HAVING ABS(COALESCE(SUM(jel.debit_amount), 0) - COALESCE(SUM(jel.credit_amount), 0)) >= 0.01;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- 2. دالة التحقق من صحة المخزون
-- =============================================
CREATE OR REPLACE FUNCTION verify_inventory_integrity(p_company_id UUID)
RETURNS TABLE (
  product_id UUID,
  product_name TEXT,
  warehouse_id UUID,
  warehouse_name TEXT,
  calculated_quantity DECIMAL,
  system_quantity DECIMAL,
  difference DECIMAL,
  has_discrepancy BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.id as product_id,
    p.name as product_name,
    w.id as warehouse_id,
    w.name as warehouse_name,
    COALESCE(SUM(
      CASE 
        WHEN it.transaction_type IN ('purchase', 'return', 'adjustment_in') THEN it.quantity
        WHEN it.transaction_type IN ('sale', 'write_off', 'adjustment_out') THEN -it.quantity
        ELSE 0
      END
    ), 0) as calculated_quantity,
    COALESCE(pi.quantity_on_hand, 0) as system_quantity,
    COALESCE(SUM(
      CASE 
        WHEN it.transaction_type IN ('purchase', 'return', 'adjustment_in') THEN it.quantity
        WHEN it.transaction_type IN ('sale', 'write_off', 'adjustment_out') THEN -it.quantity
        ELSE 0
      END
    ), 0) - COALESCE(pi.quantity_on_hand, 0) as difference,
    ABS(COALESCE(SUM(
      CASE 
        WHEN it.transaction_type IN ('purchase', 'return', 'adjustment_in') THEN it.quantity
        WHEN it.transaction_type IN ('sale', 'write_off', 'adjustment_out') THEN -it.quantity
        ELSE 0
      END
    ), 0) - COALESCE(pi.quantity_on_hand, 0)) > 0.01 as has_discrepancy
  FROM products p
  CROSS JOIN warehouses w
  LEFT JOIN inventory_transactions it ON p.id = it.product_id AND w.id = it.warehouse_id
  LEFT JOIN product_inventory pi ON p.id = pi.product_id AND w.id = pi.warehouse_id
  WHERE p.company_id = p_company_id
    AND w.company_id = p_company_id
    AND (p.item_type = 'product' OR p.item_type IS NULL)
  GROUP BY p.id, p.name, w.id, w.name, pi.quantity_on_hand
  HAVING ABS(COALESCE(SUM(
    CASE 
      WHEN it.transaction_type IN ('purchase', 'return', 'adjustment_in') THEN it.quantity
      WHEN it.transaction_type IN ('sale', 'write_off', 'adjustment_out') THEN -it.quantity
      ELSE 0
    END
  ), 0) - COALESCE(pi.quantity_on_hand, 0)) > 0.01;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- 3. دالة التحقق من صحة الذمم المدينة
-- =============================================
CREATE OR REPLACE FUNCTION verify_accounts_receivable(p_company_id UUID)
RETURNS TABLE (
  invoice_id UUID,
  invoice_number TEXT,
  customer_name TEXT,
  total_amount DECIMAL,
  paid_amount DECIMAL,
  calculated_balance DECIMAL,
  journal_balance DECIMAL,
  difference DECIMAL,
  has_discrepancy BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    i.id as invoice_id,
    i.invoice_number,
    c.name as customer_name,
    i.total_amount,
    COALESCE(i.paid_amount, 0) as paid_amount,
    i.total_amount - COALESCE(i.paid_amount, 0) as calculated_balance,
    COALESCE(ar_balance.balance, 0) as journal_balance,
    (i.total_amount - COALESCE(i.paid_amount, 0)) - COALESCE(ar_balance.balance, 0) as difference,
    ABS((i.total_amount - COALESCE(i.paid_amount, 0)) - COALESCE(ar_balance.balance, 0)) > 0.01 as has_discrepancy
  FROM invoices i
  JOIN customers c ON i.customer_id = c.id
  LEFT JOIN (
    SELECT 
      jel.reference_id,
      SUM(jel.debit_amount - jel.credit_amount) as balance
    FROM journal_entry_lines jel
    JOIN chart_of_accounts coa ON jel.account_id = coa.id
    WHERE coa.account_type = 'asset' 
      AND coa.account_code LIKE '1120%' -- حسابات العملاء
      AND jel.reference_type = 'invoice'
    GROUP BY jel.reference_id
  ) ar_balance ON i.id = ar_balance.reference_id
  WHERE i.company_id = p_company_id
    AND i.status IN ('sent', 'partially_paid')
  HAVING ABS((i.total_amount - COALESCE(i.paid_amount, 0)) - COALESCE(ar_balance.balance, 0)) > 0.01;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- 4. دالة التحقق من صحة الذمم الدائنة
-- =============================================
CREATE OR REPLACE FUNCTION verify_accounts_payable(p_company_id UUID)
RETURNS TABLE (
  bill_id UUID,
  bill_number TEXT,
  supplier_name TEXT,
  total_amount DECIMAL,
  paid_amount DECIMAL,
  calculated_balance DECIMAL,
  journal_balance DECIMAL,
  difference DECIMAL,
  has_discrepancy BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    b.id as bill_id,
    b.bill_number,
    s.name as supplier_name,
    b.total_amount,
    COALESCE(b.paid_amount, 0) as paid_amount,
    b.total_amount - COALESCE(b.paid_amount, 0) as calculated_balance,
    COALESCE(ap_balance.balance, 0) as journal_balance,
    (b.total_amount - COALESCE(b.paid_amount, 0)) - COALESCE(ap_balance.balance, 0) as difference,
    ABS((b.total_amount - COALESCE(b.paid_amount, 0)) - COALESCE(ap_balance.balance, 0)) > 0.01 as has_discrepancy
  FROM bills b
  JOIN suppliers s ON b.supplier_id = s.id
  LEFT JOIN (
    SELECT 
      jel.reference_id,
      SUM(jel.credit_amount - jel.debit_amount) as balance
    FROM journal_entry_lines jel
    JOIN chart_of_accounts coa ON jel.account_id = coa.id
    WHERE coa.account_type = 'liability' 
      AND coa.account_code LIKE '2110%' -- حسابات الموردين
      AND jel.reference_type = 'bill'
    GROUP BY jel.reference_id
  ) ap_balance ON b.id = ap_balance.reference_id
  WHERE b.company_id = p_company_id
    AND b.status IN ('received', 'partially_paid')
  HAVING ABS((b.total_amount - COALESCE(b.paid_amount, 0)) - COALESCE(ap_balance.balance, 0)) > 0.01;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- 5. دالة التحقق من النمط المحاسبي
-- =============================================
CREATE OR REPLACE FUNCTION verify_accounting_pattern(p_company_id UUID)
RETURNS TABLE (
  check_name TEXT,
  status TEXT,
  error_count INTEGER,
  description TEXT
) AS $$
DECLARE
  v_unbalanced_count INTEGER;
  v_orphan_lines_count INTEGER;
  v_missing_references_count INTEGER;
  v_duplicate_entries_count INTEGER;
BEGIN
  -- التحقق من القيود غير المتوازنة
  SELECT COUNT(*) INTO v_unbalanced_count
  FROM verify_journal_entries_balance(p_company_id)
  WHERE NOT is_balanced;

  -- التحقق من السطور اليتيمة
  SELECT COUNT(*) INTO v_orphan_lines_count
  FROM journal_entry_lines jel
  LEFT JOIN journal_entries je ON jel.journal_entry_id = je.id
  WHERE je.id IS NULL;

  -- التحقق من المراجع المفقودة
  SELECT COUNT(*) INTO v_missing_references_count
  FROM journal_entry_lines jel
  WHERE jel.reference_type IS NOT NULL 
    AND jel.reference_id IS NOT NULL
    AND NOT EXISTS (
      CASE jel.reference_type
        WHEN 'invoice' THEN (SELECT 1 FROM invoices WHERE id = jel.reference_id)
        WHEN 'bill' THEN (SELECT 1 FROM bills WHERE id = jel.reference_id)
        WHEN 'payment' THEN (SELECT 1 FROM payments WHERE id = jel.reference_id)
        ELSE NULL
      END
    );

  -- التحقق من القيود المكررة
  SELECT COUNT(*) INTO v_duplicate_entries_count
  FROM (
    SELECT reference_type, reference_id, COUNT(*)
    FROM journal_entries
    WHERE company_id = p_company_id
      AND reference_type IS NOT NULL
      AND reference_id IS NOT NULL
    GROUP BY reference_type, reference_id
    HAVING COUNT(*) > 1
  ) duplicates;

  -- إرجاع النتائج
  RETURN QUERY VALUES
    ('Journal Balance', CASE WHEN v_unbalanced_count = 0 THEN 'PASS' ELSE 'FAIL' END, v_unbalanced_count, 'التحقق من توازن القيود المحاسبية'),
    ('Orphan Lines', CASE WHEN v_orphan_lines_count = 0 THEN 'PASS' ELSE 'FAIL' END, v_orphan_lines_count, 'التحقق من السطور اليتيمة'),
    ('Missing References', CASE WHEN v_missing_references_count = 0 THEN 'PASS' ELSE 'FAIL' END, v_missing_references_count, 'التحقق من المراجع المفقودة'),
    ('Duplicate Entries', CASE WHEN v_duplicate_entries_count = 0 THEN 'PASS' ELSE 'FAIL' END, v_duplicate_entries_count, 'التحقق من القيود المكررة');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- 6. دالة شاملة للتحقق من سلامة البيانات
-- =============================================
CREATE OR REPLACE FUNCTION comprehensive_data_integrity_check(p_company_id UUID)
RETURNS TABLE (
  check_category TEXT,
  check_name TEXT,
  status TEXT,
  error_count INTEGER,
  description TEXT,
  details JSONB
) AS $$
BEGIN
  -- التحقق من النمط المحاسبي
  RETURN QUERY
  SELECT 
    'Accounting Pattern'::TEXT as check_category,
    ap.check_name,
    ap.status,
    ap.error_count,
    ap.description,
    NULL::JSONB as details
  FROM verify_accounting_pattern(p_company_id) ap;

  -- التحقق من المخزون
  RETURN QUERY
  SELECT 
    'Inventory'::TEXT as check_category,
    'Inventory Integrity'::TEXT as check_name,
    CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END as status,
    COUNT(*)::INTEGER as error_count,
    'التحقق من صحة المخزون'::TEXT as description,
    CASE WHEN COUNT(*) > 0 THEN 
      jsonb_agg(jsonb_build_object(
        'product_name', product_name,
        'warehouse_name', warehouse_name,
        'difference', difference
      ))
    ELSE NULL END as details
  FROM verify_inventory_integrity(p_company_id)
  WHERE has_discrepancy;

  -- التحقق من الذمم المدينة
  RETURN QUERY
  SELECT 
    'Receivables'::TEXT as check_category,
    'Accounts Receivable'::TEXT as check_name,
    CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END as status,
    COUNT(*)::INTEGER as error_count,
    'التحقق من صحة الذمم المدينة'::TEXT as description,
    CASE WHEN COUNT(*) > 0 THEN 
      jsonb_agg(jsonb_build_object(
        'invoice_number', invoice_number,
        'customer_name', customer_name,
        'difference', difference
      ))
    ELSE NULL END as details
  FROM verify_accounts_receivable(p_company_id)
  WHERE has_discrepancy;

  -- التحقق من الذمم الدائنة
  RETURN QUERY
  SELECT 
    'Payables'::TEXT as check_category,
    'Accounts Payable'::TEXT as check_name,
    CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END as status,
    COUNT(*)::INTEGER as error_count,
    'التحقق من صحة الذمم الدائنة'::TEXT as description,
    CASE WHEN COUNT(*) > 0 THEN 
      jsonb_agg(jsonb_build_object(
        'bill_number', bill_number,
        'supplier_name', supplier_name,
        'difference', difference
      ))
    ELSE NULL END as details
  FROM verify_accounts_payable(p_company_id)
  WHERE has_discrepancy;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- منح الصلاحيات
-- =============================================
GRANT EXECUTE ON FUNCTION verify_journal_entries_balance TO authenticated;
GRANT EXECUTE ON FUNCTION verify_inventory_integrity TO authenticated;
GRANT EXECUTE ON FUNCTION verify_accounts_receivable TO authenticated;
GRANT EXECUTE ON FUNCTION verify_accounts_payable TO authenticated;
GRANT EXECUTE ON FUNCTION verify_accounting_pattern TO authenticated;
GRANT EXECUTE ON FUNCTION comprehensive_data_integrity_check TO authenticated;

-- =============================================
-- رسالة نجاح
-- =============================================
DO $$
BEGIN
  RAISE NOTICE '✅ تم إنشاء نظام التحقق من سلامة البيانات المحاسبية';
  RAISE NOTICE '🔍 يمكن استخدام الدوال التالية:';
  RAISE NOTICE '   - verify_journal_entries_balance(company_id)';
  RAISE NOTICE '   - verify_inventory_integrity(company_id)';
  RAISE NOTICE '   - verify_accounts_receivable(company_id)';
  RAISE NOTICE '   - verify_accounts_payable(company_id)';
  RAISE NOTICE '   - comprehensive_data_integrity_check(company_id)';
END $$;