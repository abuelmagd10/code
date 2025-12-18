-- =============================================
-- 🛡️ فحوصات سلامة البيانات المحاسبية
-- ACCOUNTING DATA INTEGRITY CHECKS
-- =============================================
-- تاريخ الإنشاء: 2024-12-18
-- الغرض: منع تكرار الأخطاء المحاسبية
-- =============================================

-- =============================================
-- 1️⃣ CONSTRAINT: كل حساب يجب أن يكون له normal_balance
-- =============================================
-- تم تطبيقه: ALTER TABLE chart_of_accounts ALTER COLUMN normal_balance SET NOT NULL;
-- تم تطبيقه: ALTER TABLE chart_of_accounts ADD CONSTRAINT chk_normal_balance CHECK (normal_balance IN ('debit', 'credit'));

-- =============================================
-- 2️⃣ TRIGGER: التحقق من تطابق normal_balance مع account_type
-- =============================================
-- القاعدة:
-- - الأصول (asset) والمصروفات (expense): طبيعتها مدينة (debit)
-- - الالتزامات (liability) وحقوق الملكية (equity) والإيرادات (income): طبيعتها دائنة (credit)

CREATE OR REPLACE FUNCTION fn_validate_normal_balance()
RETURNS TRIGGER AS $$
BEGIN
  -- الأصول والمصروفات: طبيعتها مدينة (debit)
  IF NEW.account_type IN ('asset', 'expense') AND NEW.normal_balance != 'debit' THEN
    RAISE EXCEPTION 'خطأ محاسبي: حسابات % يجب أن تكون طبيعتها debit', NEW.account_type;
  END IF;
  
  -- الالتزامات وحقوق الملكية والإيرادات: طبيعتها دائنة (credit)
  IF NEW.account_type IN ('liability', 'equity', 'income') AND NEW.normal_balance != 'credit' THEN
    RAISE EXCEPTION 'خطأ محاسبي: حسابات % يجب أن تكون طبيعتها credit', NEW.account_type;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validate_normal_balance ON chart_of_accounts;
CREATE TRIGGER trg_validate_normal_balance
BEFORE INSERT OR UPDATE ON chart_of_accounts
FOR EACH ROW EXECUTE FUNCTION fn_validate_normal_balance();

-- =============================================
-- 3️⃣ TRIGGER: تحذير عند القيود غير المتوازنة
-- =============================================

CREATE OR REPLACE FUNCTION fn_check_journal_balance()
RETURNS TRIGGER AS $$
DECLARE
  total_debit DECIMAL(15,2);
  total_credit DECIMAL(15,2);
  diff DECIMAL(15,2);
BEGIN
  SELECT 
    COALESCE(SUM(debit_amount), 0),
    COALESCE(SUM(credit_amount), 0)
  INTO total_debit, total_credit
  FROM journal_entry_lines
  WHERE journal_entry_id = NEW.journal_entry_id;
  
  diff := ABS(total_debit - total_credit);
  
  IF diff > 0.01 AND total_debit > 0 AND total_credit > 0 THEN
    RAISE WARNING 'تحذير: القيد % غير متوازن - مدين: %, دائن: %, الفرق: %', 
      NEW.journal_entry_id, total_debit, total_credit, diff;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_check_journal_balance ON journal_entry_lines;
CREATE TRIGGER trg_check_journal_balance
AFTER INSERT OR UPDATE ON journal_entry_lines
FOR EACH ROW EXECUTE FUNCTION fn_check_journal_balance();

-- =============================================
-- 4️⃣ VIEW: تقرير سلامة البيانات المحاسبية
-- =============================================

CREATE OR REPLACE VIEW v_accounting_health_check AS
WITH 
-- 1. فحص القيود غير المتوازنة
unbalanced_entries AS (
  SELECT 
    je.id,
    je.entry_date,
    je.reference_type,
    je.reference_id,
    SUM(jel.debit_amount) as total_debit,
    SUM(jel.credit_amount) as total_credit,
    ABS(SUM(jel.debit_amount) - SUM(jel.credit_amount)) as difference
  FROM journal_entries je
  JOIN journal_entry_lines jel ON je.id = jel.journal_entry_id
  WHERE (je.is_deleted = false OR je.is_deleted IS NULL)
  GROUP BY je.id, je.entry_date, je.reference_type, je.reference_id
  HAVING ABS(SUM(jel.debit_amount) - SUM(jel.credit_amount)) > 0.01
),
-- 2. فحص توازن المعادلة المحاسبية
balance_check AS (
  SELECT
    SUM(CASE WHEN coa.account_type = 'asset' THEN jel.debit_amount - jel.credit_amount ELSE 0 END) as assets,
    SUM(CASE WHEN coa.account_type = 'liability' THEN jel.credit_amount - jel.debit_amount ELSE 0 END) as liabilities,
    SUM(CASE WHEN coa.account_type = 'equity' THEN jel.credit_amount - jel.debit_amount ELSE 0 END) as equity,
    SUM(CASE WHEN coa.account_type = 'income' THEN jel.credit_amount - jel.debit_amount ELSE 0 END) as income,
    SUM(CASE WHEN coa.account_type = 'expense' THEN jel.debit_amount - jel.credit_amount ELSE 0 END) as expense
  FROM journal_entry_lines jel
  JOIN journal_entries je ON je.id = jel.journal_entry_id
  JOIN chart_of_accounts coa ON coa.id = jel.account_id
  WHERE (je.is_deleted = false OR je.is_deleted IS NULL)
)
SELECT 
  'ACCOUNTING_EQUATION' as check_type,
  CASE 
    WHEN ABS(bc.assets - (bc.liabilities + bc.equity + (bc.income - bc.expense))) < 0.01 
    THEN '✅ متوازنة' 
    ELSE '❌ غير متوازنة' 
  END as status,
  bc.assets as assets,
  bc.liabilities + bc.equity + (bc.income - bc.expense) as liabilities_equity_income,
  bc.assets - (bc.liabilities + bc.equity + (bc.income - bc.expense)) as difference,
  (SELECT COUNT(*) FROM unbalanced_entries) as unbalanced_entries_count
