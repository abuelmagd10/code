-- =============================================
-- FIX: تصحيح الفاتورة INV-0001 وتعديل الـ Trigger
-- =============================================
-- يجب تنفيذ هذا في Supabase Dashboard → SQL Editor
-- =============================================

-- الخطوة 1: تعطيل الـ trigger مؤقتاً
DROP TRIGGER IF EXISTS trg_prevent_invoice_edit_after_journal ON invoices;

-- الخطوة 2: تصحيح الفاتورة INV-0001
-- المرتجع = 5000، الأصلي = 10000، الصافي = 5000
UPDATE invoices 
SET subtotal = 5000, 
    total_amount = 5000,
    notes = COALESCE(notes, '') || E'\n[AUTO-FIX] تصحيح قيم الفاتورة بعد المرتجع'
WHERE id = '92577072-101a-4a76-8c72-ed31a0343abd';

-- الخطوة 3: إعادة إنشاء الـ trigger مع الإصلاح
-- السماح بتخفيض القيم (مرتجعات) ومنع زيادتها فقط
CREATE OR REPLACE FUNCTION prevent_invoice_edit_after_journal()
RETURNS TRIGGER AS $fn$
DECLARE
  has_journal BOOLEAN;
BEGIN
  -- التحقق من وجود قيود محاسبية مرتبطة بالفاتورة
  SELECT EXISTS (
    SELECT 1 FROM journal_entries
    WHERE reference_type IN ('invoice', 'invoice_payment', 'invoice_cogs', 'invoice_cogs_reversal')
    AND reference_id = NEW.id
  ) INTO has_journal;

  -- إذا كان هناك قيود محاسبية
  IF has_journal THEN
    -- ❌ منع تعديل البيانات الأساسية
    IF (
      OLD.invoice_number IS DISTINCT FROM NEW.invoice_number OR
      OLD.customer_id IS DISTINCT FROM NEW.customer_id OR
      OLD.invoice_date IS DISTINCT FROM NEW.invoice_date OR
      OLD.due_date IS DISTINCT FROM NEW.due_date OR
      OLD.discount_type IS DISTINCT FROM NEW.discount_type OR
      OLD.discount_value IS DISTINCT FROM NEW.discount_value OR
      OLD.shipping IS DISTINCT FROM NEW.shipping OR
      OLD.adjustment IS DISTINCT FROM NEW.adjustment
    ) THEN
      RAISE EXCEPTION 'لا يمكن تعديل البيانات الأساسية للفاتورة بعد إنشاء قيود محاسبية';
    END IF;
    
    -- ❌ منع زيادة القيم (لكن السماح بتخفيضها للمرتجعات)
    IF (
      NEW.subtotal > OLD.subtotal OR
      NEW.tax_amount > OLD.tax_amount OR
      NEW.total_amount > OLD.total_amount
    ) THEN
      RAISE EXCEPTION 'لا يمكن زيادة قيم الفاتورة بعد إنشاء قيود محاسبية. استخدم المرتجعات لتخفيض القيم.';
    END IF;
  END IF;

  RETURN NEW;
END;
$fn$ LANGUAGE plpgsql;

-- إعادة إنشاء الـ trigger
CREATE TRIGGER trg_prevent_invoice_edit_after_journal
BEFORE UPDATE ON invoices
FOR EACH ROW
EXECUTE FUNCTION prevent_invoice_edit_after_journal();

-- الخطوة 4: التحقق من النتيجة
SELECT invoice_number, status, return_status, subtotal, total_amount, returned_amount, original_total
FROM invoices 
WHERE id = '92577072-101a-4a76-8c72-ed31a0343abd';

-- =============================================
-- ملاحظة: بعد تنفيذ هذا، قم بتحديث صفحة الفواتير
-- =============================================
