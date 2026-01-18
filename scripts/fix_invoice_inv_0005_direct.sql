-- =====================================================
-- إصلاح COGS للفاتورة INV-0005 (Third-Party) - مباشر
-- شركة Test Company - فرع مصر الجديدة
-- =====================================================
-- سكريبت مباشر بدون DO block - ينفذ خطوات منفصلة

-- الخطوة 1: إنشاء fifo_lot_consumption
WITH invoice_data AS (
  SELECT 
    i.id as invoice_id,
    i.invoice_date,
    i.company_id,
    i.branch_id,
    i.cost_center_id,
    i.warehouse_id,
    tpi.id as third_party_item_id,
    tpi.product_id,
    tpi.quantity,
    COALESCE(tpi.cleared_quantity, 0) as cleared_quantity,
    (tpi.quantity - COALESCE(tpi.cleared_quantity, 0)) as quantity_to_clear
  FROM invoices i
  JOIN third_party_inventory tpi ON tpi.invoice_id = i.id
  LEFT JOIN companies c ON c.id = i.company_id
  LEFT JOIN branches b ON b.id = i.branch_id
  WHERE i.invoice_number = 'INV-0005'
    AND (c.name ILIKE '%test%' OR c.name ILIKE '%تست%')
    AND (b.name ILIKE '%مصر الجديدة%' OR b.branch_name ILIKE '%مصر الجديدة%' OR b.name ILIKE '%new egypt%')
    AND tpi.status != 'cleared'
),
lot_to_use AS (
  SELECT 
    fl.id as lot_id,
    fl.product_id,
    fl.remaining_quantity,
    fl.unit_cost,
    fl.lot_date,
    id.quantity_to_clear,
    LEAST(id.quantity_to_clear, fl.remaining_quantity) as quantity_consumed
  FROM invoice_data id
  JOIN fifo_cost_lots fl ON fl.product_id = id.product_id
  WHERE fl.company_id = id.company_id
    AND fl.branch_id = id.branch_id  -- ✅ أولوية للـ Lots من نفس Branch
    AND fl.remaining_quantity > 0
  ORDER BY fl.lot_date ASC, fl.created_at ASC
  LIMIT 1
)
INSERT INTO fifo_lot_consumptions (
  lot_id,
  product_id,
  quantity_consumed,
  unit_cost,
  total_cost,
  consumption_date,
  reference_type,
  reference_id,
  created_at
)
SELECT 
  ltu.lot_id,
  ltu.product_id,
  ltu.quantity_consumed,
  ltu.unit_cost,
  ltu.quantity_consumed * ltu.unit_cost as total_cost,
  id.invoice_date,
  'invoice',
  id.invoice_id,
  NOW()
FROM lot_to_use ltu
CROSS JOIN invoice_data id
WHERE NOT EXISTS (
  SELECT 1 FROM fifo_lot_consumptions flc
  WHERE flc.lot_id = ltu.lot_id
    AND flc.reference_id = id.invoice_id
    AND flc.reference_type = 'invoice'
)
RETURNING id, reference_id, product_id, quantity_consumed, unit_cost, total_cost;

-- الخطوة 2: إنشاء cogs_transaction (بعد إنشاء consumption)
WITH consumption_data AS (
  SELECT 
    flc.id as consumption_id,
    flc.reference_id as invoice_id,
    flc.product_id,
    flc.quantity_consumed,
    flc.unit_cost,
    flc.total_cost
  FROM fifo_lot_consumptions flc
  JOIN invoices i ON i.id = flc.reference_id
  LEFT JOIN companies c ON c.id = i.company_id
  LEFT JOIN branches b ON b.id = i.branch_id
  WHERE i.invoice_number = 'INV-0005'
    AND (c.name ILIKE '%test%' OR c.name ILIKE '%تست%')
    AND (b.name ILIKE '%مصر الجديدة%' OR b.branch_name ILIKE '%مصر الجديدة%' OR b.name ILIKE '%new egypt%')
    AND flc.reference_type = 'invoice'
    AND NOT EXISTS (
      SELECT 1 FROM cogs_transactions ct
      WHERE ct.fifo_consumption_id = flc.id
    )
)
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
  cd.product_id,
  'invoice',
  cd.invoice_id,
  cd.quantity_consumed,
  cd.unit_cost,
  cd.total_cost,
  cd.consumption_id,
  i.invoice_date,
  NOW(),
  NOW()
FROM consumption_data cd
JOIN invoices i ON i.id = cd.invoice_id;

-- الخطوة 3: تحديث Third-Party Inventory status
UPDATE third_party_inventory tpi
SET 
  cleared_quantity = tpi.quantity,
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

-- الخطوة 4: التحقق من النتيجة
SELECT 
  'Final Verification' as check_type,
  i.invoice_number,
  COUNT(DISTINCT ct.id) as cogs_transactions_count,
  COALESCE(SUM(ct.total_cost), 0) as total_cogs,
  COUNT(DISTINCT flc.id) as fifo_consumptions_count,
  MAX(tpi.status) as third_party_status,
  MAX(tpi.cleared_quantity) as cleared_quantity
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
