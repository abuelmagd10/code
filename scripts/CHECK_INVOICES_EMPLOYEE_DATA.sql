-- التحقق من بيانات الفواتير وخاصة created_by_user_id في شركة تست
-- نفذ هذا SQL في Supabase SQL Editor

-- أولاً: العثور على ID شركة "تست"
SELECT 
  id,
  name
FROM companies
WHERE name ILIKE '%تست%' OR name ILIKE '%test%'
ORDER BY name;

-- ثانياً: التحقق من الفواتير في شركة تست (استخدم company_id من النتيجة أعلاه)
-- استبدل 'COMPANY_ID_HERE' بـ ID الشركة الفعلي

-- إحصائيات عامة للفواتير
SELECT 
  COUNT(*) as total_invoices,
  COUNT(created_by_user_id) as with_created_by,
  COUNT(*) - COUNT(created_by_user_id) as without_created_by,
  COUNT(sales_order_id) as with_sales_order,
  COUNT(*) - COUNT(sales_order_id) as without_sales_order,
  ROUND(COUNT(created_by_user_id)::numeric / NULLIF(COUNT(*), 0)::numeric * 100, 2) as created_by_percentage
FROM invoices
WHERE company_id = 'f0ffc062-1e6e-4324-8be4-f5052e881a67'; -- استبدل بـ company_id الفعلي

-- عرض الفواتير بدون created_by_user_id
SELECT 
  i.id,
  i.invoice_number,
  i.status,
  i.created_at,
  i.created_by_user_id,
  i.sales_order_id,
  so.created_by_user_id as sales_order_created_by,
  i.branch_id,
  i.cost_center_id
FROM invoices i
LEFT JOIN sales_orders so ON i.sales_order_id = so.id
WHERE i.company_id = 'f0ffc062-1e6e-4324-8be4-f5052e881a67' -- استبدل بـ company_id الفعلي
  AND i.created_by_user_id IS NULL
ORDER BY i.created_at DESC;

-- الفواتير الأربعة المحددة من console.log
SELECT 
  i.id,
  i.invoice_number,
  i.status,
  i.created_at,
  i.created_by_user_id,
  i.sales_order_id,
  so.created_by_user_id as sales_order_created_by,
  so.created_at as sales_order_created_at,
  i.branch_id,
  i.cost_center_id
FROM invoices i
LEFT JOIN sales_orders so ON i.sales_order_id = so.id
WHERE i.id IN (
  'ec6724a5-d005-43aa-80d0-129775ee0fc6',
  '4ed67e7e-3a62-4fe9-86c7-7da0d0dc1b9a',
  '27482c0e-e9a2-4899-8590-a2c4ca58075d',
  '92577072-101a-4a76-8c72-ed31a0343abd'
);

-- التحقق من أوامر البيع المرتبطة بهذه الفواتير
SELECT 
  so.id as sales_order_id,
  so.so_number,
  so.created_by_user_id,
  so.created_at,
  i.id as invoice_id,
  i.invoice_number
FROM sales_orders so
INNER JOIN invoices i ON i.sales_order_id = so.id
WHERE i.id IN (
  'ec6724a5-d005-43aa-80d0-129775ee0fc6',
  '4ed67e7e-3a62-4fe9-86c7-7da0d0dc1b9a',
  '27482c0e-e9a2-4899-8590-a2c4ca58075d',
  '92577072-101a-4a76-8c72-ed31a0343abd'
);

-- التحقق من الموظفين في الشركة
SELECT 
  cm.user_id,
  cm.role,
  cm.branch_id,
  up.display_name,
  up.username
FROM company_members cm
LEFT JOIN user_profiles up ON cm.user_id = up.user_id
WHERE cm.company_id = 'f0ffc062-1e6e-4324-8be4-f5052e881a67' -- استبدل بـ company_id الفعلي
ORDER BY cm.role, up.display_name;
