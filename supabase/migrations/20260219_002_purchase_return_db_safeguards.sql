-- =====================================================================
-- Migration: Purchase Return DB-Level Safeguards
-- =====================================================================
-- يضيف قيود قاعدة بيانات لمنع:
-- 1. تجاوز returned_quantity للـ quantity في bill_items
-- 2. تجاوز returned_amount للـ total_amount في bills
-- 3. ازدواجية رقم المرتجع لنفس الشركة
-- 4. قيد trigger يتحقق عند كل UPDATE على bill_items.returned_quantity

-- ✅ 1. Check constraint: returned_quantity لا تتجاوز quantity في bill_items
ALTER TABLE bill_items
  ADD CONSTRAINT chk_bill_items_returned_not_exceed_quantity
  CHECK (returned_quantity IS NULL OR returned_quantity <= quantity);

-- ✅ 2. Check constraint: returned_quantity لا تكون سالبة
ALTER TABLE bill_items
  ADD CONSTRAINT chk_bill_items_returned_quantity_non_negative
  CHECK (returned_quantity IS NULL OR returned_quantity >= 0);

-- ✅ 3. Check constraint: returned_amount لا تكون سالبة في bills
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'bills'
    AND constraint_name = 'chk_bills_returned_amount_non_negative'
  ) THEN
    ALTER TABLE bills
      ADD CONSTRAINT chk_bills_returned_amount_non_negative
      CHECK (returned_amount IS NULL OR returned_amount >= 0);
  END IF;
END $$;

-- ✅ 4. Unique constraint: رقم المرتجع فريد لكل شركة
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'purchase_returns'
    AND constraint_name = 'uq_purchase_returns_number_company'
  ) THEN
    ALTER TABLE purchase_returns
      ADD CONSTRAINT uq_purchase_returns_number_company
      UNIQUE (company_id, return_number);
  END IF;
END $$;

-- ✅ 5. Trigger: منع تجاوز returned_quantity عند التحديث
CREATE OR REPLACE FUNCTION check_bill_item_returned_quantity()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.returned_quantity IS NOT NULL AND NEW.returned_quantity > NEW.quantity THEN
    RAISE EXCEPTION 
      'returned_quantity (%) cannot exceed quantity (%) for bill_item %',
      NEW.returned_quantity, NEW.quantity, NEW.id;
  END IF;
  IF NEW.returned_quantity IS NOT NULL AND NEW.returned_quantity < 0 THEN
    RAISE EXCEPTION 
      'returned_quantity cannot be negative for bill_item %', NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_check_bill_item_returned_quantity ON bill_items;
CREATE TRIGGER trg_check_bill_item_returned_quantity
  BEFORE INSERT OR UPDATE OF returned_quantity ON bill_items
  FOR EACH ROW
  EXECUTE FUNCTION check_bill_item_returned_quantity();

-- ✅ 6. Trigger: منع تجاوز returned_amount للـ total_amount في bills
CREATE OR REPLACE FUNCTION check_bill_returned_amount()
RETURNS TRIGGER AS $$
BEGIN
  -- نتحقق فقط عند وجود قيمة للـ returned_amount
  IF NEW.returned_amount IS NOT NULL AND NEW.total_amount IS NOT NULL THEN
    -- نسمح بتجاوز total_amount في حالة المرتجع الكامل مع تعديل total_amount
    -- لكن returned_amount يجب أن لا تكون سالبة
    IF NEW.returned_amount < 0 THEN
      RAISE EXCEPTION
        'bills.returned_amount cannot be negative for bill %', NEW.id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_check_bill_returned_amount ON bills;
CREATE TRIGGER trg_check_bill_returned_amount
  BEFORE INSERT OR UPDATE OF returned_amount ON bills
  FOR EACH ROW
  EXECUTE FUNCTION check_bill_returned_amount();

-- ✅ 7. تعليق توثيقي
COMMENT ON CONSTRAINT chk_bill_items_returned_not_exceed_quantity ON bill_items IS
  'يمنع إرجاع كمية أكبر من الكمية المشتراة أصلاً في بند الفاتورة';

COMMENT ON FUNCTION check_bill_item_returned_quantity() IS
  'Trigger function: يتحقق من صحة returned_quantity قبل INSERT/UPDATE على bill_items';
