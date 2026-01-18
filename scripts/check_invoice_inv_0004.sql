-- =====================================================
-- التحقق من فاتورة INV-0004 (Third-Party Goods)
-- =====================================================

-- =====================================================
-- 1. معلومات الفاتورة
-- =====================================================
SELECT 
  '1. معلومات الفاتورة INV-0004' as check_step,
  i.id,
  i.invoice_number,
  i.status,
  i.invoice_date,
  i.created_at,
  i.updated_at,
  i.shipping_provider_id,
  i.branch_id,
  i.cost_center_id,
  i.warehouse_id,
  sp.provider_name as shipping_provider_name,
  CASE 
    WHEN i.branch_id IS NULL OR i.cost_center_id IS NULL OR i.warehouse_id IS NULL 
    THEN '❌ تفتقد الحوكمة'
    ELSE '✅ Governance كامل'
  END as governance_status
FROM invoices i
LEFT JOIN shipping_providers sp ON sp.id = i.shipping_provider_id
WHERE i.invoice_number = 'INV-0004'
LIMIT 1;

-- =====================================================
-- 2. Third-Party Inventory للفاتورة
-- =====================================================
SELECT 
  '2. Third-Party Inventory' as check_step,
  tpi.id,
  tpi.product_id,
  p.name as product_name,
  tpi.quantity,
  tpi.unit_cost,
  tpi.cleared_quantity,
  tpi.status,
  tpi.created_at,
  tpi.cleared_at
FROM invoices i
JOIN third_party_inventory tpi ON tpi.invoice_id = i.id
JOIN products p ON tpi.product_id = p.id
WHERE i.invoice_number = 'INV-0004'
ORDER BY tpi.created_at DESC;

-- =====================================================
-- 3. COGS Transactions للفاتورة
-- =====================================================
SELECT 
  '3. COGS Transactions للفاتورة' as check_step,
  ct.id,
  ct.product_id,
  p.name as product_name,
  ct.quantity,
  ct.unit_cost,
  ct.total_cost,
  ct.source_type,
  ct.transaction_date,
  ct.created_at,
  ct.fifo_consumption_id
FROM invoices i
LEFT JOIN cogs_transactions ct ON ct.source_id = i.id AND ct.source_type = 'invoice'
LEFT JOIN products p ON ct.product_id = p.id
WHERE i.invoice_number = 'INV-0004'
ORDER BY ct.created_at DESC;

-- =====================================================
-- 4. FIFO Consumptions للفاتورة
-- =====================================================
SELECT 
  '4. FIFO Consumptions للفاتورة' as check_step,
  flc.id,
  flc.lot_id,
  flc.product_id,
  p.name as product_name,
  flc.quantity_consumed,
  flc.unit_cost,
  flc.total_cost,
  flc.consumption_date,
  flc.created_at
FROM invoices i
LEFT JOIN fifo_lot_consumptions flc ON flc.reference_id = i.id AND flc.reference_type = 'invoice'
LEFT JOIN products p ON flc.product_id = p.id
WHERE i.invoice_number = 'INV-0004'
ORDER BY flc.created_at DESC;

-- =====================================================
-- 5. Inventory Transactions للفاتورة
-- =====================================================
SELECT 
  '5. Inventory Transactions للفاتورة' as check_step,
  it.id,
  it.product_id,
  p.name as product_name,
  it.transaction_type,
  it.quantity_change,
  it.from_location_type,
  it.from_location_id,
  it.reference_type,
  it.reference_id,
  it.created_at,
  it.notes
FROM invoices i
LEFT JOIN inventory_transactions it ON it.reference_id = i.id AND it.reference_type = 'invoice'
LEFT JOIN products p ON it.product_id = p.id
WHERE i.invoice_number = 'INV-0004'
ORDER BY it.created_at DESC;

-- =====================================================
-- 6. ملخص شامل
-- =====================================================
WITH invoice_data AS (
  SELECT i.id, i.invoice_number, i.status, i.shipping_provider_id, 
         i.branch_id, i.cost_center_id, i.warehouse_id, i.updated_at
  FROM invoices i
  WHERE i.invoice_number = 'INV-0004'
  LIMIT 1
)
SELECT 
  '6. ملخص شامل للفاتورة INV-0004' as summary,
  id.invoice_number,
  id.status,
  id.updated_at as last_updated,
  CASE 
    WHEN id.shipping_provider_id IS NOT NULL THEN '✅ Third-Party Goods'
    ELSE 'Direct Sales'
  END as sales_type,
  -- عدد المنتجات
  (SELECT COUNT(*) FROM invoice_items ii 
   JOIN products p ON ii.product_id = p.id 
   WHERE ii.invoice_id = id.id AND p.item_type = 'product') as product_items_count,
  -- Third-Party Inventory
  (SELECT COUNT(*) FROM third_party_inventory tpi WHERE tpi.invoice_id = id.id) as third_party_items_count,
  (SELECT COALESCE(SUM(cleared_quantity), 0) FROM third_party_inventory tpi WHERE tpi.invoice_id = id.id) as cleared_quantity,
  -- COGS Transactions
  (SELECT COUNT(*) FROM cogs_transactions ct 
   WHERE ct.source_id = id.id AND ct.source_type = 'invoice') as cogs_transactions_count,
  (SELECT COALESCE(SUM(total_cost), 0) FROM cogs_transactions ct 
   WHERE ct.source_id = id.id AND ct.source_type = 'invoice') as total_cogs,
  -- FIFO Consumptions
  (SELECT COUNT(*) FROM fifo_lot_consumptions flc 
   WHERE flc.reference_id = id.id AND flc.reference_type = 'invoice') as fifo_consumptions_count,
  -- الحالة النهائية
  CASE 
    WHEN id.status = 'paid' 
      AND (SELECT COUNT(*) FROM cogs_transactions ct 
           WHERE ct.source_id = id.id AND ct.source_type = 'invoice') > 0
    THEN '✅ تم إنشاء COGS Transactions بنجاح ✅'
    WHEN id.status = 'paid' 
      AND id.shipping_provider_id IS NOT NULL
      AND (SELECT COALESCE(SUM(cleared_quantity), 0) FROM third_party_inventory tpi WHERE tpi.invoice_id = id.id) = 0
    THEN '⚠️ Third-Party Goods - لم يتم تصفية (clearing) بعد - COGS سيتم إنشاؤه عند clearThirdPartyInventory()'
    WHEN id.status = 'paid'
      AND (SELECT COUNT(*) FROM cogs_transactions ct 
           WHERE ct.source_id = id.id AND ct.source_type = 'invoice') = 0
    THEN '❌ لم يتم إنشاء COGS - يرجى التحقق من console logs'
    ELSE 'ℹ️ Status: ' || id.status
  END as overall_status
FROM invoice_data id;
