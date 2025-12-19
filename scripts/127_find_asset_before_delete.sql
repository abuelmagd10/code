-- =============================================
-- Find Asset Before Deleting Depreciation
-- البحث عن الأصل قبل حذف الإهلاك
-- =============================================
-- هذا السكريبت يساعد في العثور على الأصل الصحيح
-- قبل تنفيذ حذف الإهلاك
-- =============================================

-- البحث عن جميع الأصول في الشركة المحددة
-- Company ID: 3a663f6b-0689-4952-93c1-6d958c737089
SELECT 
  c.name as company_name,
  c.id as company_id,
  fa.id as asset_id,
  fa.asset_code,
  fa.name as asset_name,
  fa.purchase_cost,
  fa.accumulated_depreciation,
  fa.book_value,
  fa.status,
  COUNT(ds.id) as depreciation_schedules_count,
  COUNT(DISTINCT ds.journal_entry_id) as journal_entries_count
FROM fixed_assets fa
INNER JOIN companies c ON fa.company_id = c.id
LEFT JOIN depreciation_schedules ds ON ds.asset_id = fa.id
WHERE fa.company_id = '3a663f6b-0689-4952-93c1-6d958c737089'
  AND (
    fa.asset_code ILIKE '%FA-0001%'
    OR fa.name ILIKE '%كمبيوتر%'
    OR fa.name ILIKE '%computer%'
  )
GROUP BY c.id, c.name, fa.id, fa.asset_code, fa.name, fa.purchase_cost, 
         fa.accumulated_depreciation, fa.book_value, fa.status
ORDER BY fa.asset_code;

-- عرض جميع الأصول في هذه الشركة (للمراجعة)
SELECT 
  fa.id as asset_id,
  fa.asset_code,
  fa.name as asset_name,
  fa.purchase_cost,
  fa.accumulated_depreciation,
  fa.book_value,
  fa.status,
  COUNT(ds.id) as depreciation_schedules_count
FROM fixed_assets fa
LEFT JOIN depreciation_schedules ds ON ds.asset_id = fa.id
WHERE fa.company_id = '3a663f6b-0689-4952-93c1-6d958c737089'
GROUP BY fa.id, fa.asset_code, fa.name, fa.purchase_cost, 
         fa.accumulated_depreciation, fa.book_value, fa.status
ORDER BY fa.asset_code;

-- عرض جميع الشركات المتاحة
SELECT id, name, email
FROM companies
ORDER BY name;

