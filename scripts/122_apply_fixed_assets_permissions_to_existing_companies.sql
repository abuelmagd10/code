-- =====================================
-- تطبيق صلاحيات الأصول الثابتة على الشركات الموجودة
-- Apply Fixed Assets permissions to existing companies
-- =====================================

-- هذا السكريبت يطبق الصلاحيات الجديدة (fixed_assets) على جميع الشركات الموجودة
-- This script applies new permissions (fixed_assets) to all existing companies

DO $$
DECLARE
  company_record RECORD;
  companies_count INTEGER := 0;
BEGIN
  -- حساب عدد الشركات
  SELECT COUNT(*) INTO companies_count FROM companies;
  
  RAISE NOTICE 'Found % companies to update', companies_count;
  
  -- تطبيق الصلاحيات على كل شركة
  FOR company_record IN 
    SELECT id, name FROM companies
  LOOP
    BEGIN
      -- استدعاء الدالة لتطبيق الصلاحيات الافتراضية
      PERFORM copy_default_permissions_for_company(company_record.id);
      
      RAISE NOTICE 'Applied permissions to company: % (ID: %)', company_record.name, company_record.id;
      
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Error applying permissions to company % (ID: %): %', 
        company_record.name, company_record.id, SQLERRM;
    END;
  END LOOP;
  
  RAISE NOTICE 'Finished applying permissions to all companies';
  RAISE NOTICE 'Total companies processed: %', companies_count;
END $$;

-- =====================================
-- التحقق من تطبيق الصلاحيات
-- Verify permissions were applied
-- =====================================

-- عرض عدد الصلاحيات لكل شركة
SELECT 
  c.name AS company_name,
  COUNT(crp.id) AS total_permissions,
  COUNT(CASE WHEN crp.resource = 'fixed_assets' THEN 1 END) AS fixed_assets_permissions,
  COUNT(CASE WHEN crp.resource = 'asset_categories' THEN 1 END) AS asset_categories_permissions,
  COUNT(CASE WHEN crp.resource = 'fixed_assets_reports' THEN 1 END) AS fixed_assets_reports_permissions
FROM companies c
LEFT JOIN company_role_permissions crp ON crp.company_id = c.id
GROUP BY c.id, c.name
ORDER BY c.name;

-- رسالة تأكيد
DO $$
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Fixed Assets permissions have been applied to all existing companies!';
  RAISE NOTICE 'You can verify the results using the query above.';
  RAISE NOTICE '========================================';
END $$;

