-- =============================================
-- Fix: Allow invoice updates for returns and payments
-- تصحيح: السماح بتحديث الفواتير عند المرتجعات والمدفوعات
-- =============================================

-- تعديل دالة منع تعديل الفواتير لتسمح بالتحديثات المتعلقة بالمرتجعات والمدفوعات
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

  -- إذا كان هناك قيود محاسبية، منع تعديل الحقول المحاسبية الأساسية فقط
  IF has_journal THEN
    -- ✅ الحقول المسموح بتعديلها دائماً (حتى بعد القيود):
    -- - notes, updated_at (ملاحظات)
    -- - status, return_status (حالة الفاتورة)
    -- - returned_amount (المبلغ المرتجع)
    -- - paid_amount (المبلغ المدفوع)
    -- - subtotal, tax_amount, total_amount (عند المرتجعات - تنخفض القيم)
    
    -- ❌ الحقول الممنوع تعديلها بعد القيود:
    -- - invoice_number, customer_id (بيانات أساسية)
    -- - invoice_date, due_date (تواريخ)
    -- - discount_type, discount_value (خصومات)
    -- - shipping, adjustment (شحن وتعديلات)
    
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
      RAISE EXCEPTION 'لا يمكن تعديل البيانات الأساسية للفاتورة بعد إنشاء قيود محاسبية. يمكنك فقط تعديل الملاحظات أو إجراء مرتجعات.';
    END IF;
    
    -- ✅ التحقق من أن التعديلات على القيم هي تخفيض فقط (مرتجعات)
    -- لا نسمح بزيادة القيم بعد القيود المحاسبية
    IF (
      NEW.subtotal > OLD.subtotal OR
      NEW.tax_amount > OLD.tax_amount OR
      NEW.total_amount > OLD.total_amount
    ) THEN
      RAISE EXCEPTION 'لا يمكن زيادة قيم الفاتورة بعد إنشاء قيود محاسبية. يمكنك فقط تخفيضها عبر المرتجعات.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- تحديث التعليق
COMMENT ON FUNCTION prevent_invoice_edit_after_journal() IS 
'يمنع تعديل البيانات الأساسية للفواتير بعد إنشاء قيود محاسبية، مع السماح بالتعديلات المتعلقة بالمرتجعات والمدفوعات';

-- =============================================
-- تصحيح بيانات الفاتورة INV-0001
-- =============================================
UPDATE invoices 
SET subtotal = 5000, 
    tax_amount = 0, 
    total_amount = 5000
WHERE id = '92577072-101a-4a76-8c72-ed31a0343abd'
  AND returned_amount = 5000;
