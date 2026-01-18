-- فحص تفصيلي للفواتير والموظفين المنشئين
-- للتحقق من البيانات الفعلية قبل وبعد السكربت

-- 1. جلب company_id لشركة تست
SELECT id as company_id, name 
FROM companies 
WHERE name LIKE '%تست%' OR name LIKE '%test%'
LIMIT 1;

-- 2. عرض جميع الفواتير مع created_by_user_id و sales_order_id
SELECT 
  i.id,
  i.invoice_number,
  i.status,
  i.created_at,
  i.created_by_user_id as invoice_created_by,
  i.sales_order_id,
  so.created_by_user_id as sales_order_created_by,
  up_invoice.display_name as invoice_creator_name,
  up_so.display_name as so_creator_name
FROM invoices i
LEFT JOIN sales_orders so ON i.sales_order_id = so.id
LEFT JOIN user_profiles up_invoice ON i.created_by_user_id = up_invoice.user_id
LEFT JOIN user_profiles up_so ON so.created_by_user_id = up_so.user_id
WHERE i.company_id = 'f0ffc062-1e6e-4324-8be4-f5052e881a67'
ORDER BY i.created_at DESC;

-- 3. عرض جميع الموظفين في الشركة
SELECT 
  cm.user_id,
  cm.role,
  cm.branch_id,
  up.display_name,
  up.username,
  b.name as branch_name
FROM company_members cm
LEFT JOIN user_profiles up ON cm.user_id = up.user_id
LEFT JOIN branches b ON cm.branch_id = b.id
WHERE cm.company_id = 'f0ffc062-1e6e-4324-8be4-f5052e881a67'
ORDER BY cm.role, up.display_name;

-- 4. فحص audit_logs إذا كانت موجودة لمعرفة من أنشأ الفواتير
SELECT 
  al.record_id as invoice_id,
  i.invoice_number,
  al.user_id as creator_user_id,
  up.display_name as creator_name,
  al.action,
  al.created_at as log_created_at,
  al.old_data,
  al.new_data
FROM audit_logs al
JOIN invoices i ON al.record_id = i.id
LEFT JOIN user_profiles up ON al.user_id = up.user_id
WHERE al.target_table = 'invoices'
  AND al.action = 'INSERT'
  AND i.company_id = 'f0ffc062-1e6e-4324-8be4-f5052e881a67'
ORDER BY al.created_at DESC;
