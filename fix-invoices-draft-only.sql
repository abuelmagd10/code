-- تحديث created_by_user_id للفواتير غير المدفوعة فقط
-- نفذ هذا SQL في Supabase

-- تحديث الفواتير draft فقط من أوامر البيع
UPDATE invoices i
SET created_by_user_id = so.created_by_user_id
FROM sales_orders so
WHERE i.sales_order_id = so.id
  AND i.created_by_user_id IS NULL
  AND i.status = 'draft';

-- تحديث الفواتير draft المستقلة
UPDATE invoices i
SET created_by_user_id = (
  SELECT user_id 
  FROM company_members 
  WHERE company_id = i.company_id 
    AND role IN ('owner', 'admin')
  LIMIT 1
)
WHERE created_by_user_id IS NULL
  AND status = 'draft';

-- التحقق النهائي
SELECT 
  status,
  COUNT(*) as total,
  COUNT(created_by_user_id) as with_creator,
  COUNT(*) - COUNT(created_by_user_id) as without_creator
FROM invoices
GROUP BY status
ORDER BY status;
