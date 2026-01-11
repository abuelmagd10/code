-- تحديث created_by_user_id للفواتير مباشرة
-- نفذ هذا SQL في Supabase

-- تحديث من أوامر البيع
UPDATE invoices i
SET created_by_user_id = so.created_by_user_id
FROM sales_orders so
WHERE i.sales_order_id = so.id
  AND i.created_by_user_id IS NULL;

-- تحديث الفواتير المستقلة
UPDATE invoices i
SET created_by_user_id = (
  SELECT user_id 
  FROM company_members 
  WHERE company_id = i.company_id 
    AND role IN ('owner', 'admin')
  LIMIT 1
)
WHERE created_by_user_id IS NULL;

-- التحقق
SELECT COUNT(*) as total, COUNT(created_by_user_id) as with_creator FROM invoices;
