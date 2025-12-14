-- =============================================
-- إصلاح مشكلة القيد غير المتوازن عند اعتماد إهلاك المخزون
-- Fix: Unbalanced Journal Entry Issue for Inventory Write-offs
-- =============================================
-- المشكلة: عند اعتماد إهلاك المخزون، يتم إنشاء قيد مدين فقط بدون دائن
-- الحل: 
-- 1. تعديل دالة approve_write_off لإدراج كلا السطرين في نفس الأمر
-- 2. تعديل الـ trigger ليصبح DEFERRABLE INITIALLY DEFERRED
-- =============================================

BEGIN;

-- =====================================
-- 1. تحديث دالة approve_write_off
-- =====================================
CREATE OR REPLACE FUNCTION approve_write_off(
  p_write_off_id UUID,
  p_approved_by UUID,
  p_expense_account_id UUID,
  p_inventory_account_id UUID
) RETURNS JSONB AS $$
DECLARE
  v_write_off RECORD;
  v_item RECORD;
  v_journal_id UUID;
  v_product RECORD;
  v_available_qty INTEGER;
BEGIN
  -- جلب بيانات الإهلاك
  SELECT * INTO v_write_off FROM inventory_write_offs WHERE id = p_write_off_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'لم يتم العثور على الإهلاك');
  END IF;

  IF v_write_off.status != 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'الإهلاك ليس في حالة انتظار');
  END IF;

  -- التحقق من توفر الكميات
  FOR v_item IN SELECT * FROM inventory_write_off_items WHERE write_off_id = p_write_off_id LOOP
    SELECT quantity_on_hand INTO v_available_qty FROM products WHERE id = v_item.product_id;
    IF v_available_qty < v_item.quantity THEN
      SELECT name INTO v_product FROM products WHERE id = v_item.product_id;
      RETURN jsonb_build_object(
        'success', false,
        'error', 'الكمية المتاحة غير كافية للمنتج: ' || v_product.name ||
                 ' (متاح: ' || v_available_qty || ', مطلوب: ' || v_item.quantity || ')'
      );
    END IF;
  END LOOP;

  -- إنشاء القيد المحاسبي
  INSERT INTO journal_entries (
    company_id, reference_type, reference_id, entry_date, description
  ) VALUES (
    v_write_off.company_id,
    'write_off',
    p_write_off_id,
    v_write_off.write_off_date,
    'إهلاك مخزون - ' || v_write_off.write_off_number
  ) RETURNING id INTO v_journal_id;

  -- إدراج كلا السطرين (المدين والدائن) في نفس الأمر لضمان التوازن
  INSERT INTO journal_entry_lines (
    journal_entry_id, account_id, debit_amount, credit_amount, description
  ) VALUES 
    -- خصم حساب مصروف الإهلاك
    (
      v_journal_id, p_expense_account_id, v_write_off.total_cost, 0,
      'مصروف إهلاك مخزون - ' || v_write_off.write_off_number
    ),
    -- دائن حساب المخزون
    (
      v_journal_id, p_inventory_account_id, 0, v_write_off.total_cost,
      'تخفيض المخزون - ' || v_write_off.write_off_number
    );

  -- إنشاء حركات المخزون
  FOR v_item IN SELECT * FROM inventory_write_off_items WHERE write_off_id = p_write_off_id LOOP
    INSERT INTO inventory_transactions (
      company_id, product_id, transaction_type, quantity_change,
      reference_id, journal_entry_id, notes
    ) VALUES (
      v_write_off.company_id,
      v_item.product_id,
      'write_off',
      -v_item.quantity,
      p_write_off_id,
      v_journal_id,
      'إهلاك - ' || v_write_off.write_off_number
    );
  END LOOP;

  -- تحديث حالة الإهلاك
  UPDATE inventory_write_offs SET
    status = 'approved',
    approved_by = p_approved_by,
    approved_at = now(),
    journal_entry_id = v_journal_id,
    updated_at = now()
  WHERE id = p_write_off_id;

  RETURN jsonb_build_object(
    'success', true,
    'journal_entry_id', v_journal_id,
    'message', 'تم اعتماد الإهلاك بنجاح'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================
-- 2. تحديث الـ triggers لتكون DEFERRABLE
-- =====================================
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

COMMIT;

-- =============================================
-- ملاحظات:
-- 1. DEFERRABLE INITIALLY DEFERRED يؤجل التحقق من التوازن حتى نهاية المعاملة
-- 2. هذا يسمح بإدراج جميع سطور القيد قبل التحقق من التوازن
-- 3. الدالة approve_write_off الآن تدرج كلا السطرين في نفس الأمر INSERT
-- =============================================
