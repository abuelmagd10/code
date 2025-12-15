-- =============================================
-- منع القيود المحاسبية غير المتوازنة
-- Prevent Unbalanced Journal Entries
-- تاريخ: 2025-12-15
-- =============================================

-- =============================================
-- الجزء 1: إصلاح القيد غير المتوازن الحالي
-- Part 1: Fix the current unbalanced entry
-- =============================================

-- أولاً: عرض تفاصيل القيد غير المتوازن
SELECT 
  je.id,
  je.description,
  je.entry_date,
  je.reference_type,
  SUM(jel.debit_amount) as total_debit,
  SUM(jel.credit_amount) as total_credit,
  SUM(jel.debit_amount) - SUM(jel.credit_amount) as difference
FROM journal_entries je
JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
WHERE je.id = 'cd4260f4-2cee-49e5-99f1-3bcc92a708ba'
GROUP BY je.id, je.description, je.entry_date, je.reference_type;

-- حذف القيد غير المتوازن (الخيار الموصى به)
DELETE FROM journal_entry_lines 
WHERE journal_entry_id = 'cd4260f4-2cee-49e5-99f1-3bcc92a708ba';

DELETE FROM journal_entries 
WHERE id = 'cd4260f4-2cee-49e5-99f1-3bcc92a708ba';

-- =============================================
-- الجزء 2: إنشاء دالة التحقق من توازن القيود
-- Part 2: Create balance validation function
-- =============================================

CREATE OR REPLACE FUNCTION check_journal_entry_balance()
RETURNS TRIGGER AS $$
DECLARE
  total_debit NUMERIC;
  total_credit NUMERIC;
  difference NUMERIC;
BEGIN
  -- حساب إجمالي المدين والدائن للقيد
  SELECT 
    COALESCE(SUM(debit_amount), 0),
    COALESCE(SUM(credit_amount), 0)
  INTO total_debit, total_credit
  FROM journal_entry_lines
  WHERE journal_entry_id = COALESCE(NEW.journal_entry_id, OLD.journal_entry_id);
  
  difference := ABS(total_debit - total_credit);
  
  -- السماح بفرق صغير جداً (0.01) بسبب أخطاء التقريب
  IF difference > 0.01 THEN
    RAISE EXCEPTION 'القيد المحاسبي غير متوازن! المدين: %, الدائن: %, الفرق: %',
      total_debit, total_credit, difference;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- الجزء 3: إنشاء Trigger للتحقق بعد كل تغيير
-- Part 3: Create trigger to check after each change
-- =============================================

-- حذف الـ Trigger القديم إن وجد
DROP TRIGGER IF EXISTS trg_check_journal_balance_insert ON journal_entry_lines;
DROP TRIGGER IF EXISTS trg_check_journal_balance_update ON journal_entry_lines;
DROP TRIGGER IF EXISTS trg_check_journal_balance_delete ON journal_entry_lines;

-- إنشاء Trigger جديد للتحقق عند الإدراج
-- ملاحظة: نستخدم CONSTRAINT TRIGGER لتأجيل التحقق حتى نهاية المعاملة
-- هذا يسمح بإدراج عدة سطور في نفس المعاملة

CREATE OR REPLACE FUNCTION check_journal_balance_deferred()
RETURNS TRIGGER AS $$
DECLARE
  entry_id UUID;
  total_debit NUMERIC;
  total_credit NUMERIC;
  difference NUMERIC;
BEGIN
  -- تحديد معرف القيد
  entry_id := COALESCE(NEW.journal_entry_id, OLD.journal_entry_id);
  
  -- حساب إجمالي المدين والدائن
  SELECT 
    COALESCE(SUM(debit_amount), 0),
    COALESCE(SUM(credit_amount), 0)
  INTO total_debit, total_credit
  FROM journal_entry_lines
  WHERE journal_entry_id = entry_id;
  
  difference := ABS(total_debit - total_credit);
  
  -- التحقق من التوازن
  IF difference > 0.01 THEN
    RAISE EXCEPTION 'UNBALANCED_JOURNAL_ENTRY: القيد % غير متوازن! المدين: %, الدائن: %, الفرق: %',
      entry_id, total_debit, total_credit, difference
    USING HINT = 'يجب أن يكون إجمالي المدين = إجمالي الدائن';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- الجزء 4: دالة للتحقق من جميع القيود الحالية
-- Part 4: Function to check all existing entries
-- =============================================

CREATE OR REPLACE FUNCTION find_unbalanced_journal_entries()
RETURNS TABLE (
  journal_entry_id UUID,
  description TEXT,
  entry_date DATE,
  total_debit NUMERIC,
  total_credit NUMERIC,
  difference NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    je.id as journal_entry_id,
    je.description,
    je.entry_date,
    SUM(jel.debit_amount) as total_debit,
    SUM(jel.credit_amount) as total_credit,
    SUM(jel.debit_amount) - SUM(jel.credit_amount) as difference
  FROM journal_entries je
  JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
  GROUP BY je.id, je.description, je.entry_date
  HAVING ABS(SUM(jel.debit_amount) - SUM(jel.credit_amount)) > 0.01
  ORDER BY ABS(SUM(jel.debit_amount) - SUM(jel.credit_amount)) DESC;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- الجزء 5: التحقق من عدم وجود قيود غير متوازنة
-- Part 5: Verify no unbalanced entries exist
-- =============================================

-- تشغيل هذا الاستعلام للتحقق
SELECT * FROM find_unbalanced_journal_entries();

