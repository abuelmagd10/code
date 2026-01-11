-- اصلاح created_by_user_id للفواتير مع تعطيل الـ trigger
-- نفذ هذا SQL في Supabase

-- 1. تعطيل الـ trigger مؤقتاً
ALTER TABLE invoices DISABLE TRIGGER prevent_paid_invoice_modification_trigger;

-- 2. تحديث created_by_user_id للفواتير من أوامر البيع
UPDATE invoices i
SET created_by_user_id = so.created_by_user_id
FROM sales_orders so
WHERE i.sales_order_id = so.id
  AND i.created_by_user_id IS NULL;

-- 3. تحديث created_by_user_id للفواتير المستقلة
UPDATE invoices i
SET created_by_user_id = (
  SELECT user_id 
  FROM company_members 
  WHERE company_id = i.company_id 
    AND role IN ('owner', 'admin')
  LIMIT 1
)
WHERE created_by_user_id IS NULL;

-- 4. إعادة تفعيل الـ trigger
ALTER TABLE invoices ENABLE TRIGGER prevent_paid_invoice_modification_trigger;

-- 5. التحقق من النتائج
SELECT 
  'invoices' as table_name,
  COUNT(*) as total,
  COUNT(created_by_user_id) as with_creator,
  ROUND(COUNT(created_by_user_id)::numeric / NULLIF(COUNT(*), 0)::numeric * 100, 2) as creator_percentage
FROM invoices;
