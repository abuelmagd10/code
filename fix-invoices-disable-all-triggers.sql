-- البحث عن الـ trigger وتعطيله ثم التحديث
-- نفذ هذا SQL في Supabase

-- 1. البحث عن جميع الـ triggers على جدول invoices
SELECT trigger_name 
FROM information_schema.triggers 
WHERE event_object_table = 'invoices';

-- 2. بعد معرفة اسم الـ trigger، نفذ هذا:
-- (استبدل TRIGGER_NAME باسم الـ trigger الفعلي)

-- تعطيل جميع الـ triggers
ALTER TABLE invoices DISABLE TRIGGER ALL;

-- تحديث created_by_user_id
UPDATE invoices i
SET created_by_user_id = so.created_by_user_id
FROM sales_orders so
WHERE i.sales_order_id = so.id
  AND i.created_by_user_id IS NULL;

UPDATE invoices i
SET created_by_user_id = (
  SELECT user_id 
  FROM company_members 
  WHERE company_id = i.company_id 
    AND role IN ('owner', 'admin')
  LIMIT 1
)
WHERE created_by_user_id IS NULL;

-- إعادة تفعيل جميع الـ triggers
ALTER TABLE invoices ENABLE TRIGGER ALL;

-- التحقق
SELECT COUNT(*) as total, COUNT(created_by_user_id) as with_creator FROM invoices;
