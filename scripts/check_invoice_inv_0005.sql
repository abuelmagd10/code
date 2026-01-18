-- =====================================================
-- التحقق من حالة COGS للفاتورة INV-0005
-- =====================================================

-- =====================================================
-- 1. معلومات الفاتورة الأساسية
-- =====================================================
SELECT 
  '1. معلومات الفاتورة' as check_step,
  i.id,
  i.invoice_number,
  i.status,
  i.total_amount,
  i.shipping_provider_id,
  sp.provider_name as shipping_provider_name,
  i.branch_id,
  b.name as branch_name,
  i.cost_center_id,
  cc.cost_center_name,
  i.warehouse_id,
  w.name as warehouse_name,
  i.invoice_date,
  i.created_at,
  i.updated_at
FROM invoices i
LEFT JOIN shipping_providers sp ON sp.id = i.shipping_provider_id
LEFT JOIN branches b ON b.id = i.branch_id
LEFT JOIN cost_centers cc ON cc.id = i.cost_center_id
LEFT JOIN warehouses w ON w.id = i.warehouse_id
WHERE i.invoice_number = 'INV-0005';

-- =====================================================
-- 2. الدفعات المسجلة للفاتورة
-- =====================================================
SELECT 
  '2. الدفعات المسجلة' as check_step,
  p.id,
  p.amount,
  p.payment_date,
  p.payment_method,
  p.reference,
  SUM(p.amount) OVER (PARTITION BY p.reference_id) as total_paid
FROM payments p
WHERE p.reference_type = 'invoice' 
  AND p.reference_id = (SELECT id FROM invoices WHERE invoice_number = 'INV-0005')
ORDER BY p.payment_date, p.created_at;

-- =====================================================
-- 3. Third-Party Inventory Items
-- =====================================================
SELECT 
  '3. Third-Party Inventory' as check_step,
  tpi.id,
  tpi.product_id,
  p.name as product_name,
  tpi.quantity,
  tpi.cleared_quantity,
  tpi.unit_cost,
  tpi.status,
  tpi.cleared_at,
  tpi.created_at
FROM invoices i
LEFT JOIN third_party_inventory tpi ON tpi.invoice_id = i.id
LEFT JOIN products p ON p.id = tpi.product_id
WHERE i.invoice_number = 'INV-0005'
ORDER BY tpi.created_at;

-- =====================================================
-- 4. COGS Transactions
-- =====================================================
SELECT 
  '4. COGS Transactions' as check_step,
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
WHERE i.invoice_number = 'INV-0005'
ORDER BY ct.created_at DESC;

-- =====================================================
-- 5. FIFO Consumptions
-- =====================================================
SELECT 
  '5. FIFO Consumptions' as check_step,
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
WHERE i.invoice_number = 'INV-0005'
ORDER BY flc.created_at DESC;

-- =====================================================
-- 6. Inventory Transactions
-- =====================================================
SELECT 
  '6. Inventory Transactions' as check_step,
  it.id,
  it.product_id,
  p.name as product_name,
  it.transaction_type,
  it.quantity_change,
  it.reference_type,
  it.reference_id,
  it.branch_id,
  it.cost_center_id,
  it.warehouse_id,
  it.created_at
FROM invoices i
LEFT JOIN inventory_transactions it ON it.reference_id = i.id 
  AND (it.reference_type = 'invoice' OR it.transaction_type IN ('sale', 'cogs'))
LEFT JOIN products p ON p.id = it.product_id
WHERE i.invoice_number = 'INV-0005'
ORDER BY it.created_at DESC;

-- =====================================================
-- 7. ملخص شامل للفاتورة
-- =====================================================
SELECT 
  '7. ملخص شامل للفاتورة INV-0005' as summary,
  i.invoice_number,
  i.status,
  i.updated_at as last_updated,
  CASE 
    WHEN i.shipping_provider_id IS NOT NULL THEN 'Third-Party Sales'
    ELSE 'Direct Sales'
  END as sales_type,
  (SELECT COUNT(*) FROM invoice_items WHERE invoice_id = i.id) as product_items_count,
  (SELECT COUNT(*) FROM third_party_inventory WHERE invoice_id = i.id) as third_party_items_count,
  (SELECT COALESCE(SUM(cleared_quantity), 0) FROM third_party_inventory WHERE invoice_id = i.id) as cleared_quantity,
  (SELECT COUNT(*) FROM cogs_transactions WHERE source_id = i.id AND source_type = 'invoice') as cogs_transactions_count,
  (SELECT COALESCE(SUM(total_cost), 0) FROM cogs_transactions WHERE source_id = i.id AND source_type = 'invoice') as total_cogs,
  (SELECT COUNT(*) FROM fifo_lot_consumptions WHERE reference_id = i.id AND reference_type = 'invoice') as fifo_consumptions_count,
  CASE 
    WHEN i.status IN ('paid', 'partially_paid') 
      AND (SELECT COUNT(*) FROM cogs_transactions WHERE source_id = i.id AND source_type = 'invoice') = 0 
    THEN '❌ لم يتم إنشاء COGS - يرجى التحقق من console logs'
    WHEN i.status IN ('paid', 'partially_paid') 
      AND (SELECT COUNT(*) FROM cogs_transactions WHERE source_id = i.id AND source_type = 'invoice') > 0 
    THEN '✅ تم إنشاء COGS بنجاح'
    WHEN i.status = 'sent'
      AND (SELECT COUNT(*) FROM cogs_transactions WHERE source_id = i.id AND source_type = 'invoice') = 0 
    THEN 'ℹ️ تم خصم المخزون - COGS سيتم إنشاؤه عند الدفع'
    ELSE 'ℹ️ حالة عادية'
  END as overall_status
FROM invoices i
WHERE i.invoice_number = 'INV-0005';
