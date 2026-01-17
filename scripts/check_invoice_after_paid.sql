-- =====================================================
-- التحقق من COGS Transactions بعد تحويل الفاتورة إلى Paid
-- =====================================================

-- =====================================================
-- 1. حالة الفاتورة INV-0003 بعد التحويل
-- =====================================================
SELECT 
  '1. حالة الفاتورة INV-0003' as check_step,
  i.id,
  i.invoice_number,
  i.status,
  i.invoice_date,
  i.updated_at,
  i.branch_id,
  i.cost_center_id,
  i.warehouse_id,
  CASE 
    WHEN i.branch_id IS NULL OR i.cost_center_id IS NULL OR i.warehouse_id IS NULL 
    THEN '❌ تفتقد الحوكمة'
    ELSE '✅ Governance كامل'
  END as governance_status
FROM invoices i
WHERE i.invoice_number = 'INV-0003'
LIMIT 1;

-- =====================================================
-- 2. COGS Transactions للفاتورة (بعد التحديث)
-- =====================================================
SELECT 
  '2. COGS Transactions بعد التحديث' as check_step,
  ct.id,
  ct.product_id,
  p.name as product_name,
  ct.quantity,
  ct.unit_cost,
  ct.total_cost,
  ct.transaction_date,
  ct.created_at,
  ct.fifo_consumption_id,
  CASE 
    WHEN ct.fifo_consumption_id IS NULL THEN '⚠️ بدون FIFO Consumption'
    ELSE '✅ مرتبط بـ FIFO'
  END as fifo_status
FROM invoices i
LEFT JOIN cogs_transactions ct ON ct.source_id = i.id AND ct.source_type = 'invoice'
LEFT JOIN products p ON ct.product_id = p.id
WHERE i.invoice_number = 'INV-0003'
ORDER BY ct.created_at DESC;

-- =====================================================
-- 3. FIFO Consumptions للفاتورة
-- =====================================================
SELECT 
  '3. FIFO Consumptions للفاتورة' as check_step,
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
WHERE i.invoice_number = 'INV-0003'
ORDER BY flc.created_at DESC;

-- =====================================================
-- 4. Inventory Transactions للفاتورة
-- =====================================================
SELECT 
  '4. Inventory Transactions للفاتورة' as check_step,
  it.id,
  it.product_id,
  p.name as product_name,
  it.transaction_type,
  it.quantity_change,
  it.reference_id,
  it.reference_type,
  it.created_at,
  it.notes
FROM invoices i
LEFT JOIN inventory_transactions it ON it.reference_id = i.id AND it.reference_type = 'invoice'
LEFT JOIN products p ON it.product_id = p.id
WHERE i.invoice_number = 'INV-0003'
ORDER BY it.created_at DESC;

-- =====================================================
-- 5. ملخص شامل (آخر تحديث)
-- =====================================================
WITH invoice_data AS (
  SELECT i.id, i.invoice_number, i.status, i.branch_id, i.cost_center_id, i.warehouse_id, i.updated_at
  FROM invoices i
  WHERE i.invoice_number = 'INV-0003'
  LIMIT 1
)
SELECT 
  '5. ملخص شامل (بعد التحويل إلى Paid)' as summary,
  id.invoice_number,
  id.status,
  id.updated_at as last_updated,
  -- عدد المنتجات
  (SELECT COUNT(*) FROM invoice_items ii 
   JOIN products p ON ii.product_id = p.id 
   WHERE ii.invoice_id = id.id AND p.item_type = 'product') as product_items_count,
  -- عدد COGS Transactions
  (SELECT COUNT(*) FROM cogs_transactions ct 
   WHERE ct.source_id = id.id AND ct.source_type = 'invoice') as cogs_transactions_count,
  -- عدد FIFO Consumptions
  (SELECT COUNT(*) FROM fifo_lot_consumptions flc 
   WHERE flc.reference_id = id.id AND flc.reference_type = 'invoice') as fifo_consumptions_count,
  -- إجمالي COGS
  (SELECT COALESCE(SUM(total_cost), 0) FROM cogs_transactions ct 
   WHERE ct.source_id = id.id AND ct.source_type = 'invoice') as total_cogs,
  -- حالة Governance
  CASE 
    WHEN id.branch_id IS NOT NULL 
      AND id.cost_center_id IS NOT NULL 
      AND id.warehouse_id IS NOT NULL 
    THEN '✅ Governance كامل'
    ELSE '❌ تفتقد Governance'
  END as governance_status,
  -- الحالة النهائية
  CASE 
    WHEN (SELECT COUNT(*) FROM cogs_transactions ct 
          WHERE ct.source_id = id.id AND ct.source_type = 'invoice') > 0
    THEN '✅ تم إنشاء COGS Transactions بنجاح ✅'
    WHEN id.branch_id IS NULL OR id.cost_center_id IS NULL OR id.warehouse_id IS NULL
    THEN '❌ تفتقد Governance - لا يمكن إنشاء COGS'
    WHEN id.status = 'paid' AND id.updated_at >= CURRENT_DATE - INTERVAL '1 hour'
    THEN '⚠️ تم التحويل للتو - قد تحتاج إلى إعادة تحميل الصفحة أو التحقق من console logs'
    ELSE '⚠️ لم يتم إنشاء COGS - يرجى التحقق من console logs'
  END as overall_status
FROM invoice_data id;
