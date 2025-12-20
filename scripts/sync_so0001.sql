-- تحديث أمر البيع SO-0001 ليتطابق مع الفاتورة INV-0001
UPDATE sales_orders 
SET 
  subtotal = 0,
  tax_amount = 0,
  total = 0
WHERE so_number = 'SO-0001'
  AND company_id = '3a663f6b-0689-4952-93c1-6d958c737089';

-- التحقق من النتيجة
SELECT 
  so_number,
  subtotal,
  tax_amount,
  total,
  status
FROM sales_orders 
WHERE so_number = 'SO-0001'
  AND company_id = '3a663f6b-0689-4952-93c1-6d958c737089';