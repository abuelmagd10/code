-- =====================================================
-- إصلاح COGS Transactions لجميع فواتير Third-Party Inventory
-- =====================================================
-- الغرض: إنشاء COGS transactions للفواتير المدفوعة التي لديها Third-Party Inventory
-- 
-- ⚠️ تحذير: هذا السكريبت يتعامل مع البيانات الموجودة
-- يرجى عمل backup قبل التشغيل
-- 
-- الشروط:
-- 1. الفاتورة في حالة "paid" أو "partially_paid"
-- 2. لديها Third-Party Inventory بحالة "open" أو "partial"
-- 3. لا توجد COGS transactions للفاتورة
-- 4. FIFO Lots متاحة للمنتجات
-- =====================================================

-- ===== الخطوة 1: إنشاء fifo_lot_consumptions لجميع Third-Party Items =====
WITH ThirdPartyItemsToClear AS (
  SELECT
    tpi.id AS tpi_id,
    tpi.product_id,
    p.name AS product_name,
    tpi.quantity,
    COALESCE(tpi.cleared_quantity, 0) AS cleared_quantity,
    tpi.status,
    (tpi.quantity - COALESCE(tpi.cleared_quantity, 0)) AS quantity_to_clear,
    i.id AS invoice_id,
    i.invoice_number,
    i.company_id,
    i.branch_id,
    i.cost_center_id,
    i.warehouse_id,
    i.invoice_date,
    i.status AS invoice_status
  FROM third_party_inventory tpi
  JOIN invoices i ON i.id = tpi.invoice_id
  JOIN products p ON p.id = tpi.product_id
  WHERE i.status IN ('paid', 'partially_paid')
    AND tpi.status IN ('open', 'partial')
    AND (tpi.quantity - COALESCE(tpi.cleared_quantity, 0)) > 0
    -- التحقق من عدم وجود COGS transactions
    AND NOT EXISTS (
      SELECT 1 FROM cogs_transactions ct
      WHERE ct.source_id = i.id AND ct.source_type = 'invoice'
    )
    -- التحقق من وجود الحوكمة
    AND i.branch_id IS NOT NULL
    AND i.cost_center_id IS NOT NULL
    AND i.warehouse_id IS NOT NULL
),
FIFOLotsForThirdParty AS (
  SELECT
    tpi.tpi_id,
    tpi.invoice_id,
    tpi.product_id,
    tpi.quantity_to_clear,
    fl.id AS lot_id,
    fl.remaining_quantity,
    fl.unit_cost,
    fl.lot_date,
    ROW_NUMBER() OVER (
      PARTITION BY tpi.tpi_id 
      ORDER BY
        -- أولوية للـ Lots المتطابقة في Branch/Warehouse
        CASE 
          WHEN fl.branch_id = tpi.branch_id AND (fl.warehouse_id = tpi.warehouse_id OR fl.warehouse_id IS NULL) THEN 1
          WHEN fl.branch_id = tpi.branch_id THEN 2
          WHEN fl.warehouse_id = tpi.warehouse_id OR fl.warehouse_id IS NULL THEN 3
          ELSE 4
        END,
        fl.lot_date ASC,
        fl.created_at ASC
    ) AS rn
  FROM ThirdPartyItemsToClear tpi
  JOIN fifo_cost_lots fl ON fl.product_id = tpi.product_id
  WHERE fl.company_id = tpi.company_id
    AND fl.remaining_quantity > 0
),
FIFOConsumptionsToCreate AS (
  SELECT
    ftp.invoice_id,
    ftp.tpi_id,
    ftp.product_id,
    ftp.lot_id,
    LEAST(ftp.quantity_to_clear, ftp.remaining_quantity) AS quantity_consumed,
    ftp.unit_cost,
    LEAST(ftp.quantity_to_clear, ftp.remaining_quantity) * ftp.unit_cost AS total_cost,
    tpi.invoice_date,
    tpi.company_id
  FROM FIFOLotsForThirdParty ftp
  JOIN ThirdPartyItemsToClear tpi ON tpi.tpi_id = ftp.tpi_id
  WHERE ftp.rn = 1  -- أول lot لكل third-party item
    AND NOT EXISTS (
      SELECT 1 FROM fifo_lot_consumptions flc
      WHERE flc.lot_id = ftp.lot_id
        AND flc.reference_id = ftp.invoice_id
        AND flc.product_id = ftp.product_id
        AND flc.reference_type = 'invoice'
    )
)
INSERT INTO fifo_lot_consumptions (
  company_id,
  lot_id,
  product_id,
  consumption_type,
  reference_type,
  reference_id,
  quantity_consumed,
  unit_cost,
  total_cost,
  consumption_date,
  created_at
)
SELECT
  fc.company_id,
  fc.lot_id,
  fc.product_id,
  'sale' AS consumption_type,
  'invoice' AS reference_type,
  fc.invoice_id,
  fc.quantity_consumed,
  fc.unit_cost,
  fc.total_cost,
  fc.invoice_date,
  NOW()
