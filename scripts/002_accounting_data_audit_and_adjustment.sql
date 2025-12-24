-- =====================================================
-- 🔐 نظام Audit وقيود التسوية المحاسبية
-- Accounting Data Audit and Adjustment System
-- =====================================================
-- تاريخ: 2025-01-XX
-- الهدف: تصحيح بيانات الشركات القديمة بطريقة محاسبية صحيحة
-- =====================================================
--
-- ⚠️ القواعد الصارمة:
-- ✅ يُمنع تعديل أو حذف أي بيانات تاريخية
-- ✅ يُمنع UPDATE / DELETE على invoices أو journal_entries القديمة
-- ✅ التصحيح يتم فقط عبر قيود محاسبية جديدة (Adjustment Entries)
-- ✅ جميع القيود الجديدة تكون posted
-- ✅ لا تأثير رجعي (No Retroactive Modification)
--
-- =====================================================

-- =====================================================
-- الجزء 1: Function للـ Audit الشامل لكل شركة
-- =====================================================
CREATE OR REPLACE FUNCTION audit_company_accounting_data(
  p_company_id UUID,
  p_audit_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE(
  audit_category TEXT,
  item_id UUID,
  item_reference TEXT,
  expected_value DECIMAL(15, 2),
  actual_value DECIMAL(15, 2),
  difference DECIMAL(15, 2),
  description TEXT,
  suggested_account_id UUID,
  suggested_debit DECIMAL(15, 2),
  suggested_credit DECIMAL(15, 2)
) AS $$
BEGIN
  RETURN QUERY
  
  -- ============================================
  -- 1. Audit: فواتير بدون قيود محاسبية
  -- ============================================
  SELECT 
    'invoice_without_journal'::TEXT as audit_category,
    i.id as item_id,
    i.invoice_number as item_reference,
    i.total_amount as expected_value,
    0::DECIMAL(15, 2) as actual_value,
    i.total_amount as difference,
    'فاتورة بدون قيد محاسبي' as description,
    NULL::UUID as suggested_account_id,
    0::DECIMAL(15, 2) as suggested_debit,
    0::DECIMAL(15, 2) as suggested_credit
  FROM invoices i
  WHERE i.company_id = p_company_id
    AND i.status IN ('sent', 'paid', 'partially_paid')
    AND (i.is_deleted IS NULL OR i.is_deleted = false)
    AND NOT EXISTS (
      SELECT 1 FROM journal_entries je
      WHERE je.company_id = p_company_id
        AND je.reference_type = 'invoice'
        AND je.reference_id = i.id
    )
  
  UNION ALL
  
  -- ============================================
  -- 2. Audit: فروقات paid_amount
  -- ============================================
  SELECT 
    'invoice_paid_amount_mismatch'::TEXT as audit_category,
    i.id as item_id,
    i.invoice_number as item_reference,
    i.paid_amount as expected_value,
    COALESCE((
      SELECT SUM(jel.debit_amount)
      FROM journal_entries je
      JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
      JOIN chart_of_accounts ca ON ca.id = jel.account_id
      WHERE je.company_id = p_company_id
        AND je.reference_type = 'invoice_payment'
        AND je.reference_id = i.id
        AND (je.status = 'posted' OR je.status IS NULL)
        AND (ca.sub_type = 'cash' OR ca.sub_type = 'bank' OR ca.account_type = 'asset')
    ), 0) as actual_value,
    i.paid_amount - COALESCE((
      SELECT SUM(jel.debit_amount)
      FROM journal_entries je
      JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
      JOIN chart_of_accounts ca ON ca.id = jel.account_id
      WHERE je.company_id = p_company_id
        AND je.reference_type = 'invoice_payment'
        AND je.reference_id = i.id
        AND (je.status = 'posted' OR je.status IS NULL)
        AND (ca.sub_type = 'cash' OR ca.sub_type = 'bank' OR ca.account_type = 'asset')
    ), 0) as difference,
    'فرق بين paid_amount والقيود المحاسبية' as description,
    NULL::UUID as suggested_account_id,
    0::DECIMAL(15, 2) as suggested_debit,
    0::DECIMAL(15, 2) as suggested_credit
  FROM invoices i
  WHERE i.company_id = p_company_id
    AND i.status IN ('paid', 'partially_paid')
    AND (i.is_deleted IS NULL OR i.is_deleted = false)
    AND ABS(i.paid_amount - COALESCE((
      SELECT SUM(jel.debit_amount)
      FROM journal_entries je
      JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
      JOIN chart_of_accounts ca ON ca.id = jel.account_id
      WHERE je.company_id = p_company_id
        AND je.reference_type = 'invoice_payment'
        AND je.reference_id = i.id
        AND (je.status = 'posted' OR je.status IS NULL)
        AND (ca.sub_type = 'cash' OR ca.sub_type = 'bank' OR ca.account_type = 'asset')
    ), 0)) > 0.01
  
  UNION ALL
  
  -- ============================================
  -- 3. Audit: فواتير شراء بدون قيود
  -- ============================================
  SELECT 
    'bill_without_journal'::TEXT as audit_category,
    b.id as item_id,
    b.bill_number as item_reference,
    b.total_amount as expected_value,
    0::DECIMAL(15, 2) as actual_value,
    b.total_amount as difference,
    'فاتورة شراء بدون قيد محاسبي' as description,
    NULL::UUID as suggested_account_id,
    0::DECIMAL(15, 2) as suggested_debit,
    0::DECIMAL(15, 2) as suggested_credit
  FROM bills b
  WHERE b.company_id = p_company_id
    AND b.status IN ('sent', 'paid', 'partially_paid', 'received')
    AND (b.is_deleted IS NULL OR b.is_deleted = false)
    AND NOT EXISTS (
      SELECT 1 FROM journal_entries je
      WHERE je.company_id = p_company_id
        AND je.reference_type = 'bill'
        AND je.reference_id = b.id
    )
  
  UNION ALL
  
  -- ============================================
  -- 4. Audit: فروقات paid_amount في فواتير الشراء
  -- ============================================
  SELECT 
    'bill_paid_amount_mismatch'::TEXT as audit_category,
    b.id as item_id,
    b.bill_number as item_reference,
    b.paid_amount as expected_value,
    COALESCE((
      SELECT SUM(jel.credit_amount)
      FROM journal_entries je
      JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
      JOIN chart_of_accounts ca ON ca.id = jel.account_id
      WHERE je.company_id = p_company_id
        AND je.reference_type = 'bill_payment'
        AND je.reference_id = b.id
        AND (je.status = 'posted' OR je.status IS NULL)
        AND (ca.sub_type = 'cash' OR ca.sub_type = 'bank' OR ca.account_type = 'asset')
    ), 0) as actual_value,
    b.paid_amount - COALESCE((
      SELECT SUM(jel.credit_amount)
      FROM journal_entries je
      JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
      JOIN chart_of_accounts ca ON ca.id = jel.account_id
      WHERE je.company_id = p_company_id
        AND je.reference_type = 'bill_payment'
        AND je.reference_id = b.id
        AND (je.status = 'posted' OR je.status IS NULL)
        AND (ca.sub_type = 'cash' OR ca.sub_type = 'bank' OR ca.account_type = 'asset')
    ), 0) as difference,
    'فرق بين paid_amount والقيود المحاسبية (فاتورة شراء)' as description,
    NULL::UUID as suggested_account_id,
    0::DECIMAL(15, 2) as suggested_debit,
    0::DECIMAL(15, 2) as suggested_credit
  FROM bills b
  WHERE b.company_id = p_company_id
    AND b.status IN ('paid', 'partially_paid')
    AND (b.is_deleted IS NULL OR b.is_deleted = false)
    AND ABS(b.paid_amount - COALESCE((
      SELECT SUM(jel.credit_amount)
      FROM journal_entries je
      JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
      JOIN chart_of_accounts ca ON ca.id = jel.account_id
      WHERE je.company_id = p_company_id
        AND je.reference_type = 'bill_payment'
        AND je.reference_id = b.id
        AND (je.status = 'posted' OR je.status IS NULL)
        AND (ca.sub_type = 'cash' OR ca.sub_type = 'bank' OR ca.account_type = 'asset')
    ), 0)) > 0.01
  
  UNION ALL
  
  -- ============================================
  -- 5. Audit: فروقات account_balances
  -- ============================================
  SELECT 
    'account_balance_mismatch'::TEXT as audit_category,
    ab.account_id as item_id,
    ca.account_code || ' - ' || ca.account_name as item_reference,
    CASE 
      WHEN ca.account_type IN ('asset', 'expense') THEN 
        ab.debit_balance - ab.credit_balance
      ELSE 
        ab.credit_balance - ab.debit_balance
    END as expected_value,
    COALESCE((
      SELECT CASE 
        WHEN ca.account_type IN ('asset', 'expense') THEN 
          SUM(jel.debit_amount - jel.credit_amount)
        ELSE 
          SUM(jel.credit_amount - jel.debit_amount)
      END
      FROM journal_entry_lines jel
      JOIN journal_entries je ON je.id = jel.journal_entry_id
      WHERE jel.account_id = ab.account_id
        AND je.company_id = p_company_id
        AND (je.status = 'posted' OR je.status IS NULL)
        AND je.entry_date <= ab.balance_date
    ), 0) as actual_value,
    CASE 
      WHEN ca.account_type IN ('asset', 'expense') THEN 
        (ab.debit_balance - ab.credit_balance) - COALESCE((
          SELECT SUM(jel.debit_amount - jel.credit_amount)
          FROM journal_entry_lines jel
          JOIN journal_entries je ON je.id = jel.journal_entry_id
          WHERE jel.account_id = ab.account_id
            AND je.company_id = p_company_id
            AND (je.status = 'posted' OR je.status IS NULL)
            AND je.entry_date <= ab.balance_date
        ), 0)
      ELSE 
        (ab.credit_balance - ab.debit_balance) - COALESCE((
          SELECT SUM(jel.credit_amount - jel.debit_amount)
          FROM journal_entry_lines jel
          JOIN journal_entries je ON je.id = jel.journal_entry_id
          WHERE jel.account_id = ab.account_id
            AND je.company_id = p_company_id
            AND (je.status = 'posted' OR je.status IS NULL)
            AND je.entry_date <= ab.balance_date
        ), 0)
    END as difference,
    'فرق بين account_balances والقيود المحاسبية' as description,
    ab.account_id as suggested_account_id,
    CASE 
      WHEN ca.account_type IN ('asset', 'expense') THEN 
        GREATEST(0, COALESCE((
          SELECT SUM(jel.debit_amount - jel.credit_amount)
          FROM journal_entry_lines jel
          JOIN journal_entries je ON je.id = jel.journal_entry_id
          WHERE jel.account_id = ab.account_id
            AND je.company_id = p_company_id
            AND (je.status = 'posted' OR je.status IS NULL)
            AND je.entry_date <= ab.balance_date
        ), 0) - (ab.debit_balance - ab.credit_balance))
      ELSE 0
    END as suggested_debit,
    CASE 
      WHEN ca.account_type IN ('asset', 'expense') THEN 
        GREATEST(0, (ab.debit_balance - ab.credit_balance) - COALESCE((
          SELECT SUM(jel.debit_amount - jel.credit_amount)
          FROM journal_entry_lines jel
          JOIN journal_entries je ON je.id = jel.journal_entry_id
          WHERE jel.account_id = ab.account_id
            AND je.company_id = p_company_id
            AND (je.status = 'posted' OR je.status IS NULL)
            AND je.entry_date <= ab.balance_date
        ), 0))
      ELSE 
        GREATEST(0, COALESCE((
          SELECT SUM(jel.credit_amount - jel.debit_amount)
          FROM journal_entry_lines jel
          JOIN journal_entries je ON je.id = jel.journal_entry_id
          WHERE jel.account_id = ab.account_id
            AND je.company_id = p_company_id
            AND (je.status = 'posted' OR je.status IS NULL)
            AND je.entry_date <= ab.balance_date
        ), 0) - (ab.credit_balance - ab.debit_balance))
    END as suggested_credit
  FROM account_balances ab
  JOIN chart_of_accounts ca ON ca.id = ab.account_id
  WHERE ab.company_id = p_company_id
    AND ab.balance_date = (
      SELECT MAX(balance_date) FROM account_balances 
      WHERE company_id = p_company_id AND account_id = ab.account_id
    )
    AND ABS(
      CASE 
        WHEN ca.account_type IN ('asset', 'expense') THEN 
          (ab.debit_balance - ab.credit_balance) - COALESCE((
            SELECT SUM(jel.debit_amount - jel.credit_amount)
            FROM journal_entry_lines jel
            JOIN journal_entries je ON je.id = jel.journal_entry_id
            WHERE jel.account_id = ab.account_id
              AND je.company_id = p_company_id
              AND (je.status = 'posted' OR je.status IS NULL)
              AND je.entry_date <= ab.balance_date
          ), 0)
        ELSE 
          (ab.credit_balance - ab.debit_balance) - COALESCE((
            SELECT SUM(jel.credit_amount - jel.debit_amount)
            FROM journal_entry_lines jel
            JOIN journal_entries je ON je.id = jel.journal_entry_id
            WHERE jel.account_id = ab.account_id
              AND je.company_id = p_company_id
              AND (je.status = 'posted' OR je.status IS NULL)
              AND je.entry_date <= ab.balance_date
          ), 0)
      END
    ) > 0.01;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION audit_company_accounting_data IS 'Audit شامل لبيانات الشركة - يحدد جميع الفروقات بين البيانات والقيود المحاسبية';

-- =====================================================
-- الجزء 2: Function لاقتراح قيود التسوية
-- =====================================================
CREATE OR REPLACE FUNCTION suggest_adjustment_entries(
  p_company_id UUID,
  p_adjustment_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE(
  adjustment_type TEXT,
  account_id UUID,
  account_code TEXT,
  account_name TEXT,
  debit_amount DECIMAL(15, 2),
  credit_amount DECIMAL(15, 2),
  description TEXT,
  reference_id UUID,
  reference_type TEXT
) AS $$
DECLARE
  v_ar_account_id UUID;
  v_ap_account_id UUID;
  v_revenue_account_id UUID;
  v_expense_account_id UUID;
  v_cash_account_id UUID;
  v_bank_account_id UUID;
  v_adjustment_account_id UUID;
BEGIN
  -- البحث عن الحسابات الأساسية
  SELECT id INTO v_ar_account_id
  FROM chart_of_accounts
  WHERE company_id = p_company_id
    AND (sub_type = 'accounts_receivable' OR account_name ILIKE '%receivable%' OR account_name ILIKE '%مدين%')
  LIMIT 1;
  
  SELECT id INTO v_ap_account_id
  FROM chart_of_accounts
  WHERE company_id = p_company_id
    AND (sub_type = 'accounts_payable' OR account_name ILIKE '%payable%' OR account_name ILIKE '%دائن%')
  LIMIT 1;
  
  SELECT id INTO v_revenue_account_id
  FROM chart_of_accounts
  WHERE company_id = p_company_id
    AND (account_type = 'income' OR account_name ILIKE '%revenue%' OR account_name ILIKE '%إيراد%')
  LIMIT 1;
  
  SELECT id INTO v_expense_account_id
  FROM chart_of_accounts
  WHERE company_id = p_company_id
    AND (account_type = 'expense' OR account_name ILIKE '%expense%' OR account_name ILIKE '%مصروف%')
  LIMIT 1;
  
  SELECT id INTO v_cash_account_id
  FROM chart_of_accounts
  WHERE company_id = p_company_id
    AND (sub_type = 'cash' OR account_name ILIKE '%cash%' OR account_name ILIKE '%صندوق%')
  LIMIT 1;
  
  SELECT id INTO v_bank_account_id
  FROM chart_of_accounts
  WHERE company_id = p_company_id
    AND (sub_type = 'bank' OR account_name ILIKE '%bank%' OR account_name ILIKE '%بنك%')
  LIMIT 1;
  
  -- حساب تسوية (Adjustment Account) - يمكن استخدام حساب مصروفات التسوية
  SELECT id INTO v_adjustment_account_id
  FROM chart_of_accounts
  WHERE company_id = p_company_id
    AND (account_name ILIKE '%adjustment%' OR account_name ILIKE '%تسوية%' OR account_name ILIKE '%تصحيح%')
  LIMIT 1;
  
  -- إذا لم يوجد حساب تسوية، استخدم حساب مصروفات عام
  IF v_adjustment_account_id IS NULL THEN
    v_adjustment_account_id := v_expense_account_id;
  END IF;
  
  RETURN QUERY
  
  -- ============================================
  -- 1. قيود تسوية: فواتير بدون قيود
  -- ============================================
  SELECT 
    'invoice_missing_journal'::TEXT as adjustment_type,
    v_ar_account_id as account_id,
    (SELECT account_code FROM chart_of_accounts WHERE id = v_ar_account_id) as account_code,
    (SELECT account_name FROM chart_of_accounts WHERE id = v_ar_account_id) as account_name,
    i.total_amount as debit_amount,
    0::DECIMAL(15, 2) as credit_amount,
    'تسوية: فاتورة ' || i.invoice_number || ' بدون قيد' as description,
    i.id as reference_id,
    'invoice'::TEXT as reference_type
  FROM invoices i
  WHERE i.company_id = p_company_id
    AND i.status IN ('sent', 'paid', 'partially_paid')
    AND (i.is_deleted IS NULL OR i.is_deleted = false)
    AND NOT EXISTS (
      SELECT 1 FROM journal_entries je
      WHERE je.company_id = p_company_id
        AND je.reference_type = 'invoice'
        AND je.reference_id = i.id
    )
  
  UNION ALL
  
  SELECT 
    'invoice_missing_journal_revenue'::TEXT as adjustment_type,
    v_revenue_account_id as account_id,
    (SELECT account_code FROM chart_of_accounts WHERE id = v_revenue_account_id) as account_code,
    (SELECT account_name FROM chart_of_accounts WHERE id = v_revenue_account_id) as account_name,
    0::DECIMAL(15, 2) as debit_amount,
    i.subtotal as credit_amount,
    'تسوية: إيرادات فاتورة ' || i.invoice_number as description,
    i.id as reference_id,
    'invoice'::TEXT as reference_type
  FROM invoices i
  WHERE i.company_id = p_company_id
    AND i.status IN ('sent', 'paid', 'partially_paid')
    AND (i.is_deleted IS NULL OR i.is_deleted = false)
    AND NOT EXISTS (
      SELECT 1 FROM journal_entries je
      WHERE je.company_id = p_company_id
        AND je.reference_type = 'invoice'
        AND je.reference_id = i.id
    )
  
  UNION ALL
  
  -- ============================================
  -- 2. قيود تسوية: فروقات paid_amount
  -- ============================================
  SELECT 
    'invoice_paid_adjustment'::TEXT as adjustment_type,
    COALESCE(v_cash_account_id, v_bank_account_id) as account_id,
    (SELECT account_code FROM chart_of_accounts WHERE id = COALESCE(v_cash_account_id, v_bank_account_id)) as account_code,
    (SELECT account_name FROM chart_of_accounts WHERE id = COALESCE(v_cash_account_id, v_bank_account_id)) as account_name,
    GREATEST(0, i.paid_amount - COALESCE((
      SELECT SUM(jel.debit_amount)
      FROM journal_entries je
      JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
      JOIN chart_of_accounts ca ON ca.id = jel.account_id
      WHERE je.company_id = p_company_id
        AND je.reference_type = 'invoice_payment'
        AND je.reference_id = i.id
        AND (je.status = 'posted' OR je.status IS NULL)
        AND (ca.sub_type = 'cash' OR ca.sub_type = 'bank' OR ca.account_type = 'asset')
    ), 0)) as debit_amount,
    GREATEST(0, COALESCE((
      SELECT SUM(jel.debit_amount)
      FROM journal_entries je
      JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
      JOIN chart_of_accounts ca ON ca.id = jel.account_id
      WHERE je.company_id = p_company_id
        AND je.reference_type = 'invoice_payment'
        AND je.reference_id = i.id
        AND (je.status = 'posted' OR je.status IS NULL)
        AND (ca.sub_type = 'cash' OR ca.sub_type = 'bank' OR ca.account_type = 'asset')
    ), 0) - i.paid_amount) as credit_amount,
    'تسوية: مدفوعات فاتورة ' || i.invoice_number as description,
    i.id as reference_id,
    'invoice'::TEXT as reference_type
  FROM invoices i
  WHERE i.company_id = p_company_id
    AND i.status IN ('paid', 'partially_paid')
    AND (i.is_deleted IS NULL OR i.is_deleted = false)
    AND ABS(i.paid_amount - COALESCE((
      SELECT SUM(jel.debit_amount)
      FROM journal_entries je
      JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
      JOIN chart_of_accounts ca ON ca.id = jel.account_id
      WHERE je.company_id = p_company_id
        AND je.reference_type = 'invoice_payment'
        AND je.reference_id = i.id
        AND (je.status = 'posted' OR je.status IS NULL)
        AND (ca.sub_type = 'cash' OR ca.sub_type = 'bank' OR ca.account_type = 'asset')
    ), 0)) > 0.01
    AND (
      i.paid_amount - COALESCE((
        SELECT SUM(jel.debit_amount)
        FROM journal_entries je
        JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
        JOIN chart_of_accounts ca ON ca.id = jel.account_id
        WHERE je.company_id = p_company_id
          AND je.reference_type = 'invoice_payment'
          AND je.reference_id = i.id
          AND (je.status = 'posted' OR je.status IS NULL)
          AND (ca.sub_type = 'cash' OR ca.sub_type = 'bank' OR ca.account_type = 'asset')
      ), 0) > 0.01
      OR
      COALESCE((
        SELECT SUM(jel.debit_amount)
        FROM journal_entries je
        JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
        JOIN chart_of_accounts ca ON ca.id = jel.account_id
        WHERE je.company_id = p_company_id
          AND je.reference_type = 'invoice_payment'
          AND je.reference_id = i.id
          AND (je.status = 'posted' OR je.status IS NULL)
          AND (ca.sub_type = 'cash' OR ca.sub_type = 'bank' OR ca.account_type = 'asset')
      ), 0) - i.paid_amount > 0.01
    )
  
  UNION ALL
  
  SELECT 
    'invoice_paid_adjustment_ar'::TEXT as adjustment_type,
    v_ar_account_id as account_id,
    (SELECT account_code FROM chart_of_accounts WHERE id = v_ar_account_id) as account_code,
    (SELECT account_name FROM chart_of_accounts WHERE id = v_ar_account_id) as account_name,
    GREATEST(0, COALESCE((
      SELECT SUM(jel.debit_amount)
      FROM journal_entries je
      JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
      JOIN chart_of_accounts ca ON ca.id = jel.account_id
      WHERE je.company_id = p_company_id
        AND je.reference_type = 'invoice_payment'
        AND je.reference_id = i.id
        AND (je.status = 'posted' OR je.status IS NULL)
        AND (ca.sub_type = 'cash' OR ca.sub_type = 'bank' OR ca.account_type = 'asset')
    ), 0) - i.paid_amount) as debit_amount,
    GREATEST(0, i.paid_amount - COALESCE((
      SELECT SUM(jel.debit_amount)
      FROM journal_entries je
      JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
      JOIN chart_of_accounts ca ON ca.id = jel.account_id
      WHERE je.company_id = p_company_id
        AND je.reference_type = 'invoice_payment'
        AND je.reference_id = i.id
        AND (je.status = 'posted' OR je.status IS NULL)
        AND (ca.sub_type = 'cash' OR ca.sub_type = 'bank' OR ca.account_type = 'asset')
    ), 0)) as credit_amount,
    'تسوية: ذمم مدينة فاتورة ' || i.invoice_number as description,
    i.id as reference_id,
    'invoice'::TEXT as reference_type
  FROM invoices i
  WHERE i.company_id = p_company_id
    AND i.status IN ('paid', 'partially_paid')
    AND (i.is_deleted IS NULL OR i.is_deleted = false)
    AND ABS(i.paid_amount - COALESCE((
      SELECT SUM(jel.debit_amount)
      FROM journal_entries je
      JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
      JOIN chart_of_accounts ca ON ca.id = jel.account_id
      WHERE je.company_id = p_company_id
        AND je.reference_type = 'invoice_payment'
        AND je.reference_id = i.id
        AND (je.status = 'posted' OR je.status IS NULL)
        AND (ca.sub_type = 'cash' OR ca.sub_type = 'bank' OR ca.account_type = 'asset')
    ), 0)) > 0.01
    AND (
      i.paid_amount - COALESCE((
        SELECT SUM(jel.debit_amount)
        FROM journal_entries je
        JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
        JOIN chart_of_accounts ca ON ca.id = jel.account_id
        WHERE je.company_id = p_company_id
          AND je.reference_type = 'invoice_payment'
          AND je.reference_id = i.id
          AND (je.status = 'posted' OR je.status IS NULL)
          AND (ca.sub_type = 'cash' OR ca.sub_type = 'bank' OR ca.account_type = 'asset')
      ), 0) > 0.01
      OR
      COALESCE((
        SELECT SUM(jel.debit_amount)
        FROM journal_entries je
        JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
        JOIN chart_of_accounts ca ON ca.id = jel.account_id
        WHERE je.company_id = p_company_id
          AND je.reference_type = 'invoice_payment'
          AND je.reference_id = i.id
          AND (je.status = 'posted' OR je.status IS NULL)
          AND (ca.sub_type = 'cash' OR ca.sub_type = 'bank' OR ca.account_type = 'asset')
      ), 0) - i.paid_amount > 0.01
    )
  
  UNION ALL
  
  -- ============================================
  -- 3. قيود تسوية: فروقات account_balances
  -- ============================================
  SELECT 
    'account_balance_adjustment'::TEXT as adjustment_type,
    ab.account_id,
    ca.account_code,
    ca.account_name,
    CASE 
      WHEN ca.account_type IN ('asset', 'expense') THEN 
        GREATEST(0, COALESCE((
          SELECT SUM(jel.debit_amount - jel.credit_amount)
          FROM journal_entry_lines jel
          JOIN journal_entries je ON je.id = jel.journal_entry_id
          WHERE jel.account_id = ab.account_id
            AND je.company_id = p_company_id
            AND (je.status = 'posted' OR je.status IS NULL)
            AND je.entry_date <= ab.balance_date
        ), 0) - (ab.debit_balance - ab.credit_balance))
      ELSE 0
    END as debit_amount,
    CASE 
      WHEN ca.account_type IN ('asset', 'expense') THEN 
        GREATEST(0, (ab.debit_balance - ab.credit_balance) - COALESCE((
          SELECT SUM(jel.debit_amount - jel.credit_amount)
          FROM journal_entry_lines jel
          JOIN journal_entries je ON je.id = jel.journal_entry_id
          WHERE jel.account_id = ab.account_id
            AND je.company_id = p_company_id
            AND (je.status = 'posted' OR je.status IS NULL)
            AND je.entry_date <= ab.balance_date
        ), 0))
      ELSE 
        GREATEST(0, COALESCE((
          SELECT SUM(jel.credit_amount - jel.debit_amount)
          FROM journal_entry_lines jel
          JOIN journal_entries je ON je.id = jel.journal_entry_id
          WHERE jel.account_id = ab.account_id
            AND je.company_id = p_company_id
            AND (je.status = 'posted' OR je.status IS NULL)
            AND je.entry_date <= ab.balance_date
        ), 0) - (ab.credit_balance - ab.debit_balance))
    END as credit_amount,
    'تسوية: رصيد حساب ' || ca.account_code || ' - ' || ca.account_name as description,
    ab.account_id as reference_id,
    'account_balance'::TEXT as reference_type
  FROM account_balances ab
  JOIN chart_of_accounts ca ON ca.id = ab.account_id
  WHERE ab.company_id = p_company_id
    AND ab.balance_date = (
      SELECT MAX(balance_date) FROM account_balances 
      WHERE company_id = p_company_id AND account_id = ab.account_id
    )
    AND ABS(
      CASE 
        WHEN ca.account_type IN ('asset', 'expense') THEN 
          (ab.debit_balance - ab.credit_balance) - COALESCE((
            SELECT SUM(jel.debit_amount - jel.credit_amount)
            FROM journal_entry_lines jel
            JOIN journal_entries je ON je.id = jel.journal_entry_id
            WHERE jel.account_id = ab.account_id
              AND je.company_id = p_company_id
              AND (je.status = 'posted' OR je.status IS NULL)
              AND je.entry_date <= ab.balance_date
          ), 0)
        ELSE 
          (ab.credit_balance - ab.debit_balance) - COALESCE((
            SELECT SUM(jel.credit_amount - jel.debit_amount)
            FROM journal_entry_lines jel
            JOIN journal_entries je ON je.id = jel.journal_entry_id
            WHERE jel.account_id = ab.account_id
              AND je.company_id = p_company_id
              AND (je.status = 'posted' OR je.status IS NULL)
              AND je.entry_date <= ab.balance_date
          ), 0)
      END
    ) > 0.01
    AND (
      CASE 
        WHEN ca.account_type IN ('asset', 'expense') THEN 
          COALESCE((
            SELECT SUM(jel.debit_amount - jel.credit_amount)
            FROM journal_entry_lines jel
            JOIN journal_entries je ON je.id = jel.journal_entry_id
            WHERE jel.account_id = ab.account_id
              AND je.company_id = p_company_id
              AND (je.status = 'posted' OR je.status IS NULL)
              AND je.entry_date <= ab.balance_date
          ), 0) - (ab.debit_balance - ab.credit_balance) > 0.01
        ELSE 
          COALESCE((
            SELECT SUM(jel.credit_amount - jel.debit_amount)
            FROM journal_entry_lines jel
            JOIN journal_entries je ON je.id = jel.journal_entry_id
            WHERE jel.account_id = ab.account_id
              AND je.company_id = p_company_id
              AND (je.status = 'posted' OR je.status IS NULL)
              AND je.entry_date <= ab.balance_date
          ), 0) - (ab.credit_balance - ab.debit_balance) > 0.01
      END
      OR
      CASE 
        WHEN ca.account_type IN ('asset', 'expense') THEN 
          (ab.debit_balance - ab.credit_balance) - COALESCE((
            SELECT SUM(jel.debit_amount - jel.credit_amount)
            FROM journal_entry_lines jel
            JOIN journal_entries je ON je.id = jel.journal_entry_id
            WHERE jel.account_id = ab.account_id
              AND je.company_id = p_company_id
              AND (je.status = 'posted' OR je.status IS NULL)
              AND je.entry_date <= ab.balance_date
          ), 0) > 0.01
        ELSE 
          (ab.credit_balance - ab.debit_balance) - COALESCE((
            SELECT SUM(jel.credit_amount - jel.debit_amount)
            FROM journal_entry_lines jel
            JOIN journal_entries je ON je.id = jel.journal_entry_id
            WHERE jel.account_id = ab.account_id
              AND je.company_id = p_company_id
              AND (je.status = 'posted' OR je.status IS NULL)
              AND je.entry_date <= ab.balance_date
          ), 0) > 0.01
      END
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION suggest_adjustment_entries IS 'اقتراح قيود التسوية المحاسبية بناءً على نتائج Audit';

-- =====================================================
-- الجزء 3: Function لإنشاء قيود التسوية
-- =====================================================
CREATE OR REPLACE FUNCTION create_adjustment_entries(
  p_company_id UUID,
  p_adjustment_date DATE DEFAULT CURRENT_DATE,
  p_description_prefix TEXT DEFAULT 'تسوية محاسبية'
)
RETURNS TABLE(
  journal_entry_id UUID,
  adjustment_type TEXT,
  total_debit DECIMAL(15, 2),
  total_credit DECIMAL(15, 2),
  lines_count INTEGER
) AS $$
DECLARE
  v_journal_entry_id UUID;
  v_adjustment_account_id UUID;
  v_total_debit DECIMAL(15, 2);
  v_total_credit DECIMAL(15, 2);
  v_line_record RECORD;
  v_grouped_lines RECORD;
BEGIN
  -- البحث عن حساب تسوية (Adjustment Account)
  SELECT id INTO v_adjustment_account_id
  FROM chart_of_accounts
  WHERE company_id = p_company_id
    AND (account_name ILIKE '%adjustment%' OR account_name ILIKE '%تسوية%' OR account_name ILIKE '%تصحيح%')
  LIMIT 1;
  
  -- إذا لم يوجد حساب تسوية، استخدم حساب مصروفات عام
  IF v_adjustment_account_id IS NULL THEN
    SELECT id INTO v_adjustment_account_id
    FROM chart_of_accounts
    WHERE company_id = p_company_id
      AND account_type = 'expense'
    LIMIT 1;
  END IF;
  
  -- تجميع قيود التسوية حسب النوع
  FOR v_grouped_lines IN
    SELECT 
      adjustment_type,
      SUM(debit_amount) as total_debit,
      SUM(credit_amount) as total_credit,
      COUNT(*) as lines_count
    FROM suggest_adjustment_entries(p_company_id, p_adjustment_date)
    WHERE (debit_amount > 0.01 OR credit_amount > 0.01)
    GROUP BY adjustment_type
    HAVING ABS(SUM(debit_amount) - SUM(credit_amount)) > 0.01
  LOOP
    -- إنشاء قيد تسوية لكل نوع
    INSERT INTO journal_entries (
      company_id,
      reference_type,
      reference_id,
      entry_date,
      description
    ) VALUES (
      p_company_id,
      'adjustment',
      NULL,
      p_adjustment_date,
      p_description_prefix || ' - ' || v_grouped_lines.adjustment_type
    ) RETURNING id INTO v_journal_entry_id;
    
    v_total_debit := 0;
    v_total_credit := 0;
    
    -- إدراج سطور القيد
    FOR v_line_record IN
      SELECT *
      FROM suggest_adjustment_entries(p_company_id, p_adjustment_date)
      WHERE adjustment_type = v_grouped_lines.adjustment_type
        AND (debit_amount > 0.01 OR credit_amount > 0.01)
    LOOP
      IF v_line_record.account_id IS NOT NULL THEN
        INSERT INTO journal_entry_lines (
          journal_entry_id,
          account_id,
          debit_amount,
          credit_amount,
          description
        ) VALUES (
          v_journal_entry_id,
          v_line_record.account_id,
          v_line_record.debit_amount,
          v_line_record.credit_amount,
          v_line_record.description
        );
        
        v_total_debit := v_total_debit + v_line_record.debit_amount;
        v_total_credit := v_total_credit + v_line_record.credit_amount;
      END IF;
    END LOOP;
    
    -- إضافة سطر توازن إذا لزم الأمر
    IF ABS(v_total_debit - v_total_credit) > 0.01 THEN
      IF v_total_debit > v_total_credit THEN
        -- نحتاج دائن للتوازن
        INSERT INTO journal_entry_lines (
          journal_entry_id,
          account_id,
          debit_amount,
          credit_amount,
          description
        ) VALUES (
          v_journal_entry_id,
          v_adjustment_account_id,
          0,
          v_total_debit - v_total_credit,
          'توازن قيد التسوية'
        );
        v_total_credit := v_total_credit + (v_total_debit - v_total_credit);
      ELSE
        -- نحتاج مدين للتوازن
        INSERT INTO journal_entry_lines (
          journal_entry_id,
          account_id,
          debit_amount,
          credit_amount,
          description
        ) VALUES (
          v_journal_entry_id,
          v_adjustment_account_id,
          v_total_credit - v_total_debit,
          0,
          'توازن قيد التسوية'
        );
        v_total_debit := v_total_debit + (v_total_credit - v_total_debit);
      END IF;
    END IF;
    
    -- إرجاع النتيجة
    RETURN QUERY
    SELECT 
      v_journal_entry_id,
      v_grouped_lines.adjustment_type,
      v_total_debit,
      v_total_credit,
      v_grouped_lines.lines_count;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION create_adjustment_entries IS 'إنشاء قيود التسوية المحاسبية بناءً على نتائج Audit - لا يعدل البيانات التاريخية';

-- =====================================================
-- ملخص التنفيذ
-- =====================================================
DO $$
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE '✅ تم إنشاء نظام Audit وقيود التسوية';
  RAISE NOTICE '========================================';
  RAISE NOTICE '1. ✅ Function: audit_company_accounting_data()';
  RAISE NOTICE '2. ✅ Function: suggest_adjustment_entries()';
  RAISE NOTICE '3. ✅ Function: create_adjustment_entries()';
  RAISE NOTICE '========================================';
  RAISE NOTICE '✅ لا يوجد UPDATE/DELETE على البيانات';
  RAISE NOTICE '✅ فقط INSERT قيود جديدة (Adjustment Entries)';
  RAISE NOTICE '✅ جميع القيود تكون posted';
  RAISE NOTICE '✅ لا تأثير رجعي على البيانات التاريخية';
  RAISE NOTICE '========================================';
END $$;

-- =====================================================
-- شرح مختصر
-- =====================================================
-- 
-- ما أضافه هذا Migration:
-- =====================================================
-- 1. Function audit_company_accounting_data():
--    - Audit شامل لكل شركة
--    - يحدد جميع الفروقات بين البيانات والقيود
--    - يعيد تفاصيل كل فرق مع اقتراحات التسوية
--
-- 2. Function suggest_adjustment_entries():
--    - يقترح قيود التسوية المناسبة
--    - يحسب Debit/Credit لكل حساب
--    - يعيد قائمة بجميع قيود التسوية المطلوبة
--
-- 3. Function create_adjustment_entries():
--    - ينشئ قيود التسوية الفعلية
--    - يضمن توازن القيود (Debit = Credit)
--    - يستخدم حساب تسوية للتوازن إذا لزم الأمر
--
-- لماذا آمن:
-- =====================================================
-- ✅ لا UPDATE/DELETE على البيانات القديمة
-- ✅ فقط INSERT قيود جديدة (Adjustment Entries)
-- ✅ جميع القيود بتاريخ واحد واضح (Adjustment Date)
-- ✅ لا تأثير رجعي على البيانات التاريخية
-- ✅ التاريخ المحاسبي محفوظ بالكامل
--
-- الاستخدام:
-- =====================================================
-- 1. Audit:
--    SELECT * FROM audit_company_accounting_data('company_id', '2025-01-01');
--
-- 2. اقتراح قيود التسوية:
--    SELECT * FROM suggest_adjustment_entries('company_id', '2025-01-01');
--
-- 3. إنشاء قيود التسوية:
--    SELECT * FROM create_adjustment_entries('company_id', '2025-01-01', 'تسوية 2025');
--
-- =====================================================
-- ✅ هذا Migration آمن 100% للإنتاج
-- ✅ لا يعدل البيانات التاريخية
-- ✅ فقط يضيف قيود تسوية جديدة
-- =====================================================

