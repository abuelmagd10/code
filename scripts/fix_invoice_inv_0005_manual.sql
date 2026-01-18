-- =====================================================
-- إصلاح COGS للفاتورة INV-0005 (Third-Party) - نسخة يدوية
-- شركة Test Company - فرع مصر الجديدة
-- =====================================================
-- هذه نسخة يدوية بدون DO block - للاستخدام عند فشل DO block

-- أولاً: الحصول على invoice_id
-- استبدل هذه القيم بالقيم الفعلية من استعلام التحقق

-- مثال (استبدل بالقيم الفعلية):
-- v_invoice_id = 'ef5e69a3-f4ef-493a-9b2e-e5cffc16173c' -- من استعلام التحقق
-- v_third_party_item_id = '...' -- من استعلام Third-Party Inventory
-- v_quantity_to_clear = ... -- من (quantity - cleared_quantity)

-- 1. إنشاء fifo_lot_consumption (استخدم أول Lot من نفس Branch)
INSERT INTO fifo_lot_consumptions (
  lot_id,
  product_id,
  quantity_consumed,
  unit_cost,
  total_cost,
  consumption_date,
  reference_type,
  reference_id,
  created_at,
  updated_at
)
SELECT 
  fl.id as lot_id,
  tpi.product_id,
  LEAST(
    (tpi.quantity - COALESCE(tpi.cleared_quantity, 0)), 
    fl.remaining_quantity
  ) as quantity_consumed,
  fl.unit_cost,
  LEAST(
    (tpi.quantity - COALESCE(tpi.cleared_quantity, 0)), 
    fl.remaining_quantity
  ) * fl.unit_cost as total_cost,
  i.invoice_date as consumption_date,
  'invoice' as reference_type,
  i.id as reference_id,
  NOW() as created_at,
  NOW() as updated_at
FROM invoices i
JOIN third_party_inventory tpi ON tpi.invoice_id = i.id
JOIN fifo_cost_lots fl ON fl.product_id = tpi.product_id
LEFT JOIN companies c ON c.id = i.company_id
LEFT JOIN branches b ON b.id = i.branch_id
WHERE i.invoice_number = 'INV-0005'
  AND (c.name ILIKE '%test%' OR c.name ILIKE '%تست%')
  AND (b.name ILIKE '%مصر الجديدة%' OR b.branch_name ILIKE '%مصر الجديدة%' OR b.name ILIKE '%new egypt%')
  AND tpi.status != 'cleared'
  AND fl.company_id = i.company_id
  AND fl.remaining_quantity > 0
  -- ✅ أولوية للـ Lots من نفس Branch
  AND fl.branch_id = i.branch_id
ORDER BY fl.lot_date ASC, fl.created_at ASC
LIMIT 1
RETURNING id;

-- 2. إنشاء cogs_transaction (استخدم Consumption ID من الخطوة 1)
-- ⚠️ استبدل 'CONSUMPTION_ID_HERE' بـ ID من الخطوة 1
INSERT INTO cogs_transactions (
  company_id,
  branch_id,
  cost_center_id,
  warehouse_id,
  product_id,
  source_type,
  source_id,
  quantity,
  unit_cost,
  total_cost,
  fifo_consumption_id,
  transaction_date,
  created_at,
  updated_at
)
SELECT 
  i.company_id,
  i.branch_id,
  i.cost_center_id,
  i.warehouse_id,
  tpi.product_id,
  'invoice' as source_type,
  i.id as source_id,
  flc.quantity_consumed as quantity,
  flc.unit_cost,
  flc.total_cost,
  flc.id as fifo_consumption_id,
  i.invoice_date as transaction_date,
  NOW() as created_at,
  NOW() as updated_at
FROM invoices i
JOIN third_party_inventory tpi ON tpi.invoice_id = i.id
JOIN fifo_lot_consumptions flc ON flc.reference_id = i.id 
  AND flc.reference_type = 'invoice'
  AND flc.product_id = tpi.product_id
LEFT JOIN companies c ON c.id = i.company_id
LEFT JOIN branches b ON b.id = i.branch_id
WHERE i.invoice_number = 'INV-0005'
  AND (c.name ILIKE '%test%' OR c.name ILIKE '%تست%')
  AND (b.name ILIKE '%مصر الجديدة%' OR b.branch_name ILIKE '%مصر الجديدة%' OR b.name ILIKE '%new egypt%')
  AND tpi.status != 'cleared'
  AND flc.id NOT IN (SELECT fifo_consumption_id FROM cogs_transactions WHERE fifo_consumption_id IS NOT NULL);

-- 3. تحديث Third-Party Inventory status
UPDATE third_party_inventory tpi
SET 
  cleared_quantity = tpi.quantity,  -- 100% cleared (paid invoice)
  status = 'cleared',
  cleared_at = NOW(),
  updated_at = NOW()
FROM invoices i
LEFT JOIN companies c ON c.id = i.company_id
LEFT JOIN branches b ON b.id = i.branch_id
WHERE tpi.invoice_id = i.id
  AND i.invoice_number = 'INV-0005'
  AND (c.name ILIKE '%test%' OR c.name ILIKE '%تست%')
  AND (b.name ILIKE '%مصر الجديدة%' OR b.branch_name ILIKE '%مصر الجديدة%' OR b.name ILIKE '%new egypt%')
  AND tpi.status != 'cleared'
  AND EXISTS (
    SELECT 1 FROM cogs_transactions ct
    WHERE ct.source_id = i.id 
      AND ct.source_type = 'invoice'
      AND ct.product_id = tpi.product_id
  );

-- 4. التحقق من النتيجة
SELECT 
  'Result Verification' as check_type,
  i.invoice_number,
  COUNT(DISTINCT ct.id) as cogs_transactions_count,
  COALESCE(SUM(ct.total_cost), 0) as total_cogs,
  COUNT(DISTINCT flc.id) as fifo_consumptions_count,
  MAX(tpi.status) as third_party_status
FROM invoices i
LEFT JOIN cogs_transactions ct ON ct.source_id = i.id AND ct.source_type = 'invoice'
LEFT JOIN fifo_lot_consumptions flc ON flc.reference_id = i.id AND flc.reference_type = 'invoice'
LEFT JOIN third_party_inventory tpi ON tpi.invoice_id = i.id
LEFT JOIN companies c ON c.id = i.company_id
LEFT JOIN branches b ON b.id = i.branch_id
WHERE i.invoice_number = 'INV-0005'
  AND (c.name ILIKE '%test%' OR c.name ILIKE '%تست%')
  AND (b.name ILIKE '%مصر الجديدة%' OR b.branch_name ILIKE '%مصر الجديدة%' OR b.name ILIKE '%new egypt%')
GROUP BY i.invoice_number;
