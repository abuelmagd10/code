-- =============================================
-- Phase 1: إصلاح القيود غير المتوازنة الموجودة
-- =============================================
-- Phase 1: Fix Existing Unbalanced Journal Entries
-- =============================================
-- ⚠️ هذا الملف لإصلاح القيود غير المتوازنة الموجودة قبل تطبيق Phase 1
-- يجب مراجعة كل قيد قبل الإصلاح
-- =============================================

-- =============================================
-- 1. عرض جميع القيود غير المتوازنة
-- =============================================
-- استخدم هذا الاستعلام أولاً لرؤية جميع القيود غير المتوازنة
SELECT 
  je.id,
  je.description,
  je.entry_date,
  je.reference_type,
  SUM(jel.debit_amount) as total_debit,
  SUM(jel.credit_amount) as total_credit,
  ABS(SUM(jel.debit_amount) - SUM(jel.credit_amount)) as difference,
  CASE 
    WHEN SUM(jel.debit_amount) > SUM(jel.credit_amount) THEN 'نقص في الدائن'
    WHEN SUM(jel.credit_amount) > SUM(jel.debit_amount) THEN 'نقص في المدين'
    ELSE 'متوازن'
  END as issue_type
FROM journal_entries je
JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
GROUP BY je.id, je.description, je.entry_date, je.reference_type
HAVING ABS(SUM(jel.debit_amount) - SUM(jel.credit_amount)) > 0.01
ORDER BY ABS(SUM(jel.debit_amount) - SUM(jel.credit_amount)) DESC;

-- =============================================
-- 2. إصلاح قيد معين (مثال)
-- =============================================
-- ⚠️ استبدل 'YOUR_JOURNAL_ENTRY_ID' بمعرف القيد الفعلي
-- ⚠️ استبدل 'YOUR_ACCOUNT_ID' بمعرف حساب مناسب للإصلاح

-- مثال: إصلاح القيد المكتشف (cd4260f4-2cee-49e5-99f1-3bcc92a708ba)
-- هذا القيد لديه: debit = 0, credit = 250
-- يجب إضافة سطر مدين بقيمة 250

-- الخطوة 1: تحديد حساب مناسب للإصلاح
-- (عادة حساب مصروف أو تكلفة)
-- يمكنك البحث عن حساب مناسب:
-- SELECT id, account_name, account_code 
-- FROM chart_of_accounts 
-- WHERE account_type = 'Expense' 
-- LIMIT 1;

-- الخطوة 2: إضافة سطر مدين لموازنة القيد
-- ⚠️ يجب مراجعة هذا يدوياً قبل التنفيذ
/*
INSERT INTO journal_entry_lines (
  journal_entry_id,
  account_id,
  debit_amount,
  credit_amount,
  description
)
VALUES (
  'cd4260f4-2cee-49e5-99f1-3bcc92a708ba',  -- معرف القيد
  'YOUR_ACCOUNT_ID',  -- حساب مناسب (مصروف أو تكلفة)
  250.00,  -- المبلغ المطلوب لموازنة القيد
  0,
  'إصلاح توازن القيد - Phase 1'
);
*/

-- =============================================
-- 3. دالة مساعدة لإصلاح القيود غير المتوازنة
-- =============================================
-- ⚠️ هذه الدالة تحتاج مراجعة يدوية قبل الاستخدام
-- لا تستخدمها بدون فهم كامل للسياق المحاسبي

CREATE OR REPLACE FUNCTION suggest_fix_for_unbalanced_entry(
  p_journal_entry_id UUID,
  p_account_id UUID DEFAULT NULL
)
RETURNS TABLE (
  journal_entry_id UUID,
  current_debit DECIMAL,
  current_credit DECIMAL,
  difference DECIMAL,
  suggested_debit DECIMAL,
  suggested_credit DECIMAL,
  account_suggestion UUID
) AS $$
DECLARE
  v_debit DECIMAL;
  v_credit DECIMAL;
  v_diff DECIMAL;
  v_account UUID;
BEGIN
  -- حساب المبالغ الحالية
  SELECT 
    COALESCE(SUM(debit_amount), 0),
    COALESCE(SUM(credit_amount), 0)
  INTO v_debit, v_credit
  FROM journal_entry_lines
  WHERE journal_entry_id = p_journal_entry_id;

  v_diff := ABS(v_debit - v_credit);

  -- إذا كان هناك حساب محدد، استخدمه
  -- وإلا، ابحث عن حساب مناسب
  IF p_account_id IS NOT NULL THEN
    v_account := p_account_id;
  ELSE
    -- البحث عن حساب مصروف أو تكلفة كاقتراح
    SELECT id INTO v_account
    FROM chart_of_accounts
    WHERE account_type IN ('Expense', 'Cost of Goods Sold')
    LIMIT 1;
  END IF;

  RETURN QUERY
  SELECT 
    p_journal_entry_id,
    v_debit,
    v_credit,
    v_diff,
    CASE WHEN v_credit > v_debit THEN v_diff ELSE 0 END as suggested_debit,
    CASE WHEN v_debit > v_credit THEN v_diff ELSE 0 END as suggested_credit,
    v_account;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- 4. استخدام الدالة المساعدة
-- =============================================
-- مثال: الحصول على اقتراح إصلاح للقيد المكتشف
/*
SELECT * FROM suggest_fix_for_unbalanced_entry(
  'cd4260f4-2cee-49e5-99f1-3bcc92a708ba'::UUID
);
*/

-- =============================================
-- 5. التحقق من القيود بعد الإصلاح
-- =============================================
-- بعد إصلاح القيود، استخدم هذا للتحقق:
SELECT 
  je.id,
  je.description,
  SUM(jel.debit_amount) as total_debit,
  SUM(jel.credit_amount) as total_credit,
  ABS(SUM(jel.debit_amount) - SUM(jel.credit_amount)) as difference,
  CASE 
    WHEN ABS(SUM(jel.debit_amount) - SUM(jel.credit_amount)) <= 0.01 THEN '✓ متوازن'
    ELSE '✗ غير متوازن'
  END as status
FROM journal_entries je
JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
WHERE je.id = 'cd4260f4-2cee-49e5-99f1-3bcc92a708ba'  -- استبدل بمعرف القيد
GROUP BY je.id, je.description;

-- =============================================
-- ملاحظات مهمة:
-- =============================================
-- 1. يجب مراجعة كل قيد غير متوازن يدوياً
-- 2. يجب فهم السياق المحاسبي قبل الإصلاح
-- 3. يجب التأكد من الحساب المستخدم في الإصلاح
-- 4. بعد الإصلاح، Phase 1 سيمنع إنشاء قيود غير متوازنة جديدة
-- =============================================

