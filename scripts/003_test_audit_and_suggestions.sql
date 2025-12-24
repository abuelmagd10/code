-- =====================================================
-- 🧪 ملف اختبارات Audit واقتراحات قيود التسوية
-- Test File: Audit and Adjustment Suggestions
-- =====================================================
-- تاريخ: 2025-01-XX
-- الهدف: اختبار Functions Audit واقتراحات قيود التسوية فقط
-- =====================================================
--
-- ⚠️ هذا الملف للاختبار فقط:
-- ✅ SELECT statements فقط (قراءة)
-- ❌ لا INSERT
-- ❌ لا UPDATE
-- ❌ لا DELETE
-- ❌ لا ALTER
--
-- =====================================================

-- =====================================================
-- الاختبار 1: Audit شامل لشركة
-- =====================================================
-- استبدل 'YOUR_COMPANY_ID' بـ UUID الشركة الفعلية
SELECT 
  '=== AUDIT RESULTS ===' as test_section,
  audit_category,
  item_reference,
  expected_value,
  actual_value,
  difference,
  description
FROM audit_company_accounting_data(
  'YOUR_COMPANY_ID'::UUID,  -- ⚠️ استبدل بـ UUID الشركة الفعلية
  CURRENT_DATE
)
ORDER BY audit_category, ABS(difference) DESC;

-- =====================================================
-- الاختبار 2: ملخص Audit حسب النوع
-- =====================================================
SELECT 
  '=== AUDIT SUMMARY ===' as test_section,
  audit_category,
  COUNT(*) as issues_count,
  SUM(ABS(difference)) as total_difference,
  MIN(difference) as min_difference,
  MAX(difference) as max_difference
FROM audit_company_accounting_data(
  'YOUR_COMPANY_ID'::UUID,  -- ⚠️ استبدل بـ UUID الشركة الفعلية
  CURRENT_DATE
)
GROUP BY audit_category
ORDER BY total_difference DESC;

-- =====================================================
-- الاختبار 3: اقتراحات قيود التسوية
-- =====================================================
SELECT 
  '=== ADJUSTMENT SUGGESTIONS ===' as test_section,
  adjustment_type,
  account_code,
  account_name,
  debit_amount,
  credit_amount,
  description,
  reference_type,
  reference_id
FROM suggest_adjustment_entries(
  'YOUR_COMPANY_ID'::UUID,  -- ⚠️ استبدل بـ UUID الشركة الفعلية
  CURRENT_DATE
)
WHERE debit_amount > 0.01 OR credit_amount > 0.01
ORDER BY adjustment_type, debit_amount DESC, credit_amount DESC;

-- =====================================================
-- الاختبار 4: ملخص اقتراحات قيود التسوية
-- =====================================================
SELECT 
  '=== ADJUSTMENT SUMMARY ===' as test_section,
  adjustment_type,
  COUNT(*) as entries_count,
  SUM(debit_amount) as total_debit,
  SUM(credit_amount) as total_credit,
  ABS(SUM(debit_amount) - SUM(credit_amount)) as imbalance
FROM suggest_adjustment_entries(
  'YOUR_COMPANY_ID'::UUID,  -- ⚠️ استبدل بـ UUID الشركة الفعلية
  CURRENT_DATE
)
WHERE debit_amount > 0.01 OR credit_amount > 0.01
GROUP BY adjustment_type
ORDER BY total_debit DESC, total_credit DESC;

-- =====================================================
-- الاختبار 5: التحقق من توازن الاقتراحات
-- =====================================================
SELECT 
  '=== BALANCE CHECK ===' as test_section,
  'Total Debit' as item,
  SUM(debit_amount) as amount
FROM suggest_adjustment_entries(
  'YOUR_COMPANY_ID'::UUID,  -- ⚠️ استبدل بـ UUID الشركة الفعلية
  CURRENT_DATE
)
WHERE debit_amount > 0.01

UNION ALL

SELECT 
  'Total Credit' as item,
  SUM(credit_amount) as amount
FROM suggest_adjustment_entries(
  'YOUR_COMPANY_ID'::UUID,  -- ⚠️ استبدل بـ UUID الشركة الفعلية
  CURRENT_DATE
)
WHERE credit_amount > 0.01

UNION ALL

SELECT 
  'Difference' as item,
  ABS(SUM(debit_amount) - SUM(credit_amount)) as amount
FROM suggest_adjustment_entries(
  'YOUR_COMPANY_ID'::UUID,  -- ⚠️ استبدل بـ UUID الشركة الفعلية
  CURRENT_DATE
);

-- =====================================================
-- الاختبار 6: قائمة الشركات المتاحة للاختبار
-- =====================================================
SELECT 
  '=== AVAILABLE COMPANIES ===' as test_section,
  id as company_id,
  name as company_name,
  created_at
FROM companies
ORDER BY created_at DESC
LIMIT 10;

-- =====================================================
-- ملاحظات الاستخدام
-- =====================================================
-- 1. استبدل 'YOUR_COMPANY_ID' بـ UUID الشركة الفعلية من نتائج الاختبار 6
-- 2. نفّذ كل اختبار على حدة لمراجعة النتائج
-- 3. راجع نتائج Audit قبل النظر في اقتراحات قيود التسوية
-- 4. تأكد من فهم جميع الفروقات قبل إنشاء قيود التسوية الفعلية
-- =====================================================

