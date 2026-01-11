-- تحديث جميع الفواتير بـ branch_id الصحيح
UPDATE invoices
SET branch_id = '3808e27d-8461-4684-989d-fddbb4f5d029'
WHERE branch_id IS NULL OR branch_id != '3808e27d-8461-4684-989d-fddbb4f5d029';

-- التحقق
SELECT COUNT(*) as total_invoices_in_branch
FROM invoices 
WHERE branch_id = '3808e27d-8461-4684-989d-fddbb4f5d029';
