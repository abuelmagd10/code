-- =====================================================
-- تشخيص الفاتورة INV-0005 قبل إصلاح COGS
-- =====================================================

-- 1. معلومات الفاتورة الأساسية
SELECT 
  '1. Invoice Info' as step,
  i.id,
  i.invoice_number,
  i.status,
  i.company_id,
  i.branch_id,
  i.cost_center_id,
  i.warehouse_id,
  i.invoice_date,
  i.total_amount
FROM invoices i
WHERE i.invoice_number = 'INV-0005';

-- 2. التحقق من Third-Party Inventory
SELECT 
  '2. Third-Party Inventory' as step,
  COUNT(*) as third_party_items_count,
  STRING_AGG(DISTINCT tpi.status, ', ') as statuses
FROM third_party_inventory tpi
JOIN invoices i ON i.id = tpi.invoice_id
WHERE i.invoice_number = 'INV-0005';

-- 3. التحقق من منتجات الفاتورة
SELECT 
  '3. Invoice Items' as step,
  ii.product_id,
  p.name as product_name,
  p.item_type,
  ii.quantity
FROM invoice_items ii
JOIN products p ON p.id = ii.product_id
JOIN invoices i ON i.id = ii.invoice_id
WHERE i.invoice_number = 'INV-0005'
ORDER BY ii.created_at;

-- 4. التحقق من FIFO Lots للمنتجات
SELECT 
  '4. FIFO Lots Availability' as step,
  p.id as product_id,
  p.name as product_name,
  COUNT(fl.id) as available_lots_count,
  COALESCE(SUM(fl.remaining_quantity), 0) as total_available_quantity,
  COALESCE(AVG(fl.unit_cost), 0) as avg_unit_cost
FROM invoice_items ii
JOIN products p ON p.id = ii.product_id
JOIN invoices i ON i.id = ii.invoice_id
LEFT JOIN fifo_cost_lots fl ON fl.product_id = p.id AND fl.remaining_quantity > 0
WHERE i.invoice_number = 'INV-0005'
  AND p.item_type != 'service'
GROUP BY p.id, p.name;

-- 5. التحقق من COGS Transactions الموجودة
SELECT 
  '5. Existing COGS Transactions' as step,
  COUNT(*) as count
FROM cogs_transactions ct
JOIN invoices i ON i.id = ct.source_id
WHERE i.invoice_number = 'INV-0005'
  AND ct.source_type = 'invoice';

-- 6. التحقق من FIFO Consumptions الموجودة
SELECT 
  '6. Existing FIFO Consumptions' as step,
  COUNT(*) as count
FROM fifo_lot_consumptions flc
JOIN invoices i ON i.id = flc.reference_id
WHERE i.invoice_number = 'INV-0005'
  AND flc.reference_type = 'invoice';

-- 7. ملخص التشخيص
SELECT 
  '7. Diagnosis Summary' as step,
  i.invoice_number,
  i.status,
  CASE 
    WHEN i.status NOT IN ('paid', 'partially_paid') THEN '❌ الفاتورة ليست مدفوعة'
    WHEN i.branch_id IS NULL THEN '❌ branch_id مفقود'
    WHEN i.cost_center_id IS NULL THEN '❌ cost_center_id مفقود'
    WHEN i.warehouse_id IS NULL THEN '❌ warehouse_id مفقود'
    WHEN EXISTS (
      SELECT 1 FROM third_party_inventory tpi 
      WHERE tpi.invoice_id = i.id AND tpi.status != 'cleared'
    ) THEN '⚠️ Third-Party Inventory موجود - يجب استخدام clearThirdPartyInventory()'
    WHEN NOT EXISTS (
      SELECT 1 FROM invoice_items ii
      JOIN products p ON p.id = ii.product_id
      WHERE ii.invoice_id = i.id AND p.item_type != 'service'
    ) THEN '⚠️ لا توجد منتجات في الفاتورة (فقط خدمات)'
    WHEN NOT EXISTS (
      SELECT 1 FROM invoice_items ii
      JOIN products p ON p.id = ii.product_id
      JOIN fifo_cost_lots fl ON fl.product_id = p.id AND fl.remaining_quantity > 0
      WHERE ii.invoice_id = i.id AND p.item_type != 'service'
    ) THEN '❌ لا توجد FIFO Lots متاحة للمنتجات'
    WHEN EXISTS (
      SELECT 1 FROM cogs_transactions ct
      WHERE ct.source_id = i.id AND ct.source_type = 'invoice'
    ) THEN 'ℹ️ COGS Transactions موجودة بالفعل'
    ELSE '✅ جاهزة للإصلاح'
  END as diagnosis
FROM invoices i
WHERE i.invoice_number = 'INV-0005';
