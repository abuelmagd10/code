-- تطبيق النمط المحاسبي الصارم لأوامر البيع والشراء
-- منع تعديل الأوامر بعد إرسال الفواتير المرتبطة

-- 1. دالة منع تعديل أمر البيع بعد إرسال الفاتورة
CREATE OR REPLACE FUNCTION prevent_sales_order_edit_after_sent()
RETURNS TRIGGER AS $$
BEGIN
  -- التحقق من وجود فاتورة مرتبطة بحالة غير مسودة
  IF EXISTS (
    SELECT 1 FROM invoices 
    WHERE sales_order_id = NEW.id 
    AND status != 'draft'
  ) THEN
    RAISE EXCEPTION 'لا يمكن تعديل أمر البيع بعد إرسال الفاتورة المرتبطة. يجب التعديل من خلال الفاتورة فقط.';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. دالة منع تعديل أمر الشراء بعد إرسال الفاتورة
CREATE OR REPLACE FUNCTION prevent_purchase_order_edit_after_sent()
RETURNS TRIGGER AS $$
BEGIN
  -- التحقق من وجود فاتورة شراء مرتبطة بحالة غير مسودة
  IF EXISTS (
    SELECT 1 FROM bills 
    WHERE purchase_order_id = NEW.id 
    AND status != 'draft'
  ) THEN
    RAISE EXCEPTION 'لا يمكن تعديل أمر الشراء بعد إرسال الفاتورة المرتبطة. يجب التعديل من خلال الفاتورة فقط.';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. دالة منع حذف أمر البيع بعد إرسال الفاتورة
CREATE OR REPLACE FUNCTION prevent_sales_order_delete_after_sent()
RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM invoices 
    WHERE sales_order_id = OLD.id 
    AND status != 'draft'
  ) THEN
    RAISE EXCEPTION 'لا يمكن حذف أمر البيع بعد إرسال الفاتورة المرتبطة.';
  END IF;
  
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- 4. دالة منع حذف أمر الشراء بعد إرسال الفاتورة
CREATE OR REPLACE FUNCTION prevent_purchase_order_delete_after_sent()
RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM bills 
    WHERE purchase_order_id = OLD.id 
    AND status != 'draft'
  ) THEN
    RAISE EXCEPTION 'لا يمكن حذف أمر الشراء بعد إرسال الفاتورة المرتبطة.';
  END IF;
  
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- 5. إنشاء Triggers لأوامر البيع
DROP TRIGGER IF EXISTS prevent_so_edit_trigger ON sales_orders;
CREATE TRIGGER prevent_so_edit_trigger
  BEFORE UPDATE ON sales_orders
  FOR EACH ROW
  EXECUTE FUNCTION prevent_sales_order_edit_after_sent();

DROP TRIGGER IF EXISTS prevent_so_delete_trigger ON sales_orders;
CREATE TRIGGER prevent_so_delete_trigger
  BEFORE DELETE ON sales_orders
  FOR EACH ROW
  EXECUTE FUNCTION prevent_sales_order_delete_after_sent();

-- 6. إنشاء Triggers لأوامر الشراء
DROP TRIGGER IF EXISTS prevent_po_edit_trigger ON purchase_orders;
CREATE TRIGGER prevent_po_edit_trigger
  BEFORE UPDATE ON purchase_orders
  FOR EACH ROW
  EXECUTE FUNCTION prevent_purchase_order_edit_after_sent();

DROP TRIGGER IF EXISTS prevent_po_delete_trigger ON purchase_orders;
CREATE TRIGGER prevent_po_delete_trigger
  BEFORE DELETE ON purchase_orders
  FOR EACH ROW
  EXECUTE FUNCTION prevent_purchase_order_delete_after_sent();

-- 7. دالة تحديث أمر البيع عند تعديل الفاتورة (اختياري)
CREATE OR REPLACE FUNCTION sync_sales_order_from_invoice()
RETURNS TRIGGER AS $$
BEGIN
  -- تحديث إجمالي أمر البيع عند تعديل الفاتورة
  IF NEW.sales_order_id IS NOT NULL THEN
    UPDATE sales_orders 
    SET 
      subtotal = NEW.subtotal,
      tax_amount = NEW.tax_amount,
      total = NEW.total_amount,
      updated_at = NOW()
    WHERE id = NEW.sales_order_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 8. دالة تحديث أمر الشراء عند تعديل فاتورة الشراء (اختياري)
CREATE OR REPLACE FUNCTION sync_purchase_order_from_bill()
RETURNS TRIGGER AS $$
BEGIN
  -- تحديث إجمالي أمر الشراء عند تعديل الفاتورة
  IF NEW.purchase_order_id IS NOT NULL THEN
    UPDATE purchase_orders 
    SET 
      subtotal = NEW.subtotal,
      tax_amount = NEW.tax_amount,
      total = NEW.total_amount,
      updated_at = NOW()
    WHERE id = NEW.purchase_order_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 9. Triggers للمزامنة (اختياري)
DROP TRIGGER IF EXISTS sync_so_from_invoice_trigger ON invoices;
CREATE TRIGGER sync_so_from_invoice_trigger
  AFTER UPDATE ON invoices
  FOR EACH ROW
  EXECUTE FUNCTION sync_sales_order_from_invoice();

DROP TRIGGER IF EXISTS sync_po_from_bill_trigger ON bills;
CREATE TRIGGER sync_po_from_bill_trigger
  AFTER UPDATE ON bills
  FOR EACH ROW
  EXECUTE FUNCTION sync_purchase_order_from_bill();

-- 10. التحقق من التطبيق
SELECT 'تم تطبيق النمط المحاسبي الصارم لأوامر البيع والشراء بنجاح' as status;