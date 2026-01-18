-- =====================================================
-- إصلاح COGS للفاتورة INV-0005 (Third-Party) - نسخة مبسطة
-- شركة Test Company - فرع مصر الجديدة
-- =====================================================
-- هذه نسخة مبسطة بدون DO block للاختبار خطوة بخطوة

-- 1. التحقق من الفاتورة
SELECT 
  i.id as invoice_id,
  i.invoice_number,
  i.company_id,
  i.branch_id,
  i.cost_center_id,
  i.warehouse_id,
  i.status
FROM invoices i
LEFT JOIN companies c ON c.id = i.company_id
LEFT JOIN branches b ON b.id = i.branch_id
WHERE i.invoice_number = 'INV-0005'
  AND (c.name ILIKE '%test%' OR c.name ILIKE '%تست%')
  AND (b.name ILIKE '%مصر الجديدة%' OR b.branch_name ILIKE '%مصر الجديدة%' OR b.name ILIKE '%new egypt%');

-- 2. التحقق من Third-Party Inventory
SELECT 
  tpi.id,
  tpi.product_id,
  p.name as product_name,
  tpi.quantity,
  tpi.cleared_quantity,
  tpi.status,
  (tpi.quantity - COALESCE(tpi.cleared_quantity, 0)) as quantity_to_clear
FROM third_party_inventory tpi
JOIN products p ON p.id = tpi.product_id
JOIN invoices i ON i.id = tpi.invoice_id
LEFT JOIN companies c ON c.id = i.company_id
LEFT JOIN branches b ON b.id = i.branch_id
WHERE i.invoice_number = 'INV-0005'
  AND (c.name ILIKE '%test%' OR c.name ILIKE '%تست%')
  AND (b.name ILIKE '%مصر الجديدة%' OR b.branch_name ILIKE '%مصر الجديدة%' OR b.name ILIKE '%new egypt%')
  AND tpi.status != 'cleared';

-- 3. التحقق من FIFO Lots المتاحة
SELECT 
  fl.id as lot_id,
  fl.product_id,
  fl.lot_date,
  fl.remaining_quantity,
  fl.unit_cost,
  fl.company_id,
  fl.branch_id,
  fl.warehouse_id
FROM fifo_cost_lots fl
JOIN third_party_inventory tpi ON tpi.product_id = fl.product_id
JOIN invoices i ON i.id = tpi.invoice_id
LEFT JOIN companies c ON c.id = i.company_id
LEFT JOIN branches b ON b.id = i.branch_id
WHERE i.invoice_number = 'INV-0005'
  AND (c.name ILIKE '%test%' OR c.name ILIKE '%تست%')
  AND (b.name ILIKE '%مصر الجديدة%' OR b.branch_name ILIKE '%مصر الجديدة%' OR b.name ILIKE '%new egypt%')
  AND fl.company_id = i.company_id
  AND fl.remaining_quantity > 0
ORDER BY 
  CASE 
    WHEN fl.branch_id = i.branch_id AND (fl.warehouse_id = i.warehouse_id OR fl.warehouse_id IS NULL) THEN 1
    WHEN fl.branch_id = i.branch_id THEN 2
    ELSE 3
  END,
  fl.lot_date ASC;
