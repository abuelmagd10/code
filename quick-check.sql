-- فحص سريع: مقارنة branch_id بين المحاسب والفواتير

-- 1. branch_id المحاسب
SELECT 'المحاسب' as type, branch_id, COUNT(*) as count
FROM company_members 
WHERE role = 'accountant'
GROUP BY branch_id;

-- 2. branch_id الفواتير
SELECT 'الفواتير' as type, branch_id, COUNT(*) as count
FROM invoices
GROUP BY branch_id;

-- 3. الفواتير التي يجب أن يراها المحاسب
SELECT COUNT(*) as invoices_in_accountant_branch
FROM invoices i
WHERE i.branch_id = (SELECT branch_id FROM company_members WHERE role = 'accountant' LIMIT 1);
