-- =====================================================
-- تشخيص تفصيلي للفاتورة INV-0005 (Third-Party)
-- =====================================================

-- 1. معلومات Third-Party Inventory
SELECT 
  'Third-Party Inventory Details' as check_type,
  tpi.id,
  tpi.product_id,
  p.name as product_name,
  tpi.quantity,
  tpi.cleared_quantity,
  tpi.status,
  tpi.warehouse_id
FROM third_party_inventory tpi
JOIN products p ON p.id = tpi.product_id
JOIN invoices i ON i.id = tpi.invoice_id
LEFT JOIN companies c ON c.id = i.company_id
LEFT JOIN branches b ON b.id = i.branch_id
WHERE i.invoice_number = 'INV-0005'
  AND (c.name ILIKE '%test%' OR c.name ILIKE '%تست%')
  AND (b.name ILIKE '%مصر الجديدة%' OR b.branch_name ILIKE '%مصر الجديدة%' OR b.name ILIKE '%new egypt%');

-- 2. FIFO Lots للمنتج في Third-Party Inventory
SELECT 
  'FIFO Lots for Third-Party Product' as check_type,
  p.id as product_id,
  p.name as product_name,
  fl.id as lot_id,
  fl.lot_date,
  fl.remaining_quantity,
  fl.unit_cost,
  fl.company_id,
  fl.branch_id,
  fl.warehouse_id
FROM third_party_inventory tpi
JOIN products p ON p.id = tpi.product_id
JOIN invoices i ON i.id = tpi.invoice_id
LEFT JOIN companies c ON c.id = i.company_id
LEFT JOIN branches b ON b.id = i.branch_id
LEFT JOIN fifo_cost_lots fl ON fl.product_id = p.id AND fl.remaining_quantity > 0
WHERE i.invoice_number = 'INV-0005'
  AND (c.name ILIKE '%test%' OR c.name ILIKE '%تست%')
  AND (b.name ILIKE '%مصر الجديدة%' OR b.branch_name ILIKE '%مصر الجديدة%' OR b.name ILIKE '%new egypt%')
ORDER BY fl.lot_date, fl.created_at;

-- 3. مقارنة Company/Branch/Warehouse بين Invoice و FIFO Lots
SELECT 
  'Governance Comparison' as check_type,
  i.invoice_number,
  i.company_id as invoice_company_id,
  i.branch_id as invoice_branch_id,
  i.warehouse_id as invoice_warehouse_id,
  tpi.product_id,
  fl.company_id as fifo_company_id,
  fl.branch_id as fifo_branch_id,
  fl.warehouse_id as fifo_warehouse_id,
  CASE 
    WHEN fl.id IS NULL THEN '❌ لا توجد FIFO Lots'
    WHEN fl.company_id != i.company_id THEN '⚠️ Company ID مختلف'
    WHEN fl.branch_id IS NOT NULL AND fl.branch_id != i.branch_id THEN '⚠️ Branch ID مختلف'
    WHEN fl.warehouse_id IS NOT NULL AND fl.warehouse_id != i.warehouse_id THEN '⚠️ Warehouse ID مختلف'
    ELSE '✅ Governance متطابق'
  END as governance_match
FROM invoices i
JOIN third_party_inventory tpi ON tpi.invoice_id = i.id
LEFT JOIN companies c ON c.id = i.company_id
LEFT JOIN branches b ON b.id = i.branch_id
LEFT JOIN fifo_cost_lots fl ON fl.product_id = tpi.product_id AND fl.remaining_quantity > 0
WHERE i.invoice_number = 'INV-0005'
  AND (c.name ILIKE '%test%' OR c.name ILIKE '%تست%')
  AND (b.name ILIKE '%مصر الجديدة%' OR b.branch_name ILIKE '%مصر الجديدة%' OR b.name ILIKE '%new egypt%')
ORDER BY fl.lot_date, fl.created_at;
