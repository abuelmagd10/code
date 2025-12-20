-- تحسين النمط المحاسبي الصارم لأوامر البيع والشراء
-- إضافة التحققات المفقودة والحماية الإضافية

-- 1. دالة منع تعديل الفاتورة مباشرة عندما تكون مرتبطة بأمر في حالة مسودة
CREATE OR REPLACE FUNCTION prevent_direct_invoice_edit_when_linked_to_draft_order()
RETURNS TRIGGER AS $$
BEGIN
  -- التحقق من وجود أمر بيع مرتبط في حالة مسودة
  IF NEW.sales_order_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM sales_orders 
      WHERE id = NEW.sales_order_id 
      AND status = 'draft'
    ) THEN
      RAISE EXCEPTION 'لا يمكن تعديل الفاتورة مباشرة. يجب التعديل من خلال أمر البيع المرتبط في حالة المسودة.';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. دالة منع تعديل فاتورة الشراء مباشرة عندما تكون مرتبطة بأمر في حالة مسودة
CREATE OR REPLACE FUNCTION prevent_direct_bill_edit_when_linked_to_draft_order()
RETURNS TRIGGER AS $$
BEGIN
  -- التحقق من وجود أمر شراء مرتبط في حالة مسودة
  IF NEW.purchase_order_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM purchase_orders 
      WHERE id = NEW.purchase_order_id 
      AND status = 'draft'
    ) THEN
      RAISE EXCEPTION 'لا يمكن تعديل فاتورة الشراء مباشرة. يجب التعديل من خلال أمر الشراء المرتبط في حالة المسودة.';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. دالة التحقق من حالة الدفع قبل السماح بالتعديل
CREATE OR REPLACE FUNCTION check_payment_status_before_order_edit()
RETURNS TRIGGER AS $$
BEGIN
  -- للأوامر البيع: التحقق من حالة الدفع
  IF TG_TABLE_NAME = 'sales_orders' THEN
    IF EXISTS (
      SELECT 1 FROM invoices i
      JOIN invoice_payments ip ON i.id = ip.invoice_id
      WHERE i.sales_order_id = NEW.id
      AND ip.amount > 0
    ) THEN
      RAISE EXCEPTION 'لا يمكن تعديل أمر البيع. الفاتورة المرتبطة مدفوعة جزئياً أو كلياً. يجب التعديل من خلال الفاتورة فقط.';
    END IF;
  END IF;
  
  -- لأوامر الشراء: التحقق من حالة الدفع
  IF TG_TABLE_NAME = 'purchase_orders' THEN
    IF EXISTS (
      SELECT 1 FROM bills b
      JOIN bill_payments bp ON b.id = bp.bill_id
      WHERE b.purchase_order_id = NEW.id
      AND bp.amount > 0
    ) THEN
      RAISE EXCEPTION 'لا يمكن تعديل أمر الشراء. الفاتورة المرتبطة مدفوعة جزئياً أو كلياً. يجب التعديل من خلال الفاتورة فقط.';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. إنشاء Triggers للحماية الإضافية
DROP TRIGGER IF EXISTS prevent_direct_invoice_edit_trigger ON invoices;
CREATE TRIGGER prevent_direct_invoice_edit_trigger
  BEFORE UPDATE ON invoices
  FOR EACH ROW
  EXECUTE FUNCTION prevent_direct_invoice_edit_when_linked_to_draft_order();

DROP TRIGGER IF EXISTS prevent_direct_bill_edit_trigger ON bills;
CREATE TRIGGER prevent_direct_bill_edit_trigger
  BEFORE UPDATE ON bills
  FOR EACH ROW
  EXECUTE FUNCTION prevent_direct_bill_edit_when_linked_to_draft_order();

-- 5. إضافة التحقق من حالة الدفع للـ triggers الموجودة
DROP TRIGGER IF EXISTS check_payment_status_so_trigger ON sales_orders;
CREATE TRIGGER check_payment_status_so_trigger
  BEFORE UPDATE ON sales_orders
  FOR EACH ROW
  EXECUTE FUNCTION check_payment_status_before_order_edit();

DROP TRIGGER IF EXISTS check_payment_status_po_trigger ON purchase_orders;
CREATE TRIGGER check_payment_status_po_trigger
  BEFORE UPDATE ON purchase_orders
  FOR EACH ROW
  EXECUTE FUNCTION check_payment_status_before_order_edit();

