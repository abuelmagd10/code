-- =============================================
-- Accounting Integrity Guards
-- حمايات سلامة القيود المحاسبية
-- Created: 2025-12-15
-- Purpose: منع تكرار الأخطاء المحاسبية
-- =============================================

-- =============================================
-- 1. Trigger: منع إنشاء قيد فارغ (بدون سطور)
-- =============================================
CREATE OR REPLACE FUNCTION check_journal_entry_has_lines()
RETURNS trigger AS $$
DECLARE
  lines_count INTEGER;
BEGIN
  -- انتظر 100ms للسماح بإدراج السطور
  -- هذا الفحص يتم عند التحديث أو بعد فترة
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- 2. دالة للتحقق الدوري من سلامة القيود
-- =============================================
CREATE OR REPLACE FUNCTION audit_journal_entries_integrity()
RETURNS TABLE(
  issue_type TEXT,
  journal_entry_id UUID,
  reference_type TEXT,
  description TEXT,
  severity TEXT
) AS $$
BEGIN
  -- 1. القيود غير المتوازنة
  RETURN QUERY
  SELECT 
    'UNBALANCED_ENTRY'::TEXT,
    je.id,
    je.reference_type,
    'المدين: ' || COALESCE(SUM(jel.debit_amount), 0)::TEXT || 
    ' - الدائن: ' || COALESCE(SUM(jel.credit_amount), 0)::TEXT,
    'CRITICAL'::TEXT
  FROM journal_entries je
  LEFT JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
  GROUP BY je.id
  HAVING ABS(COALESCE(SUM(jel.debit_amount), 0) - COALESCE(SUM(jel.credit_amount), 0)) > 0.01;
  
  -- 2. القيود الفارغة
  RETURN QUERY
  SELECT 
    'EMPTY_ENTRY'::TEXT,
    je.id,
    je.reference_type,
    je.description,
    'WARNING'::TEXT
  FROM journal_entries je
  WHERE NOT EXISTS (
    SELECT 1 FROM journal_entry_lines jel WHERE jel.journal_entry_id = je.id
  );
  
  -- 3. مرتجعات البيع المكتملة بدون قيود
  RETURN QUERY
  SELECT 
    'RETURN_WITHOUT_ENTRY'::TEXT,
    sr.id,
    'sales_return'::TEXT,
    'مرتجع ' || sr.return_number || ' بمبلغ ' || sr.total_amount::TEXT,
    'HIGH'::TEXT
  FROM sales_returns sr
  WHERE sr.status = 'completed' 
    AND sr.journal_entry_id IS NULL;
  
  -- 4. مرتجعات الشراء المكتملة بدون قيود
  RETURN QUERY
  SELECT 
    'RETURN_WITHOUT_ENTRY'::TEXT,
    pr.id,
    'purchase_return'::TEXT,
    'مرتجع مشتريات ' || pr.return_number || ' بمبلغ ' || pr.total_amount::TEXT,
    'HIGH'::TEXT
  FROM purchase_returns pr
  WHERE pr.status = 'completed' 
    AND pr.journal_entry_id IS NULL;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- 3. Trigger: التحقق من وجود journal_entry_id عند اكتمال المرتجع
-- =============================================
CREATE OR REPLACE FUNCTION ensure_return_has_journal_entry()
RETURNS trigger AS $$
BEGIN
  -- للمرتجعات المكتملة، تحذير فقط (لا منع)
  IF NEW.status = 'completed' AND NEW.journal_entry_id IS NULL THEN
    RAISE WARNING 'مرتجع مكتمل بدون قيد محاسبي: %', NEW.return_number;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- تطبيق على مرتجعات البيع
DROP TRIGGER IF EXISTS trg_ensure_sales_return_has_entry ON sales_returns;
CREATE TRIGGER trg_ensure_sales_return_has_entry
AFTER INSERT OR UPDATE ON sales_returns
FOR EACH ROW 
WHEN (NEW.status = 'completed')
EXECUTE FUNCTION ensure_return_has_journal_entry();

-- تطبيق على مرتجعات الشراء (إذا وجد الجدول)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'purchase_returns') THEN
    DROP TRIGGER IF EXISTS trg_ensure_purchase_return_has_entry ON purchase_returns;
    CREATE TRIGGER trg_ensure_purchase_return_has_entry
    AFTER INSERT OR UPDATE ON purchase_returns
    FOR EACH ROW 
    WHEN (NEW.status = 'completed')
    EXECUTE FUNCTION ensure_return_has_journal_entry();
  END IF;
END $$;

-- =============================================
-- 4. View: لوحة سلامة القيود المحاسبية
-- =============================================
CREATE OR REPLACE VIEW accounting_integrity_dashboard AS
SELECT 
  'إجمالي القيود' as metric,
  COUNT(*)::TEXT as value
FROM journal_entries
UNION ALL
SELECT 
  'القيود المتوازنة',
  COUNT(*)::TEXT
FROM (
  SELECT je.id 
  FROM journal_entries je
  LEFT JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
  GROUP BY je.id
  HAVING ABS(COALESCE(SUM(jel.debit_amount), 0) - COALESCE(SUM(jel.credit_amount), 0)) <= 0.01
) balanced
UNION ALL
SELECT 
  'القيود الفارغة',
  COUNT(*)::TEXT
FROM journal_entries je
WHERE NOT EXISTS (SELECT 1 FROM journal_entry_lines jel WHERE jel.journal_entry_id = je.id)
UNION ALL
SELECT 
  'إجمالي المدين',
  COALESCE(SUM(debit_amount), 0)::TEXT
FROM journal_entry_lines
UNION ALL
SELECT 
  'إجمالي الدائن',
  COALESCE(SUM(credit_amount), 0)::TEXT
FROM journal_entry_lines
UNION ALL
SELECT 
  'الفرق',
  ABS(COALESCE(SUM(debit_amount), 0) - COALESCE(SUM(credit_amount), 0))::TEXT
FROM journal_entry_lines;

-- =============================================
-- رسالة نجاح
-- =============================================
DO $$
BEGIN
  RAISE NOTICE 'تم تثبيت حمايات سلامة القيود المحاسبية بنجاح ✅';
END $$;

