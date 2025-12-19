-- =============================================
-- Quick Verify Asset Status
-- التحقق السريع من حالة الأصل
-- =============================================
-- USAGE: Replace 'YOUR_ASSET_ID' with actual asset UUID
-- الاستخدام: استبدل 'YOUR_ASSET_ID' بمعرف الأصل الفعلي
-- =============================================
-- Example: Run this query with your asset_id
-- =============================================

-- =====================================
-- 1. حالة الأصل الأساسية
-- =====================================
SELECT 
  fa.asset_code as "الكود",
  fa.name as "الاسم",
  fa.purchase_cost as "التكلفة",
  fa.accumulated_depreciation as "الإهلاك المتراكم",
  fa.book_value as "القيمة الدفترية",
  fa.status as "الحالة",
  CASE 
    WHEN fa.accumulated_depreciation = 0 AND fa.book_value = fa.purchase_cost THEN '✓ تم إعادة التعيين'
    ELSE '⚠ يحتاج مراجعة'
  END as "حالة الإعادة"
FROM fixed_assets fa
WHERE fa.asset_code = 'FA-0001'  -- ⚠️ Replace with your asset_code or use asset_id
  -- OR fa.id = 'YOUR_ASSET_ID_HERE'  -- Uncomment and use asset_id instead
ORDER BY fa.asset_code;

-- =====================================
-- 2. جداول الإهلاك المتبقية
-- =====================================
SELECT 
  fa.asset_code as "الكود",
  fa.name as "الاسم",
  COUNT(ds.id) as "عدد الجداول المتبقية",
  COUNT(CASE WHEN ds.status = 'posted' THEN 1 END) as "مرحلة",
  COUNT(CASE WHEN ds.status = 'approved' THEN 1 END) as "معتمدة",
  COUNT(CASE WHEN ds.status = 'pending' THEN 1 END) as "معلقة"
FROM fixed_assets fa
LEFT JOIN depreciation_schedules ds ON ds.asset_id = fa.id
WHERE fa.asset_code = 'FA-0001'  -- ⚠️ Replace with your asset_code or use asset_id
  -- OR fa.id = 'YOUR_ASSET_ID_HERE'  -- Uncomment and use asset_id instead
GROUP BY fa.id, fa.asset_code, fa.name
ORDER BY fa.asset_code;

-- =====================================
-- 3. القيود المحاسبية المتبقية
-- =====================================
SELECT 
  fa.asset_code as "الكود",
  fa.name as "الاسم",
  COUNT(je.id) as "عدد القيود المتبقية",
  SUM(COALESCE(jel.debit_amount, 0)) as "إجمالي المدين",
  SUM(COALESCE(jel.credit_amount, 0)) as "إجمالي الدائن"
FROM fixed_assets fa
LEFT JOIN journal_entries je ON je.reference_type = 'depreciation' AND je.reference_id = fa.id
LEFT JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
WHERE fa.asset_code = 'FA-0001'  -- ⚠️ Replace with your asset_code or use asset_id
  -- OR fa.id = 'YOUR_ASSET_ID_HERE'  -- Uncomment and use asset_id instead
GROUP BY fa.id, fa.asset_code, fa.name
ORDER BY fa.asset_code;

-- =====================================
-- 4. ملخص شامل
-- =====================================
SELECT 
  fa.asset_code as "الكود",
  fa.name as "الاسم",
  fa.purchase_cost as "التكلفة",
  fa.accumulated_depreciation as "الإهلاك المتراكم",
  fa.book_value as "القيمة الدفترية",
  fa.status as "الحالة",
  COUNT(DISTINCT ds.id) as "جداول_الإهلاك",
  COUNT(DISTINCT je.id) as "القيود_المحاسبية",
  CASE 
    WHEN fa.accumulated_depreciation = 0 
     AND fa.book_value = fa.purchase_cost 
     AND COUNT(DISTINCT ds.id) = 0 
     AND COUNT(DISTINCT je.id) = 0 
    THEN '✓ جاهز لإعادة الإنشاء'
    ELSE '⚠ يحتاج مراجعة'
  END as "الحالة_النهائية"
FROM fixed_assets fa
LEFT JOIN depreciation_schedules ds ON ds.asset_id = fa.id
LEFT JOIN journal_entries je ON je.reference_type = 'depreciation' AND je.reference_id = fa.id
WHERE fa.asset_code = 'FA-0001'  -- ⚠️ Replace with your asset_code or use asset_id
  -- OR fa.id = 'YOUR_ASSET_ID_HERE'  -- Uncomment and use asset_id instead
GROUP BY fa.id, fa.asset_code, fa.name, fa.purchase_cost, 
         fa.accumulated_depreciation, fa.book_value, fa.status
ORDER BY fa.asset_code;