-- 6. دالة للتحقق من صحة النمط المحاسبي
CREATE OR REPLACE FUNCTION validate_accounting_pattern()
RETURNS TABLE(
  check_name TEXT,
  status TEXT,
  details TEXT
) AS $$
BEGIN
  -- التحقق من وجود الـ triggers المطلوبة
  RETURN QUERY
  SELECT 
    'Sales Order Edit Protection'::TEXT,
    CASE WHEN EXISTS (
      SELECT 1 FROM pg_trigger 
      WHERE tgname = 'prevent_so_edit_trigger'
    ) THEN 'OK' ELSE 'MISSING' END::TEXT,
    'Prevents editing sales orders after invoice is sent'::TEXT;
    
  RETURN QUERY
  SELECT 
    'Purchase Order Edit Protection'::TEXT,
    CASE WHEN EXISTS (
      SELECT 1 FROM pg_trigger 
      WHERE tgname = 'prevent_po_edit_trigger'
    ) THEN 'OK' ELSE 'MISSING' END::TEXT,
    'Prevents editing purchase orders after bill is sent'::TEXT;
    
  RETURN QUERY
  SELECT 
    'Direct Invoice Edit Protection'::TEXT,
    CASE WHEN EXISTS (
      SELECT 1 FROM pg_trigger 
      WHERE tgname = 'prevent_direct_invoice_edit_trigger'
    ) THEN 'OK' ELSE 'MISSING' END::TEXT,
    'Prevents direct invoice editing when linked to draft order'::TEXT;
    
  RETURN QUERY
  SELECT 
    'Direct Bill Edit Protection'::TEXT,
    CASE WHEN EXISTS (
      SELECT 1 FROM pg_trigger 
      WHERE tgname = 'prevent_direct_bill_edit_trigger'
    ) THEN 'OK' ELSE 'MISSING' END::TEXT,
    'Prevents direct bill editing when linked to draft order'::TEXT;
END;
$$ LANGUAGE plpgsql;

-- 7. تحسين دالة المزامنة لتشمل التحقق من الحالة
CREATE OR REPLACE FUNCTION enhanced_sync_sales_order_from_invoice()
RETURNS TRIGGER AS $$
BEGIN
  -- تحديث أمر البيع فقط إذا كان في حالة غير مسودة
  IF NEW.sales_order_id IS NOT NULL THEN
    -- التحقق من حالة أمر البيع
    IF EXISTS (
      SELECT 1 FROM sales_orders 
      WHERE id = NEW.sales_order_id 
      AND status != 'draft'
    ) THEN
      UPDATE sales_orders 
      SET 
        subtotal = NEW.subtotal,
        tax_amount = NEW.tax_amount,
        total = NEW.total_amount,
        updated_at = NOW()
      WHERE id = NEW.sales_order_id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 8. تحسين دالة المزامنة لأوامر الشراء
CREATE OR REPLACE FUNCTION enhanced_sync_purchase_order_from_bill()
RETURNS TRIGGER AS $$
BEGIN
  -- تحديث أمر الشراء فقط إذا كان في حالة غير مسودة
  IF NEW.purchase_order_id IS NOT NULL THEN
    -- التحقق من حالة أمر الشراء
    IF EXISTS (
      SELECT 1 FROM purchase_orders 
      WHERE id = NEW.purchase_order_id 
      AND status != 'draft'
    ) THEN
      UPDATE purchase_orders 
      SET 
        subtotal = NEW.subtotal,
        tax_amount = NEW.tax_amount,
        total = NEW.total_amount,
        updated_at = NOW()
      WHERE id = NEW.purchase_order_id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 9. تحديث الـ triggers للمزامنة المحسنة
DROP TRIGGER IF EXISTS sync_so_from_invoice_trigger ON invoices;
CREATE TRIGGER sync_so_from_invoice_trigger
  AFTER UPDATE ON invoices
  FOR EACH ROW
  EXECUTE FUNCTION enhanced_sync_sales_order_from_invoice();

DROP TRIGGER IF EXISTS sync_po_from_bill_trigger ON bills;
CREATE TRIGGER sync_po_from_bill_trigger
  AFTER UPDATE ON bills
  FOR EACH ROW
  EXECUTE FUNCTION enhanced_sync_purchase_order_from_bill();

-- 10. التحقق من التطبيق
SELECT 'تم تطبيق التحسينات على النمط المحاسبي بنجاح' as status;

-- عرض حالة النمط المحاسبي
SELECT * FROM validate_accounting_pattern();