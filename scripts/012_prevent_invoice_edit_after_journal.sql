-- =============================================
-- Phase 1: Critical Fix - منع تعديل الفواتير بعد إنشاء قيود محاسبية
-- =============================================
-- يمنع تعديل الحقول المحاسبية في الفواتير بعد إنشاء قيود
-- Critical Fix: Prevent Invoice Edit After Journal Entries
-- =============================================

-- دالة للتحقق من وجود قيود محاسبية ومنع التعديل
CREATE OR REPLACE FUNCTION prevent_invoice_edit_after_journal()
RETURNS TRIGGER AS $$
DECLARE
  has_journal BOOLEAN;
BEGIN
  -- التحقق من وجود قيود محاسبية مرتبطة بالفاتورة
  SELECT EXISTS (
    SELECT 1 FROM journal_entries
    WHERE reference_type IN ('invoice', 'invoice_payment', 'invoice_cogs', 'invoice_cogs_reversal')
    AND reference_id = NEW.id
  ) INTO has_journal;

  -- إذا كان هناك قيود محاسبية، منع تعديل الحقول المحاسبية
  IF has_journal THEN
    -- السماح بتعديل الحقول غير المحاسبية فقط (notes, updated_at)
    -- منع تعديل الحقول المحاسبية
    IF (
      OLD.invoice_number IS DISTINCT FROM NEW.invoice_number OR
      OLD.customer_id IS DISTINCT FROM NEW.customer_id OR
      OLD.invoice_date IS DISTINCT FROM NEW.invoice_date OR
      OLD.due_date IS DISTINCT FROM NEW.due_date OR
      OLD.subtotal IS DISTINCT FROM NEW.subtotal OR
      OLD.tax_amount IS DISTINCT FROM NEW.tax_amount OR
      OLD.total_amount IS DISTINCT FROM NEW.total_amount OR
      OLD.discount_type IS DISTINCT FROM NEW.discount_type OR
      OLD.discount_value IS DISTINCT FROM NEW.discount_value OR
      OLD.shipping IS DISTINCT FROM NEW.shipping OR
      OLD.adjustment IS DISTINCT FROM NEW.adjustment
    ) THEN
      RAISE EXCEPTION 'لا يمكن تعديل الفاتورة بعد إنشاء قيود محاسبية. يمكنك فقط تعديل الملاحظات (notes)';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger قبل تحديث الفواتير
DROP TRIGGER IF EXISTS trg_prevent_invoice_edit_after_journal ON invoices;
CREATE TRIGGER trg_prevent_invoice_edit_after_journal
BEFORE UPDATE ON invoices
FOR EACH ROW
EXECUTE FUNCTION prevent_invoice_edit_after_journal();

-- =============================================
-- ملاحظات:
-- 1. يمنع تعديل الحقول المحاسبية فقط
-- 2. يسمح بتعديل notes و updated_at
-- 3. يعمل BEFORE UPDATE لرفض التعديل قبل تنفيذه
-- =============================================

COMMENT ON FUNCTION prevent_invoice_edit_after_journal() IS 
'Phase 1 Critical Fix: يمنع تعديل الفواتير بعد إنشاء قيود محاسبية';