FROM FIFOConsumptionsToCreate fc;

-- ===== الخطوة 2: إنشاء cogs_transactions =====
WITH NewFIFOConsumptions AS (
  SELECT
    flc.id AS consumption_id,
    flc.lot_id,
    flc.product_id,
    flc.reference_id AS invoice_id,
    flc.quantity_consumed,
    flc.unit_cost,
    flc.total_cost,
    i.company_id,
    i.branch_id,
    i.cost_center_id,
    i.warehouse_id,
    i.invoice_date
  FROM fifo_lot_consumptions flc
  JOIN invoices i ON i.id = flc.reference_id
  WHERE flc.reference_type = 'invoice'
    AND flc.consumption_type = 'sale'
    AND flc.created_at >= NOW() - INTERVAL '5 minutes'  -- Consumptions created in this script
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
  nfc.company_id,
  nfc.branch_id,
  nfc.cost_center_id,
  nfc.warehouse_id,
  nfc.product_id,
  'invoice' AS source_type,
  nfc.invoice_id,
  nfc.quantity_consumed,
  nfc.unit_cost,
  nfc.total_cost,
  nfc.consumption_id,
  nfc.invoice_date,
  NOW(),
  NOW()
FROM NewFIFOConsumptions nfc;

-- ===== الخطوة 3: تحديث third_party_inventory status =====
WITH ThirdPartyTotals AS (
  SELECT
    tpi.id AS tpi_id,
    tpi.invoice_id,
    tpi.quantity,
    tpi.cleared_quantity,
    COALESCE(SUM(flc.quantity_consumed), 0) AS total_consumed
  FROM third_party_inventory tpi
  LEFT JOIN fifo_lot_consumptions flc ON 
    flc.reference_id = tpi.invoice_id
    AND flc.product_id = tpi.product_id
    AND flc.reference_type = 'invoice'
    AND flc.created_at >= NOW() - INTERVAL '5 minutes'
  WHERE tpi.invoice_id IN (
    SELECT DISTINCT i.id FROM invoices i
    WHERE i.status IN ('paid', 'partially_paid')
      AND NOT EXISTS (
        SELECT 1 FROM cogs_transactions ct
        WHERE ct.source_id = i.id AND ct.source_type = 'invoice'
      )
  )
  GROUP BY tpi.id, tpi.invoice_id, tpi.quantity, tpi.cleared_quantity
)
UPDATE third_party_inventory tpi
SET
  cleared_quantity = COALESCE(tpt.cleared_quantity, 0) + tpt.total_consumed,
  status = CASE
    WHEN (COALESCE(tpt.cleared_quantity, 0) + tpt.total_consumed) >= tpt.quantity THEN 'cleared'
    ELSE 'partial'
  END,
  cleared_at = CASE
    WHEN (COALESCE(tpt.cleared_quantity, 0) + tpt.total_consumed) >= tpt.quantity THEN NOW()
    ELSE NULL
  END,
  updated_at = NOW()
FROM ThirdPartyTotals tpt
WHERE tpi.id = tpt.tpi_id
  AND tpt.total_consumed > 0;

-- ===== الخطوة 4: تحديث remaining_quantity في fifo_cost_lots =====
UPDATE fifo_cost_lots fl
SET
  remaining_quantity = fl.remaining_quantity - flc.quantity_consumed,
  updated_at = CURRENT_TIMESTAMP
FROM fifo_lot_consumptions flc
WHERE flc.lot_id = fl.id
  AND flc.reference_type = 'invoice'
  AND flc.consumption_type = 'sale'
  AND flc.created_at >= NOW() - INTERVAL '5 minutes';

-- ===== الخطوة 5: التحقق من النتيجة =====
SELECT
  'Verification' AS check_type,
  COUNT(DISTINCT i.id) AS invoices_processed,
  COUNT(DISTINCT tpi.id) AS third_party_items_cleared,
  COUNT(DISTINCT ct.id) AS cogs_transactions_created,
  COUNT(DISTINCT flc.id) AS fifo_consumptions_created,
  COALESCE(SUM(ct.total_cost), 0) AS total_cogs_amount
FROM invoices i
LEFT JOIN third_party_inventory tpi ON tpi.invoice_id = i.id
LEFT JOIN cogs_transactions ct ON ct.source_id = i.id AND ct.source_type = 'invoice'
LEFT JOIN fifo_lot_consumptions flc ON 
  flc.reference_id = i.id 
  AND flc.reference_type = 'invoice'
  AND flc.created_at >= NOW() - INTERVAL '5 minutes'
WHERE i.invoice_number IN ('INV-0002', 'INV-0003', 'INV-0004', 'INV-0006')
  AND i.status IN ('paid', 'partially_paid');
