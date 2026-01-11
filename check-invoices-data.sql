-- فحص بيانات الفواتير والمحاسب
-- 1. فحص بيانات المحاسب
SELECT 
  cm.user_id,
  cm.role,
  cm.branch_id,
  b.name as branch_name,
  cm.company_id
FROM company_members cm
LEFT JOIN branches b ON cm.branch_id = b.id
WHERE cm.role = 'accountant'
LIMIT 5;

-- 2. فحص الفواتير في نفس الفرع
SELECT 
  i.id,
  i.invoice_number,
  i.branch_id,
  b.name as branch_name,
  i.created_by_user_id,
  i.company_id,
  i.status
FROM invoices i
LEFT JOIN branches b ON i.branch_id = b.id
WHERE i.company_id = (SELECT company_id FROM company_members WHERE role = 'accountant' LIMIT 1)
ORDER BY i.created_at DESC
LIMIT 10;

-- 3. مقارنة branch_id بين المحاسب والفواتير
SELECT 
  'accountant_branch' as type,
  cm.branch_id,
  b.name as branch_name,
  COUNT(*) as count
FROM company_members cm
LEFT JOIN branches b ON cm.branch_id = b.id
WHERE cm.role = 'accountant'
GROUP BY cm.branch_id, b.name

UNION ALL

SELECT 
  'invoices_branch' as type,
  i.branch_id,
  b.name as branch_name,
  COUNT(*) as count
FROM invoices i
LEFT JOIN branches b ON i.branch_id = b.id
WHERE i.company_id = (SELECT company_id FROM company_members WHERE role = 'accountant' LIMIT 1)
GROUP BY i.branch_id, b.name;

-- 4. فحص API response simulation
SELECT 
  i.id,
  i.invoice_number,
  i.branch_id,
  i.company_id,
  CASE 
    WHEN i.branch_id = (SELECT branch_id FROM company_members WHERE role = 'accountant' LIMIT 1) 
    THEN 'MATCH ✓'
    ELSE 'NO MATCH ✗'
  END as branch_match
FROM invoices i
WHERE i.company_id = (SELECT company_id FROM company_members WHERE role = 'accountant' LIMIT 1)
LIMIT 10;
