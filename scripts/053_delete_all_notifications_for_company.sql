-- =====================================================
-- 🗑️ حذف جميع الإشعارات من شركة معينة
-- =====================================================
-- هذا الـ script يحذف جميع الإشعارات من شركة معينة
-- مفيد للاختبار والبدء من جديد
-- =====================================================

-- ✅ الطريقة 1: حذف حسب اسم الشركة (تست)
-- استبدل 'تست' باسم الشركة المطلوب
DO $$
DECLARE
  v_company_id UUID;
  v_deleted_count INTEGER;
BEGIN
  -- جلب ID الشركة حسب الاسم
  SELECT id INTO v_company_id
  FROM companies
  WHERE name = 'تست'  -- ✅ استبدل باسم الشركة المطلوب
  LIMIT 1;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION '❌ الشركة "تست" غير موجودة!';
  END IF;

  -- حذف جميع الإشعارات
  DELETE FROM notifications
  WHERE company_id = v_company_id;

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  RAISE NOTICE '✅ تم حذف % إشعار من شركة "تست"', v_deleted_count;
END $$;

-- ✅ الطريقة 2: حذف حسب company_id مباشرة (إذا كنت تعرف الـ ID)
-- قم بإلغاء التعليق واستخدم هذه الطريقة إذا كنت تعرف company_id
/*
DO $$
DECLARE
  v_company_id UUID := 'YOUR_COMPANY_ID_HERE';  -- ✅ استبدل بـ company_id
  v_deleted_count INTEGER;
BEGIN
  DELETE FROM notifications
  WHERE company_id = v_company_id;

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  RAISE NOTICE '✅ تم حذف % إشعار من الشركة', v_deleted_count;
END $$;
*/

-- ✅ الطريقة 3: عرض جميع الشركات أولاً (للمساعدة في العثور على الاسم الصحيح)
-- قم بإلغاء التعليق لرؤية قائمة الشركات
/*
SELECT 
  id,
  name,
  (SELECT COUNT(*) FROM notifications WHERE company_id = companies.id) as notification_count
FROM companies
ORDER BY name;
*/

-- ✅ تم الحذف بنجاح
SELECT '✅ تم حذف جميع الإشعارات من شركة "تست"!' AS status;
