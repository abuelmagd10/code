-- =====================================================
-- 🔧 إصلاح قيم المرتجعات في فواتير المشتريات
-- =====================================================
-- هذا السكربت يصلح قيم total_amount و returned_amount و paid_amount
-- للفواتير التي تم عمل مرتجع جزئي أو كامل عليها بشكل خاطئ
-- =====================================================

-- الخطوة 1: عرض الفواتير التي قد تحتاج إصلاح
-- (الفواتير التي لها returned_amount > 0)
SELECT 
  id,
  bill_number,
  total_amount,
  paid_amount,
  returned_amount,
  -- حساب الإجمالي الأصلي (المفترض)
  (total_amount + returned_amount) as calculated_original_total,
  -- حساب المتبقي
  (total_amount - paid_amount) as current_remaining,
  -- حساب المتبقي الصحيح (بعد المرتجع)
  ((total_amount + returned_amount) - paid_amount - returned_amount) as correct_remaining,
  status,
  return_status
FROM bills
WHERE returned_amount > 0
  AND company_id = (SELECT id FROM companies WHERE name = 'تست' LIMIT 1)
ORDER BY bill_date DESC;

-- =====================================================
-- الخطوة 2: إصلاح الفواتير التي تم حسابها بشكل خاطئ
-- =====================================================
-- ملاحظة: هذا السكربت يفترض أن total_amount الحالي هو الإجمالي بعد المرتجعات
-- وأن returned_amount هو مجموع المرتجعات
-- إذا كان total_amount = الإجمالي الأصلي، فيجب تصحيحه

-- ✅ الحالة 1: إذا كان total_amount = الإجمالي الأصلي (قبل المرتجعات)
-- يجب تصحيحه ليكون = الإجمالي الأصلي - returned_amount
UPDATE bills
SET 
  total_amount = GREATEST(0, total_amount - returned_amount),
  -- تحديث paid_amount إذا كان أكبر من total_amount الجديد
  paid_amount = LEAST(paid_amount, GREATEST(0, total_amount - returned_amount))
WHERE 
  company_id = (SELECT id FROM companies WHERE name = 'تست' LIMIT 1)
  AND returned_amount > 0
  -- التحقق: إذا كان total_amount + returned_amount > total_amount الأصلي المفترض
  -- (هذا يعني أن total_amount لم يتم تحديثه بعد المرتجع)
  AND (total_amount + returned_amount) > total_amount
  AND status NOT IN ('draft', 'cancelled', 'voided');

-- =====================================================
-- الخطوة 3: التحقق من صحة الحسابات بعد الإصلاح
-- =====================================================
-- المتبقي الصحيح = total_amount - paid_amount
-- يجب أن يكون >= 0 دائماً

SELECT 
  id,
  bill_number,
  total_amount,
  paid_amount,
  returned_amount,
  (total_amount - paid_amount) as remaining,
  status,
  return_status,
  CASE 
    WHEN (total_amount - paid_amount) < 0 THEN '❌ خطأ: المتبقي سالب'
    WHEN (total_amount + returned_amount) < paid_amount THEN '⚠️ تحذير: المدفوع أكبر من الإجمالي الأصلي'
    ELSE '✅ صحيح'
  END as validation
FROM bills
WHERE 
  company_id = (SELECT id FROM companies WHERE name = 'تست' LIMIT 1)
  AND returned_amount > 0
  AND status NOT IN ('draft', 'cancelled', 'voided')
ORDER BY bill_date DESC;

-- =====================================================
-- ملاحظات:
-- =====================================================
-- 1. total_amount يجب أن يكون الإجمالي الحالي (بعد المرتجعات)
-- 2. returned_amount يجب أن يكون مجموع جميع المرتجعات
-- 3. paid_amount يجب أن يكون <= total_amount
-- 4. المتبقي = total_amount - paid_amount
-- 5. الإجمالي الأصلي = total_amount + returned_amount
-- =====================================================

