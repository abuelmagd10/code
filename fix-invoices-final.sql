-- تعطيل trigger
ALTER TABLE invoices DISABLE TRIGGER trg_prevent_paid_invoice_modification;

-- تحديث جميع الفواتير
UPDATE invoices
SET branch_id = '3808e27d-8461-4684-989d-fddbb4f5d029'
WHERE branch_id IS NULL OR branch_id != '3808e27d-8461-4684-989d-fddbb4f5d029';

-- إعادة تفعيل trigger
ALTER TABLE invoices ENABLE TRIGGER trg_prevent_paid_invoice_modification;

-- التحقق
SELECT COUNT(*) as total_invoices
FROM invoices 
WHERE branch_id = '3808e27d-8461-4684-989d-fddbb4f5d029';
