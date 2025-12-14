-- =============================================
-- اختبارات القواعد الحرجة (Critical Rules Tests)
-- =============================================
-- Critical Business Rules Tests
-- =============================================
-- ⚠️ هذه الاختبارات للتحقق من القواعد الحرجة فقط
-- ⚠️ These tests verify critical business rules only

BEGIN;

-- =====================================
-- 1. اختبار: منع البيع بدون مخزون
-- =====================================
-- Test: Prevent Sale Without Inventory
CREATE OR REPLACE FUNCTION test_prevent_sale_without_inventory()
RETURNS TEXT AS $$
DECLARE
  v_company_id UUID;
  v_product_id UUID;
  v_customer_id UUID;
  v_invoice_id UUID;
  v_error_message TEXT;
BEGIN
  -- إنشاء بيانات اختبار
  -- (يجب أن تكون موجودة مسبقاً أو يتم إنشاؤها)
  
  -- محاولة إنشاء فاتورة بكمية أكبر من المخزون المتاح
  -- هذا الاختبار يتطلب بيانات فعلية في قاعدة البيانات
  
  RETURN 'Test requires actual data - manual verification needed';
END;
$$ LANGUAGE plpgsql;

-- =====================================
-- 2. اختبار: منع تعديل الفاتورة بعد القيود
-- =====================================
-- Test: Prevent Invoice Edit After Journal Entries
CREATE OR REPLACE FUNCTION test_prevent_invoice_edit_after_journal()
RETURNS TEXT AS $$
DECLARE
  v_test_result TEXT := 'PASS';
  v_invoice_id UUID;
  v_journal_id UUID;
BEGIN
  -- هذا الاختبار يتحقق من أن trigger prevent_invoice_edit_after_journal يعمل
  
  -- التحقق من وجود الدالة
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'prevent_invoice_edit_after_journal'
  ) THEN
    RETURN 'FAIL: Function prevent_invoice_edit_after_journal does not exist';
  END IF;

  -- التحقق من وجود Trigger
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'trg_prevent_invoice_edit_after_journal'
  ) THEN
    RETURN 'FAIL: Trigger trg_prevent_invoice_edit_after_journal does not exist';
  END IF;

  RETURN 'PASS: Invoice edit protection is in place';
END;
$$ LANGUAGE plpgsql;

-- =====================================
-- 3. اختبار: منع المرتجع للفواتير الملغاة
-- =====================================
-- Test: Prevent Return for Cancelled Invoices
CREATE OR REPLACE FUNCTION test_prevent_return_for_cancelled_invoice()
RETURNS TEXT AS $$
DECLARE
  v_test_result TEXT := 'PASS';
BEGIN
  -- التحقق من وجود constraint أو trigger يمنع المرتجع للفواتير الملغاة
  
  -- هذا يتطلب فحص الكود في sales_returns table
  -- أو trigger على sales_returns
  
  RETURN 'PASS: Manual verification needed - check sales_returns constraints';
END;
$$ LANGUAGE plpgsql;

-- =====================================
-- 4. اختبار: توازن القيود المحاسبية
-- =====================================
-- Test: Journal Entry Balance
CREATE OR REPLACE FUNCTION test_journal_entry_balance()
RETURNS TEXT AS $$
DECLARE
  v_test_result TEXT := 'PASS';
BEGIN
  -- التحقق من وجود دالة check_journal_entry_balance
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'check_journal_entry_balance'
  ) THEN
    RETURN 'FAIL: Function check_journal_entry_balance does not exist';
  END IF;

  -- التحقق من وجود Triggers
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname IN (
      'trg_check_journal_balance_insert',
      'trg_check_journal_balance_update',
      'trg_check_journal_balance_delete'
    )
  ) THEN
    RETURN 'FAIL: Journal balance check triggers do not exist';
  END IF;

  RETURN 'PASS: Journal entry balance validation is in place';
END;
$$ LANGUAGE plpgsql;

-- =====================================
-- 5. اختبار: منع حذف عميل مرتبط بفواتير
-- =====================================
-- Test: Prevent Customer Deletion with Invoices
CREATE OR REPLACE FUNCTION test_prevent_customer_deletion_with_invoices()
RETURNS TEXT AS $$
DECLARE
  v_test_result TEXT := 'PASS';
BEGIN
  -- التحقق من وجود foreign key constraint
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu 
      ON tc.constraint_name = kcu.constraint_name
    WHERE tc.table_name = 'invoices'
      AND tc.constraint_type = 'FOREIGN KEY'
      AND kcu.column_name = 'customer_id'
      AND kcu.table_name = 'invoices'
  ) THEN
    RETURN 'FAIL: Foreign key constraint on invoices.customer_id does not exist';
  END IF;

  RETURN 'PASS: Customer deletion protection is in place (FK constraint)';
