-- =====================================
-- دوال فحص صحة البيانات
-- Data Health Check Functions
-- =====================================

-- 1. فحص الفواتير المدفوعة بدون قيود محاسبية
CREATE OR REPLACE FUNCTION check_paid_invoices_without_entries(p_company_id UUID)
RETURNS TABLE (
  invoice_id UUID,
  invoice_number TEXT,
  status TEXT,
  total_amount DECIMAL,
  paid_amount DECIMAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    i.id,
    i.invoice_number,
    i.status,
    i.total_amount,
    i.paid_amount
  FROM invoices i
  WHERE i.company_id = p_company_id
    AND i.status IN ('paid', 'partially_paid')
    AND (i.is_deleted IS NULL OR i.is_deleted = false)
    AND NOT EXISTS (
      SELECT 1 FROM journal_entries je 
      WHERE je.reference_id = i.id 
      AND je.reference_type = 'invoice'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. فحص تطابق رصيد المخزون
CREATE OR REPLACE FUNCTION check_stock_mismatch(p_company_id UUID)
RETURNS TABLE (
  product_id UUID,
  product_name TEXT,
  recorded_qty INTEGER,
  calculated_qty BIGINT,
  difference BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.id,
    p.name,
    p.quantity_on_hand,
    COALESCE(SUM(it.quantity_change), 0)::BIGINT as calc_qty,
    (p.quantity_on_hand - COALESCE(SUM(it.quantity_change), 0))::BIGINT as diff
  FROM products p
  LEFT JOIN inventory_transactions it ON it.product_id = p.id 
    AND (it.is_deleted IS NULL OR it.is_deleted = false)
  WHERE p.company_id = p_company_id
  GROUP BY p.id, p.name, p.quantity_on_hand
  HAVING p.quantity_on_hand != COALESCE(SUM(it.quantity_change), 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. فحص قيود المرتجعات بحسابات خاطئة
-- (فواتير غير مدفوعة لكن المرتجع يستخدم حساب سلف العملاء)
CREATE OR REPLACE FUNCTION check_wrong_return_entries(p_company_id UUID)
RETURNS TABLE (
  journal_entry_id UUID,
  invoice_id UUID,
  invoice_number TEXT,
  invoice_status TEXT,
  wrong_account_name TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    je.id,
    i.id,
    i.invoice_number,
    i.status,
    ca.account_name
  FROM journal_entries je
  JOIN invoices i ON je.reference_id = i.id
  JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
  JOIN chart_of_accounts ca ON jel.account_id = ca.id
  WHERE je.company_id = p_company_id
    AND je.reference_type = 'sales_return'
    AND i.paid_amount = 0
    AND ca.sub_type = 'customer_credit'
    AND jel.credit_amount > 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. فحص حركات مخزون لفواتير ملغاة (يجب أن تكون فقط sale_return وليس sale)
CREATE OR REPLACE FUNCTION check_cancelled_invoice_transactions(p_company_id UUID)
RETURNS TABLE (
  transaction_id UUID,
  invoice_id UUID,
  invoice_number TEXT,
  transaction_type TEXT,
  quantity_change INTEGER,
  product_name TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    it.id,
    i.id,
    i.invoice_number,
    it.transaction_type,
    it.quantity_change,
    p.name
  FROM inventory_transactions it
  JOIN invoices i ON it.reference_id = i.id
  JOIN products p ON it.product_id = p.id
  WHERE it.company_id = p_company_id
    AND i.status = 'cancelled'
    AND i.return_status = 'full'
    AND it.transaction_type = 'sale'
    AND (it.is_deleted IS NULL OR it.is_deleted = false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. فحص القيود غير المتوازنة
CREATE OR REPLACE FUNCTION check_unbalanced_entries(p_company_id UUID)
RETURNS TABLE (
  journal_entry_id UUID,
  entry_date DATE,
  description TEXT,
  total_debit DECIMAL,
  total_credit DECIMAL,
  difference DECIMAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    je.id,
    je.entry_date,
    je.description,
    COALESCE(SUM(jel.debit_amount), 0) as t_debit,
    COALESCE(SUM(jel.credit_amount), 0) as t_credit,
    ABS(COALESCE(SUM(jel.debit_amount), 0) - COALESCE(SUM(jel.credit_amount), 0)) as diff
  FROM journal_entries je
  LEFT JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
  WHERE je.company_id = p_company_id
  GROUP BY je.id, je.entry_date, je.description
  HAVING ABS(COALESCE(SUM(jel.debit_amount), 0) - COALESCE(SUM(jel.credit_amount), 0)) > 0.01;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================
-- دوال الإصلاح التلقائي
-- =====================================

-- 6. مزامنة جميع أرصدة المخزون
CREATE OR REPLACE FUNCTION sync_all_stock_quantities(p_company_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_fixed_count INTEGER := 0;
BEGIN
  UPDATE products p
  SET quantity_on_hand = (
    SELECT COALESCE(SUM(it.quantity_change), 0)
    FROM inventory_transactions it
    WHERE it.product_id = p.id
    AND (it.is_deleted IS NULL OR it.is_deleted = false)
  )
  WHERE p.company_id = p_company_id
  AND p.quantity_on_hand != (
    SELECT COALESCE(SUM(it.quantity_change), 0)
    FROM inventory_transactions it
    WHERE it.product_id = p.id
    AND (it.is_deleted IS NULL OR it.is_deleted = false)
  );

  GET DIAGNOSTICS v_fixed_count = ROW_COUNT;

  RETURN jsonb_build_object('success', true, 'fixed_count', v_fixed_count);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. حذف حركات البيع للفواتير الملغاة بالكامل
CREATE OR REPLACE FUNCTION remove_cancelled_invoice_sale_transactions(p_company_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_deleted_count INTEGER := 0;
BEGIN
  DELETE FROM inventory_transactions it
  WHERE it.company_id = p_company_id
  AND it.transaction_type = 'sale'
  AND (it.is_deleted IS NULL OR it.is_deleted = false)
  AND EXISTS (
    SELECT 1 FROM invoices i
    WHERE i.id = it.reference_id
    AND i.status = 'cancelled'
    AND i.return_status = 'full'
  );

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  PERFORM sync_all_stock_quantities(p_company_id);

  RETURN jsonb_build_object('success', true, 'deleted_count', v_deleted_count);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. إصلاح قيود المرتجعات بحسابات خاطئة
CREATE OR REPLACE FUNCTION fix_wrong_return_account_entries(p_company_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_fixed_count INTEGER := 0;
  v_ar_account_id UUID;
BEGIN
  SELECT id INTO v_ar_account_id
  FROM chart_of_accounts
  WHERE company_id = p_company_id
  AND sub_type = 'accounts_receivable'
  LIMIT 1;

  IF v_ar_account_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'AR account not found');
  END IF;

  UPDATE journal_entry_lines jel
  SET
    account_id = v_ar_account_id,
    description = 'إلغاء الذمم المدينة - مرتجع'
  WHERE jel.journal_entry_id IN (
    SELECT je.id
    FROM journal_entries je
    JOIN invoices i ON je.reference_id = i.id
    JOIN journal_entry_lines jel2 ON jel2.journal_entry_id = je.id
    JOIN chart_of_accounts ca ON jel2.account_id = ca.id
    WHERE je.company_id = p_company_id
    AND je.reference_type = 'sales_return'
    AND i.paid_amount = 0
    AND ca.sub_type = 'customer_credit'
    AND jel2.credit_amount > 0
  )
  AND jel.credit_amount > 0;

  GET DIAGNOSTICS v_fixed_count = ROW_COUNT;

  RETURN jsonb_build_object('success', true, 'fixed_count', v_fixed_count);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

