-- =============================================
-- Phase 1: Critical Fix - منع خروج مخزون بدون فاتورة
-- =============================================
-- يضمن أن حركات البيع يجب أن يكون لها reference_id
-- Critical Fix: Prevent Inventory Sale Without Reference
-- =============================================

-- إضافة constraint: حركات البيع يجب أن يكون لها reference_id
-- هذا يمنع خروج مخزون بدون فاتورة أو مستند مرجعي

-- التحقق من وجود العمود أولاً
DO $$
BEGIN
  -- إضافة constraint لحركات البيع
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'check_sale_has_reference'
  ) THEN
    ALTER TABLE inventory_transactions
    ADD CONSTRAINT check_sale_has_reference
    CHECK (
      transaction_type != 'sale' OR reference_id IS NOT NULL
    );
  END IF;

  -- إضافة constraint لحركات عكس البيع
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'check_sale_reversal_has_reference'
  ) THEN
    ALTER TABLE inventory_transactions
    ADD CONSTRAINT check_sale_reversal_has_reference
    CHECK (
      transaction_type != 'sale_reversal' OR reference_id IS NOT NULL
    );
  END IF;

  -- إضافة constraint لحركات الشراء (اختياري لكن يُفضل)
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'check_purchase_has_reference'
  ) THEN
    ALTER TABLE inventory_transactions
    ADD CONSTRAINT check_purchase_has_reference
    CHECK (
      transaction_type != 'purchase' OR reference_id IS NOT NULL
    );
  END IF;

  -- إضافة constraint لحركات عكس الشراء
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'check_purchase_reversal_has_reference'
  ) THEN
    ALTER TABLE inventory_transactions
    ADD CONSTRAINT check_purchase_reversal_has_reference
    CHECK (
      transaction_type != 'purchase_reversal' OR reference_id IS NOT NULL
    );
  END IF;
END $$;

-- =============================================
-- ملاحظات:
-- 1. يمنع إنشاء حركة بيع بدون reference_id
-- 2. يطبق على sale, sale_reversal, purchase, purchase_reversal
-- 3. يسمح بـ adjustment بدون reference_id (للتسويات اليدوية)
-- =============================================

COMMENT ON CONSTRAINT check_sale_has_reference ON inventory_transactions IS 
'Phase 1 Critical Fix: يمنع خروج مخزون بدون فاتورة';

COMMENT ON CONSTRAINT check_sale_reversal_has_reference ON inventory_transactions IS 
'Phase 1 Critical Fix: يمنع عكس بيع بدون مرجع';

COMMENT ON CONSTRAINT check_purchase_has_reference ON inventory_transactions IS 
'Phase 1 Critical Fix: يمنع شراء بدون فاتورة';

COMMENT ON CONSTRAINT check_purchase_reversal_has_reference ON inventory_transactions IS 
'Phase 1 Critical Fix: يمنع عكس شراء بدون مرجع';

