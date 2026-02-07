-- =====================================================
-- 🔐 JOURNAL ENTRY GOVERNANCE - حوكمة القيود المحاسبية
-- =====================================================
-- 📌 الهدف: منع الأخطاء المحاسبية الشائعة
-- 📌 التاريخ: 2024
-- =====================================================

-- =====================================
-- 1️⃣ دالة البحث عن القيود المكررة
-- =====================================
CREATE OR REPLACE FUNCTION find_duplicate_journal_entries(p_company_id UUID)
RETURNS TABLE (
  reference_type TEXT,
  reference_id UUID,
  count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    je.reference_type::TEXT,
    je.reference_id,
    COUNT(*)::BIGINT as count
  FROM journal_entries je
  WHERE je.company_id = p_company_id
    AND (je.is_deleted IS NULL OR je.is_deleted = false)
    AND je.reference_type IN ('invoice', 'invoice_cogs', 'bill', 'expense')
  GROUP BY je.reference_type, je.reference_id
  HAVING COUNT(*) > 1;
END;
$$ LANGUAGE plpgsql;

-- =====================================
-- 2️⃣ دالة التحقق من وجود قيد سابق
-- =====================================
CREATE OR REPLACE FUNCTION check_journal_entry_exists(
  p_company_id UUID,
  p_reference_type TEXT,
  p_reference_id UUID
) RETURNS BOOLEAN AS $$
DECLARE
  v_exists BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM journal_entries
    WHERE company_id = p_company_id
      AND reference_type = p_reference_type
      AND reference_id = p_reference_id
      AND (is_deleted IS NULL OR is_deleted = false)
  ) INTO v_exists;
  
  RETURN v_exists;
END;
$$ LANGUAGE plpgsql;

-- =====================================
-- 3️⃣ Trigger لمنع القيود المكررة
-- =====================================
CREATE OR REPLACE FUNCTION prevent_duplicate_journal_entry()
RETURNS TRIGGER AS $$
BEGIN
  -- التحقق من عدم وجود قيد سابق لنفس المرجع
  IF check_journal_entry_exists(NEW.company_id, NEW.reference_type, NEW.reference_id) THEN
    RAISE EXCEPTION '🚨 GOVERNANCE: Duplicate journal entry blocked! Type: %, RefId: %', 
      NEW.reference_type, NEW.reference_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- إنشاء Trigger (معطل افتراضياً للسماح بالتشغيل التدريجي)
DROP TRIGGER IF EXISTS trg_prevent_duplicate_journal_entry ON journal_entries;
-- CREATE TRIGGER trg_prevent_duplicate_journal_entry
--   BEFORE INSERT ON journal_entries
--   FOR EACH ROW
--   EXECUTE FUNCTION prevent_duplicate_journal_entry();

-- =====================================
-- 4️⃣ دالة التحقق من COGS بدون إيراد
-- =====================================
CREATE OR REPLACE FUNCTION check_cogs_has_revenue(
  p_company_id UUID,
  p_invoice_id UUID
) RETURNS BOOLEAN AS $$
DECLARE
  v_has_revenue BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM journal_entries
    WHERE company_id = p_company_id
      AND reference_type = 'invoice'
      AND reference_id = p_invoice_id
      AND (is_deleted IS NULL OR is_deleted = false)
  ) INTO v_has_revenue;
  
  RETURN v_has_revenue;
END;
$$ LANGUAGE plpgsql;

-- =====================================
-- 5️⃣ Trigger لمنع COGS بدون إيراد
-- =====================================
CREATE OR REPLACE FUNCTION prevent_cogs_without_revenue()
RETURNS TRIGGER AS $$
BEGIN
  -- التحقق فقط لقيود COGS
  IF NEW.reference_type = 'invoice_cogs' THEN
    IF NOT check_cogs_has_revenue(NEW.company_id, NEW.reference_id) THEN
      RAISE EXCEPTION '🚨 GOVERNANCE: COGS without revenue blocked! InvoiceId: %', 
        NEW.reference_id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- إنشاء Trigger (معطل افتراضياً)
DROP TRIGGER IF EXISTS trg_prevent_cogs_without_revenue ON journal_entries;
-- CREATE TRIGGER trg_prevent_cogs_without_revenue
--   BEFORE INSERT ON journal_entries
--   FOR EACH ROW
--   EXECUTE FUNCTION prevent_cogs_without_revenue();

-- =====================================
-- 6️⃣ View للقيود المكررة (للمراقبة)
-- =====================================
CREATE OR REPLACE VIEW v_duplicate_journal_entries AS
SELECT 
  je.company_id,
  je.reference_type,
  je.reference_id,
  COUNT(*) as duplicate_count,
  array_agg(je.id) as entry_ids,
  array_agg(je.created_at) as created_dates
FROM journal_entries je
WHERE (je.is_deleted IS NULL OR je.is_deleted = false)
  AND je.reference_type IN ('invoice', 'invoice_cogs', 'bill', 'expense')
GROUP BY je.company_id, je.reference_type, je.reference_id
HAVING COUNT(*) > 1;

-- =====================================
-- 7️⃣ View للمصروفات بدون قيود
-- =====================================
CREATE OR REPLACE VIEW v_expenses_without_journals AS
SELECT 
  e.id,
  e.company_id,
  e.expense_number,
  e.expense_date,
  e.amount,
  e.status
FROM expenses e
WHERE e.status = 'approved'
  AND NOT EXISTS (
    SELECT 1 FROM journal_entries je
    WHERE je.company_id = e.company_id
      AND je.reference_type = 'expense'
      AND je.reference_id = e.id
      AND (je.is_deleted IS NULL OR je.is_deleted = false)
  );

COMMENT ON FUNCTION find_duplicate_journal_entries IS '🔐 GOVERNANCE: البحث عن القيود المكررة';
COMMENT ON FUNCTION check_journal_entry_exists IS '🔐 GOVERNANCE: التحقق من وجود قيد سابق';
COMMENT ON FUNCTION prevent_duplicate_journal_entry IS '🔐 GOVERNANCE: منع القيود المكررة';
COMMENT ON FUNCTION check_cogs_has_revenue IS '🔐 GOVERNANCE: التحقق من وجود إيراد قبل COGS';
COMMENT ON FUNCTION prevent_cogs_without_revenue IS '🔐 GOVERNANCE: منع COGS بدون إيراد';