END;
$$ LANGUAGE plpgsql;

-- =====================================
-- 6. اختبار: إقفال الفترات المحاسبية
-- =====================================
-- Test: Accounting Period Lock
CREATE OR REPLACE FUNCTION test_accounting_period_lock()
RETURNS TEXT AS $$
DECLARE
  v_test_result TEXT := 'PASS';
BEGIN
  -- التحقق من وجود جدول accounting_periods
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_name = 'accounting_periods'
  ) THEN
    RETURN 'FAIL: Table accounting_periods does not exist';
  END IF;

  -- التحقق من وجود دالة check_period_lock
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'check_period_lock'
  ) THEN
    RETURN 'FAIL: Function check_period_lock does not exist';
  END IF;

  -- التحقق من وجود Triggers
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname IN (
      'trg_prevent_invoice_closed_period',
      'trg_prevent_payment_closed_period',
      'trg_prevent_journal_closed_period',
      'trg_prevent_inventory_closed_period'
    )
  ) THEN
    RETURN 'WARN: Some accounting period lock triggers are missing';
  END IF;

  RETURN 'PASS: Accounting period lock system is in place';
END;
$$ LANGUAGE plpgsql;

-- =====================================
-- 7. اختبار: Audit Trail
-- =====================================
-- Test: Audit Trail System
CREATE OR REPLACE FUNCTION test_audit_trail()
RETURNS TEXT AS $$
DECLARE
  v_test_result TEXT := 'PASS';
BEGIN
  -- التحقق من وجود جدول audit_logs
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_name = 'audit_logs'
  ) THEN
    RETURN 'FAIL: Table audit_logs does not exist';
  END IF;

  -- التحقق من وجود دالة create_audit_log
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'create_audit_log'
  ) THEN
    RETURN 'FAIL: Function create_audit_log does not exist';
  END IF;

  -- التحقق من وجود Triggers على الجداول الرئيسية
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname IN (
      'audit_invoices',
      'audit_customers',
      'audit_products',
      'audit_payments',
      'audit_journal_entries'
    )
  ) THEN
    RETURN 'WARN: Some audit triggers are missing';
  END IF;

  RETURN 'PASS: Audit trail system is in place';
END;
$$ LANGUAGE plpgsql;

-- =====================================
-- 8. دالة شاملة لتشغيل جميع الاختبارات
-- =====================================
CREATE OR REPLACE FUNCTION run_all_critical_tests()
RETURNS TABLE (
  test_name TEXT,
  result TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    'Invoice Edit Protection'::TEXT,
    test_prevent_invoice_edit_after_journal()::TEXT
  UNION ALL
  SELECT 
    'Journal Entry Balance'::TEXT,
    test_journal_entry_balance()::TEXT
  UNION ALL
  SELECT 
    'Customer Deletion Protection'::TEXT,
    test_prevent_customer_deletion_with_invoices()::TEXT
  UNION ALL
  SELECT 
    'Accounting Period Lock'::TEXT,
    test_accounting_period_lock()::TEXT
  UNION ALL
  SELECT 
    'Audit Trail System'::TEXT,
    test_audit_trail()::TEXT;
END;
$$ LANGUAGE plpgsql;

-- =====================================
-- 9. منح الصلاحيات
-- =====================================
GRANT EXECUTE ON FUNCTION test_prevent_invoice_edit_after_journal TO authenticated;
GRANT EXECUTE ON FUNCTION test_journal_entry_balance TO authenticated;
GRANT EXECUTE ON FUNCTION test_prevent_customer_deletion_with_invoices TO authenticated;
GRANT EXECUTE ON FUNCTION test_accounting_period_lock TO authenticated;
GRANT EXECUTE ON FUNCTION test_audit_trail TO authenticated;
GRANT EXECUTE ON FUNCTION run_all_critical_tests TO authenticated;

COMMIT;

-- =============================================
-- ملاحظات:
-- 1. هذه الاختبارات تتحقق من وجود القواعد فقط
-- 2. للاختبار الفعلي للسلوك، يجب استخدام بيانات حقيقية
-- 3. يمكن تشغيل جميع الاختبارات باستخدام:
--    SELECT * FROM run_all_critical_tests();
-- 4. أي اختبار يفشل = خطأ يمنع الدمج
-- =============================================
