-- إصلاح branch_id للفواتير من أوامر البيع
UPDATE invoices i
SET branch_id = so.branch_id
FROM sales_orders so
WHERE i.sales_order_id = so.id
  AND so.branch_id IS NOT NULL;

-- التحقق
SELECT COUNT(*) as fixed_invoices
FROM invoices 
WHERE branch_id = (SELECT branch_id FROM company_members WHERE role = 'accountant' LIMIT 1);
