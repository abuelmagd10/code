-- =============================================
-- حساب الذمم والرصيد للعملاء والموردين من القيود المحاسبية
-- مطابق 100% لنمط Zoho Books
-- =============================================
-- الهدف: حساب الذمم من القيود المحاسبية بدلاً من الفواتير مباشرة
-- المعايير:
-- ✅ الذمم المدينة = رصيد حساب Accounts Receivable (مدين - دائن)
-- ✅ الذمم الدائنة = رصيد حساب Accounts Payable (دائن - مدين)
-- ✅ التوافق الكامل مع نظام المحاسبة على أساس الاستحقاق
-- =============================================

-- =============================================
-- 1. دالة حساب الذمم المدينة للعملاء من القيود المحاسبية
-- =============================================
CREATE OR REPLACE FUNCTION get_customer_receivables_from_ledger(
  p_company_id UUID,
  p_customer_id UUID DEFAULT NULL
)
RETURNS TABLE (
  customer_id UUID,
  customer_name TEXT,
  receivable_balance NUMERIC,
  total_invoiced NUMERIC,
  total_paid NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  WITH ar_account AS (
    -- الحصول على حساب الذمم المدينة
    SELECT id as account_id
    FROM chart_of_accounts
    WHERE company_id = p_company_id
      AND sub_type = 'accounts_receivable'
      AND COALESCE(is_active, true) = true
    LIMIT 1
  ),
  customer_ar_balance AS (
    -- حساب رصيد كل عميل من القيود المحاسبية
    SELECT 
      i.customer_id,
      c.name as customer_name,
      -- الرصيد = المدين - الدائن (للأصول)
      COALESCE(SUM(jel.debit_amount), 0) - COALESCE(SUM(jel.credit_amount), 0) as ar_balance
    FROM invoices i
    JOIN customers c ON c.id = i.customer_id
    LEFT JOIN journal_entries je ON je.reference_type = 'invoice' AND je.reference_id = i.id
    LEFT JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
    CROSS JOIN ar_account
    WHERE i.company_id = p_company_id
      AND jel.account_id = ar_account.account_id
      AND (p_customer_id IS NULL OR i.customer_id = p_customer_id)
      AND i.status NOT IN ('draft', 'cancelled')
      AND (je.is_deleted IS NULL OR je.is_deleted = false)
    GROUP BY i.customer_id, c.name
  ),
  customer_totals AS (
    -- حساب إجمالي الفواتير والمدفوعات لكل عميل
    SELECT 
      customer_id,
      COALESCE(SUM(total_amount), 0) as total_invoiced,
      COALESCE(SUM(paid_amount), 0) as total_paid
    FROM invoices
    WHERE company_id = p_company_id
      AND (p_customer_id IS NULL OR customer_id = p_customer_id)
      AND status NOT IN ('draft', 'cancelled')
    GROUP BY customer_id
  )
  SELECT 
    cab.customer_id,
    cab.customer_name,
    COALESCE(cab.ar_balance, 0) as receivable_balance,
    COALESCE(ct.total_invoiced, 0) as total_invoiced,
    COALESCE(ct.total_paid, 0) as total_paid
  FROM customer_ar_balance cab
  LEFT JOIN customer_totals ct ON ct.customer_id = cab.customer_id
  WHERE COALESCE(cab.ar_balance, 0) > 0.01 -- فقط العملاء الذين لديهم ذمم
  ORDER BY cab.ar_balance DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- 2. دالة حساب الذمم الدائنة للموردين من القيود المحاسبية
-- =============================================
CREATE OR REPLACE FUNCTION get_supplier_payables_from_ledger(
  p_company_id UUID,
  p_supplier_id UUID DEFAULT NULL
)
RETURNS TABLE (
  supplier_id UUID,
  supplier_name TEXT,
  payable_balance NUMERIC,
  total_billed NUMERIC,
  total_paid NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  WITH ap_account AS (
    -- الحصول على حساب الذمم الدائنة
    SELECT id as account_id
    FROM chart_of_accounts
    WHERE company_id = p_company_id
      AND sub_type = 'accounts_payable'
      AND COALESCE(is_active, true) = true
    LIMIT 1
  ),
  supplier_ap_balance AS (
    -- حساب رصيد كل مورد من القيود المحاسبية
    SELECT 
      b.supplier_id,
      s.name as supplier_name,
      -- الرصيد = الدائن - المدين (للخصوم)
      COALESCE(SUM(jel.credit_amount), 0) - COALESCE(SUM(jel.debit_amount), 0) as ap_balance
    FROM bills b
    JOIN suppliers s ON s.id = b.supplier_id
    LEFT JOIN journal_entries je ON je.reference_type = 'bill' AND je.reference_id = b.id
    LEFT JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
    CROSS JOIN ap_account
    WHERE b.company_id = p_company_id
      AND jel.account_id = ap_account.account_id
      AND (p_supplier_id IS NULL OR b.supplier_id = p_supplier_id)
      AND b.status NOT IN ('draft', 'cancelled')
      AND (je.is_deleted IS NULL OR je.is_deleted = false)
    GROUP BY b.supplier_id, s.name
  ),
  supplier_totals AS (
    -- حساب إجمالي الفواتير والمدفوعات لكل مورد
    SELECT 
      supplier_id,
      COALESCE(SUM(total_amount), 0) as total_billed,
      COALESCE(SUM(paid_amount), 0) as total_paid
    FROM bills
    WHERE company_id = p_company_id
      AND (p_supplier_id IS NULL OR supplier_id = p_supplier_id)
      AND status NOT IN ('draft', 'cancelled')
    GROUP BY supplier_id
  )
  SELECT 
    sab.supplier_id,
    sab.supplier_name,
    COALESCE(sab.ap_balance, 0) as payable_balance,
    COALESCE(st.total_billed, 0) as total_billed,
    COALESCE(st.total_paid, 0) as total_paid
  FROM supplier_ap_balance sab
  LEFT JOIN supplier_totals st ON st.supplier_id = sab.supplier_id
  WHERE COALESCE(sab.ap_balance, 0) > 0.01 -- فقط الموردين الذين لديهم ذمم
  ORDER BY sab.ap_balance DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- 3. دالة التحقق من تطابق الذمم بين الفواتير والقيود
-- =============================================
CREATE OR REPLACE FUNCTION verify_receivables_payables_integrity(p_company_id UUID)
RETURNS TABLE (
  check_type TEXT,
  entity_type TEXT,
  entity_id UUID,
  entity_name TEXT,
  invoice_balance NUMERIC,
  ledger_balance NUMERIC,
  difference NUMERIC,
  status TEXT
) AS $$
BEGIN
  -- التحقق من الذمم المدينة (العملاء)
  RETURN QUERY
  WITH customer_invoice_balance AS (
    SELECT
      customer_id,
      c.name as customer_name,
      COALESCE(SUM(total_amount - COALESCE(paid_amount, 0)), 0) as balance
    FROM invoices i
    JOIN customers c ON c.id = i.customer_id
    WHERE i.company_id = p_company_id
      AND i.status IN ('sent', 'partially_paid')
    GROUP BY customer_id, c.name
  ),
  customer_ledger_balance AS (
    SELECT
      customer_id,
      customer_name,
      receivable_balance as balance
    FROM get_customer_receivables_from_ledger(p_company_id)
  )
  SELECT
    'Accounts Receivable'::TEXT as check_type,
    'Customer'::TEXT as entity_type,
    COALESCE(cib.customer_id, clb.customer_id) as entity_id,
    COALESCE(cib.customer_name, clb.customer_name) as entity_name,
    COALESCE(cib.balance, 0) as invoice_balance,
    COALESCE(clb.balance, 0) as ledger_balance,
    ABS(COALESCE(cib.balance, 0) - COALESCE(clb.balance, 0)) as difference,
    CASE
      WHEN ABS(COALESCE(cib.balance, 0) - COALESCE(clb.balance, 0)) < 0.01 THEN '✅ متطابق'
      ELSE '❌ غير متطابق'
    END as status
  FROM customer_invoice_balance cib
  FULL OUTER JOIN customer_ledger_balance clb ON cib.customer_id = clb.customer_id
  WHERE ABS(COALESCE(cib.balance, 0) - COALESCE(clb.balance, 0)) > 0.01

  UNION ALL

  -- التحقق من الذمم الدائنة (الموردين)
  WITH supplier_bill_balance AS (
    SELECT
      supplier_id,
      s.name as supplier_name,
      COALESCE(SUM(total_amount - COALESCE(paid_amount, 0)), 0) as balance
    FROM bills b
    JOIN suppliers s ON s.id = b.supplier_id
    WHERE b.company_id = p_company_id
      AND b.status IN ('sent', 'received', 'partially_paid')
    GROUP BY supplier_id, s.name
  ),
  supplier_ledger_balance AS (
    SELECT
      supplier_id,
      supplier_name,
      payable_balance as balance
    FROM get_supplier_payables_from_ledger(p_company_id)
  )
  SELECT
    'Accounts Payable'::TEXT as check_type,
    'Supplier'::TEXT as entity_type,
    COALESCE(sbb.supplier_id, slb.supplier_id) as entity_id,
    COALESCE(sbb.supplier_name, slb.supplier_name) as entity_name,
    COALESCE(sbb.balance, 0) as invoice_balance,
    COALESCE(slb.balance, 0) as ledger_balance,
    ABS(COALESCE(sbb.balance, 0) - COALESCE(slb.balance, 0)) as difference,
    CASE
      WHEN ABS(COALESCE(sbb.balance, 0) - COALESCE(slb.balance, 0)) < 0.01 THEN '✅ متطابق'
      ELSE '❌ غير متطابق'
    END as status
  FROM supplier_bill_balance sbb
  FULL OUTER JOIN supplier_ledger_balance slb ON sbb.supplier_id = slb.supplier_id
  WHERE ABS(COALESCE(sbb.balance, 0) - COALESCE(slb.balance, 0)) > 0.01;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- 4. منح الصلاحيات
-- =============================================
GRANT EXECUTE ON FUNCTION get_customer_receivables_from_ledger(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_supplier_payables_from_ledger(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION verify_receivables_payables_integrity(UUID) TO authenticated;

-- =============================================
-- أمثلة الاستخدام:
-- =============================================
--
-- 1. عرض الذمم المدينة لجميع العملاء:
--    SELECT * FROM get_customer_receivables_from_ledger('company-uuid-here');
--
-- 2. عرض الذمم المدينة لعميل محدد:
--    SELECT * FROM get_customer_receivables_from_ledger('company-uuid-here', 'customer-uuid-here');
--
-- 3. عرض الذمم الدائنة لجميع الموردين:
--    SELECT * FROM get_supplier_payables_from_ledger('company-uuid-here');
--
-- 4. عرض الذمم الدائنة لمورد محدد:
--    SELECT * FROM get_supplier_payables_from_ledger('company-uuid-here', 'supplier-uuid-here');
--
-- 5. التحقق من تطابق الذمم بين الفواتير والقيود:
--    SELECT * FROM verify_receivables_payables_integrity('company-uuid-here');
-- =============================================

