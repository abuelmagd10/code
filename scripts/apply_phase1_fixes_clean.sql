-- =============================================
-- Phase 1: تطبيق جميع الإصلاحات الحرجة
-- =============================================
-- هذا الملف يطبق جميع ملفات SQL لـ Phase 1 بالترتيب
-- Phase 1: Apply All Critical Fixes
-- =============================================
-- ⚠️ التحذير: تأكد من عمل نسخة احتياطية قبل التطبيق!
-- WARNING: Make sure to backup the database before applying!

BEGIN;

-- =============================================
-- 1. تحقق من توازن القيود المحاسبية
-- =============================================
-- Applying: Journal Entry Balance Check...

-- دالة للتحقق من توازن القيد (المدين = الدائن)
CREATE OR REPLACE FUNCTION check_journal_entry_balance()
RETURNS TRIGGER AS $$
DECLARE
  total_debit DECIMAL(15, 2);
  total_credit DECIMAL(15, 2);
  entry_id UUID;
BEGIN
  -- تحديد journal_entry_id حسب نوع العملية
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    entry_id := NEW.journal_entry_id;
  ELSE
    entry_id := OLD.journal_entry_id;
  END IF;

  -- حساب مجموع المدين والدائن لجميع سطور القيد
  SELECT 
    COALESCE(SUM(debit_amount), 0),
    COALESCE(SUM(credit_amount), 0)
  INTO total_debit, total_credit
  FROM journal_entry_lines
  WHERE journal_entry_id = entry_id;

  -- التحقق من التوازن (مع هامش خطأ صغير للتقريب - 0.01)
  IF ABS(total_debit - total_credit) > 0.01 THEN
    RAISE EXCEPTION 'القيد غير متوازن: المدين = %, الدائن = %. الفرق = %', 
      total_debit, total_credit, ABS(total_debit - total_credit);
  END IF;

  -- إذا كانت العملية DELETE، نرجع OLD
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers
-- DEFERRABLE INITIALLY DEFERRED: يؤجل التحقق حتى نهاية المعاملة
-- هذا يسمح بإدراج عدة سطور في نفس المعاملة قبل التحقق من التوازن
DROP TRIGGER IF EXISTS trg_check_journal_balance_insert ON journal_entry_lines;
CREATE TRIGGER trg_check_journal_balance_insert
AFTER INSERT ON journal_entry_lines
FOR EACH ROW
DEFERRABLE INITIALLY DEFERRED
EXECUTE FUNCTION check_journal_entry_balance();

DROP TRIGGER IF EXISTS trg_check_journal_balance_update ON journal_entry_lines;
CREATE TRIGGER trg_check_journal_balance_update
AFTER UPDATE ON journal_entry_lines
FOR EACH ROW
DEFERRABLE INITIALLY DEFERRED
EXECUTE FUNCTION check_journal_entry_balance();

DROP TRIGGER IF EXISTS trg_check_journal_balance_delete ON journal_entry_lines;
CREATE TRIGGER trg_check_journal_balance_delete
AFTER DELETE ON journal_entry_lines
FOR EACH ROW
DEFERRABLE INITIALLY DEFERRED
EXECUTE FUNCTION check_journal_entry_balance();

COMMENT ON FUNCTION check_journal_entry_balance() IS 
'Phase 1 Critical Fix: يتحقق من توازن القيود المحاسبية (المدين = الدائن)';

-- ✓ Journal Entry Balance Check applied successfully

-- =============================================
-- 2. منع تعديل الفواتير بعد إنشاء قيود محاسبية
-- =============================================
-- Applying: Prevent Invoice Edit After Journal...

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

DROP TRIGGER IF EXISTS trg_prevent_invoice_edit_after_journal ON invoices;
CREATE TRIGGER trg_prevent_invoice_edit_after_journal
BEFORE UPDATE ON invoices
FOR EACH ROW
EXECUTE FUNCTION prevent_invoice_edit_after_journal();

COMMENT ON FUNCTION prevent_invoice_edit_after_journal() IS 
'Phase 1 Critical Fix: يمنع تعديل الفواتير بعد إنشاء قيود محاسبية';

-- ✓ Prevent Invoice Edit After Journal applied successfully

-- =============================================
-- 3. منع خروج مخزون بدون فاتورة
-- =============================================
-- Applying: Inventory Sale Reference Constraint...

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

  -- إضافة constraint لحركات الشراء
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

-- ✓ Inventory Sale Reference Constraint applied successfully

-- =============================================
-- 4. منع حركات مخزون للفواتير الملغاة
-- =============================================
-- Applying: Prevent Inventory for Cancelled Invoices...

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

DROP TRIGGER IF EXISTS trg_prevent_inventory_for_cancelled ON inventory_transactions;
CREATE TRIGGER trg_prevent_inventory_for_cancelled
BEFORE INSERT ON inventory_transactions
FOR EACH ROW
EXECUTE FUNCTION prevent_inventory_for_cancelled();

COMMENT ON FUNCTION prevent_inventory_for_cancelled() IS 
'Phase 1 Critical Fix: يمنع إنشاء حركات مخزون للفواتير/الفواتير الملغاة';

-- ✓ Prevent Inventory for Cancelled Invoices applied successfully

-- =============================================
-- التحقق من التطبيق
-- =============================================
-- Verifying installation...

-- التحقق من Functions
SELECT 
  CASE 
    WHEN EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'check_journal_entry_balance') 
    THEN '✓ check_journal_entry_balance'
    ELSE '✗ check_journal_entry_balance'
  END as function_1,
  CASE 
    WHEN EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'prevent_invoice_edit_after_journal') 
    THEN '✓ prevent_invoice_edit_after_journal'
    ELSE '✗ prevent_invoice_edit_after_journal'
  END as function_2,
  CASE 
    WHEN EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'prevent_inventory_for_cancelled') 
    THEN '✓ prevent_inventory_for_cancelled'
    ELSE '✗ prevent_inventory_for_cancelled'
  END as function_3;

-- التحقق من Triggers
SELECT 
  CASE 
    WHEN EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_check_journal_balance_insert') 
    THEN '✓ trg_check_journal_balance_insert'
    ELSE '✗ trg_check_journal_balance_insert'
  END as trigger_1,
  CASE 
    WHEN EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_prevent_invoice_edit_after_journal') 
    THEN '✓ trg_prevent_invoice_edit_after_journal'
    ELSE '✗ trg_prevent_invoice_edit_after_journal'
  END as trigger_2,
  CASE 
    WHEN EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_prevent_inventory_for_cancelled') 
    THEN '✓ trg_prevent_inventory_for_cancelled'
    ELSE '✗ trg_prevent_inventory_for_cancelled'
  END as trigger_3;

-- التحقق من Constraints
SELECT 
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM pg_constraint 
      WHERE conrelid = 'inventory_transactions'::regclass 
      AND conname = 'check_sale_has_reference'
    ) 
    THEN '✓ check_sale_has_reference'
    ELSE '✗ check_sale_has_reference'
  END as constraint_1;

-- =============================================
-- Phase 1 Critical Fixes Applied Successfully!
-- =============================================

COMMIT;

