-- 🔒 تحديث البيانات القديمة بالحوكمة الصحيحة
-- تاريخ: 2024

-- 1️⃣ تحديث أوامر البيع القديمة
UPDATE sales_orders so
SET 
  branch_id = COALESCE(
    (SELECT branch_id FROM company_members WHERE user_id = so.created_by_user_id AND company_id = so.company_id LIMIT 1),
    (SELECT id FROM branches WHERE company_id = so.company_id AND is_main = true LIMIT 1)
  ),
  cost_center_id = (SELECT cost_center_id FROM company_members WHERE user_id = so.created_by_user_id AND company_id = so.company_id LIMIT 1),
  warehouse_id = COALESCE(
    (SELECT w.id FROM warehouses w 
     INNER JOIN company_members cm ON w.branch_id = cm.branch_id 
     WHERE cm.user_id = so.created_by_user_id AND w.company_id = so.company_id AND w.is_main = true LIMIT 1),
    (SELECT id FROM warehouses WHERE company_id = so.company_id AND is_main = true LIMIT 1)
  )
WHERE branch_id IS NULL OR warehouse_id IS NULL;

-- 2️⃣ تحديث الفواتير من أوامر البيع المرتبطة
UPDATE invoices i
SET 
  branch_id = so.branch_id,
  cost_center_id = so.cost_center_id,
  warehouse_id = so.warehouse_id,
  created_by_user_id = COALESCE(i.created_by_user_id, so.created_by_user_id)
FROM sales_orders so
WHERE i.sales_order_id = so.id
  AND (i.branch_id IS NULL OR i.warehouse_id IS NULL);

-- 3️⃣ تحديث الفواتير غير المرتبطة بأوامر بيع
UPDATE invoices i
SET 
  branch_id = COALESCE(
    (SELECT branch_id FROM company_members WHERE user_id = i.created_by_user_id AND company_id = i.company_id LIMIT 1),
    (SELECT id FROM branches WHERE company_id = i.company_id AND is_main = true LIMIT 1)
  ),
  cost_center_id = (SELECT cost_center_id FROM company_members WHERE user_id = i.created_by_user_id AND company_id = i.company_id LIMIT 1),
  warehouse_id = COALESCE(
    (SELECT w.id FROM warehouses w 
     INNER JOIN company_members cm ON w.branch_id = cm.branch_id 
     WHERE cm.user_id = i.created_by_user_id AND w.company_id = i.company_id AND w.is_main = true LIMIT 1),
    (SELECT id FROM warehouses WHERE company_id = i.company_id AND is_main = true LIMIT 1)
  )
WHERE (branch_id IS NULL OR warehouse_id IS NULL)
  AND sales_order_id IS NULL;

-- 4️⃣ التحقق من النتائج
SELECT 
  'sales_orders' as table_name,
  COUNT(*) as total,
  COUNT(branch_id) as with_branch,
  COUNT(warehouse_id) as with_warehouse,
  COUNT(created_by_user_id) as with_creator
FROM sales_orders
UNION ALL
SELECT 
  'invoices' as table_name,
  COUNT(*) as total,
  COUNT(branch_id) as with_branch,
  COUNT(warehouse_id) as with_warehouse,
  COUNT(created_by_user_id) as with_creator
FROM invoices;
