-- =====================================================
-- منع تسجيل دفعة بدون قيد فاتورة
-- Prevent recording payment without invoice journal entry
-- =====================================================
-- 
-- السبب: تم اكتشاف أن بعض الدفعات سُجلت بدون قيد الفاتورة الأصلي
-- مما أدى إلى رصيد سالب في الذمم المدينة
--
-- الحل: إضافة trigger يتحقق من وجود قيد الفاتورة قبل السماح بقيد الدفعة
-- 
-- تاريخ الإنشاء: 2025-12-15
-- =====================================================

-- دالة التحقق من وجود قيد الفاتورة قبل الدفعة
CREATE OR REPLACE FUNCTION check_invoice_entry_before_payment()
RETURNS TRIGGER AS $$
DECLARE
  invoice_entry_exists BOOLEAN;
  invoice_id UUID;
BEGIN
  -- فقط للقيود من نوع invoice_payment
  IF NEW.reference_type != 'invoice_payment' THEN
    RETURN NEW;
  END IF;
  
  -- تجاهل إذا لم يكن هناك reference_id
  IF NEW.reference_id IS NULL THEN
    RETURN NEW;
  END IF;
  
  invoice_id := NEW.reference_id;
  
  -- التحقق من وجود قيد الفاتورة
  SELECT EXISTS (
    SELECT 1 FROM journal_entries 
    WHERE reference_type = 'invoice' 
    AND reference_id = invoice_id
    AND company_id = NEW.company_id
  ) INTO invoice_entry_exists;
  
  -- إذا لم يوجد قيد فاتورة، إصدار تحذير (لا يمنع الإدراج لتجنب كسر العمليات الحالية)
  -- يمكن تغيير هذا لـ RAISE EXCEPTION لمنع الإدراج بشكل صارم
  IF NOT invoice_entry_exists THEN
    RAISE WARNING 'تحذير: يتم تسجيل دفعة (invoice_payment) للفاتورة % بدون قيد فاتورة مسبق. قد يسبب هذا رصيد سالب في الذمم المدينة.', invoice_id;
    -- لتفعيل المنع الصارم، أزل التعليق من السطر التالي:
    -- RAISE EXCEPTION 'لا يمكن تسجيل دفعة بدون قيد فاتورة. يرجى إنشاء قيد الفاتورة أولاً للفاتورة: %', invoice_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- حذف الـ trigger إذا كان موجوداً
DROP TRIGGER IF EXISTS trg_check_invoice_entry_before_payment ON journal_entries;

-- إنشاء الـ trigger
CREATE TRIGGER trg_check_invoice_entry_before_payment
  BEFORE INSERT ON journal_entries
  FOR EACH ROW
  EXECUTE FUNCTION check_invoice_entry_before_payment();

-- =====================================================
-- دالة للتدقيق على قيود الدفع بدون قيد فاتورة
-- Audit function for payments without invoice entries
-- =====================================================

CREATE OR REPLACE FUNCTION audit_payments_without_invoice_entries()
RETURNS TABLE (
  payment_journal_id UUID,
  invoice_id UUID,
  invoice_number TEXT,
  payment_date DATE,
  payment_amount NUMERIC,
  issue TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    je.id as payment_journal_id,
    je.reference_id as invoice_id,
    i.invoice_number,
    je.entry_date as payment_date,
    COALESCE(
      (SELECT SUM(jel.credit_amount) FROM journal_entry_lines jel WHERE jel.journal_entry_id = je.id),
      0
    ) as payment_amount,
    'دفعة بدون قيد فاتورة - Payment without invoice entry'::TEXT as issue
  FROM journal_entries je
  LEFT JOIN invoices i ON i.id = je.reference_id
  WHERE je.reference_type = 'invoice_payment'
  AND NOT EXISTS (
    SELECT 1 FROM journal_entries inv_je
    WHERE inv_je.reference_type = 'invoice'
    AND inv_je.reference_id = je.reference_id
    AND inv_je.company_id = je.company_id
  );
END;
$$ LANGUAGE plpgsql;

-- تعليق: لتشغيل التدقيق:
-- SELECT * FROM audit_payments_without_invoice_entries();

COMMENT ON FUNCTION check_invoice_entry_before_payment() IS 
'يتحقق من وجود قيد الفاتورة قبل السماح بتسجيل قيد الدفعة. يصدر تحذير إذا لم يوجد قيد فاتورة.';

COMMENT ON FUNCTION audit_payments_without_invoice_entries() IS 
'دالة تدقيق تُرجع جميع قيود الدفع التي ليس لها قيد فاتورة مقابل. تستخدم للكشف عن المشاكل.';

