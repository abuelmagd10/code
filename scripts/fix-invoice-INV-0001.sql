-- ============================================
-- إصلاح بيانات الفاتورة INV-0001
-- ============================================

-- 1️⃣ فحص البيانات الحالية
SELECT 
  id,
  invoice_number,
  total_amount,
  subtotal,
  tax_amount,
  paid_amount,
  returned_amount,
  status,
  return_status
FROM invoices 
WHERE invoice_number = 'INV-0001';

-- 2️⃣ فحص بنود الفاتورة
SELECT 
  id,
  product_id,
  quantity,
  returned_quantity,
  unit_price,
  discount_percent,
  tax_rate,
  line_total
FROM invoice_items 
WHERE invoice_id = (SELECT id FROM invoices WHERE invoice_number = 'INV-0001');

-- 3️⃣ فحص المرتجعات
SELECT 
  id,
  invoice_id,
  return_date,
  return_type,
  subtotal,
  tax_amount,
  total_amount,
  status
FROM sales_returns 
WHERE invoice_id = (SELECT id FROM invoices WHERE invoice_number = 'INV-0001');

-- ============================================
-- الإصلاح (إذا لزم الأمر)
-- ============================================

-- إذا كانت returned_quantity سالبة، اجعلها موجبة:
-- UPDATE invoice_items 
-- SET returned_quantity = ABS(returned_quantity)
-- WHERE invoice_id = (SELECT id FROM invoices WHERE invoice_number = 'INV-0001')
--   AND returned_quantity < 0;

-- إذا كان total_amount = 0 والمفروض يكون 20000:
-- UPDATE invoices 
-- SET 
--   subtotal = 20000,
--   total_amount = 20000,
--   tax_amount = 0
-- WHERE invoice_number = 'INV-0001'
--   AND total_amount = 0;

-- ============================================
-- التحقق بعد الإصلاح
-- ============================================

-- حساب الإجمالي الصحيح من البنود:
SELECT 
  SUM(quantity * unit_price * (1 - COALESCE(discount_percent, 0) / 100) * (1 + COALESCE(tax_rate, 0) / 100)) as calculated_total,
  SUM(COALESCE(returned_quantity, 0) * unit_price * (1 - COALESCE(discount_percent, 0) / 100) * (1 + COALESCE(tax_rate, 0) / 100)) as calculated_returned
FROM invoice_items 
WHERE invoice_id = (SELECT id FROM invoices WHERE invoice_number = 'INV-0001');

