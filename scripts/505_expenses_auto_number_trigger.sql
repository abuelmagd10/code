-- =====================================
-- Auto-generate expense_number on INSERT
-- =====================================
-- This trigger ensures expense_number is generated atomically
-- within the same transaction as the INSERT, preventing race conditions

CREATE OR REPLACE FUNCTION auto_generate_expense_number()
RETURNS TRIGGER AS $$
DECLARE
  v_lock_key BIGINT;
  v_max_number INTEGER;
  v_number TEXT;
BEGIN
  -- Only generate if expense_number is NULL or empty
  IF NEW.expense_number IS NULL OR NEW.expense_number = '' THEN
    -- 🔒 إنشاء lock key فريد لكل شركة
    v_lock_key := hashtext(NEW.company_id::TEXT);
    
    -- 🔒 الحصول على قفل حصري لهذه الشركة
    PERFORM pg_advisory_xact_lock(v_lock_key);
    
    -- 🔍 الحصول على أكبر رقم موجود
    SELECT COALESCE(
      MAX(
        CAST(
          SUBSTRING(expense_number FROM 'EXP-([0-9]+)') AS INTEGER
        )
      ),
      0
    ) INTO v_max_number
    FROM expenses
    WHERE company_id = NEW.company_id
      AND expense_number ~ '^EXP-[0-9]+$';
    
    -- ✅ توليد الرقم التالي
    v_number := 'EXP-' || LPAD((v_max_number + 1)::TEXT, 4, '0');
    
    -- ✅ تعيين الرقم
    NEW.expense_number := v_number;
    
    -- 🔓 القفل سيتم تحريره تلقائياً عند انتهاء Transaction
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if exists
DROP TRIGGER IF EXISTS trigger_auto_generate_expense_number ON expenses;

-- Create trigger
CREATE TRIGGER trigger_auto_generate_expense_number
  BEFORE INSERT ON expenses
  FOR EACH ROW
  EXECUTE FUNCTION auto_generate_expense_number();

-- Test the trigger
COMMENT ON TRIGGER trigger_auto_generate_expense_number ON expenses IS 
'Auto-generates expense_number using advisory locks to prevent race conditions';