FROM balance_check bc;

-- =============================================
-- 5️⃣ FUNCTION: فحص شامل للبيانات المحاسبية
-- =============================================

CREATE OR REPLACE FUNCTION fn_full_accounting_audit()
RETURNS TABLE (
  check_name TEXT,
  status TEXT,
  details TEXT
) AS $$
BEGIN
  -- 1. فحص الحسابات بدون normal_balance
  RETURN QUERY
  SELECT 
    'حسابات بدون normal_balance'::TEXT,
    CASE WHEN COUNT(*) = 0 THEN '✅ لا توجد مشاكل' ELSE '❌ يوجد ' || COUNT(*) || ' حساب' END::TEXT,
    COALESCE(STRING_AGG(account_name, ', '), 'لا يوجد')::TEXT
  FROM chart_of_accounts 
  WHERE normal_balance IS NULL;
  
  -- 2. فحص القيود غير المتوازنة
  RETURN QUERY
  SELECT 
    'قيود غير متوازنة'::TEXT,
    CASE WHEN COUNT(*) = 0 THEN '✅ لا توجد مشاكل' ELSE '❌ يوجد ' || COUNT(*) || ' قيد' END::TEXT,
    COALESCE(STRING_AGG(je.id::TEXT, ', '), 'لا يوجد')::TEXT
  FROM journal_entries je
  JOIN (
    SELECT journal_entry_id, ABS(SUM(debit_amount) - SUM(credit_amount)) as diff
    FROM journal_entry_lines
    GROUP BY journal_entry_id
    HAVING ABS(SUM(debit_amount) - SUM(credit_amount)) > 0.01
  ) unbalanced ON je.id = unbalanced.journal_entry_id
  WHERE (je.is_deleted = false OR je.is_deleted IS NULL);
  
  -- 3. فحص توازن المعادلة المحاسبية
  RETURN QUERY
  WITH bc AS (
    SELECT
      SUM(CASE WHEN coa.account_type = 'asset' THEN jel.debit_amount - jel.credit_amount ELSE 0 END) as assets,
      SUM(CASE WHEN coa.account_type = 'liability' THEN jel.credit_amount - jel.debit_amount ELSE 0 END) as liabilities,
      SUM(CASE WHEN coa.account_type = 'equity' THEN jel.credit_amount - jel.debit_amount ELSE 0 END) as equity,
      SUM(CASE WHEN coa.account_type = 'income' THEN jel.credit_amount - jel.debit_amount ELSE 0 END) as income,
      SUM(CASE WHEN coa.account_type = 'expense' THEN jel.debit_amount - jel.credit_amount ELSE 0 END) as expense
    FROM journal_entry_lines jel
    JOIN journal_entries je ON je.id = jel.journal_entry_id
    JOIN chart_of_accounts coa ON coa.id = jel.account_id
    WHERE (je.is_deleted = false OR je.is_deleted IS NULL)
  )
  SELECT 
    'المعادلة المحاسبية'::TEXT,
    CASE 
      WHEN ABS(bc.assets - (bc.liabilities + bc.equity + (bc.income - bc.expense))) < 0.01 
      THEN '✅ متوازنة' 
      ELSE '❌ غير متوازنة (فرق: ' || ROUND(bc.assets - (bc.liabilities + bc.equity + (bc.income - bc.expense)), 2) || ')' 
    END::TEXT,
    'الأصول: ' || ROUND(bc.assets, 2) || ' | الالتزامات+حقوق الملكية+صافي الربح: ' || 
    ROUND(bc.liabilities + bc.equity + (bc.income - bc.expense), 2)::TEXT
  FROM bc;
  
  -- 4. فحص تطابق المخزون
  RETURN QUERY
  SELECT 
    'تطابق المخزون'::TEXT,
    CASE WHEN COUNT(*) = 0 THEN '✅ لا توجد مشاكل' ELSE '❌ يوجد ' || COUNT(*) || ' منتج غير متطابق' END::TEXT,
    COALESCE(STRING_AGG(p.name, ', '), 'لا يوجد')::TEXT
  FROM products p
  LEFT JOIN (
    SELECT product_id, SUM(quantity_change) as calc_qty
    FROM inventory_transactions
    WHERE (is_deleted = false OR is_deleted IS NULL)
    GROUP BY product_id
  ) it ON p.id = it.product_id
  WHERE ABS(p.quantity_on_hand - COALESCE(it.calc_qty, 0)) > 0;
  
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- 📌 كيفية الاستخدام:
-- =============================================
-- 1. لفحص سلامة البيانات:
--    SELECT * FROM fn_full_accounting_audit();
--
-- 2. لعرض تقرير المعادلة المحاسبية:
--    SELECT * FROM v_accounting_health_check;
-- =============================================

