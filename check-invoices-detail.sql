-- فحص الفواتير
SELECT 
  COUNT(*) as total_invoices,
  COUNT(sales_order_id) as with_sales_order,
  COUNT(*) - COUNT(sales_order_id) as without_sales_order,
  COUNT(CASE WHEN branch_id IS NULL THEN 1 END) as null_branch
FROM invoices;

-- فحص branch_id الموجود
SELECT branch_id, COUNT(*) 
FROM invoices 
GROUP BY branch_id;

-- branch_id المحاسب
SELECT branch_id FROM company_members WHERE role = 'accountant' LIMIT 1;
