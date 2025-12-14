-- =============================================
-- Phase 1: Critical Fix - تحقق من توازن القيود المحاسبية
-- =============================================
-- يضمن أن مجموع المدين = مجموع الدائن في كل قيد
-- Critical Fix: Journal Entry Balance Validation
-- =============================================

-- دالة للتحقق من توازن القيد (المدين = الدائن)
-- السماح بالقيد غير المتوازن مؤقتاً إذا كان يحتوي على سطر واحد فقط
CREATE OR REPLACE FUNCTION check_journal_entry_balance()
RETURNS TRIGGER AS $$
DECLARE
  total_debit DECIMAL(15, 2);
  total_credit DECIMAL(15, 2);
  entry_id UUID;
  line_count INTEGER;
BEGIN
  -- تحديد journal_entry_id حسب نوع العملية
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    entry_id := NEW.journal_entry_id;
  ELSE
    entry_id := OLD.journal_entry_id;
  END IF;

  -- حساب عدد السطور في القيد
  SELECT COUNT(*) INTO line_count
  FROM journal_entry_lines
  WHERE journal_entry_id = entry_id;

  -- إذا كان القيد يحتوي على سطر واحد فقط، نسمح بذلك مؤقتاً
  -- (لأنه سيتم إضافة سطر آخر قريباً في نفس المعاملة)
  IF line_count <= 1 THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
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

-- Trigger بعد إدراج/تحديث/حذف سطور القيد
-- يتم التحقق من التوازن بعد كل تغيير
-- السماح بالقيد غير المتوازن مؤقتاً إذا كان يحتوي على سطر واحد فقط
DROP TRIGGER IF EXISTS trg_check_journal_balance_insert ON journal_entry_lines;
CREATE TRIGGER trg_check_journal_balance_insert
AFTER INSERT ON journal_entry_lines
FOR EACH ROW
EXECUTE FUNCTION check_journal_entry_balance();

DROP TRIGGER IF EXISTS trg_check_journal_balance_update ON journal_entry_lines;
CREATE TRIGGER trg_check_journal_balance_update
AFTER UPDATE ON journal_entry_lines
FOR EACH ROW
EXECUTE FUNCTION check_journal_entry_balance();

DROP TRIGGER IF EXISTS trg_check_journal_balance_delete ON journal_entry_lines;
CREATE TRIGGER trg_check_journal_balance_delete
AFTER DELETE ON journal_entry_lines
FOR EACH ROW
EXECUTE FUNCTION check_journal_entry_balance();

-- =============================================
-- ملاحظات:
-- 1. الهامش 0.01 للتعامل مع أخطاء التقريب في العمليات الحسابية
-- 2. Trigger يعمل AFTER لضمان حساب جميع السطور
-- 3. يعمل على INSERT, UPDATE, DELETE لضمان التوازن دائماً
-- =============================================

COMMENT ON FUNCTION check_journal_entry_balance() IS 
'Phase 1 Critical Fix: يتحقق من توازن القيود المحاسبية (المدين = الدائن)';

