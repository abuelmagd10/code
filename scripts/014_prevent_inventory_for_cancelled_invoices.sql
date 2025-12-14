-- =============================================
-- Phase 1: Critical Fix - منع حركات مخزون للفواتير الملغاة
-- =============================================
-- يمنع إنشاء حركات مخزون للفواتير أو الفواتير الملغاة
-- Critical Fix: Prevent Inventory Transactions for Cancelled Invoices/Bills
-- =============================================

-- دالة للتحقق من حالة الفاتورة/الفاتورة قبل إنشاء حركة مخزون
CREATE OR REPLACE FUNCTION prevent_inventory_for_cancelled()
RETURNS TRIGGER AS $$
DECLARE
  invoice_status TEXT;
  bill_status TEXT;
  po_status TEXT;
BEGIN
  -- إذا كانت الحركة مرتبطة بفاتورة بيع
  IF NEW.transaction_type IN ('sale', 'sale_reversal') AND NEW.reference_id IS NOT NULL THEN
    SELECT status INTO invoice_status
    FROM invoices
    WHERE id = NEW.reference_id;

    -- إذا كانت الفاتورة ملغاة، منع إنشاء الحركة
    IF invoice_status = 'cancelled' THEN
      RAISE EXCEPTION 'لا يمكن إنشاء حركة مخزون لفاتورة ملغاة (invoice_id: %)', NEW.reference_id;
    END IF;
  END IF;

  -- إذا كانت الحركة مرتبطة بفاتورة شراء
  IF NEW.transaction_type IN ('purchase', 'purchase_reversal') AND NEW.reference_id IS NOT NULL THEN
    SELECT status INTO bill_status
    FROM bills
    WHERE id = NEW.reference_id;

    -- إذا كانت الفاتورة ملغاة، منع إنشاء الحركة
    IF bill_status = 'cancelled' THEN
      RAISE EXCEPTION 'لا يمكن إنشاء حركة مخزون لفاتورة شراء ملغاة (bill_id: %)', NEW.reference_id;
    END IF;
  END IF;

  -- إذا كانت الحركة مرتبطة بأمر شراء
  IF NEW.transaction_type IN ('purchase', 'purchase_reversal') AND NEW.reference_id IS NOT NULL THEN
    -- التحقق من وجود أمر شراء بهذا ID
    SELECT status INTO po_status
    FROM purchase_orders
    WHERE id = NEW.reference_id;

    -- إذا كان أمر الشراء ملغى، منع إنشاء الحركة
    IF po_status = 'cancelled' THEN
      RAISE EXCEPTION 'لا يمكن إنشاء حركة مخزون لأمر شراء ملغى (purchase_order_id: %)', NEW.reference_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger قبل إدراج حركات المخزون
DROP TRIGGER IF EXISTS trg_prevent_inventory_for_cancelled ON inventory_transactions;
CREATE TRIGGER trg_prevent_inventory_for_cancelled
BEFORE INSERT ON inventory_transactions
FOR EACH ROW
EXECUTE FUNCTION prevent_inventory_for_cancelled();

-- =============================================
-- ملاحظات:
-- 1. يعمل BEFORE INSERT لرفض الحركة قبل إنشائها
-- 2. يتحقق من حالة الفاتورة/الفاتورة/أمر الشراء
-- 3. يطبق على sale, sale_reversal, purchase, purchase_reversal
-- 4. يسمح بـ adjustment بدون مرجع (للتسويات اليدوية)
-- =============================================

COMMENT ON FUNCTION prevent_inventory_for_cancelled() IS 
'Phase 1 Critical Fix: يمنع إنشاء حركات مخزون للفواتير/الفواتير الملغاة';

