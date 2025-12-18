-- =============================================
-- 📌 MANDATORY ACCOUNTING PATTERN ENFORCEMENT
-- فرض النمط المحاسبي الصارم
-- Created: 2025-12-18
-- Reference: docs/ACCOUNTING_PATTERN.md
-- =============================================

-- =============================================
-- 1. منع إنشاء قيود محاسبية على فواتير SENT
-- (فقط الفواتير PAID يجب أن يكون لها قيود)
-- =============================================
CREATE OR REPLACE FUNCTION prevent_journal_on_sent_invoice()
RETURNS TRIGGER AS $$
DECLARE
  invoice_status TEXT;
  bill_status TEXT;
BEGIN
  -- فواتير المبيعات
  IF NEW.reference_type IN ('invoice', 'invoice_cogs') AND NEW.reference_id IS NOT NULL THEN
    SELECT status INTO invoice_status FROM invoices WHERE id = NEW.reference_id;
    
    IF invoice_status = 'sent' THEN
      RAISE EXCEPTION '❌ النمط المحاسبي: لا يمكن إنشاء قيد محاسبي لفاتورة مبيعات بحالة SENT. القيود تُنشأ فقط عند الدفع (PAID)';
    END IF;
    
    IF invoice_status = 'draft' THEN
      RAISE EXCEPTION '❌ النمط المحاسبي: لا يمكن إنشاء قيد محاسبي لفاتورة مبيعات مسودة (DRAFT)';
    END IF;
  END IF;
  
  -- فواتير الشراء
  IF NEW.reference_type IN ('bill', 'bill_cogs') AND NEW.reference_id IS NOT NULL THEN
    SELECT status INTO bill_status FROM bills WHERE id = NEW.reference_id;
    
    IF bill_status = 'sent' THEN
      RAISE EXCEPTION '❌ النمط المحاسبي: لا يمكن إنشاء قيد محاسبي لفاتورة شراء بحالة SENT. القيود تُنشأ فقط عند الدفع (PAID)';
    END IF;
    
    IF bill_status = 'draft' THEN
      RAISE EXCEPTION '❌ النمط المحاسبي: لا يمكن إنشاء قيد محاسبي لفاتورة شراء مسودة (DRAFT)';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_journal_on_sent ON journal_entries;
CREATE TRIGGER trg_prevent_journal_on_sent
BEFORE INSERT ON journal_entries
FOR EACH ROW
EXECUTE FUNCTION prevent_journal_on_sent_invoice();

-- =============================================
-- 2. منع إنشاء حركات مخزون مكررة لنفس الفاتورة والمنتج
-- =============================================
CREATE OR REPLACE FUNCTION prevent_duplicate_inventory_transactions()
RETURNS TRIGGER AS $$
DECLARE
  existing_count INTEGER;
BEGIN
  -- التحقق من عدم وجود حركة مخزون سابقة لنفس المنتج والفاتورة ونوع الحركة
  IF NEW.reference_id IS NOT NULL AND NEW.product_id IS NOT NULL THEN
    SELECT COUNT(*) INTO existing_count
    FROM inventory_transactions
    WHERE reference_id = NEW.reference_id
      AND product_id = NEW.product_id
      AND transaction_type = NEW.transaction_type
      AND (is_deleted = false OR is_deleted IS NULL)
      AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);
    
    IF existing_count > 0 THEN
      RAISE EXCEPTION '❌ يوجد حركة مخزون سابقة لنفس المنتج والفاتورة. reference_id: %, product_id: %, type: %', 
        NEW.reference_id, NEW.product_id, NEW.transaction_type;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_duplicate_inventory ON inventory_transactions;
CREATE TRIGGER trg_prevent_duplicate_inventory
BEFORE INSERT ON inventory_transactions
FOR EACH ROW
EXECUTE FUNCTION prevent_duplicate_inventory_transactions();

-- =============================================
-- 3. منع حركات المخزون على فواتير DRAFT
-- =============================================
CREATE OR REPLACE FUNCTION prevent_inventory_on_draft_invoice()
RETURNS TRIGGER AS $$
DECLARE
  invoice_status TEXT;
  bill_status TEXT;
BEGIN
  -- فواتير المبيعات
  IF NEW.transaction_type = 'sale' AND NEW.reference_id IS NOT NULL THEN
    SELECT status INTO invoice_status FROM invoices WHERE id = NEW.reference_id;
    
    IF invoice_status = 'draft' THEN
      RAISE EXCEPTION '❌ النمط المحاسبي: لا يمكن إنشاء حركة مخزون لفاتورة مبيعات مسودة (DRAFT)';
    END IF;
  END IF;
  
  -- فواتير الشراء
  IF NEW.transaction_type = 'purchase' AND NEW.reference_id IS NOT NULL THEN
    SELECT status INTO bill_status FROM bills WHERE id = NEW.reference_id;
    
    IF bill_status = 'draft' THEN
      RAISE EXCEPTION '❌ النمط المحاسبي: لا يمكن إنشاء حركة مخزون لفاتورة شراء مسودة (DRAFT)';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_inventory_on_draft ON inventory_transactions;
CREATE TRIGGER trg_prevent_inventory_on_draft
BEFORE INSERT ON inventory_transactions
FOR EACH ROW
EXECUTE FUNCTION prevent_inventory_on_draft_invoice();

-- =============================================
-- رسالة نجاح
-- =============================================
DO $$
BEGIN
  RAISE NOTICE '✅ تم تثبيت حمايات النمط المحاسبي الصارم بنجاح';
  RAISE NOTICE '📌 القواعد المطبقة:';
  RAISE NOTICE '   1. منع القيود المحاسبية على فواتير SENT/DRAFT';
  RAISE NOTICE '   2. منع حركات المخزون المكررة';
  RAISE NOTICE '   3. منع حركات المخزون على فواتير DRAFT';
END $$;

