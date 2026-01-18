-- =====================================================
-- تشخيص الفواتير بدون COGS
-- =====================================================
-- الغرض: فهم سبب عدم وجود COGS للفواتير المدفوعة

-- 1️⃣ إحصائيات عامة
SELECT 
  'General Stats' as check_type,
  COUNT(DISTINCT i.id) as total_paid_invoices,
  COUNT(DISTINCT CASE WHEN ct.id IS NOT NULL THEN i.id END) as invoices_with_cogs,
  COUNT(DISTINCT CASE WHEN ct.id IS NULL THEN i.id END) as invoices_without_cogs
FROM invoices i
LEFT JOIN cogs_transactions ct ON ct.source_id = i.id AND ct.source_type = 'invoice'
WHERE i.status IN ('paid', 'partially_paid');

-- 2️⃣ سبب عدم وجود COGS (تحليل مفصل)
SELECT 
  'Diagnosis' as check_type,
  i.invoice_number,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM third_party_inventory tpi
      WHERE tpi.invoice_id = i.id AND tpi.status != 'cleared'
    ) THEN 'Third-Party (not cleared)'
    WHEN i.branch_id IS NULL OR i.cost_center_id IS NULL OR i.warehouse_id IS NULL THEN 'Missing Governance'
    WHEN NOT EXISTS (
      SELECT 1 FROM invoice_items ii
      JOIN products p ON p.id = ii.product_id
      WHERE ii.invoice_id = i.id AND p.item_type != 'service'
    ) THEN 'No Products (services only)'
    WHEN NOT EXISTS (
      SELECT 1 FROM invoice_items ii
      JOIN products p ON p.id = ii.product_id
      JOIN fifo_cost_lots fl ON fl.product_id = p.id
      WHERE ii.invoice_id = i.id 
        AND p.item_type != 'service'
        AND fl.remaining_quantity > 0
    ) THEN 'No FIFO Lots'
    ELSE 'Unknown'
  END as reason,
  CASE WHEN EXISTS (
    SELECT 1 FROM third_party_inventory tpi
    WHERE tpi.invoice_id = i.id
  ) THEN 'Yes' ELSE 'No' END as has_third_party,
  CASE WHEN i.branch_id IS NULL OR i.cost_center_id IS NULL OR i.warehouse_id IS NULL THEN 'Missing' ELSE 'OK' END as governance_status,
  (
    SELECT COUNT(*) FROM invoice_items ii
    JOIN products p ON p.id = ii.product_id
    WHERE ii.invoice_id = i.id AND p.item_type != 'service'
  ) as product_count,
  (
    SELECT COUNT(DISTINCT fl.id) FROM invoice_items ii
    JOIN products p ON p.id = ii.product_id
    JOIN fifo_cost_lots fl ON fl.product_id = p.id
    WHERE ii.invoice_id = i.id 
      AND p.item_type != 'service'
      AND fl.remaining_quantity > 0
  ) as fifo_lots_count
FROM invoices i
WHERE i.status IN ('paid', 'partially_paid')
  AND NOT EXISTS (
    SELECT 1 FROM cogs_transactions ct
    WHERE ct.source_id = i.id AND ct.source_type = 'invoice'
  )
ORDER BY i.created_at DESC
LIMIT 20;

-- 3️⃣ عدد الفواتير حسب السبب
SELECT 
  'Summary by Reason' as check_type,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM third_party_inventory tpi
      WHERE tpi.invoice_id = i.id AND tpi.status != 'cleared'
    ) THEN 'Third-Party (not cleared)'
    WHEN i.branch_id IS NULL OR i.cost_center_id IS NULL OR i.warehouse_id IS NULL THEN 'Missing Governance'
    WHEN NOT EXISTS (
      SELECT 1 FROM invoice_items ii
      JOIN products p ON p.id = ii.product_id
      WHERE ii.invoice_id = i.id AND p.item_type != 'service'
    ) THEN 'No Products'
    WHEN NOT EXISTS (
      SELECT 1 FROM invoice_items ii
      JOIN products p ON p.id = ii.product_id
      JOIN fifo_cost_lots fl ON fl.product_id = p.id
      WHERE ii.invoice_id = i.id 
        AND p.item_type != 'service'
        AND fl.remaining_quantity > 0
    ) THEN 'No FIFO Lots'
    ELSE 'Unknown'
  END as reason,
  COUNT(*) as invoice_count
FROM invoices i
WHERE i.status IN ('paid', 'partially_paid')
  AND NOT EXISTS (
    SELECT 1 FROM cogs_transactions ct
    WHERE ct.source_id = i.id AND ct.source_type = 'invoice'
  )
GROUP BY 
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM third_party_inventory tpi
      WHERE tpi.invoice_id = i.id AND tpi.status != 'cleared'
    ) THEN 'Third-Party (not cleared)'
    WHEN i.branch_id IS NULL OR i.cost_center_id IS NULL OR i.warehouse_id IS NULL THEN 'Missing Governance'
    WHEN NOT EXISTS (
      SELECT 1 FROM invoice_items ii
      JOIN products p ON p.id = ii.product_id
      WHERE ii.invoice_id = i.id AND p.item_type != 'service'
    ) THEN 'No Products'
    WHEN NOT EXISTS (
      SELECT 1 FROM invoice_items ii
      JOIN products p ON p.id = ii.product_id
      JOIN fifo_cost_lots fl ON fl.product_id = p.id
      WHERE ii.invoice_id = i.id 
        AND p.item_type != 'service'
        AND fl.remaining_quantity > 0
    ) THEN 'No FIFO Lots'
    ELSE 'Unknown'
  END
ORDER BY invoice_count DESC;
